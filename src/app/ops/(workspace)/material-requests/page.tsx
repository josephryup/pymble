import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileCheck2,
  PackagePlus,
  Plus,
  Send,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { requireOpsUser } from "@/lib/ops/auth";
import { parseOpsListState } from "@/lib/ops/listing";
import {
  addMaterialRequestItemAction,
  createMaterialRequestAction,
  submitMaterialRequestForApprovalAction,
} from "@/lib/ops/material-request-actions";
import {
  canCreateOpsMaterialRequest,
  canEditOpsMaterialRequest,
  canManageOpsMaterialRequest,
  canSubmitOpsMaterialRequest,
} from "@/lib/ops/material-request-permissions";
import {
  fetchPaginatedOpsMaterialRequests,
  type OpsMaterialRequestSummary,
} from "@/lib/ops/material-requests";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { formatOpsUserName } from "@/lib/ops/roles";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import {
  firstParam,
  formatZmw,
  OPS_FOCUS_CLASS,
  noticeFromParams,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";
import type { OpsMaterialRequestStatus, OpsPriority } from "@/lib/ops/types";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const MATERIAL_REQUEST_STATUS_OPTIONS: Array<{
  label: string;
  value: OpsMaterialRequestStatus | "";
}> = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Submitted", value: "submitted" },
  { label: "In review", value: "in_review" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Ordered", value: "ordered" },
  { label: "Closed", value: "closed" },
];

const PRIORITY_OPTIONS: Array<{ label: string; value: OpsPriority }> = [
  { label: "Low", value: "low" },
  { label: "Normal", value: "normal" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
];

function materialRequestStatusFromParam(value: string | undefined) {
  return MATERIAL_REQUEST_STATUS_OPTIONS.some((status) => status.value === value)
    ? (value as OpsMaterialRequestStatus | "")
    : "";
}

function materialRequestNotice(params: OpsSearchParams) {
  const created = noticeFromParams(
    params,
    "material_request",
    "Material request created as a draft.",
  );

  if (created) {
    return created;
  }

  if (firstParam(params.updated) === "item_added") {
    return {
      message: "Material request item added.",
      tone: "success" as const,
    };
  }

  if (firstParam(params.updated) === "attachment") {
    return {
      message: "Material request attachment uploaded.",
      tone: "success" as const,
    };
  }

  if (firstParam(params.updated) === "comment") {
    return {
      message: "Material request comment added.",
      tone: "success" as const,
    };
  }

  return null;
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function statusClass(status: OpsMaterialRequestStatus) {
  if (status === "approved" || status === "closed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "submitted" || status === "in_review" || status === "ordered") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (status === "rejected" || status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-orange-200 bg-orange-50 text-orange-700";
}

function priorityClass(priority: OpsPriority) {
  if (priority === "urgent") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (priority === "high") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (priority === "low") {
    return "border-primary-dark/10 bg-primary-dark/[0.03] text-primary-dark/55";
  }

  return "border-sky-200 bg-sky-50 text-sky-700";
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function hasOpenApproval(request: OpsMaterialRequestSummary) {
  return request.approval_status === "submitted" || request.approval_status === "in_review";
}

function MaterialRequestValueMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-primary-dark/10 px-3 py-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
        {label}
      </dt>
      <dd className="mt-1 font-heading text-xl font-bold text-primary-dark">{value}</dd>
    </div>
  );
}

function MaterialRequestFlowStep({
  description,
  icon: Icon,
  label,
  value,
}: {
  description: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-primary-dark/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
            {label}
          </p>
          <p className="mt-1 font-heading text-xl font-bold text-primary-dark">{value}</p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-blue/10 text-primary-blue">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-primary-dark/60">{description}</p>
    </div>
  );
}

function MaterialRequestItems({ request }: { request: OpsMaterialRequestSummary }) {
  if (request.items.length === 0) {
    return (
      <p className="rounded-md border border-orange-200 bg-orange-50 px-3 py-3 text-sm text-orange-800">
        No line items have been added yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-primary-dark/10">
      <table className="min-w-full divide-y divide-primary-dark/10 text-sm">
        <caption className="sr-only">
          Line items for {request.request_number}
        </caption>
        <thead className="bg-primary-dark/[0.03] text-left text-xs uppercase tracking-[0.12em] text-primary-dark/52">
          <tr>
            <th className="px-3 py-3" scope="col">
              Item
            </th>
            <th className="px-3 py-3" scope="col">
              Quantity
            </th>
            <th className="px-3 py-3" scope="col">
              Estimate
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-primary-dark/10">
          {request.items.map((item) => (
            <tr key={item.id}>
              <td className="px-3 py-3 align-top">
                <p className="font-bold text-primary-dark">{item.item_name}</p>
                {item.specification ? (
                  <p className="mt-1 max-w-lg text-xs leading-5 text-primary-dark/55">
                    {item.specification}
                  </p>
                ) : null}
                {item.notes ? (
                  <p className="mt-1 max-w-lg text-xs leading-5 text-primary-dark/45">
                    {item.notes}
                  </p>
                ) : null}
              </td>
              <td className="px-3 py-3 align-top font-semibold text-primary-dark/70">
                {item.quantity.toLocaleString("en-ZM")} {item.unit}
              </td>
              <td className="px-3 py-3 align-top">
                <p className="font-bold text-primary-dark">{formatZmw(item.estimated_total)}</p>
                <p className="mt-1 text-xs text-primary-dark/45">
                  {formatZmw(item.estimated_unit_cost)} per {item.unit}
                </p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddItemForm({ requestId }: { requestId: string }) {
  return (
    <details className="rounded-md border border-primary-dark/10">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-primary-dark transition hover:text-primary-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue [&::-webkit-details-marker]:hidden">
        <PackagePlus className="size-4" aria-hidden="true" />
        Add line item
      </summary>
      <form
        action={addMaterialRequestItemAction}
        className="grid gap-3 border-t border-primary-dark/10 p-3 min-[520px]:grid-cols-2 lg:grid-cols-6"
      >
        <input name="request_id" type="hidden" value={requestId} />
        <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
          Item
          <input className={OPS_INPUT_CLASS} name="item_name" required />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Quantity
          <input className={OPS_INPUT_CLASS} min="0.01" name="quantity" required step="0.01" type="number" />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Unit
          <input className={OPS_INPUT_CLASS} defaultValue="each" name="unit" required />
        </label>
        <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
          Unit estimate
          <input className={OPS_INPUT_CLASS} min="0" name="estimated_unit_cost" step="0.01" type="number" />
        </label>
        <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-3`}>
          Specification
          <input className={OPS_INPUT_CLASS} name="specification" />
        </label>
        <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-2`}>
          Notes
          <input className={OPS_INPUT_CLASS} name="notes" />
        </label>
        <div className="flex items-end lg:col-span-1">
          <button className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`} type="submit">
            <Plus className="size-4" aria-hidden="true" />
            Add
          </button>
        </div>
      </form>
    </details>
  );
}

export default async function OpsMaterialRequestsPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/material-requests")) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 8 });
  const status = materialRequestStatusFromParam(firstParam(params.status));
  const [requestPage, siteOptions] = await Promise.all([
    fetchPaginatedOpsMaterialRequests({
      listState,
      query: listState.query,
      status: status || undefined,
    }),
    fetchActiveSiteOptions(),
  ]);
  const requests = requestPage.items;
  const canCreate = canCreateOpsMaterialRequest(auth.profile.role);
  const canManageActivity = canCreate || canManageOpsMaterialRequest(auth.profile.role);
  const notice = materialRequestNotice(params);
  const hasActiveListFilter = listState.query.length > 0 || Boolean(status);
  const draftCount = requests.filter((request) => request.status === "draft").length;
  const submittedCount = requests.filter((request) => request.status === "submitted").length;
  const reviewCount = requests.filter((request) => request.status === "in_review").length;
  const pendingCount = requests.filter(
    (request) => request.status === "submitted" || request.status === "in_review",
  ).length;
  const approvedCount = requests.filter((request) => request.status === "approved").length;
  const procurementCount = requests.filter(
    (request) => request.status === "ordered" || request.status === "closed",
  ).length;
  const urgentCount = requests.filter((request) => request.priority === "urgent").length;
  const lineItemCount = requests.reduce((sum, request) => sum + request.items.length, 0);
  const visibleSiteCount = new Set(requests.map((request) => request.site_id)).size;
  const shownTotal = requests.reduce((sum, request) => sum + request.estimated_total, 0);
  const earliestNeededBy = requests.reduce<string | null>((earliest, request) => {
    if (!request.needed_by) {
      return earliest;
    }

    if (!earliest || request.needed_by < earliest) {
      return request.needed_by;
    }

    return earliest;
  }, null);
  const createPanelParams = new URLSearchParams();

  if (listState.query) {
    createPanelParams.set("q", listState.query);
  }

  if (status) {
    createPanelParams.set("status", status);
  }

  createPanelParams.set("create", "request");
  const createRequestHref = `/ops/material-requests?${createPanelParams.toString()}#material-request-create-panel`;
  const openCreatePanel = firstParam(params.create) === "request";

  return (
    <div className="w-full max-w-none space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
            Engineering to Procurement
          </p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark">
            Material requests
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
            Raise site material needs, collect line items, and submit controlled requests into
            approval before procurement action.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/approvals">
            <FileCheck2 className="size-4" aria-hidden="true" />
            Approvals
          </Link>
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/rfq-po">
            <ClipboardList className="size-4" aria-hidden="true" />
            RFQ and PO
          </Link>
          {canCreate ? (
            <a className={OPS_PRIMARY_BUTTON_CLASS} href={createRequestHref}>
              <PackagePlus className="size-4" aria-hidden="true" />
              New request
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
          href="/ops/material-requests?status=draft#request-register"
          icon={ClipboardList}
          label="Drafts shown"
          tone={draftCount > 0 ? "warn" : "default"}
          trend="Editable"
          value={String(draftCount)}
        />
        <OpsKpiCard
          href="/ops/material-requests?status=submitted#request-register"
          icon={Send}
          label="Submitted"
          tone={submittedCount > 0 ? "warn" : "default"}
          trend={`${pendingCount} pending shown`}
          value={String(submittedCount)}
        />
        <OpsKpiCard
          href="/ops/material-requests?status=in_review#request-register"
          icon={Clock}
          label="In review"
          tone={reviewCount > 0 ? "warn" : "default"}
          trend="Approval queue"
          value={String(reviewCount)}
        />
        <OpsKpiCard
          href="/ops/material-requests#request-register"
          icon={AlertTriangle}
          label="Urgent shown"
          tone={urgentCount > 0 ? "warn" : "default"}
          trend="Current filter"
          value={String(urgentCount)}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.45fr)]">
        <OpsDashboardPanel eyebrow="Visible values" title="Current request selection">
          <dl className="grid gap-3 min-[520px]:grid-cols-2">
            <MaterialRequestValueMetric
              label="Matching requests"
              value={requestPage.pagination.total.toLocaleString("en-ZM")}
            />
            <MaterialRequestValueMetric label="Estimate shown" value={formatZmw(shownTotal)} />
            <MaterialRequestValueMetric
              label="Line items shown"
              value={lineItemCount.toLocaleString("en-ZM")}
            />
            <MaterialRequestValueMetric
              label="Sites shown"
              value={visibleSiteCount.toLocaleString("en-ZM")}
            />
          </dl>
        </OpsDashboardPanel>

        <OpsDashboardPanel
          actions={
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/rfq-po">
              Procurement register
            </Link>
          }
          eyebrow="Material flow"
          title="Request to procurement"
        >
          <div className="grid gap-3 lg:grid-cols-4">
            <MaterialRequestFlowStep
              description="Draft requests can keep receiving line items before submission."
              icon={ClipboardList}
              label="Draft scope"
              value={`${draftCount} drafts`}
            />
            <MaterialRequestFlowStep
              description="Submitted and in-review requests wait on the shared approval queue."
              icon={FileCheck2}
              label="Approval queue"
              value={`${pendingCount} pending`}
            />
            <MaterialRequestFlowStep
              description="Approved requests become procurement-ready source records."
              icon={CheckCircle2}
              label="Approved"
              value={`${approvedCount} shown`}
            />
            <MaterialRequestFlowStep
              description="Ordered and closed requests are already handed into procurement."
              icon={PackagePlus}
              label="Handoff"
              value={`${procurementCount} shown`}
            />
          </div>
          <p className="mt-4 text-sm leading-6 text-primary-dark/60">
            Earliest visible need date:{" "}
            <span className="font-bold text-primary-dark">{formatDate(earliestNeededBy)}</span>
          </p>
        </OpsDashboardPanel>
      </div>

      {canCreate ? (
        <details
          className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white"
          id="material-request-create-panel"
          open={openCreatePanel}
        >
          <summary
            className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
              <PackagePlus className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-xl font-bold text-primary-dark">
                Create request
              </span>
              <span className="mt-1 block text-sm text-primary-dark/60">
                Start with site, priority, first item, quantity, and target need date.
              </span>
            </span>
            <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
              Open
            </span>
          </summary>
          {siteOptions.length === 0 ? (
            <div className="border-t border-primary-dark/10 p-5">
              <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                Add at least one active site before creating material requests.
              </div>
            </div>
          ) : (
            <form
              action={createMaterialRequestAction}
              className="grid gap-4 border-t border-primary-dark/10 p-5 min-[520px]:grid-cols-2 lg:grid-cols-6"
            >
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Site
                <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id" required>
                  <option value="" disabled>
                    Select Pymble site
                  </option>
                  {siteOptions.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.code} - {site.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
                Request title
                <input className={OPS_INPUT_CLASS} name="title" required />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Priority
                <select className={OPS_INPUT_CLASS} defaultValue="normal" name="priority">
                  {PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority.value} value={priority.value}>
                      {priority.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-4`}>
                Description
                <input className={OPS_INPUT_CLASS} name="description" />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Needed by
                <input className={OPS_INPUT_CLASS} name="needed_by" type="date" />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                First item
                <input className={OPS_INPUT_CLASS} name="item_name" required />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Quantity
                <input className={OPS_INPUT_CLASS} min="0.01" name="quantity" required step="0.01" type="number" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Unit
                <input className={OPS_INPUT_CLASS} defaultValue="each" name="unit" required />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Unit estimate
                <input className={OPS_INPUT_CLASS} min="0" name="estimated_unit_cost" step="0.01" type="number" />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
                Specification
                <input className={OPS_INPUT_CLASS} name="specification" />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Notes
                <input className={OPS_INPUT_CLASS} name="notes" />
              </label>
              <div className="flex items-end lg:col-span-1">
                <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
                  <Plus className="size-4" aria-hidden="true" />
                  Create
                </button>
              </div>
            </form>
          )}
        </details>
      ) : (
        <div className="rounded-md border border-primary-dark/10 bg-white px-4 py-3 text-sm text-primary-dark/65">
          Your role can review material requests assigned to it, but cannot create new ones.
        </div>
      )}

      <section className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white" id="request-register">
        <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
              Request register
            </p>
            <h2 className="font-heading text-xl font-bold text-primary-dark">
              Site material requests
            </h2>
            <p className="mt-1 text-sm text-primary-dark/60">
              {requestPage.pagination.total} matching material requests filtered by status and
              search.
            </p>
          </div>
          <ClipboardList className="size-6 shrink-0 text-primary-blue" aria-hidden="true" />
        </div>
        <OpsListControls
          action="/ops/material-requests"
          filters={[
            {
              label: "Status",
              name: "status",
              options: MATERIAL_REQUEST_STATUS_OPTIONS,
              value: status,
            },
          ]}
          placeholder="Search request number, title, or description"
          query={listState.query}
          resultLabel="material requests"
        />

        {requests.length > 0 ? (
          <div className="divide-y divide-primary-dark/10">
            {requests.map((request) => {
              const canEdit = canEditOpsMaterialRequest(
                auth.profile.id,
                auth.profile.role,
                request,
              );
              const canSubmit =
                request.items.length > 0 &&
                !hasOpenApproval(request) &&
                canSubmitOpsMaterialRequest(auth.profile.id, auth.profile.role, request);

              return (
                <article className="p-5" key={request.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading text-lg font-bold text-primary-dark">
                          {request.request_number}
                        </h3>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(
                            request.status,
                          )}`}
                        >
                          {formatLabel(request.status)}
                        </span>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${priorityClass(
                            request.priority,
                          )}`}
                        >
                          {request.priority}
                        </span>
                      </div>
                      <p className="mt-2 font-bold text-primary-dark">{request.title}</p>
                      <p className="mt-1 text-sm leading-6 text-primary-dark/62">
                        {request.site
                          ? `${request.site.code} - ${request.site.name}`
                          : "Site unavailable"}{" "}
                        / needed by {formatDate(request.needed_by)}
                      </p>
                      {request.description ? (
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-primary-dark/60">
                          {request.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="grid gap-2 min-[520px]:grid-cols-2 lg:min-w-56 lg:grid-cols-1">
                      {request.approval_request_id ? (
                        <Link
                          className={OPS_SECONDARY_BUTTON_CLASS}
                          href={`/ops/approvals/${request.approval_request_id}`}
                        >
                          View approval
                        </Link>
                      ) : null}
                      {canSubmit ? (
                        <form action={submitMaterialRequestForApprovalAction}>
                          <input name="request_id" type="hidden" value={request.id} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
                            confirmText="Confirm submit"
                          >
                            <Send className="size-4" aria-hidden="true" />
                            Submit approval
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  <dl className="mt-4 grid gap-3 md:grid-cols-4">
                    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        Items
                      </dt>
                      <dd className="mt-1 font-bold text-primary-dark">{request.items.length}</dd>
                    </div>
                    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        Estimate
                      </dt>
                      <dd className="mt-1 font-bold text-primary-dark">
                        {formatZmw(request.estimated_total)}
                      </dd>
                    </div>
                    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        Requested by
                      </dt>
                      <dd className="mt-1 font-bold text-primary-dark">
                        {formatOpsUserName(request.requester?.full_name, request.requester?.id)}
                      </dd>
                    </div>
                    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        Created
                      </dt>
                      <dd className="mt-1 font-bold text-primary-dark">
                        {formatDateTime(request.created_at)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 grid gap-4">
                    <MaterialRequestItems request={request} />
                    {canEdit ? <AddItemForm requestId={request.id} /> : null}
                  </div>

                  <OpsRecordActivityPanel
                    canManage={canManageActivity}
                    sourceId={request.id}
                    sourceTable="material_requests"
                  />
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
            <ClipboardList className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-primary-dark">
                {hasActiveListFilter ? "No matching material requests" : "No material requests yet"}
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-primary-dark/60">
                {hasActiveListFilter
                  ? "Adjust the search or status filter to widen the material request register."
                  : "Create the first draft request above, add line items, then submit it for approval."}
              </p>
            </div>
          </div>
        )}
        <OpsPaginationControls
          basePath="/ops/material-requests"
          filters={[
            {
              label: "Status",
              name: "status",
              options: [],
              value: status,
            },
          ]}
          pagination={requestPage.pagination}
          query={listState.query}
          resultLabel="material requests"
        />
      </section>
    </div>
  );
}
