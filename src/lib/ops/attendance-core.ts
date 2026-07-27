import { z } from "zod";
import type { OpsUserProfile } from "@/lib/ops/auth";
import { createOpsServerSessionClient } from "@/lib/ops/auth";
import {
  computeAttendanceEarnings,
  DEFAULT_WORKER_DAILY_RATE,
  hoursBetweenClockTimes,
} from "@/lib/ops/attendance-earnings";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { swallowOpsError } from "@/lib/ops/log";
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

/**
 * Optional numeric form field: blank means "not supplied", so the server can
 * derive the value instead of treating it as a hard zero.
 */
const optionalHours = (max: number, label: string) =>
  z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null))
    .refine(
      (value) => value === null || (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= max),
      label,
    )
    .transform((value) => (value === null ? null : Number(value)));

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
  /** Blank = derive from the clock times. */
  hours_worked: optionalHours(24, "Hours worked must be between 0 and 24."),
  /** Blank = derive from hours beyond the standard day. */
  overtime_hours: optionalHours(16, "Overtime hours must be between 0 and 16."),
  presence: z.enum(["present", "late", "absent"]),
  site_note: z.string().trim().max(160).default(""),
});

export function attendanceField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function combineAttendanceDateTime(date: string, time: string) {
  return `${date}T${time}:00+02:00`;
}

export type AttendanceRateSettings = {
  standardDailyHours: number;
  overtimeMultiplier: number;
};

/**
 * Company-wide standard day and overtime multiplier, with the documented
 * defaults when the organization profile has not been filled in yet.
 */
export function attendanceRateSettings(
  row: { standard_daily_hours?: number | string | null; overtime_multiplier?: number | string | null } | null,
): AttendanceRateSettings {
  return {
    standardDailyHours: Number(row?.standard_daily_hours ?? 8),
    overtimeMultiplier: Number(row?.overtime_multiplier ?? 1.5),
  };
}

export type AttendanceEarningsInputs = {
  presence: "present" | "late" | "absent";
  clockInTime: string;
  clockOutTime: string | null;
  hoursWorked: number | null;
  overtimeHours: number | null;
  dailyRate: number;
  settings: AttendanceRateSettings;
};

/**
 * Resolve what actually gets stored on the record. Hours worked fall back to
 * the clock in/out span, overtime falls back to hours beyond the standard day,
 * and an absent record zeroes everything.
 */
export function resolveAttendanceEarnings(inputs: AttendanceEarningsInputs) {
  const isAbsent = inputs.presence === "absent";
  const clockedHours = hoursBetweenClockTimes(inputs.clockInTime, inputs.clockOutTime);
  const hoursWorked = isAbsent ? 0 : (inputs.hoursWorked ?? clockedHours ?? 0);
  const earnings = computeAttendanceEarnings({
    hoursWorked,
    overtimeHours: isAbsent ? 0 : inputs.overtimeHours,
    dailyRate: inputs.dailyRate,
    standardDailyHours: inputs.settings.standardDailyHours,
    overtimeMultiplier: inputs.settings.overtimeMultiplier,
    isAbsent,
  });

  return { hoursWorked, earnings };
}

/**
 * Guard against paying a worker twice for the same day.
 *
 * Under the fixed daily rate a duplicate record is a duplicate day's pay, and
 * the hours column no longer makes the mistake obvious. This cannot be a unique
 * index because the work day has to be derived from clock_in_at in the Lusaka
 * zone (`at time zone` is STABLE, not IMMUTABLE, so Postgres will not index
 * it), so it is enforced here on the write path instead.
 *
 * Returns the clashing record id, or null when the day is free.
 */
export async function findAttendanceDayClash(
  supabase: Awaited<ReturnType<typeof createOpsServerSessionClient>>,
  args: { workerId: string; workDate: string; excludeId?: string },
): Promise<string | null> {
  let query = supabase
    .from("attendance_records")
    .select("id")
    .eq("worker_id", args.workerId)
    .eq("is_active", true)
    .is("cancelled_at", null)
    .gte("clock_in_at", `${args.workDate}T00:00:00+02:00`)
    .lte("clock_in_at", `${args.workDate}T23:59:59.999+02:00`)
    .limit(1);

  if (args.excludeId) {
    query = query.neq("id", args.excludeId);
  }

  const { data } = await query.maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

export const ATTENDANCE_DAY_CLASH_MESSAGE =
  "That worker already has an attendance record for this day. Edit or cancel the existing record instead.";

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

  const parsed = createAttendanceSchema.safeParse({
    worker_id: attendanceField(formData, "worker_id"),
    site_id: attendanceField(formData, "site_id"),
    work_date: attendanceField(formData, "work_date"),
    clock_in_time: attendanceField(formData, "clock_in_time"),
    clock_out_time: attendanceField(formData, "clock_out_time"),
    hours_worked: attendanceField(formData, "hours_worked"),
    overtime_hours: attendanceField(formData, "overtime_hours"),
    presence: attendanceField(formData, "presence") || "present",
    site_note: attendanceField(formData, "site_note"),
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

  // Offline replays are deduplicated by client_id, so only guard fresh entries.
  const clientId = (attendanceField(formData, "client_id") || "").trim() || null;
  if (!clientId) {
    const clash = await findAttendanceDayClash(supabase, {
      workerId: parsed.data.worker_id,
      workDate: parsed.data.work_date,
    });
    if (clash) {
      return { ok: false, message: ATTENDANCE_DAY_CLASH_MESSAGE };
    }
  }

  const { hoursWorked, earnings } = resolveAttendanceEarnings({
    presence: parsed.data.presence,
    clockInTime: parsed.data.clock_in_time,
    clockOutTime: parsed.data.clock_out_time,
    hoursWorked: parsed.data.hours_worked,
    overtimeHours: parsed.data.overtime_hours,
    dailyRate: Number(worker.daily_rate) || DEFAULT_WORKER_DAILY_RATE,
    settings: attendanceRateSettings(orgRes.data),
  });

  // Sprint 10 offline support: upsert on the optional client_id so a queued
  // attendance record from a phone that's been offline doesn't double-insert
  // when it eventually syncs.
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
    // gps_label is the legacy column name; it now stores a plain site note.
    gps_label: parsed.data.site_note,
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

  await recordOpsAuditEvent({
    action: "attendance.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "attendance_record",
    metadata: {
      worker_id: parsed.data.worker_id,
      site_id: parsed.data.site_id,
      hours_worked: hoursWorked,
      amount_earned: earnings.totalAmount,
      overtime_hours: earnings.overtimeHours,
      overtime_amount: earnings.overtimeAmount,
    },
    moduleKey: "attendance",
    sourceId: data.id,
    sourceTable: "attendance_records",
    summary: `${profile.full_name} recorded attendance`,
  }).catch(swallowOpsError({ module: "attendance", action: "createAttendanceRecordCore" }));

  return { ok: true, id: data.id };
}
