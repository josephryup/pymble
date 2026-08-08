import { requireOpsUser } from "@/lib/ops/auth";
import { logOpsServerError } from "@/lib/ops/log";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsUserRole } from "@/lib/ops/types";

export type OpsProjectTaskStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "blocked"
  | "cancelled";

export type OpsProjectTaskAssignee = {
  id: string;
  full_name: string;
  role: OpsUserRole;
} | null;

export type OpsProjectTaskSite = {
  id: string;
  code: string;
  name: string;
} | null;

export type OpsProjectTask = {
  id: string;
  site_id: string;
  parent_task_id: string | null;
  title: string;
  description: string;
  status: OpsProjectTaskStatus;
  planned_start_date: string;
  planned_end_date: string;
  /** The approved dates, frozen at baselining. Null until baselined (D11). */
  baseline_start_date: string | null;
  baseline_end_date: string | null;
  baseline_set_at: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  completion_percent: number;
  assigned_to: string | null;
  /** The WBS leaf this activity's cost belongs to. Optional — not every
   *  activity carries cost of its own. */
  cost_code_id: string | null;
  sort_order: number;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_by: string | null;
  assignee: OpsProjectTaskAssignee;
  site: OpsProjectTaskSite;
  /** Computed: days past planned_end_date when still open. Negative = on time. */
  days_overdue: number;
  /** Computed: planned_end_date < today AND status open. */
  is_overdue: boolean;
};

type Relation<T> = T | T[] | null;

type RawProjectTask = Omit<
  OpsProjectTask,
  "assignee" | "site" | "days_overdue" | "is_overdue"
> & {
  assignee: Relation<NonNullable<OpsProjectTaskAssignee>>;
  site: Relation<NonNullable<OpsProjectTaskSite>>;
};

function normalizeRel<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function startOfTodayLusaka(): Date {
  const lusakaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lusaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${lusakaDate}T00:00:00+02:00`);
}

function daysBetween(earlier: string, laterIso: Date): number {
  const earlierDate = new Date(`${earlier}T00:00:00+02:00`);
  const diffMs = laterIso.getTime() - earlierDate.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

function normalize(task: RawProjectTask): OpsProjectTask {
  const today = startOfTodayLusaka();
  const daysOverdue = daysBetween(task.planned_end_date, today);
  const isOpen = task.status !== "completed" && task.status !== "cancelled";
  return {
    ...task,
    assignee: normalizeRel(task.assignee),
    site: normalizeRel(task.site),
    days_overdue: daysOverdue,
    is_overdue: isOpen && daysOverdue > 0,
  };
}

const TASK_SELECT = [
  "id",
  "site_id",
  "parent_task_id",
  "title",
  "description",
  "status",
  "planned_start_date",
  "planned_end_date",
  // The approved dates, frozen. planned_* drift with reality; without these
  // the plan always agrees with itself and slippage is unmeasurable (D11).
  "baseline_start_date",
  "baseline_end_date",
  "baseline_set_at",
  "actual_start_date",
  "actual_end_date",
  "completion_percent",
  "assigned_to",
  "cost_code_id",
  "sort_order",
  "notes",
  "created_by",
  "created_at",
  "updated_at",
  "archived_at",
  "archived_by",
  "assignee:users!project_tasks_assigned_to_fkey(id, full_name, role)",
  "site:sites!project_tasks_site_id_fkey(id, code, name)",
].join(", ");

export async function fetchOpsProjectTasksForSite(siteId: string) {
  await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("project_tasks")
    .select(TASK_SELECT)
    .eq("site_id", siteId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true })
    .order("planned_start_date", { ascending: true });

  if (error) {
    logOpsServerError(error, {
      module: "project_tasks",
      action: "fetchOpsProjectTasksForSite",
      entityId: siteId,
    });
    throw error;
  }

  return ((data ?? []) as unknown as RawProjectTask[]).map(normalize);
}

export async function fetchOpsProjectTaskById(taskId: string): Promise<OpsProjectTask | null> {
  await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("project_tasks")
    .select(TASK_SELECT)
    .eq("id", taskId)
    .maybeSingle();
  if (error) {
    logOpsServerError(error, {
      module: "project_tasks",
      action: "fetchOpsProjectTaskById",
      entityId: taskId,
    });
    throw error;
  }
  return data ? normalize(data as unknown as RawProjectTask) : null;
}

export async function fetchOpsProjectTasksAssignedTo(userId: string) {
  await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("project_tasks")
    .select(TASK_SELECT)
    .eq("assigned_to", userId)
    .is("archived_at", null)
    .not("status", "in", "(completed,cancelled)")
    .order("planned_end_date", { ascending: true });
  if (error) {
    logOpsServerError(error, {
      module: "project_tasks",
      action: "fetchOpsProjectTasksAssignedTo",
    });
    throw error;
  }
  return ((data ?? []) as unknown as RawProjectTask[]).map(normalize);
}

export type OpsSiteProgressRollup = {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  blockedTasks: number;
  averageCompletion: number;
};

/**
 * Site progress from a list of tasks. Averages completion_percent across
 * non-cancelled tasks. Skips cancelled tasks entirely so they don't drag the
 * average down.
 */
export function computeOpsSiteProgress(tasks: OpsProjectTask[]): OpsSiteProgressRollup {
  const live = tasks.filter((task) => task.status !== "cancelled");
  if (live.length === 0) {
    return {
      totalTasks: 0,
      completedTasks: 0,
      overdueTasks: 0,
      blockedTasks: 0,
      averageCompletion: 0,
    };
  }
  const total = live.reduce((sum, task) => sum + task.completion_percent, 0);
  return {
    totalTasks: live.length,
    completedTasks: live.filter((task) => task.status === "completed").length,
    overdueTasks: live.filter((task) => task.is_overdue).length,
    blockedTasks: live.filter((task) => task.status === "blocked").length,
    averageCompletion: Math.round(total / live.length),
  };
}

export type OpsPlannedProgressPoint = {
  /** ISO date of the sample. */
  date: string;
  /** Short chart label, e.g. "23 Jun". */
  label: string;
  /** Cumulative planned completion (0–100) if every task tracked its window. */
  planned: number;
};

export type OpsPlannedProgressCurve = {
  points: OpsPlannedProgressPoint[];
  /** Where the plan says the site should be today (0–100), null if today is outside the programme. */
  plannedToday: number | null;
};

const CURVE_LABEL_FORMAT = new Intl.DateTimeFormat("en-ZM", {
  day: "numeric",
  month: "short",
  timeZone: "Africa/Lusaka",
});

/**
 * Planned S-curve for a site programme, assuming linear progress inside each
 * task's planned window and equal task weights — the same weighting as
 * computeOpsSiteProgress, so "planned today" is directly comparable to
 * averageCompletion. We deliberately do NOT plot an "actual" curve: only the
 * current completion is stored, not its history, and inventing one would be
 * decorative data.
 */
export function buildOpsPlannedProgressCurve(
  tasks: OpsProjectTask[],
  today = new Date(),
  samples = 13,
): OpsPlannedProgressCurve {
  const live = tasks.filter(
    (task) => task.status !== "cancelled" && task.planned_start_date && task.planned_end_date,
  );
  if (live.length === 0) {
    return { points: [], plannedToday: null };
  }

  const starts = live.map((task) => new Date(task.planned_start_date).getTime());
  const ends = live.map((task) => new Date(task.planned_end_date).getTime());
  const programmeStart = Math.min(...starts);
  const programmeEnd = Math.max(...ends);
  if (!Number.isFinite(programmeStart) || programmeEnd <= programmeStart) {
    return { points: [], plannedToday: null };
  }

  const plannedAt = (time: number) => {
    const total = live.reduce((sum, task) => {
      const start = new Date(task.planned_start_date).getTime();
      const end = new Date(task.planned_end_date).getTime();
      if (time <= start) return sum;
      if (time >= end || end <= start) return sum + 100;
      return sum + ((time - start) / (end - start)) * 100;
    }, 0);
    return Math.round(total / live.length);
  };

  const step = (programmeEnd - programmeStart) / (samples - 1);
  const points = Array.from({ length: samples }, (_, index) => {
    const time = programmeStart + index * step;
    const date = new Date(time);
    return {
      date: date.toISOString().slice(0, 10),
      label: CURVE_LABEL_FORMAT.format(date),
      planned: plannedAt(time),
    };
  });

  const now = today.getTime();
  const plannedToday =
    now < programmeStart || now > programmeEnd ? null : plannedAt(now);

  return { points, plannedToday };
}
