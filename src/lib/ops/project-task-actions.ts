"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { logOpsServerError } from "@/lib/ops/log";
import { fetchOpsProjectTaskById } from "@/lib/ops/project-tasks";
import {
  canArchiveProjectTask,
  canCreateProjectTask,
  canDeleteProjectTask,
  canEditProjectTask,
  canUpdateProjectTaskProgress,
} from "@/lib/ops/project-task-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

const SCHEDULE_ROUTE = "/ops/project-schedule";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const optionalUuid = z
  .string()
  .trim()
  .default("")
  .transform((value) => (value.length > 0 ? value : null));

const baseTaskSchema = z.object({
  title: z.string().trim().min(2, "Task title is required.").max(160),
  description: z.string().trim().max(2000).default(""),
  planned_start_date: z.string().regex(datePattern, "Pick a planned start date."),
  planned_end_date: z.string().regex(datePattern, "Pick a planned end date."),
  assigned_to: optionalUuid,
  sort_order: z.coerce.number().int().min(0).default(0),
  notes: z.string().trim().max(2000).default(""),
});

const createTaskSchema = baseTaskSchema.extend({
  site_id: z.string().uuid("Select a project site."),
  parent_task_id: optionalUuid,
});

const updateTaskSchema = baseTaskSchema.extend({
  id: z.string().uuid("Select a project task."),
  status: z.enum(["planned", "in_progress", "completed", "blocked", "cancelled"]),
  completion_percent: z.coerce.number().int().min(0).max(100),
  actual_start_date: z
    .string()
    .trim()
    .default("")
    .transform((value) => (value && datePattern.test(value) ? value : null)),
  actual_end_date: z
    .string()
    .trim()
    .default("")
    .transform((value) => (value && datePattern.test(value) ? value : null)),
});

const progressSchema = z.object({
  id: z.string().uuid("Select a project task."),
  status: z.enum(["planned", "in_progress", "completed", "blocked", "cancelled"]),
  completion_percent: z.coerce.number().int().min(0).max(100),
  notes: z.string().trim().max(2000).default(""),
});

const idSchema = z.object({ id: z.string().uuid("Select a project task.") });

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function taskError(message: string): never {
  redirect(
    `${SCHEDULE_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`,
  );
}

export async function createProjectTaskAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canCreateProjectTask(profile.role)) {
    taskError("Your role cannot create project tasks.");
  }

  const parsed = createTaskSchema.safeParse({
    site_id: field(formData, "site_id"),
    parent_task_id: field(formData, "parent_task_id"),
    title: field(formData, "title"),
    description: field(formData, "description"),
    planned_start_date: field(formData, "planned_start_date"),
    planned_end_date: field(formData, "planned_end_date"),
    assigned_to: field(formData, "assigned_to"),
    sort_order: field(formData, "sort_order") || "0",
    notes: field(formData, "notes"),
  });
  if (!parsed.success) {
    taskError(parsed.error.issues[0]?.message ?? "Check the task details.");
  }
  if (parsed.data.planned_end_date < parsed.data.planned_start_date) {
    taskError("Planned end date must be on or after planned start date.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("project_tasks")
    .insert({ ...parsed.data, created_by: profile.id })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    logOpsServerError(error, {
      module: "project_tasks",
      action: "createProjectTaskAction",
    });
    taskError(error?.message ?? "The project task could not be created.");
  }

  await recordOpsAuditEvent({
    action: "project_task.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "project_task",
    metadata: {
      site_id: parsed.data.site_id,
      planned_end_date: parsed.data.planned_end_date,
    },
    moduleKey: "project_schedule",
    sourceId: data.id,
    sourceTable: "project_tasks",
    summary: `Created project task: ${parsed.data.title}`,
  }).catch(() => null);

  revalidatePath(SCHEDULE_ROUTE);
  revalidatePath(`${SCHEDULE_ROUTE}/${parsed.data.site_id}`);
  redirect(`${SCHEDULE_ROUTE}/${parsed.data.site_id}?created=task#task-${data.id}`);
}

export async function updateProjectTaskAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canEditProjectTask(profile.role)) {
    taskError("Your role cannot edit project tasks.");
  }
  const parsed = updateTaskSchema.safeParse({
    id: field(formData, "id"),
    title: field(formData, "title"),
    description: field(formData, "description"),
    planned_start_date: field(formData, "planned_start_date"),
    planned_end_date: field(formData, "planned_end_date"),
    assigned_to: field(formData, "assigned_to"),
    sort_order: field(formData, "sort_order") || "0",
    notes: field(formData, "notes"),
    status: field(formData, "status"),
    completion_percent: field(formData, "completion_percent") || "0",
    actual_start_date: field(formData, "actual_start_date"),
    actual_end_date: field(formData, "actual_end_date"),
  });
  if (!parsed.success) {
    taskError(parsed.error.issues[0]?.message ?? "Check the task details.");
  }
  if (parsed.data.planned_end_date < parsed.data.planned_start_date) {
    taskError("Planned end date must be on or after planned start date.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { id, ...patch } = parsed.data;
  const { error, data } = await supabase
    .from("project_tasks")
    .update(patch)
    .eq("id", id)
    .is("archived_at", null)
    .select("site_id")
    .single<{ site_id: string }>();

  if (error || !data) {
    taskError(error?.message ?? "The project task could not be updated.");
  }

  await recordOpsAuditEvent({
    action: "project_task.updated",
    actorUserId: profile.id,
    entityId: id,
    entityType: "project_task",
    moduleKey: "project_schedule",
    sourceId: id,
    sourceTable: "project_tasks",
    summary: `Updated project task: ${patch.title}`,
  }).catch(() => null);

  revalidatePath(`${SCHEDULE_ROUTE}/${data.site_id}`);
  redirect(`${SCHEDULE_ROUTE}/${data.site_id}?updated=task#task-${id}`);
}

export async function updateProjectTaskProgressAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = progressSchema.safeParse({
    id: field(formData, "id"),
    status: field(formData, "status"),
    completion_percent: field(formData, "completion_percent") || "0",
    notes: field(formData, "notes"),
  });
  if (!parsed.success) {
    taskError(parsed.error.issues[0]?.message ?? "Pick a status and progress.");
  }

  const task = await fetchOpsProjectTaskById(parsed.data.id);
  if (!task) {
    taskError("The project task was not found.");
  }

  if (!canUpdateProjectTaskProgress(profile.role, profile.id, task)) {
    taskError("Only the assigned engineer or managers can update this task.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const patch: Record<string, unknown> = {
    status: parsed.data.status,
    completion_percent:
      parsed.data.status === "completed" ? 100 : parsed.data.completion_percent,
    notes: parsed.data.notes || task.notes,
  };
  // Auto-stamp start/end dates as the status moves.
  if (
    parsed.data.status === "in_progress" &&
    !task.actual_start_date
  ) {
    patch.actual_start_date = new Date().toISOString().slice(0, 10);
  }
  if (parsed.data.status === "completed") {
    patch.actual_end_date = new Date().toISOString().slice(0, 10);
    if (!task.actual_start_date) {
      patch.actual_start_date = new Date().toISOString().slice(0, 10);
    }
  }

  const { error } = await supabase
    .from("project_tasks")
    .update(patch)
    .eq("id", parsed.data.id)
    .is("archived_at", null);

  if (error) {
    taskError(error.message);
  }

  await recordOpsAuditEvent({
    action: "project_task.progress",
    actorUserId: profile.id,
    entityId: task.id,
    entityType: "project_task",
    metadata: {
      status: parsed.data.status,
      completion_percent: patch.completion_percent,
    },
    moduleKey: "project_schedule",
    sourceId: task.id,
    sourceTable: "project_tasks",
    summary: `Marked ${task.title} as ${parsed.data.status} (${patch.completion_percent}%)`,
  }).catch(() => null);

  revalidatePath(`${SCHEDULE_ROUTE}/${task.site_id}`);
  redirect(
    `${SCHEDULE_ROUTE}/${task.site_id}?updated=progress#task-${task.id}`,
  );
}

/**
 * Freeze the programme's approved dates (audit D11).
 *
 * `planned_start_date` / `planned_end_date` are mutable and drift with
 * reality, so without a frozen copy the plan always agrees with itself and
 * slippage is unmeasurable. Baselining copies today's planned dates into the
 * baseline columns for every un-baselined task on the site.
 *
 * Deliberately only fills EMPTY baselines. Re-baselining an already-baselined
 * task would erase the evidence of slip, which is the one thing the baseline
 * exists to preserve — a genuine re-baseline is a management decision that
 * should leave a trail, not a side effect of pressing this again.
 */
export async function baselineProjectScheduleAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canCreateProjectTask(profile.role)) {
    taskError("Your role cannot baseline the programme.");
  }

  const siteId = field(formData, "site_id");
  if (!siteId) {
    taskError("Select a project to baseline.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const nowIso = new Date().toISOString();

  // Only un-baselined tasks. Copy planned → baseline per row: an UPDATE
  // cannot reference another column through PostgREST, so the copy is explicit.
  const { data: rows, error } = await supabase
    .from("project_tasks")
    .select("id, planned_start_date, planned_end_date")
    .eq("site_id", siteId)
    .is("archived_at", null)
    .is("baseline_end_date", null);

  if (error) {
    taskError(error.message);
  }

  const pending = (rows ?? []) as Array<{
    id: string;
    planned_start_date: string;
    planned_end_date: string;
  }>;

  if (pending.length === 0) {
    taskError("Every task on this programme is already baselined.");
  }

  for (const row of pending) {
    await supabase
      .from("project_tasks")
      .update({
        baseline_start_date: row.planned_start_date,
        baseline_end_date: row.planned_end_date,
        baseline_set_at: nowIso,
        baseline_set_by: profile.id,
      })
      .eq("id", row.id);
  }

  await recordOpsAuditEvent({
    action: "project_schedule.baselined",
    actorUserId: profile.id,
    entityId: siteId,
    entityType: "site",
    metadata: { tasks_baselined: pending.length },
    moduleKey: "project_schedule",
    sourceId: siteId,
    sourceTable: "sites",
    summary: `Baselined ${pending.length} programme task(s)`,
  }).catch(() => null);

  revalidatePath(`${SCHEDULE_ROUTE}/${siteId}`);
  redirect(`${SCHEDULE_ROUTE}/${siteId}?updated=baselined`);
}

export async function archiveProjectTaskAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canArchiveProjectTask(profile.role)) {
    taskError("Your role cannot archive project tasks.");
  }
  const parsed = idSchema.safeParse({ id: field(formData, "id") });
  if (!parsed.success) {
    taskError("Select a project task to archive.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error, data } = await supabase
    .from("project_tasks")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", parsed.data.id)
    .select("site_id")
    .single<{ site_id: string }>();

  if (error || !data) {
    taskError(error?.message ?? "The project task could not be archived.");
  }

  await recordOpsAuditEvent({
    action: "project_task.archived",
    actorUserId: profile.id,
    entityId: parsed.data.id,
    entityType: "project_task",
    moduleKey: "project_schedule",
    sourceId: parsed.data.id,
    sourceTable: "project_tasks",
    summary: "Archived project task",
  }).catch(() => null);

  revalidatePath(`${SCHEDULE_ROUTE}/${data.site_id}`);
  redirect(`${SCHEDULE_ROUTE}/${data.site_id}?updated=archived`);
}

export async function deleteProjectTaskAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canDeleteProjectTask(profile.role)) {
    taskError("Only the Developer can permanently delete project tasks.");
  }
  const parsed = idSchema.safeParse({ id: field(formData, "id") });
  if (!parsed.success) {
    taskError("Select a project task to delete.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: target } = await supabase
    .from("project_tasks")
    .select("site_id")
    .eq("id", parsed.data.id)
    .maybeSingle<{ site_id: string }>();

  const { error } = await supabase
    .from("project_tasks")
    .delete()
    .eq("id", parsed.data.id);
  if (error) {
    taskError(error.message);
  }

  await recordOpsAuditEvent({
    action: "project_task.deleted",
    actorUserId: profile.id,
    entityId: parsed.data.id,
    entityType: "project_task",
    moduleKey: "project_schedule",
    sourceId: parsed.data.id,
    sourceTable: "project_tasks",
  }).catch(() => null);

  if (target?.site_id) {
    revalidatePath(`${SCHEDULE_ROUTE}/${target.site_id}`);
  }
  redirect(SCHEDULE_ROUTE);
}
