"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import {
  ATTENDANCE_DAY_CLASH_MESSAGE,
  ATTENDANCE_TIME_PATTERN,
  attendanceRateSettings,
  combineAttendanceDateTime,
  findAttendanceDayClash,
  createAttendanceRecordCore,
  createAttendanceSchema,
  resolveAttendanceEarnings,
} from "@/lib/ops/attendance-core";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import { DEFAULT_WORKER_DAILY_RATE } from "@/lib/ops/attendance-earnings";
import { fanoutToOpsRoles } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import {
  canApproveAttendance,
  canRecordAttendance,
  canSelfApproveAttendance,
} from "@/lib/ops/permissions";
import { hasActiveOpsSiteAssignment, requiresOpsSiteAssignment } from "@/lib/ops/site-assignments";

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

export async function createAttendanceAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const result = await createAttendanceRecordCore(formData, profile);

  if (!result.ok) {
    attendanceError(result.message);
  }

  revalidatePath("/ops");
  revalidatePath("/ops/attendance");
  redirect("/ops/attendance?created=attendance");
}

/**
 * Bulk roster capture (audit finding A4).
 *
 * One submit for a whole site's crew: a shared date and default clock times,
 * per-worker presence and optional overrides. Workers left on "skip" are
 * ignored, and anyone who already has a record for that day is passed over
 * rather than duplicated — the roster form marks them, and this is the
 * server-side backstop.
 */
const BULK_PRESENCE_VALUES = ["present", "late", "absent"] as const;

export async function createBulkAttendanceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canRecordAttendance(profile.role)) {
    attendanceError("Your role cannot record attendance.");
  }

  const siteId = field(formData, "site_id");
  const workDate = field(formData, "work_date");
  const defaultClockIn = field(formData, "default_clock_in_time");
  const defaultClockOut = field(formData, "default_clock_out_time");

  if (!z.string().uuid().safeParse(siteId).success) {
    attendanceError("Select a Pymble site.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    attendanceError("Select a work date.");
  }
  if (!ATTENDANCE_TIME_PATTERN.test(defaultClockIn)) {
    attendanceError("Enter a valid default clock-in time.");
  }
  if (defaultClockOut && !ATTENDANCE_TIME_PATTERN.test(defaultClockOut)) {
    attendanceError("Enter a valid default clock-out time.");
  }

  if (
    requiresOpsSiteAssignment(profile.role) &&
    !(await hasActiveOpsSiteAssignment(profile.id, siteId))
  ) {
    attendanceError("You can only record attendance for a site assigned to you.");
  }

  const rosterIds = formData
    .getAll("roster_worker_id")
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  const requested = rosterIds.flatMap((workerId) => {
    // Anything other than a real presence value (including "skip") is ignored.
    const presence = BULK_PRESENCE_VALUES.find(
      (value) => value === field(formData, `presence_${workerId}`),
    );
    if (!presence) {
      return [];
    }

    const clockIn = field(formData, `clock_in_${workerId}`) || defaultClockIn;
    const clockOut = field(formData, `clock_out_${workerId}`) || defaultClockOut;
    const overtimeRaw = field(formData, `overtime_hours_${workerId}`).trim();

    if (!ATTENDANCE_TIME_PATTERN.test(clockIn)) return [];

    return [
      {
        workerId,
        presence,
        clockIn,
        clockOut: clockOut && ATTENDANCE_TIME_PATTERN.test(clockOut) ? clockOut : null,
        overtimeHours: overtimeRaw.length > 0 ? Number(overtimeRaw) : null,
      },
    ];
  });

  if (requested.length === 0) {
    attendanceError("Set presence for at least one worker before saving the roster.");
  }

  const supabase = await createOpsServerSessionClient();
  const [workersRes, orgRes, existingRes] = await Promise.all([
    supabase
      .from("workers")
      .select("id, daily_rate, site_id")
      .eq("is_active", true)
      .in(
        "id",
        requested.map((row) => row.workerId),
      ),
    supabase
      .from("organization_profile")
      .select("standard_daily_hours, overtime_multiplier")
      .eq("id", 1)
      .maybeSingle<{ standard_daily_hours: number | string; overtime_multiplier: number | string }>(),
    supabase
      .from("attendance_records")
      .select("worker_id")
      .eq("is_active", true)
      .is("cancelled_at", null)
      .gte("clock_in_at", `${workDate}T00:00:00+02:00`)
      .lte("clock_in_at", `${workDate}T23:59:59.999+02:00`)
      .in(
        "worker_id",
        requested.map((row) => row.workerId),
      ),
  ]);

  if (workersRes.error) {
    attendanceError(workersRes.error.message);
  }

  const workers = new Map(
    ((workersRes.data ?? []) as Array<{
      id: string;
      daily_rate: number | string;
      site_id: string | null;
    }>).map((worker) => [worker.id, worker]),
  );
  const alreadyRecorded = new Set(
    ((existingRes.data ?? []) as Array<{ worker_id: string }>).map((row) => row.worker_id),
  );
  const settings = attendanceRateSettings(orgRes.data);

  let skippedDuplicates = 0;
  const rows = requested.flatMap((row) => {
    const worker = workers.get(row.workerId);
    if (!worker) return [];
    if (worker.site_id && worker.site_id !== siteId) return [];
    if (alreadyRecorded.has(row.workerId)) {
      skippedDuplicates += 1;
      return [];
    }

    const { hoursWorked, earnings } = resolveAttendanceEarnings({
      presence: row.presence,
      clockInTime: row.clockIn,
      clockOutTime: row.clockOut,
      hoursWorked: null,
      overtimeHours: row.overtimeHours,
      dailyRate: Number(worker.daily_rate) || DEFAULT_WORKER_DAILY_RATE,
      settings,
    });

    return [
      {
        worker_id: row.workerId,
        site_id: siteId,
        clock_in_at: combineAttendanceDateTime(workDate, row.clockIn),
        clock_out_at: row.clockOut ? combineAttendanceDateTime(workDate, row.clockOut) : null,
        hours_worked: hoursWorked,
        amount_earned: earnings.totalAmount,
        overtime_hours: earnings.overtimeHours,
        overtime_amount: earnings.overtimeAmount,
        presence: row.presence,
        source: "manual" as const,
        gps_label: "",
        created_by: profile.id,
        is_active: true,
      },
    ];
  });

  if (rows.length === 0) {
    attendanceError(
      skippedDuplicates > 0
        ? "Every selected worker already has a record for that day."
        : "None of the selected workers could be recorded.",
    );
  }

  const { data: inserted, error } = await supabase
    .from("attendance_records")
    .insert(rows)
    .select("id");

  if (error) {
    attendanceError(error.message);
  }

  const insertedRows = (inserted ?? []) as Array<{ id: string }>;
  if (insertedRows.length > 0) {
    await supabase.from("audit_events").insert(
      insertedRows.map((record, index) => ({
        actor_user_id: profile.id,
        action: "attendance.created",
        entity_type: "attendance_record",
        entity_id: record.id,
        module_key: "attendance",
        source_table: "attendance_records",
        source_id: record.id,
        metadata: {
          bulk: true,
          site_id: siteId,
          work_date: workDate,
          worker_id: rows[index]?.worker_id,
          amount_earned: rows[index]?.amount_earned,
          overtime_hours: rows[index]?.overtime_hours,
          overtime_amount: rows[index]?.overtime_amount,
        },
      })),
    );
  }

  revalidatePath("/ops");
  revalidatePath("/ops/attendance");
  redirect(
    `/ops/attendance?roster_saved=${insertedRows.length}${
      skippedDuplicates > 0 ? `&roster_skipped=${skippedDuplicates}` : ""
    }`,
  );
}

export async function approveAttendanceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canApproveAttendance(profile.role)) {
    attendanceError("Your role cannot approve attendance yet.");
  }

  const parsed = approveAttendanceSchema.safeParse({
    id: field(formData, "id"),
  });

  if (!parsed.success) {
    attendanceError(parsed.error.issues[0]?.message ?? "Select an attendance record.");
  }

  const supabase = await createOpsServerSessionClient();

  // Maker/checker: approval releases the record into payroll, so whoever
  // captured it cannot also wave it through unless they are senior enough to
  // carry that authority alone (audit finding A1).
  if (!canSelfApproveAttendance(profile.role)) {
    const { data: existing, error: existingError } = await supabase
      .from("attendance_records")
      .select("created_by")
      .eq("id", parsed.data.id)
      .maybeSingle<{ created_by: string | null }>();

    if (existingError) {
      attendanceError(existingError.message);
    }

    if (existing?.created_by === profile.id) {
      attendanceError(
        "You cannot approve attendance you recorded yourself. Ask a site manager or projects manager to approve it.",
      );
    }
  }

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
    module_key: "attendance",
    source_table: "attendance_records",
    source_id: parsed.data.id,
  });

  // Phase M backfill: notify HR + finance so approved attendance feeds straight
  // into the payroll cycle without a manual ping.
  const recipients = await fanoutToOpsRoles(
    ["human_resource", "hr", "finance_manager", "accountant"],
    { excludeUserIds: [profile.id] },
  );
  await Promise.all(
    recipients.map((recipient) =>
      queueOpsNotification({
        actionHref: "/ops/attendance",
        body: `${profile.full_name} approved an attendance record (${parsed.data.id.slice(0, 8)}). It is now eligible for payroll.`,
        idempotencyKey: `attendance-approved:${parsed.data.id}:${recipient.id}`,
        moduleKey: "attendance",
        recipientId: recipient.id,
        sourceId: parsed.data.id,
        sourceTable: "attendance_records",
        title: "Attendance approved",
      }).catch(() => null),
    ),
  );

  revalidatePath("/ops");
  revalidatePath("/ops/attendance");
  revalidatePath("/ops/notifications");
  redirect("/ops/attendance?updated=approved");
}

const updateAttendanceSchema = createAttendanceSchema.extend({
  id: z.string().uuid("Select an attendance record."),
});

const cancelAttendanceSchema = z.object({
  id: z.string().uuid("Select an attendance record."),
  reason: z.string().trim().min(3, "Provide a brief reason.").max(280).optional(),
});

export async function updateAttendanceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canRecordAttendance(profile.role)) {
    attendanceError("Your role cannot edit attendance.");
  }

  const parsed = updateAttendanceSchema.safeParse({
    id: field(formData, "id"),
    worker_id: field(formData, "worker_id"),
    site_id: field(formData, "site_id"),
    work_date: field(formData, "work_date"),
    clock_in_time: field(formData, "clock_in_time"),
    clock_out_time: field(formData, "clock_out_time"),
    hours_worked: field(formData, "hours_worked"),
    overtime_hours: field(formData, "overtime_hours"),
    presence: field(formData, "presence"),
    site_note: field(formData, "site_note"),
  });

  if (!parsed.success) {
    attendanceError(parsed.error.issues[0]?.message ?? "Check the attendance entry.");
  }

  const { id, ...patch } = parsed.data;
  const supabase = await createOpsServerSessionClient();

  if (requiresOpsSiteAssignment(profile.role)) {
    if (!(await hasActiveOpsSiteAssignment(profile.id, patch.site_id))) {
      attendanceError("You can only edit attendance for sites assigned to you.");
    }

    const { data: existing, error: existingError } = await supabase
      .from("attendance_records")
      .select("created_by, site_id")
      .eq("id", id)
      .maybeSingle<{ created_by: string | null; site_id: string }>();

    if (existingError) {
      attendanceError(existingError.message);
    }

    if (!existing || existing.created_by !== profile.id || existing.site_id !== patch.site_id) {
      attendanceError("You can only edit attendance records that you created for your assigned site.");
    }
  }

  // Recompute earnings from the (possibly changed) worker and hours so an edit
  // never leaves amount_earned / overtime stale ahead of payroll.
  const [workerRes, orgRes] = await Promise.all([
    supabase
      .from("workers")
      .select("daily_rate, site_id")
      .eq("id", patch.worker_id)
      .eq("is_active", true)
      .single<{ daily_rate: number | string; site_id: string | null }>(),
    supabase
      .from("organization_profile")
      .select("standard_daily_hours, overtime_multiplier")
      .eq("id", 1)
      .maybeSingle<{ standard_daily_hours: number | string; overtime_multiplier: number | string }>(),
  ]);

  if (workerRes.error || !workerRes.data) {
    attendanceError("The selected worker could not be found.");
  }

  if (workerRes.data.site_id && workerRes.data.site_id !== patch.site_id) {
    attendanceError("The selected worker belongs to a different site.");
  }

  if (
    await findAttendanceDayClash(supabase, {
      workerId: patch.worker_id,
      workDate: patch.work_date,
      excludeId: id,
    })
  ) {
    attendanceError(ATTENDANCE_DAY_CLASH_MESSAGE);
  }

  const { hoursWorked, earnings } = resolveAttendanceEarnings({
    presence: patch.presence,
    clockInTime: patch.clock_in_time,
    clockOutTime: patch.clock_out_time,
    hoursWorked: patch.hours_worked,
    overtimeHours: patch.overtime_hours,
    dailyRate: Number(workerRes.data.daily_rate) || DEFAULT_WORKER_DAILY_RATE,
    settings: attendanceRateSettings(orgRes.data),
  });

  const { error } = await supabase
    .from("attendance_records")
    .update({
      worker_id: patch.worker_id,
      site_id: patch.site_id,
      clock_in_at: combineAttendanceDateTime(patch.work_date, patch.clock_in_time),
      clock_out_at: patch.clock_out_time
        ? combineAttendanceDateTime(patch.work_date, patch.clock_out_time)
        : null,
      hours_worked: hoursWorked,
      amount_earned: earnings.totalAmount,
      overtime_hours: earnings.overtimeHours,
      overtime_amount: earnings.overtimeAmount,
      presence: patch.presence,
      // gps_label is the legacy column name; it now stores a plain site note.
      gps_label: patch.site_note,
    })
    .eq("id", id)
    .is("approved_at", null)
    .is("cancelled_at", null);

  if (error) {
    attendanceError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "attendance.updated",
    entity_type: "attendance_record",
    entity_id: id,
    module_key: "attendance",
    source_table: "attendance_records",
    source_id: id,
  });

  revalidatePath("/ops/attendance");
  redirect("/ops/attendance?updated=record");
}

export async function cancelAttendanceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canRecordAttendance(profile.role)) {
    attendanceError("Your role cannot cancel attendance.");
  }

  const parsed = cancelAttendanceSchema.safeParse({
    id: field(formData, "id"),
    reason: field(formData, "reason") || undefined,
  });

  if (!parsed.success) {
    attendanceError(parsed.error.issues[0]?.message ?? "Select an attendance record.");
  }

  const supabase = await createOpsServerSessionClient();
  if (requiresOpsSiteAssignment(profile.role)) {
    const { data: existing, error: existingError } = await supabase
      .from("attendance_records")
      .select("created_by, site_id")
      .eq("id", parsed.data.id)
      .maybeSingle<{ created_by: string | null; site_id: string }>();

    if (existingError) {
      attendanceError(existingError.message);
    }

    if (
      !existing ||
      existing.created_by !== profile.id ||
      !(await hasActiveOpsSiteAssignment(profile.id, existing.site_id))
    ) {
      attendanceError("You can only cancel attendance records that you created for your assigned site.");
    }
  }

  const { error } = await supabase
    .from("attendance_records")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: profile.id,
    })
    .eq("id", parsed.data.id)
    .is("approved_at", null);

  if (error) {
    attendanceError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "attendance.cancelled",
    entity_type: "attendance_record",
    entity_id: parsed.data.id,
    module_key: "attendance",
    source_table: "attendance_records",
    source_id: parsed.data.id,
    metadata: parsed.data.reason ? { reason: parsed.data.reason } : null,
  });

  revalidatePath("/ops/attendance");
  redirect("/ops/attendance?updated=cancelled");
}
