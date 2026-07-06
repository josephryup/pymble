import {
  AlertTriangle,
  Archive,
  Banknote,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Landmark,
  Lock,
  Plus,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsProjectPnlPanel } from "@/components/ops/OpsProjectPnlPanel";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  activateProjectBudgetAction,
  addProjectBudgetLineAction,
  archiveProjectBudgetAction,
  createProjectBudgetAction,
  lockProjectBudgetAction,
} from "@/lib/ops/finance-actions";
import {
  canActivateOpsProjectBudget,
  canArchiveOpsProjectBudget,
  canCreateOpsProjectBudget,
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
} from "@/lib/ops/ui";
import type { OpsProjectBudgetStatus } from "@/lib/ops/types";

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
    line_added: "Project budget line added.",
    locked: "Project budget locked.",
  };

  return updated && messages[updated]
    ? {
        message: messages[updated],
        tone: "success" as const,
      }
    : null;
}

function todayInLusaka() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Lusaka",
    year: "numeric",
  }).format(new Date());
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeZone: "Africa/Lusaka",
  }).format(new Date(`${value}T00:00:00+02:00`));
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

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function statusClass(status: OpsProjectBudgetStatus) {
  if (status === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "locked") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (status === "archived") {
    return "border-primary-dark/10 bg-primary-dark/[0.04] text-primary-dark/55";
  }

  return "border-orange-200 bg-orange-50 text-orange-700";
}

function BudgetMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
        {label}
      </dt>
      <dd className="mt-1 font-bold text-primary-dark">{value}</dd>
    </div>
  );
}

function AddBudgetLineForm({ budget }: { budget: OpsProjectBudgetSummary }) {
  return (
    <details className="rounded-md border border-primary-dark/10">
      <summary
        className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-primary-dark transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
      >
        <span className="inline-flex items-center gap-2">
          <Plus className="size-4" aria-hidden="true" />
          Add budget line
        </span>
        <span className="text-xs uppercase tracking-[0.12em] text-primary-dark/45">
          Open
        </span>
      </summary>
      <form
        action={addProjectBudgetLineAction}
        className="grid gap-3 border-t border-primary-dark/10 p-4 min-[520px]:grid-cols-2 lg:grid-cols-6"
      >
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

  if (!canAccessOpsHref(auth.profile.role, "/ops/project-budgets")) {
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
          <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark">
            Project budgets
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
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

        <div className="mt-4 rounded-md border border-primary-dark/10">
          <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
              Highest exposure
            </p>
            <Gauge className="size-4 text-primary-blue" aria-hidden="true" />
          </div>
          {varianceDashboard.rows.length > 0 ? (
            <ul className="divide-y divide-primary-dark/10">
              {varianceDashboard.rows.map((row) => {
                const progress = Math.max(0, Math.min(row.variance_percent, 100));

                return (
                  <li className="px-3 py-3" key={row.id}>
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-primary-dark">{row.budget_number}</p>
                          {row.over_budget_amount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-red-700">
                              <AlertTriangle className="size-3.5" aria-hidden="true" />
                              Over
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-sm text-primary-dark/62">
                          {row.title} / {row.site ? `${row.site.code} - ${row.site.name}` : "Site unavailable"}
                        </p>
                      </div>
                      <div className="shrink-0 text-left lg:text-right">
                        <p className="text-sm font-bold text-primary-dark">
                          {formatMoney(row.exposure_amount, row.currency_code)}
                        </p>
                        <p className="text-xs font-semibold text-primary-dark/55">
                          {formatPercent(row.variance_percent)} used
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-primary-dark/[0.06]">
                      <div
                        aria-hidden="true"
                        className={`h-full rounded-full ${
                          row.over_budget_amount > 0 ? "bg-red-500" : "bg-primary-blue"
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <dl className="mt-3 grid gap-2 text-xs min-[520px]:grid-cols-3">
                      <div className="flex justify-between gap-2 rounded-md bg-primary-dark/[0.03] px-2 py-1.5">
                        <dt className="text-primary-dark/55">Posted</dt>
                        <dd className="font-bold text-primary-dark">
                          {formatMoney(row.posted_amount, row.currency_code)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2 rounded-md bg-primary-dark/[0.03] px-2 py-1.5">
                        <dt className="text-primary-dark/55">Committed</dt>
                        <dd className="font-bold text-primary-dark">
                          {formatMoney(row.committed_amount, row.currency_code)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2 rounded-md bg-primary-dark/[0.03] px-2 py-1.5">
                        <dt className="text-primary-dark/55">Remaining</dt>
                        <dd className="font-bold text-primary-dark">
                          {formatMoney(row.remaining_amount, row.currency_code)}
                        </dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-3 py-6 text-center text-sm text-primary-dark/60">
              Activate a budget and add cost lines to see variance.
            </p>
          )}
        </div>
      </OpsDashboardPanel>

      {canCreate ? (
        <details
          className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white"
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
              <span className="block font-heading text-xl font-bold text-primary-dark">
                Create project budget
              </span>
              <span className="mt-1 block text-sm text-primary-dark/60">
                Start with a budget header, then add cost lines before activation.
              </span>
            </span>
            <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
              Open
            </span>
          </summary>
          {siteOptions.length === 0 ? (
            <div className="border-t border-primary-dark/10 p-5">
              <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                Add at least one active site before creating project budgets.
              </div>
            </div>
          ) : (
            <form
              action={createProjectBudgetAction}
              className="grid gap-4 border-t border-primary-dark/10 p-5 min-[520px]:grid-cols-2 lg:grid-cols-6"
            >
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
        className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white"
        id="project-budget-register"
      >
        <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
              Budget register
            </p>
            <h2 className="font-heading text-xl font-bold text-primary-dark">
              Project budget records
            </h2>
            <p className="mt-1 text-sm text-primary-dark/60">
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
          <div className="divide-y divide-primary-dark/10">
            {budgetPage.items.map((budget) => {
              const canAddLine = canEditOpsProjectBudgetLine(auth.profile.role, budget);
              const canActivate = canActivateOpsProjectBudget(auth.profile.role, budget);
              const canLock = canLockOpsProjectBudget(auth.profile.role, budget);
              const canArchive = canArchiveOpsProjectBudget(auth.profile.role, budget);

              return (
                <article className="p-5" key={budget.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading text-lg font-bold text-primary-dark">
                          {budget.budget_number}
                        </h3>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(
                            budget.status,
                          )}`}
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
                      <p className="mt-2 font-bold text-primary-dark">{budget.title}</p>
                      <p className="mt-1 text-sm leading-6 text-primary-dark/62">
                        {budget.site
                          ? `${budget.site.code} - ${budget.site.name}`
                          : "Site unavailable"}{" "}
                        / effective {formatDate(budget.effective_from)}
                      </p>
                    </div>
                    <div className="grid gap-2 min-[520px]:grid-cols-3 lg:min-w-56 lg:grid-cols-1">
                      {canActivate ? (
                        <form action={activateProjectBudgetAction}>
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
                    <p className="mt-4 rounded-md border border-primary-dark/10 px-3 py-3 text-sm leading-6 text-primary-dark/65">
                      {budget.description}
                    </p>
                  ) : null}

                  <div className="mt-4 grid gap-3">
                    {canAddLine ? <AddBudgetLineForm budget={budget} /> : null}
                    {budget.lines.length > 0 ? (
                      <div className="overflow-x-auto rounded-md border border-primary-dark/10">
                        <table className="min-w-[720px] w-full text-left text-sm">
                          <caption className="sr-only">
                            Project budget lines with cost code, description, budgeted, committed,
                            and posted amounts.
                          </caption>
                          <thead className="bg-primary-dark/[0.03] text-xs uppercase tracking-[0.12em] text-primary-dark/45">
                            <tr>
                              <th className="px-3 py-3" scope="col">Line</th>
                              <th className="px-3 py-3" scope="col">Cost code</th>
                              <th className="px-3 py-3" scope="col">Classification</th>
                              <th className="px-3 py-3" scope="col">Description</th>
                              <th className="px-3 py-3" scope="col">Budgeted</th>
                              <th className="px-3 py-3" scope="col">Committed</th>
                              <th className="px-3 py-3" scope="col">Posted</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-primary-dark/10">
                            {budget.lines.map((line) => (
                              <tr key={line.id}>
                                <td className="px-3 py-3 font-bold text-primary-dark">
                                  {line.line_number}
                                </td>
                                <td className="px-3 py-3 text-primary-dark/65">
                                  {line.cost_code || "No code"}
                                </td>
                                <td className="px-3 py-3">
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.06em] ${
                                      line.category === "transport"
                                        ? "border-primary-blue/25 bg-primary-blue/10 text-primary-blue"
                                        : line.category === "unplanned"
                                          ? "border-orange-200 bg-orange-50 text-orange-700"
                                          : "border-primary-dark/15 bg-primary-dark/[0.04] text-primary-dark/60"
                                    }`}
                                  >
                                    {line.category === "transport" ? (
                                      <Truck className="size-3" aria-hidden="true" />
                                    ) : null}
                                    {line.category}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-primary-dark/70">
                                  {line.description}
                                </td>
                                <td className="px-3 py-3 font-semibold text-primary-dark">
                                  {formatMoney(line.budgeted_amount, budget.currency_code)}
                                </td>
                                <td className="px-3 py-3 text-primary-dark/65">
                                  {formatMoney(line.committed_amount, budget.currency_code)}
                                </td>
                                <td className="px-3 py-3 text-primary-dark/65">
                                  {formatMoney(line.posted_amount, budget.currency_code)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="rounded-md border border-primary-dark/10 px-3 py-3 text-sm text-primary-dark/60">
                        No budget lines added yet.
                      </p>
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
              <p className="font-heading text-xl font-bold text-primary-dark">
                {hasActiveListFilter ? "No matching budgets" : "No project budgets yet"}
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-primary-dark/60">
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
