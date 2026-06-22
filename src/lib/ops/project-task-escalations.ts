import { logOpsServerError } from "@/lib/ops/log";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsUserRole } from "@/lib/ops/types";

const ESCALATION_ROLES: OpsUserRole[] = [
  "projects_manager",
  "engineering_manager",
  "operations_manager",
  "general_manager",
  "managing_director",
];

type OverdueTaskRow = {
  id: string;
  site_id: string;
  title: string;
  planned_end_date: string;
  status: string;
  assigned_to: string | null;
  site: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
};

function todayInLusaka() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Lusaka",
    year: "numeric",
  }).format(new Date());
}

function normalizeSite(
  site: OverdueTaskRow["site"],
): { id: string; code: string; name: string } | null {
  if (!site) return null;
  return Array.isArray(site) ? (site[0] ?? null) : site;
}

async function safeQueue(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    return 1;
  } catch (error) {
    logOpsServerError(error, {
      module: "project_tasks",
      action: `project-overdue-sweep:${label}`,
    });
    return 0;
  }
}

export type ProjectOverdueSweepResult = {
  today: string;
  overdueTasks: number;
  notificationsQueued: number;
};

export async function runOpsProjectOverdueSweep(
  today = todayInLusaka(),
): Promise<ProjectOverdueSweepResult> {
  const supabase = getOpsSupabaseServiceClient();

  // Fetch open tasks whose planned_end_date is before today.
  const { data, error } = await supabase
    .from("project_tasks")
    .select(
      "id, site_id, title, planned_end_date, status, assigned_to, site:sites!project_tasks_site_id_fkey(id, code, name)",
    )
    .lt("planned_end_date", today)
    .not("status", "in", "(completed,cancelled)")
    .is("archived_at", null)
    .order("planned_end_date", { ascending: true })
    .limit(200);

  if (error) {
    logOpsServerError(error, {
      module: "project_tasks",
      action: "runOpsProjectOverdueSweep",
    });
    throw error;
  }

  const overdueTasks = (data ?? []) as OverdueTaskRow[];
  if (overdueTasks.length === 0) {
    return { today, overdueTasks: 0, notificationsQueued: 0 };
  }

  // Look up users in escalation roles once.
  const { data: managers, error: managersError } = await supabase
    .from("users")
    .select("id, role")
    .in("role", ESCALATION_ROLES)
    .eq("is_active", true);

  if (managersError) {
    logOpsServerError(managersError, {
      module: "project_tasks",
      action: "runOpsProjectOverdueSweep:managers",
    });
  }

  const managerIds = (managers ?? []).map((row) => row.id as string);

  let queued = 0;
  for (const task of overdueTasks) {
    const site = normalizeSite(task.site);
    const siteLabel = site ? `${site.code} — ${site.name}` : "site";
    const daysOverdue = Math.max(
      1,
      Math.floor(
        (new Date(`${today}T00:00:00+02:00`).getTime() -
          new Date(`${task.planned_end_date}T00:00:00+02:00`).getTime()) /
          (24 * 60 * 60 * 1000),
      ),
    );
    const actionHref = `/ops/project-schedule/${task.site_id}#task-${task.id}`;
    const body = `${task.title} is ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} past its planned end date on ${siteLabel}.`;

    // Notify the assigned engineer.
    if (task.assigned_to) {
      queued += await safeQueue(`assignee:${task.id}`, () =>
        queueOpsNotification({
          actionHref,
          body,
          idempotencyKey: `project-task-overdue:${today}:assignee:${task.id}`,
          moduleKey: "project_schedule",
          recipientId: task.assigned_to as string,
          sourceId: task.id,
          sourceTable: "project_tasks",
          title: "Your project task is overdue",
        }),
      );
    }

    // Notify each manager once per task per day.
    for (const managerId of managerIds) {
      queued += await safeQueue(`manager:${managerId}:${task.id}`, () =>
        queueOpsNotification({
          actionHref,
          body,
          idempotencyKey: `project-task-overdue:${today}:manager:${managerId}:${task.id}`,
          moduleKey: "project_schedule",
          recipientId: managerId,
          sourceId: task.id,
          sourceTable: "project_tasks",
          title: "Overdue project task on site",
        }),
      );
    }
  }

  return {
    today,
    overdueTasks: overdueTasks.length,
    notificationsQueued: queued,
  };
}
