import { z } from "zod";
import type { OpsUserProfile } from "@/lib/ops/auth";
import { createOpsServerSessionClient } from "@/lib/ops/auth";
import { computeAttendanceEarnings } from "@/lib/ops/attendance-earnings";
import { parseCoordinateInput } from "@/lib/ops/coordinates";
import { canRecordAttendance } from "@/lib/ops/permissions";
import { hasActiveOpsSiteAssignment, requiresOpsSiteAssignment } from "@/lib/ops/site-assignments";

/**
 * Shared core for creating an attendance record — used by both
 * createAttendanceAction (the online form submit, in attendance-actions.ts)
 * and the /api/ops/offline/attendance route (the outbox replay endpoint for
 * field workers who recorded attendance with no signal). Kept here, outside
 * any "use server" file, so it's a plain function importable from a Route
 * Handler without becoming an accidental server action itself.
 */

export const ATTENDANCE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createAttendanceSchema = z.object({
  worker_id: z.string().uuid("Select a Pymble worker."),
  site_id: z.string().uuid("Select a Pymble site."),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select a work date."),
  clock_in_time: z.string().regex(ATTENDANCE_TIME_PATTERN, "Enter a valid clock-in time."),
  clock_out_time: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null))
    .pipe(z.string().regex(ATTENDANCE_TIME_PATTERN).nullable()),
  hours_worked: z.coerce.number().min(0).max(24),
  presence: z.enum(["present", "late", "absent"]),
  gps_label: z.string().trim().max(160).default(""),
  gps_latitude: z.number().min(-90).max(90).nullable(),
  gps_longitude: z.number().min(-180).max(180).nullable(),
});

export function attendanceField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function combineAttendanceDateTime(date: string, time: string) {
  return `${date}T${time}:00+02:00`;
}

export type CreateAttendanceResult =
  | { ok: true; id: string }
  | { ok: false; message: string };

export async function createAttendanceRecordCore(
  formData: FormData,
  profile: OpsUserProfile,
): Promise<CreateAttendanceResult> {
  if (!canRecordAttendance(profile.role)) {
    return { ok: false, message: "Your role cannot record attendance yet." };
  }

  const gpsLatitude = parseCoordinateInput(attendanceField(formData, "gps_latitude"), "latitude");
  if (gpsLatitude === undefined) {
    return { ok: false, message: "Enter a valid latitude." };
  }

  const gpsLongitude = parseCoordinateInput(attendanceField(formData, "gps_longitude"), "longitude");
  if (gpsLongitude === undefined) {
    return { ok: false, message: "Enter a valid longitude." };
  }

  if ((gpsLatitude === null) !== (gpsLongitude === null)) {
    return { ok: false, message: "Enter both GPS latitude and longitude, or leave both blank." };
  }

  const parsed = createAttendanceSchema.safeParse({
    worker_id: attendanceField(formData, "worker_id"),
    site_id: attendanceField(formData, "site_id"),
    work_date: attendanceField(formData, "work_date"),
    clock_in_time: attendanceField(formData, "clock_in_time"),
    clock_out_time: attendanceField(formData, "clock_out_time"),
    hours_worked: attendanceField(formData, "hours_worked"),
    presence: attendanceField(formData, "presence") || "present",
    gps_label: attendanceField(formData, "gps_label"),
    gps_latitude: gpsLatitude,
    gps_longitude: gpsLongitude,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the attendance details." };
  }

  if (
    requiresOpsSiteAssignment(profile.role) &&
    !(await hasActiveOpsSiteAssignment(profile.id, parsed.data.site_id))
  ) {
    return { ok: false, message: "You can only record attendance for a site assigned to you." };
  }

  const supabase = await createOpsServerSessionClient();
  const [workerRes, orgRes] = await Promise.all([
    supabase
      .from("workers")
      .select("daily_rate, site_id")
      .eq("id", parsed.data.worker_id)
      .eq("is_active", true)
      .single<{ daily_rate: number | string; site_id: string | null }>(),
    supabase
      .from("organization_profile")
      .select("standard_daily_hours, overtime_multiplier")
      .eq("id", 1)
      .maybeSingle<{ standard_daily_hours: number | string; overtime_multiplier: number | string }>(),
  ]);

  if (workerRes.error || !workerRes.data) {
    return { ok: false, message: "The selected worker could not be found." };
  }
  const worker = workerRes.data;
  if (worker.site_id && worker.site_id !== parsed.data.site_id) {
    return { ok: false, message: "The selected worker is assigned to a different site." };
  }

  const standardDailyHours = Number(orgRes.data?.standard_daily_hours ?? 8);
  const overtimeMultiplier = Number(orgRes.data?.overtime_multiplier ?? 1.5);

  const hoursWorked = parsed.data.presence === "absent" ? 0 : parsed.data.hours_worked;
  const earnings = computeAttendanceEarnings({
    hoursWorked,
    dailyRate: Number(worker.daily_rate),
    standardDailyHours,
    overtimeMultiplier,
    isAbsent: parsed.data.presence === "absent",
  });

  // Sprint 10 offline support: upsert on the optional client_id so a queued
  // attendance record from a phone that's been offline doesn't double-insert
  // when it eventually syncs.
  const clientId = (attendanceField(formData, "client_id") || "").trim() || null;
  const attendancePayload = {
    worker_id: parsed.data.worker_id,
    site_id: parsed.data.site_id,
    clock_in_at: combineAttendanceDateTime(parsed.data.work_date, parsed.data.clock_in_time),
    clock_out_at: parsed.data.clock_out_time
      ? combineAttendanceDateTime(parsed.data.work_date, parsed.data.clock_out_time)
      : null,
    hours_worked: hoursWorked,
    amount_earned: earnings.totalAmount,
    overtime_hours: earnings.overtimeHours,
    overtime_amount: earnings.overtimeAmount,
    presence: parsed.data.presence,
    source: "manual",
    gps_label: parsed.data.gps_label,
    gps_latitude: parsed.data.gps_latitude,
    gps_longitude: parsed.data.gps_longitude,
    created_by: profile.id,
    is_active: true,
  };
  const { data, error } = clientId
    ? await supabase
        .from("attendance_records")
        .upsert(
          { ...attendancePayload, client_id: clientId },
          { onConflict: "client_id", ignoreDuplicates: false },
        )
        .select("id")
        .single<{ id: string }>()
    : await supabase
        .from("attendance_records")
        .insert(attendancePayload)
        .select("id")
        .single<{ id: string }>();

  if (error || !data) {
    return {
      ok: false,
      message: error
        ? error.code === "23505"
          ? "That worker already has an open attendance record."
          : error.message
        : "The attendance record could not be created.",
    };
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "attendance.created",
    entity_type: "attendance_record",
    entity_id: data.id,
    module_key: "attendance",
    source_table: "attendance_records",
    source_id: data.id,
    metadata: {
      worker_id: parsed.data.worker_id,
      site_id: parsed.data.site_id,
      gps_latitude: parsed.data.gps_latitude,
      gps_longitude: parsed.data.gps_longitude,
      hours_worked: hoursWorked,
      amount_earned: earnings.totalAmount,
      overtime_hours: earnings.overtimeHours,
      overtime_amount: earnings.overtimeAmount,
    },
  });

  return { ok: true, id: data.id };
}
