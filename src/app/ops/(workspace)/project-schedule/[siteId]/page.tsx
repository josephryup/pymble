import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Package,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  deriveOpsBoqLineDates,
  fetchOpsBoqDocuments,
  fetchOpsMaterialTriggerAlerts,
  type OpsBoqLineItem,
} from "@/lib/ops/boq";
import {
  archiveProjectTaskAction,
  createProjectTaskAction,
  updateProjectTaskAction,
  updateProjectTaskProgressAction,
} from "@/lib/ops/project-task-actions";
import {
  canArchiveProjectTask,
  canCreateProjectTask,
  canEditProjectTask,
  canUpdateProjectTaskProgress,
  canViewProjectTasks,
} from "@/lib/ops/project-task-permissions";
import {
  buildOpsPlannedProgressCurve,
  computeOpsSiteProgress,
  fetchOpsProjectTasksForSite,
  type OpsProjectTask,
  type OpsProjectTaskStatus,
} from "@/lib/ops/project-tasks";
import { OPS_CHART_COLORS, OpsTrendChart } from "@/components/ops/OpsAnalyticsCharts";
import { fetchOpsStaffMembers } from "@/lib/ops/staff";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import { formatOpsRole } from "@/lib/ops/roles";
import {
  firstParam,
  noticeFromParams,
  OPS_DANGER_BUTTON_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ siteId: string }>;
  searchParams?: Promise<OpsSearchParams>;
};

function statusBadgeClass(status: OpsProjectTaskStatus, overdue: boolean) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "cancelled") return "border-slate-200 bg-slate-50 text-slate-600";
  if (status === "blocked") return "border-red-200 bg-red-50 text-red-700";
  if (overdue) return "border-orange-200 bg-orange-50 text-orange-700";
  if (status === "in_progress") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-primary-dark/15 bg-primary-dark/[0.04] text-primary-dark/70";
}

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeZone: "Africa/Lusaka",
  }).format(new Date(`${dateString}T00:00:00+02:00`));
}

export default async function OpsProjectScheduleSitePage({ params, searchParams }: PageProps) {
  const { siteId } = await params;
  const search = (await (searchParams ?? Promise.resolve({} as OpsSearchParams))) ?? {};
  const { profile } = await requireOpsUser();

  if (!canViewProjectTasks(profile.role)) {
    notFound();
  }

  const supabase = getOpsSupabaseServiceClient();
  const [siteRes, tasks, staff, boqDocuments, materialTriggerAlerts] = await Promise.all([
    supabase.from("sites").select("id, code, name").eq("id", siteId).maybeSingle(),
    fetchOpsProjectTasksForSite(siteId),
    fetchOpsStaffMembers().catch(() => []),
    fetchOpsBoqDocuments(),
    fetchOpsMaterialTriggerAlerts(siteId),
  ]);
  if (siteRes.error || !siteRes.data) notFound();
  const site = siteRes.data as { id: string; code: string; name: string };

  const canCreate = canCreateProjectTask(profile.role);
  const canEdit = canEditProjectTask(profile.role);
  const canArchive = canArchiveProjectTask(profile.role);
  const rollup = computeOpsSiteProgress(tasks);
  const plannedCurve = buildOpsPlannedProgressCurve(tasks);
  const notice = noticeFromParams(search, "task", "Project task created.");
  const errorMessage = firstParam(search.error);
  const assignableStaff = staff.filter(
    (member) =>
      member.is_active &&
      ["engineer", "engineering_manager", "projects_manager", "supervisor"].includes(
        member.role,
      ),
  );

  // Material schedule (BOQ) lines linked to this site's tasks — the
  // schedule↔material-schedule link surfaced on the schedule itself.
  const boqLinesByTaskId = new Map<string, OpsBoqLineItem[]>();
  for (const document of boqDocuments) {
    if (document.site_id !== site.id) {
      continue;
    }
    for (const item of document.items) {
      if (!item.project_task_id) {
        continue;
      }
      const existing = boqLinesByTaskId.get(item.project_task_id) ?? [];
      existing.push(item);
      boqLinesByTaskId.set(item.project_task_id, existing);
    }
  }

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh tables={["project_tasks"]} />
      <OpsPageHeader
        eyebrow={`${site.code}`}
        title={`Schedule — ${site.name}`}
        description="Plan tasks, assign them to engineers, and track progress to flag overdue work."
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/project-schedule">
            <CalendarRange className="size-4" aria-hidden="true" />
            All sites
          </Link>
        }
      />

      {errorMessage ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {notice.message}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-5">
        <div className="rounded-md border border-primary-dark/10 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
            Site progress
          </p>
          <p className="mt-1 font-heading text-3xl font-bold text-primary-dark">
            {rollup.averageCompletion}%
          </p>
          <div className="mt-2 h-2 rounded-full bg-primary-dark/10">
            <div
              className="h-full rounded-full bg-primary-blue"
              style={{ width: `${rollup.averageCompletion}%` }}
            />
          </div>
        </div>
        <div className="rounded-md border border-primary-dark/10 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
            Tasks
          </p>
          <p className="mt-1 font-heading text-3xl font-bold text-primary-dark">
            {rollup.totalTasks}
          </p>
          <p className="mt-1 text-xs text-primary-dark/55">
            {rollup.completedTasks} completed
          </p>
        </div>
        <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">
            Overdue
          </p>
          <p className="mt-1 font-heading text-3xl font-bold text-orange-700">
            {rollup.overdueTasks}
          </p>
        </div>
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-700">
            Blocked
          </p>
          <p className="mt-1 font-heading text-3xl font-bold text-red-700">
            {rollup.blockedTasks}
          </p>
        </div>
        <Link
          className="block rounded-md border border-orange-200 bg-orange-50 px-4 py-3 shadow-sm transition hover:bg-orange-100"
          href="/ops/boq"
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-orange-700">
            <Package className="size-3.5" aria-hidden="true" />
            Materials due
          </p>
          <p className="mt-1 font-heading text-3xl font-bold text-orange-700">
            {materialTriggerAlerts.length}
          </p>
        </Link>
      </section>

      {plannedCurve.points.length > 0 ? (
        <section className="rounded-2xl border border-primary-dark/10 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-xl font-bold text-primary-dark">
                Planned progress curve
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-primary-dark/60">
                Cumulative planned completion across the programme, assuming each task
                progresses linearly through its planned window (equal task weights).
              </p>
            </div>
            {plannedCurve.plannedToday !== null ? (
              <p
                className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] ${
                  rollup.averageCompletion >= plannedCurve.plannedToday
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-orange-200 bg-orange-50 text-orange-800"
                }`}
              >
                Actual {rollup.averageCompletion}% vs planned {plannedCurve.plannedToday}%
              </p>
            ) : null}
          </div>
          <div className="mt-4">
            <OpsTrendChart
              ariaLabel="Cumulative planned completion percentage across the site programme"
              points={plannedCurve.points.map((point) => ({
                label: point.label,
                planned: point.planned,
              }))}
              series={[
                { key: "planned", label: "Planned completion", color: OPS_CHART_COLORS.blue, kind: "area" },
              ]}
              valueKind="percent"
            />
          </div>
        </section>
      ) : null}

      {canCreate ? (
        <details className="rounded-2xl border border-primary-dark/10 bg-white">
          <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 text-sm font-semibold text-primary-dark">
            <Plus className="size-4" aria-hidden="true" />
            Add a project task
          </summary>
          <form
            action={createProjectTaskAction}
            className="grid gap-3 border-t border-primary-dark/10 p-5 md:grid-cols-6"
          >
            <input name="site_id" type="hidden" value={site.id} />
            <label className={`${OPS_LABEL_CLASS} md:col-span-3`}>
              Task title
              <input className={OPS_INPUT_CLASS} name="title" required />
            </label>
            <label className={`${OPS_LABEL_CLASS} md:col-span-3`}>
              Description
              <input className={OPS_INPUT_CLASS} name="description" />
            </label>
            <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
              Planned start
              <input className={OPS_INPUT_CLASS} name="planned_start_date" required type="date" />
            </label>
            <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
              Planned end
              <input className={OPS_INPUT_CLASS} name="planned_end_date" required type="date" />
            </label>
            <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
              Assigned engineer
              <select className={OPS_INPUT_CLASS} defaultValue="" name="assigned_to">
                <option value="">— Unassigned —</option>
                {assignableStaff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name} ({formatOpsRole(member.role)})
                  </option>
                ))}
              </select>
            </label>
            <div className="md:col-span-6">
              <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                <Plus className="size-4" aria-hidden="true" />
                Add task
              </button>
            </div>
          </form>
        </details>
      ) : null}

      {tasks.length === 0 ? (
        <OpsEmptyState
          icon={ClipboardList}
          title="No tasks scheduled yet"
          description="Once tasks are added, engineers can mark progress and the system computes site completion."
          actions={
            canCreate
              ? [{ href: "#", label: "Use the form above to add a task" }]
              : [{ href: "/ops/project-schedule", label: "Back to all sites", variant: "secondary" }]
          }
        />
      ) : (
        <ul className="space-y-3">
          {tasks.map((task) => (
            <ProjectTaskCard
              key={task.id}
              task={task}
              actorId={profile.id}
              role={profile.role}
              canEdit={canEdit}
              canArchive={canArchive}
              assignableStaff={assignableStaff}
              linkedBoqLines={boqLinesByTaskId.get(task.id) ?? []}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectTaskCard({
  task,
  actorId,
  role,
  canEdit,
  canArchive,
  assignableStaff,
  linkedBoqLines,
}: {
  task: OpsProjectTask;
  actorId: string;
  role: Parameters<typeof canUpdateProjectTaskProgress>[0];
  canEdit: boolean;
  canArchive: boolean;
  assignableStaff: Array<{ id: string; full_name: string; role: string }>;
  linkedBoqLines: OpsBoqLineItem[];
}) {
  const canProgress = canUpdateProjectTaskProgress(role, actorId, task);
  return (
    <li
      id={`task-${task.id}`}
      className="rounded-2xl border border-primary-dark/10 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-lg font-bold text-primary-dark">{task.title}</h3>
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusBadgeClass(task.status, task.is_overdue)}`}
            >
              {task.status.replace("_", " ")}
            </span>
            {task.is_overdue ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-orange-700">
                <AlertTriangle className="size-3" aria-hidden="true" />
                {task.days_overdue}d overdue
              </span>
            ) : null}
          </div>
          {task.description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-primary-dark/65">
              {task.description}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-primary-dark/55">
            {formatDate(task.planned_start_date)} → {formatDate(task.planned_end_date)}
            {task.assignee ? ` · Assigned to ${task.assignee.full_name}` : " · Unassigned"}
          </p>
        </div>
        <div className="w-full sm:w-44">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
            {task.completion_percent}% complete
          </p>
          <div className="mt-1 h-2 rounded-full bg-primary-dark/10">
            <div
              className={`h-full rounded-full ${task.status === "completed" ? "bg-emerald-500" : "bg-primary-blue"}`}
              style={{ width: `${task.completion_percent}%` }}
            />
          </div>
        </div>
      </div>

      {linkedBoqLines.length > 0 ? (
        <details className="mt-3 rounded-md border border-primary-blue/20 bg-primary-blue/5">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-primary-blue">
            <Package className="mr-1 inline size-3.5" aria-hidden="true" />
            {linkedBoqLines.length} material schedule line{linkedBoqLines.length === 1 ? "" : "s"} linked to
            this task
          </summary>
          <ul className="grid gap-1.5 border-t border-primary-blue/15 p-3 text-xs text-primary-dark/70">
            {linkedBoqLines.map((line) => {
              const { triggerBy } = deriveOpsBoqLineDates(line);
              return (
                <li key={line.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-semibold text-primary-dark">{line.description}</span>{" "}
                    ({line.quantity} {line.unit}, {line.category})
                  </span>
                  {triggerBy ? (
                    <span className="text-primary-dark/50">Trigger by {triggerBy}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      {canProgress ? (
        <details className="mt-3 rounded-md border border-primary-dark/10">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-primary-dark/70">
            Update progress
          </summary>
          <form
            action={updateProjectTaskProgressAction}
            className="grid gap-2 border-t border-primary-dark/10 p-3 sm:grid-cols-4"
          >
            <input name="id" type="hidden" value={task.id} />
            <label className={OPS_LABEL_CLASS}>
              Status
              <select className={OPS_INPUT_CLASS} defaultValue={task.status} name="status">
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="blocked">Blocked</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Completion %
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={task.completion_percent}
                max="100"
                min="0"
                name="completion_percent"
                step="5"
                type="number"
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2`}>
              Notes
              <input className={OPS_INPUT_CLASS} defaultValue={task.notes} name="notes" />
            </label>
            <div className="sm:col-span-4">
              <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Save progress
              </button>
            </div>
          </form>
        </details>
      ) : null}

      {canEdit ? (
        <details className="mt-2 rounded-md border border-primary-dark/10">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-primary-dark/70">
            <Pencil className="mr-1 inline size-3.5" aria-hidden="true" /> Edit task details
          </summary>
          <form
            action={updateProjectTaskAction}
            className="grid gap-2 border-t border-primary-dark/10 p-3 sm:grid-cols-6"
          >
            <input name="id" type="hidden" value={task.id} />
            <label className={`${OPS_LABEL_CLASS} sm:col-span-3`}>
              Title
              <input className={OPS_INPUT_CLASS} defaultValue={task.title} name="title" required />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-3`}>
              Description
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={task.description}
                name="description"
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2`}>
              Planned start
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={task.planned_start_date}
                name="planned_start_date"
                required
                type="date"
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2`}>
              Planned end
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={task.planned_end_date}
                name="planned_end_date"
                required
                type="date"
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2`}>
              Assignee
              <select
                className={OPS_INPUT_CLASS}
                defaultValue={task.assigned_to ?? ""}
                name="assigned_to"
              >
                <option value="">— Unassigned —</option>
                {assignableStaff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name} ({formatOpsRole(member.role)})
                  </option>
                ))}
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Status
              <select className={OPS_INPUT_CLASS} defaultValue={task.status} name="status">
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="blocked">Blocked</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Completion %
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={task.completion_percent}
                max="100"
                min="0"
                name="completion_percent"
                step="5"
                type="number"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Actual start
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={task.actual_start_date ?? ""}
                name="actual_start_date"
                type="date"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Actual end
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={task.actual_end_date ?? ""}
                name="actual_end_date"
                type="date"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Sort order
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={task.sort_order}
                name="sort_order"
                type="number"
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-6`}>
              Notes
              <input className={OPS_INPUT_CLASS} defaultValue={task.notes} name="notes" />
            </label>
            <div className="flex items-center gap-2 sm:col-span-6">
              <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                Save task
              </button>
              {canArchive ? (
                <form action={archiveProjectTaskAction} className="inline-block">
                  <input name="id" type="hidden" value={task.id} />
                  <OpsConfirmSubmitButton
                    className={OPS_DANGER_BUTTON_CLASS}
                    confirmText="Confirm archive"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Archive
                  </OpsConfirmSubmitButton>
                </form>
              ) : null}
            </div>
          </form>
        </details>
      ) : null}
    </li>
  );
}
