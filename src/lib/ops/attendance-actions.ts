"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import { parseCoordinateInput } from "@/lib/ops/coordinates";
import { canRecordAttendance } from "@/lib/ops/permissions";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const createAttendanceSchema = z.object({
  worker_id: z.string().uuid("Select a Pymble worker."),
  site_id: z.string().uuid("Select a Pymble site."),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select a work date."),
  clock_in_time: z.string().regex(timePattern, "Enter a valid clock-in time."),
  clock_out_time: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null))
    .pipe(z.string().regex(timePattern).nullable()),
  hours_worked: z.coerce.number().min(0).max(24),
  presence: z.enum(["present", "late", "absent"]),
  gps_label: z.string().trim().max(160).default(""),
  gps_latitude: z.number().min(-90).max(90).nullable(),
  gps_longitude: z.number().min(-180).max(180).nullable(),
});

const approveAttendanceSchema = z.object({
  id: z.string().uuid("Select an attendance record."),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function attendanceError(message: string): never {
  redirect(`/ops/attendance?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function coordinateField(formData: FormData, name: "gps_latitude" | "gps_longitude") {
  const kind = name === "gps_latitude" ? "latitude" : "longitude";
  const parsed = parseCoordinateInput(field(formData, name), kind);

  if (parsed === undefined) {
    attendanceError(`Enter a valid ${kind}.`);
  }

  return parsed;
}

function combineDateTime(date: string, time: string) {
  return `${date}T${time}:00+02:00`;
}

export async function createAttendanceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canRecordAttendance(profile.role)) {
    attendanceError("Your role cannot record attendance yet.");
  }

  const gpsLatitude = coordinateField(formData, "gps_latitude");
  const gpsLongitude = coordinateField(formData, "gps_longitude");

  if ((gpsLatitude === null) !== (gpsLongitude === null)) {
    attendanceError("Enter both GPS latitude and longitude, or leave both blank.");
  }

  const parsed = createAttendanceSchema.safeParse({
    worker_id: field(formData, "worker_id"),
    site_id: field(formData, "site_id"),
    work_date: field(formData, "work_date"),
    clock_in_time: field(formData, "clock_in_time"),
    clock_out_time: field(formData, "clock_out_time"),
    hours_worked: field(formData, "hours_worked"),
    presence: field(formData, "presence") || "present",
    gps_label: field(formData, "gps_label"),
    gps_latitude: gpsLatitude,
    gps_longitude: gpsLongitude,
  });

  if (!parsed.success) {
    attendanceError(parsed.error.issues[0]?.message ?? "Check the attendance details.");
  }

  const supabase = await createOpsServerSessionClient();
  const { data: worker, error: workerError } = await supabase
    .from("workers")
    .select("daily_rate")
    .eq("id", parsed.data.worker_id)
    .eq("is_active", true)
    .single<{ daily_rate: number | string }>();

  if (workerError || !worker) {
    attendanceError("The selected worker could not be found.");
  }

  const hoursWorked = parsed.data.presence === "absent" ? 0 : parsed.data.hours_worked;
  const amountEarned =
    parsed.data.presence === "absent"
      ? 0
      : Math.round(((Number(worker.daily_rate) / 8) * hoursWorked + Number.EPSILON) * 100) / 100;

  const { data, error } = await supabase
    .from("attendance_records")
    .insert({
      worker_id: parsed.data.worker_id,
      site_id: parsed.data.site_id,
      clock_in_at: combineDateTime(parsed.data.work_date, parsed.data.clock_in_time),
      clock_out_at: parsed.data.clock_out_time
        ? combineDateTime(parsed.data.work_date, parsed.data.clock_out_time)
        : null,
      hours_worked: hoursWorked,
      amount_earned: amountEarned,
      presence: parsed.data.presence,
      source: "manual",
      gps_label: parsed.data.gps_label,
      gps_latitude: parsed.data.gps_latitude,
      gps_longitude: parsed.data.gps_longitude,
      created_by: profile.id,
      is_active: true,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    attendanceError(
      error
        ? error.code === "23505"
          ? "That worker already has an open attendance record."
          : error.message
        : "The attendance record could not be created.",
    );
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "attendance.created",
    entity_type: "attendance_record",
    entity_id: data.id,
    metadata: {
      worker_id: parsed.data.worker_id,
      site_id: parsed.data.site_id,
      gps_latitude: parsed.data.gps_latitude,
      gps_longitude: parsed.data.gps_longitude,
      hours_worked: hoursWorked,
      amount_earned: amountEarned,
    },
  });

  revalidatePath("/ops");
  revalidatePath("/ops/attendance");
  redirect("/ops/attendance?created=attendance");
}

export async function approveAttendanceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canRecordAttendance(profile.role)) {
    attendanceError("Your role cannot approve attendance yet.");
  }

  const parsed = approveAttendanceSchema.safeParse({
    id: field(formData, "id"),
  });

  if (!parsed.success) {
    attendanceError(parsed.error.issues[0]?.message ?? "Select an attendance record.");
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("attendance_records")
    .update({
      approved_at: new Date().toISOString(),
      approved_by: profile.id,
    })
    .eq("id", parsed.data.id)
    .is("approved_at", null);

  if (error) {
    attendanceError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "attendance.approved",
    entity_type: "attendance_record",
    entity_id: parsed.data.id,
  });

  revalidatePath("/ops");
  revalidatePath("/ops/attendance");
  redirect("/ops/attendance?updated=approved");
}
