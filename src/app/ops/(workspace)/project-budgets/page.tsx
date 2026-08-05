import {
  AlertTriangle,
  Archive,
  Banknote,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Landmark,
  Lock,
  Pencil,
  Plus,
  Save,
  Trash2,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsInlineEmpty } from "@/components/ops/OpsInlineEmpty";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsProjectPnlPanel } from "@/components/ops/OpsProjectPnlPanel";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { OpsReturnToField } from "@/components/ops/OpsReturnToField";
import { OpsSubmitButton } from "@/components/ops/OpsSubmitButton";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  activateProjectBudgetAction,
  addProjectBudgetLineAction,
  deleteProjectBudgetLineAction,
  editProjectBudgetLineAction,
  archiveProjectBudgetAction,
  createProjectBudgetAction,
  editProjectBudgetAction,
  lockProjectBudgetAction,
} from "@/lib/ops/finance-actions";
import {
  canActivateOpsProjectBudget,
  canArchiveOpsProjectBudget,
  canCreateOpsProjectBudget,
  canEditOpsProjectBudget,
  canEditOpsProjectBudgetLine,
  canLockOpsProjectBudget,
  canManageOpsProjectBudget,
} from "@/lib/ops/finance-permissions";
import {
  fetchOpsBudgetVarianceDashboard,
  fetchOpsProjectBudgetStats,
  fetchPaginatedOpsProjectBudgets,
  type OpsProjectBudgetSummary,
} from "@/lib/ops/finance";
import {
  fetchOpsScheduleComposition,
  scheduleCompositionKey,
  type OpsScheduleCompositionLine,
} from "@/lib/ops/boq";
import { parseOpsListState } from "@/lib/ops/listing";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { fetchOpsProjectPnl } from "@/lib/ops/project-pnl";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import {
  firstParam,
  noticeFromParams,
  OPS_DANGER_BUTTON_CLASS,
  OPS_FOCUS_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
  OPS_NOTICE_WARNING_CLASS,
  opsStatusBadgeClass,
} from "@/lib/ops/ui";
import type { OpsProjectBudgetStatus } from "@/lib/ops/types";
import { todayInLusaka, formatOpsLabel as formatLabel, formatOpsDate as formatDate } from "@/lib/ops/format";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const PROJECT_BUDGET_STATUS_OPTIONS: Array<{
  label: string;
  value: OpsProjectBudgetStatus | "";
}> = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Locked", value: "locked" },
  { label: "Archived", value: "archived" },
];

function statusFromParam(value: string | undefined) {
  return PROJECT_BUDGET_STATUS_OPTIONS.some((status) => status.value === value)
    ? (value as OpsProjectBudgetStatus | "")
    : "";
}

function projectBudgetNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "budget", "Project budget created.");

  if (created) {
    return created;
  }

  const updated = firstParam(params.updated);
  const messages: Record<string, string> = {
    activated: "Project budget activated.",
    archived: "Project budget archived.",
    attachment: "Project budget attachment uploaded.",
    comment: "Project budget comment added.",
    edited: "Project budget updated.",
    line_added: "Project budget line added.",
    line_edited: "Budget line updated. The change is recorded in the audit trail with the before and after amounts.",
    line_deleted: "Budget line deleted. The line and its amount are recorded in the audit trail.",
    locked: "Project budget locked.",
  };

  return updated && messages[updated]
    ? {
        message: messages[updated],
        tone: "success" as const,
      }
    : null;
}

/**
 * Drill-down from a generated budget line to the material schedule lines that
 * produced it (audit B2).
 *
 * The budget stays category-level on purpose — Finance wants a handful of lines,
 * not two hundred — so traceability is a look-through rather than an explosion
 * of the budget itself. Renders nothing for lines Finance entered by hand.
 */
/**
 * Edit or delete a single budget line.
 *
 * Deletion is guarded server-side: a line carrying cost entries, material
 * requests or payment requests cannot be removed, because doing so would
 * orphan real money and silently change every variance figure that included
 * it. The action names what is attached and suggests zeroing instead.
 *
 * `cost_code_id` is deliberately absent — the WBS link is maintained on
 * /ops/cost-codes where the structure and GL mapping are visible. Re-pointing
 * it from a free-text form here would reopen the drift the spine closed.
 */
function BudgetLineMaintenance({
  line,
}: {
  line: OpsProjectBudgetSummary["lines"][number];
}) {
  return (
    <details className="rounded-md border border-border">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1 text-xs font-semibold text-muted-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden">
        <Pencil className="size-3.5" aria-hidden="true" />
        Edit
      </summary>
      <div className="space-y-2 border-t border-border p-2">
        <form action={editProjectBudgetLineAction} className="grid gap-2">
          <OpsReturnToField />
          <input name="line_id" type="hidden" value={line.id} />
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            Description
            <input
              className={OPS_INPUT_CLASS}
              defaultValue={line.description}
              name="description"
              required
            />
          </label>
          <div className="grid gap-2 min-[520px]:grid-cols-3">
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
              Cost code
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={line.cost_code}
                name="cost_code"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
              Classification
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={line.category}
                name="category"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
              Budgeted
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={line.budgeted_amount}
                min="0"
                name="budgeted_amount"
                step="0.01"
                type="number"
              />
            </label>
          </div>
          {line.source === "boq" ? (
            <p className="text-xs leading-5 text-amber-700">
              This line is generated from the material schedule. Re-issuing the schedule
              will overwrite the amount — correct the schedule too, or the change is
              temporary.
            </p>
          ) : null}
          <OpsSubmitButton className={OPS_SECONDARY_BUTTON_CLASS}>
            <Save className="size-4" aria-hidden="true" />
            Save line
          </OpsSubmitButton>
        </form>

        <form action={deleteProjectBudgetLineAction}>

          <OpsReturnToField />
          <input name="line_id" type="hidden" value={line.id} />
          <OpsConfirmSubmitButton
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50"
            confirmText="Confirm — delete this line"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete line
          </OpsConfirmSubmitButton>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Only possible while nothing is charged to the line. If spend exists, set the
            amount to zero instead — that keeps the history.
          </p>
        </form>
      </div>
    </details>
  );
}

function BudgetLineComposition({
  currencyCode,
  lines,
}: {
  currencyCode: string;
  lines: OpsScheduleCompositionLine[];
}) {
  if (lines.length === 0) {
    return null;
  }

  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs font-semibold text-primary-blue">
        {lines.length} schedule line{lines.length === 1 ? "" : "s"}
      </summary>
      <ul className="mt-1 space-y-1 border-l border-border pl-3">
        {lines.map((line) => (
          <li key={line.id} className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{line.description}</span>{" "}
            — {line.quantity.toLocaleString("en-ZM", { maximumFractionDigits: 2 })} {line.unit} @{" "}
            {formatMoney(line.unitRate, currencyCode)} ={" "}
            {formatMoney(line.plannedTotal, currencyCode)}
            {line.requestedValue > 0 ? (
              <span
                className={
                  line.requestedValue > line.plannedTotal ? "text-red-700" : "text-emerald-700"
                }
              >
                {" "}
                · {formatMoney(line.requestedValue, currencyCode)} requested
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

function formatMoney(value: number, currencyCode = "ZMW") {
  return new Intl.NumberFormat("en-ZM", {
    currency: currencyCode,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("en-ZM", {
    maximumFractionDigits: 0,
    style: "percent",
  }).format(value / 100);
}

function BudgetMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-bold text-foreground">{value}</dd>
    </div>
  );
}

function AddBudgetLineForm({ budget }: { budget: OpsProjectBudgetSummary }) {
  return (
    <details className="rounded-md border border-border">
      <summary
        className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
      >
        <span className="inline-flex items-center gap-2">
          <Plus className="size-4" aria-hidden="true" />
          Add budget line
        </span>
        <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Open
        </span>
      </summary>
      <form
        action={addProjectBudgetLineAction}
        className="grid gap-3 border-t border-border p-4 min-[520px]:grid-cols-2 lg:grid-cols-6"
      >
        <OpsReturnToField />
        <input name="budget_id" type="hidden" value={budget.id} />
        <label className={OPS_LABEL_CLASS}>
          Cost code
          <input className={OPS_INPUT_CLASS} name="cost_code" placeholder="CIV-001" />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Category
          <input className={OPS_INPUT_CLASS} name="category" placeholder="earthworks" />
        </label>
        <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
          Description
          <input className={OPS_INPUT_CLASS} name="description" required />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Budgeted amount
          <input
            className={OPS_INPUT_CLASS}
            min="0"
            name="budgeted_amount"
            required
            step="0.01"
            type="number"
          />
        </label>
        <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-5`}>
          Notes
          <input className={OPS_INPUT_CLASS} name="notes" />
        </label>
        <div className="flex items-end">
          <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
            <Plus className="size-4" aria-hidden="true" />
            Add
          </button>
        </div>
      </form>
    </details>
  );
}

export default async function OpsProjectBudgetsPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/project-budgets", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 8 });
  const status = statusFromParam(firstParam(params.status));
  const [budgetPage, stats, varianceDashboard, siteOptions, projectPnl] = await Promise.all([
    fetchPaginatedOpsProjectBudgets({
      listState,
      query: listState.query,
      status: status || undefined,
    }),
    fetchOpsProjectBudgetStats(),
    fetchOpsBudgetVarianceDashboard(),
    fetchActiveSiteOptions(),
    fetchOpsProjectPnl(),
  ]);
  // Which schedule lines compose each generated budget line (audit B2).
  const scheduleComposition = await fetchOpsScheduleComposition(
    [...new Set(budgetPage.items.map((budget) => budget.site?.id).filter((id): id is string => Boolean(id)))],
  );
  const notice = projectBudgetNotice(params);
  const canCreate = canCreateOpsProjectBudget(auth.profile.role);
  const canManage = canManageOpsProjectBudget(auth.profile.role);
  const hasActiveListFilter = listState.query.length > 0 || Boolean(status);
  const createPanelParams = new URLSearchParams();

  if (listState.query) {
    createPanelParams.set("q", listState.query);
  }

  if (status) {
    createPanelParams.set("status", status);
  }

  createPanelParams.set("create", "budget");
  const createBudgetHref = `/ops/project-budgets?${createPanelParams.toString()}#project-budget-create-panel`;
  const openCreatePanel = firstParam(params.create) === "budget";

  return (
    <div className="w-full max-w-none space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
            Finance and cost control
          </p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">
            Project budgets
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-foreground/68">
            Site budget headers, cost lines, contingency, committed costs, posted costs, and
            remaining balances.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/payment-requests">
            <Banknote className="size-4" aria-hidden="true" />
            Payment requests
          </Link>
          {canCreate ? (
            <a className={OPS_PRIMARY_BUTTON_CLASS} href={createBudgetHref}>
              <Plus className="size-4" aria-hidden="true" />
              New budget
            </a>
          ) : null}
        </div>
      </section>

      {notice ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm font-semibold ${
            notice.tone === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OpsKpiCard
          href="/ops/project-budgets?status=draft#project-budget-register"
          icon={ClipboardList}
          label="Draft budgets"
          tone={stats.draftBudgets > 0 ? "warn" : "default"}
          hint="Needs activation"
          value={String(stats.draftBudgets)}
        />
        <OpsKpiCard
          href="/ops/project-budgets?status=active#project-budget-register"
          icon={CheckCircle2}
          label="Active budgets"
          tone="good"
          hint="Live control"
          value={String(stats.activeBudgets)}
        />
        <OpsKpiCard
          href="/ops/project-budgets#project-budget-register"
          icon={Landmark}
          label="Budgeted"
          tone="default"
          hint="All lines"
          value={formatMoney(stats.totalBudgetedAmount)}
        />
        <OpsKpiCard
          href="/ops/project-budgets#project-budget-register"
          icon={Banknote}
          label="Committed"
          tone={stats.committedAmount > 0 ? "warn" : "default"}
          hint="Approved unpaid"
          value={formatMoney(stats.committedAmount)}
        />
      </section>

      <OpsProjectPnlPanel pnl={projectPnl} />

      <OpsDashboardPanel eyebrow="Cost movement" title="Posted cost signal">
        <dl className="grid gap-3 min-[520px]:grid-cols-3">
          <BudgetMetric label="Posted costs" value={formatMoney(stats.postedAmount)} />
          <BudgetMetric label="Committed costs" value={formatMoney(stats.committedAmount)} />
          <BudgetMetric
            label="Cost exposure"
            value={formatMoney(stats.postedAmount + stats.committedAmount)}
          />
        </dl>
      </OpsDashboardPanel>

      <OpsDashboardPanel
        eyebrow="Budget variance"
        title="Active budget exposure"
        actions={
          <a className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/payment-requests#payment-request-register">
            <Banknote className="size-4" aria-hidden="true" />
            Payment pressure
          </a>
        }
      >
        <dl className="grid gap-3 min-[520px]:grid-cols-2 xl:grid-cols-5">
          <BudgetMetric
            label="Budgeted"
            value={formatMoney(varianceDashboard.totalBudgetedAmount)}
          />
          <BudgetMetric
            label="Exposure"
            value={formatMoney(varianceDashboard.totalExposureAmount)}
          />
          <BudgetMetric
            label="Remaining"
            value={formatMoney(varianceDashboard.totalRemainingAmount)}
          />
          <BudgetMetric
            label="Over budget"
            value={formatMoney(varianceDashboard.overBudgetAmount)}
          />
          <BudgetMetric
            label="Committed"
            value={formatMoney(varianceDashboard.totalCommittedAmount)}
          />
        </dl>

        <div className="mt-4 rounded-md border border-border">
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Highest exposure
            </p>
            <Gauge className="size-4 text-primary-blue" aria-hidden="true" />
          </div>
          {varianceDashboard.rows.length > 0 ? (
            <ul className="divide-y divide-border">
              {varianceDashboard.rows.map((row) => {
                const progress = Math.max(0, Math.min(row.variance_percent, 100));

                return (
                  <li className="px-3 py-3" key={row.id}>
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-foreground">{row.budget_number}</p>
                          {row.over_budget_amount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-red-700">
                              <AlertTriangle className="size-3.5" aria-hidden="true" />
                              Over
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {row.title} / {row.site ? `${row.site.code} - ${row.site.name}` : "Site unavailable"}
                        </p>
                      </div>
                      <div className="shrink-0 text-left lg:text-right">
                        <p className="text-sm font-bold text-foreground">
                          {formatMoney(row.exposure_amount, row.currency_code)}
                        </p>
                        <p className="text-xs font-semibold text-muted-foreground">
                          {formatPercent(row.variance_percent)} used
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted/40">
                      <div
                        aria-hidden="true"
                        className={`h-full rounded-full ${
                          row.over_budget_amount > 0 ? "bg-red-500" : "bg-primary-blue"
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <dl className="mt-3 grid gap-2 text-xs min-[520px]:grid-cols-3">
                      <div className="flex justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                        <dt className="text-muted-foreground">Posted</dt>
                        <dd className="font-bold text-foreground">
                          {formatMoney(row.posted_amount, row.currency_code)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                        <dt className="text-muted-foreground">Committed</dt>
                        <dd className="font-bold text-foreground">
                          {formatMoney(row.committed_amount, row.currency_code)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                        <dt className="text-muted-foreground">Remaining</dt>
                        <dd className="font-bold text-foreground">
                          {formatMoney(row.remaining_amount, row.currency_code)}
                        </dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Activate a budget and add cost lines to see variance.
            </p>
          )}
        </div>
      </OpsDashboardPanel>

      {canCreate ? (
        <details
          className="scroll-mt-24 rounded-lg border border-border bg-card"
          id="project-budget-create-panel"
          open={openCreatePanel}
        >
          <summary
            className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
              <Landmark className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-xl font-bold text-foreground">
                Create project budget
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Start with a budget header, then add cost lines before activation.
              </span>
            </span>
            <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Open
            </span>
          </summary>
          {siteOptions.length === 0 ? (
            <div className="border-t border-border p-5">
              <div className={OPS_NOTICE_WARNING_CLASS}>
                Add at least one active site before creating project budgets.
              </div>
            </div>
          ) : (
            <form
              action={createProjectBudgetAction}
              className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2 lg:grid-cols-6"
            >
              <OpsReturnToField />
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Site
                <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id" required>
                  <option value="" disabled>
                    Select site
                  </option>
                  {siteOptions.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.code} - {site.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Budget title
                <input className={OPS_INPUT_CLASS} name="title" required />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Currency
                <input className={OPS_INPUT_CLASS} defaultValue="ZMW" name="currency_code" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Effective from
                <input
                  className={OPS_INPUT_CLASS}
                  defaultValue={todayInLusaka()}
                  name="effective_from"
                  type="date"
                />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Contingency
                <input
                  className={OPS_INPUT_CLASS}
                  min="0"
                  name="contingency_amount"
                  step="0.01"
                  type="number"
                />
              </label>
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-6`}>
                Description
                <textarea className={`${OPS_INPUT_CLASS} min-h-24`} name="description" />
              </label>
              <div className="flex items-end min-[520px]:col-span-2 lg:col-span-6">
                <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`} type="submit">
                  <Plus className="size-4" aria-hidden="true" />
                  Create budget
                </button>
              </div>
            </form>
          )}
        </details>
      ) : null}

      <section
        className="scroll-mt-24 rounded-lg border border-border bg-card"
        id="project-budget-register"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Budget register
            </p>
            <h2 className="font-heading text-xl font-bold text-foreground">
              Project budget records
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {budgetPage.pagination.total} matching budgets filtered by status and search.
            </p>
          </div>
          <Landmark className="size-6 shrink-0 text-primary-blue" aria-hidden="true" />
        </div>
        <OpsListControls
          action="/ops/project-budgets"
          filters={[
            {
              label: "Status",
              name: "status",
              options: PROJECT_BUDGET_STATUS_OPTIONS,
              value: status,
            },
          ]}
          placeholder="Search budget number, title, or description"
          query={listState.query}
          resultLabel="project budgets"
        />

        {budgetPage.items.length > 0 ? (
          <div className="divide-y divide-border">
            {budgetPage.items.map((budget) => {
              const canAddLine = canEditOpsProjectBudgetLine(auth.profile.role, budget);
              // Same gate as adding: whoever may add a line may correct or
              // remove one, subject to the server-side referential guards.
              const canEditLines = canAddLine;
              const canEdit = canEditOpsProjectBudget(auth.profile.role, budget);
              const canActivate = canActivateOpsProjectBudget(auth.profile.role, budget);
              const canLock = canLockOpsProjectBudget(auth.profile.role, budget);
              const canArchive = canArchiveOpsProjectBudget(auth.profile.role, budget);

              return (
                <article className="p-5" key={budget.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading text-lg font-bold text-foreground">
                          {budget.budget_number}
                        </h3>
                        <span
                          className={opsStatusBadgeClass(budget.status)}
                        >
                          {formatLabel(budget.status)}
                        </span>
                        {budget.title.startsWith("Budget generated from ") ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-primary-blue/25 bg-primary-blue/10 px-2.5 py-1 text-[11px] font-bold text-primary-blue">
                            <ClipboardList className="size-3" aria-hidden="true" />
                            From material schedule
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 font-bold text-foreground">{budget.title}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {budget.site
                          ? `${budget.site.code} - ${budget.site.name}`
                          : "Site unavailable"}{" "}
                        / effective {formatDate(budget.effective_from)}
                      </p>
                    </div>
                    <div className="grid gap-2 min-[520px]:grid-cols-3 lg:min-w-56 lg:grid-cols-1">
                      {canActivate ? (
                        <form action={activateProjectBudgetAction}>
                          <OpsReturnToField />
                          <input name="budget_id" type="hidden" value={budget.id} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
                            confirmText="Activate budget"
                          >
                            <CheckCircle2 className="size-4" aria-hidden="true" />
                            Activate
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                      {canLock ? (
                        <form action={lockProjectBudgetAction}>
                          <OpsReturnToField />
                          <input name="budget_id" type="hidden" value={budget.id} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`}
                            confirmText="Lock budget"
                          >
                            <Lock className="size-4" aria-hidden="true" />
                            Lock
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                      {canArchive ? (
                        <form action={archiveProjectBudgetAction}>
                          <OpsReturnToField />
                          <input name="budget_id" type="hidden" value={budget.id} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_DANGER_BUTTON_CLASS} w-full`}
                            confirmText="Archive budget"
                          >
                            <Archive className="size-4" aria-hidden="true" />
                            Archive
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  <dl className="mt-4 grid gap-3 md:grid-cols-5">
                    <BudgetMetric
                      label="Budgeted"
                      value={formatMoney(budget.total_budgeted_amount, budget.currency_code)}
                    />
                    <BudgetMetric
                      label="Contingency"
                      value={formatMoney(budget.contingency_amount, budget.currency_code)}
                    />
                    <BudgetMetric
                      label="Committed"
                      value={formatMoney(budget.committed_amount, budget.currency_code)}
                    />
                    <BudgetMetric
                      label="Posted"
                      value={formatMoney(budget.posted_amount, budget.currency_code)}
                    />
                    <BudgetMetric
                      label="Remaining"
                      value={formatMoney(budget.remaining_amount, budget.currency_code)}
                    />
                  </dl>

                  {budget.description ? (
                    <p className="mt-4 rounded-md border border-border px-3 py-3 text-sm leading-6 text-muted-foreground">
                      {budget.description}
                    </p>
                  ) : null}

                  <div className="mt-4 grid gap-3">
                    {canEdit ? (
                      <details className="rounded-md border border-border">
                        <summary
                          className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
                        >
                          <span className="inline-flex items-center gap-2">
                            <Pencil className="size-4" aria-hidden="true" />
                            Edit budget
                          </span>
                          <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                            Open
                          </span>
                        </summary>
                        <form
                          action={editProjectBudgetAction}
                          className="grid gap-3 border-t border-border p-4 min-[520px]:grid-cols-2 lg:grid-cols-6"
                        >
                          <OpsReturnToField />
                          <input name="budget_id" type="hidden" value={budget.id} />
                          <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                            Site
                            <select className={OPS_INPUT_CLASS} defaultValue={budget.site_id} name="site_id" required>
                              <option value="" disabled>
                                Select site
                              </option>
                              {siteOptions.map((site) => (
                                <option key={site.id} value={site.id}>
                                  {site.code} - {site.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                            Budget title
                            <input className={OPS_INPUT_CLASS} defaultValue={budget.title} name="title" required />
                          </label>
                          <label className={OPS_LABEL_CLASS}>
                            Currency
                            <input className={OPS_INPUT_CLASS} defaultValue={budget.currency_code} name="currency_code" />
                          </label>
                          <label className={OPS_LABEL_CLASS}>
                            Effective from
                            <input
                              className={OPS_INPUT_CLASS}
                              defaultValue={budget.effective_from}
                              name="effective_from"
                              type="date"
                            />
                          </label>
                          <label className={OPS_LABEL_CLASS}>
                            Contingency
                            <input
                              className={OPS_INPUT_CLASS}
                              defaultValue={budget.contingency_amount}
                              min="0"
                              name="contingency_amount"
                              step="0.01"
                              type="number"
                            />
                          </label>
                          <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-5`}>
                            Description
                            <textarea className={`${OPS_INPUT_CLASS} min-h-24`} defaultValue={budget.description} name="description" />
                          </label>
                          <div className="flex items-end">
                            <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
                              <Pencil className="size-4" aria-hidden="true" />
                              Save changes
                            </button>
                          </div>
                        </form>
                      </details>
                    ) : null}
                    {canAddLine ? <AddBudgetLineForm budget={budget} /> : null}
                    {budget.lines.length > 0 ? (
                      <div className="overflow-x-auto rounded-md border border-border">
                        <table className="min-w-[720px] w-full text-left text-sm">
                          <caption className="sr-only">
                            Project budget lines with cost code, description, budgeted, committed,
                            and posted amounts.
                          </caption>
                          <thead className="bg-muted/40 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                            <tr>
                              <th className="px-3 py-3" scope="col">Line</th>
                              <th className="px-3 py-3" scope="col">Cost code</th>
                              <th className="px-3 py-3" scope="col">Classification</th>
                              <th className="px-3 py-3" scope="col">Description</th>
                              <th className="px-3 py-3" scope="col">Budgeted</th>
                              <th className="px-3 py-3" scope="col">Committed</th>
                              <th className="px-3 py-3" scope="col">Posted</th>
                              {canEditLines ? (
                                <th className="px-3 py-3" scope="col">Maintain</th>
                              ) : null}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {budget.lines.map((line) => (
                              <tr key={line.id}>
                                <td className="px-3 py-3 font-bold text-foreground">
                                  {line.line_number}
                                </td>
                                <td className="px-3 py-3 text-muted-foreground">
                                  {line.cost_code || "No code"}
                                </td>
                                <td className="px-3 py-3">
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.06em] ${
                                      line.category === "transport"
                                        ? "border-primary-blue/25 bg-primary-blue/10 text-primary-blue"
                                        : line.category === "unplanned"
                                          ? "border-orange-200 bg-orange-50 text-orange-700"
                                          : "border-border bg-muted/40 text-muted-foreground"
                                    }`}
                                  >
                                    {line.category === "transport" ? (
                                      <Truck className="size-3" aria-hidden="true" />
                                    ) : null}
                                    {line.category}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-foreground/70">
                                  {line.description}
                                  <BudgetLineComposition
                                    currencyCode={budget.currency_code}
                                    lines={
                                      line.source === "boq" && budget.site
                                        ? (scheduleComposition.get(
                                            scheduleCompositionKey(budget.site.id, line.category),
                                          ) ?? [])
                                        : []
                                    }
                                  />
                                </td>
                                <td className="px-3 py-3 font-semibold text-foreground">
                                  {formatMoney(line.budgeted_amount, budget.currency_code)}
                                </td>
                                <td className="px-3 py-3 text-muted-foreground">
                                  {formatMoney(line.committed_amount, budget.currency_code)}
                                </td>
                                <td className="px-3 py-3 text-muted-foreground">
                                  {formatMoney(line.posted_amount, budget.currency_code)}
                                </td>
                                {canEditLines ? (
                                  <td className="px-3 py-3 align-top">
                                    <BudgetLineMaintenance line={line} />
                                  </td>
                                ) : null}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <OpsInlineEmpty>No budget lines added yet.</OpsInlineEmpty>
                    )}
                  </div>

                  <OpsRecordActivityPanel
                    canManage={canManage || canAddLine}
                    sourceId={budget.id}
                    sourceTable="project_budgets"
                  />
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
            <Landmark className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-foreground">
                {hasActiveListFilter ? "No matching budgets" : "No project budgets yet"}
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                {hasActiveListFilter
                  ? "Adjust the search or status filter to widen the budget register."
                  : "Create the first project budget, then add budget lines before activation."}
              </p>
            </div>
          </div>
        )}
        <OpsPaginationControls
          basePath="/ops/project-budgets"
          filters={[
            {
              label: "Status",
              name: "status",
              options: [],
              value: status,
            },
          ]}
          pagination={budgetPage.pagination}
          query={listState.query}
          resultLabel="project budgets"
        />
      </section>
    </div>
  );
}
