import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileCheck2,
  FilePlus2,
  PackagePlus,
  Pencil,
  Plus,
  Send,
  Trash2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsChainTracker } from "@/components/ops/OpsChainTracker";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { requireOpsUser } from "@/lib/ops/auth";
import { parseOpsListState } from "@/lib/ops/listing";
import {
  addMaterialRequestItemAction,
  archiveMaterialRequestAction,
  attachMaterialRequestPricingAction,
  cancelMaterialRequestAction,
  createMaterialRequestAction,
  decideMaterialRequestCostAction,
  deleteMaterialRequestItemAction,
  importMaterialRequestItemsAction,
  submitMaterialRequestForApprovalAction,
  updateMaterialRequestHeaderAction,
  updateMaterialRequestItemAction,
} from "@/lib/ops/material-request-actions";
import {
  canApproveMaterialRequestCost,
  canArchiveOpsMaterialRequest,
  canAttachMaterialRequestPricing,
  canCancelOpsMaterialRequest,
  canCreateOpsMaterialRequest,
  canEditOpsMaterialRequest,
  canManageOpsMaterialRequest,
  canSubmitOpsMaterialRequest,
} from "@/lib/ops/material-request-permissions";
import {
  buildMaterialRequestChainSteps,
  fetchPaginatedOpsMaterialRequests,
  type OpsMaterialRequestSummary,
} from "@/lib/ops/material-requests";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { formatOpsUserName } from "@/lib/ops/roles";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import { fetchActiveSupplierOptions } from "@/lib/ops/suppliers";
import { OpsSupplierPicker } from "@/components/ops/OpsSupplierPicker";
import { OpsLineItemsEditor } from "@/components/ops/OpsLineItemsEditor";
import { OpsScopeSitePicker } from "@/components/ops/OpsScopeSitePicker";
import { OpsImportTemplateLinks } from "@/components/ops/OpsImportTemplateLinks";
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

  if (firstParam(params.updated) === "items_imported") {
    const imported = firstParam(params.imported) ?? "0";
    const skipped = firstParam(params.skipped) ?? "0";
    return {
      message: `Imported ${imported} item${imported === "1" ? "" : "s"}${
        skipped !== "0" ? ` (${skipped} row${skipped === "1" ? "" : "s"} skipped)` : ""
      }.`,
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

  const u = firstParam(params.updated);
  if (u === "request") {
    return { tone: "success" as const, message: "Material request updated." };
  }
  if (u === "item") {
    return { tone: "success" as const, message: "Line item updated." };
  }
  if (u === "item_deleted") {
    return { tone: "success" as const, message: "Line item removed." };
  }
  if (u === "priced") {
    return { tone: "success" as const, message: "Supplier prices attached. Finance has been notified." };
  }
  if (u === "cost_approved") {
    return { tone: "success" as const, message: "Cost approved. Procurement can raise the Request for Quotation or Purchase Order." };
  }
  if (u === "cost_rejected") {
    return { tone: "success" as const, message: "Cost rejected. Procurement has been asked to re-price." };
  }
  if (u === "cancelled") {
    return { tone: "success" as const, message: "Material request cancelled." };
  }
  if (u === "archived") {
    return { tone: "success" as const, message: "Material request archived." };
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

  if (status === "pricing_pending") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  if (status === "priced") {
    return "border-amber-200 bg-amber-50 text-amber-700";
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

function MaterialRequestItems({
  canEdit,
  request,
  supplierOptions,
}: {
  canEdit: boolean;
  request: OpsMaterialRequestSummary;
  supplierOptions: Array<{ id: string; label: string }>;
}) {
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
            <th className="px-3 py-3" scope="col">Item</th>
            <th className="px-3 py-3" scope="col">Quantity</th>
            <th className="px-3 py-3" scope="col">Estimate</th>
            {canEdit ? <th className="px-3 py-3" scope="col">Actions</th> : null}
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
                {item.supplier_name ? (
                  <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-primary-blue/20 bg-primary-blue/5 px-2 py-0.5 text-[11px] font-semibold text-primary-blue">
                    Supplier: {item.supplier_name}
                    {!item.supplier_id ? (
                      <span className="text-[10px] font-normal text-primary-blue/60">
                        (not in master list)
                      </span>
                    ) : null}
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
              {canEdit ? (
                <td className="px-3 py-3 align-top">
                  <div className="flex flex-wrap gap-2">
                    <details className="inline-block">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-primary-dark/70 hover:text-primary-dark [&::-webkit-details-marker]:hidden">
                        <Pencil className="size-3.5" aria-hidden="true" />
                        Edit
                      </summary>
                      <form
                        action={updateMaterialRequestItemAction}
                        className="mt-2 grid gap-2 rounded-md border border-primary-dark/10 bg-white p-3 shadow-sm"
                      >
                        <input name="item_id" type="hidden" value={item.id} />
                        <label className="text-xs font-bold text-primary-dark/60">
                          Item
                          <input className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={item.item_name} name="item_name" required />
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          <label className="text-xs font-bold text-primary-dark/60">
                            Qty
                            <input className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={String(item.quantity)} min="0.01" name="quantity" required step="0.01" type="number" />
                          </label>
                          <label className="text-xs font-bold text-primary-dark/60">
                            Unit
                            <input className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={item.unit} name="unit" required />
                          </label>
                          <label className="text-xs font-bold text-primary-dark/60">
                            Est cost
                            <input className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={String(item.estimated_unit_cost)} min="0" name="estimated_unit_cost" step="0.01" type="number" />
                          </label>
                        </div>
                        <label className="text-xs font-bold text-primary-dark/60">
                          Specification
                          <input className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={item.specification} name="specification" />
                        </label>
                        <label className="text-xs font-bold text-primary-dark/60">
                          Notes
                          <input className={`${OPS_INPUT_CLASS} mt-1`} defaultValue={item.notes} name="notes" />
                        </label>
                        <OpsSupplierPicker
                          defaultSupplierId={item.supplier_id}
                          defaultSupplierName={item.supplier_name}
                          helperText="Pick from master list or type a new name."
                          suppliers={supplierOptions}
                        />
                        <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
                          Save line
                        </button>
                      </form>
                    </details>
                    <form action={deleteMaterialRequestItemAction} className="inline-block">
                      <input name="item_id" type="hidden" value={item.id} />
                      <button
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700"
                        type="submit"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddItemForm({
  requestId,
  supplierOptions,
}: {
  requestId: string;
  supplierOptions: Array<{ id: string; label: string }>;
}) {
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
        <div className="lg:col-span-3">
          <OpsSupplierPicker
            helperText="Optional. Each line can nominate its own supplier."
            suppliers={supplierOptions}
          />
        </div>
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

function ImportMaterialItemsForm({ requestId }: { requestId: string }) {
  return (
    <details className="rounded-md border border-primary-dark/10">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-primary-dark transition hover:text-primary-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue [&::-webkit-details-marker]:hidden">
        <FilePlus2 className="size-4" aria-hidden="true" />
        Import items (CSV / Excel / PDF)
      </summary>
      <form
        action={importMaterialRequestItemsAction}
        className="grid gap-3 border-t border-primary-dark/10 p-3"
      >
        <input name="request_id" type="hidden" value={requestId} />
        <p className="text-xs leading-5 text-primary-dark/55">
          Upload a needs list. Recognised columns: item / description, unit, quantity, estimate,
          and supplier (code or name — unmatched names are kept as a typed supplier). The first
          row must be the header.
        </p>
        <OpsImportTemplateLinks kind="material-requests" />
        <label className={OPS_LABEL_CLASS}>
          File
          <input
            accept=".csv,.xlsx,.xls,.pdf"
            className={OPS_INPUT_CLASS}
            name="file"
            required
            type="file"
          />
        </label>
        <div>
          <button className={`${OPS_SECONDARY_BUTTON_CLASS} w-full sm:w-auto`} type="submit">
            <FilePlus2 className="size-4" aria-hidden="true" />
            Import
          </button>
        </div>
      </form>
    </details>
  );
}

function ProcurementPricingForm({ request }: { request: OpsMaterialRequestSummary }) {
  return (
    <form
      action={attachMaterialRequestPricingAction}
      className="rounded-md border border-primary-blue/30 bg-primary-blue/5 p-4"
    >
      <input name="request_id" type="hidden" value={request.id} />
      <div className="mb-3 flex flex-col gap-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary-blue">
          Procurement — attach supplier prices
        </p>
        <p className="text-sm leading-6 text-primary-dark/70">
          Enter the actual unit price you have agreed with the supplier for each line item.
          When you save, the request moves to <strong>Priced</strong> and Finance is notified
          to approve the cost.
        </p>
      </div>
      <div className="grid gap-3">
        {request.items.map((item) => (
          <div
            key={item.id}
            className="grid items-end gap-2 rounded-md border border-primary-dark/10 bg-white p-3 sm:grid-cols-[1fr_auto_auto_auto]"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-primary-dark">{item.item_name}</p>
              <p className="text-xs text-primary-dark/55">
                {item.quantity} {item.unit} · estimate ZMW {formatZmw(item.estimated_unit_cost)} / unit
              </p>
            </div>
            <label className="text-xs font-bold text-primary-dark/60">
              Actual unit price (ZMW)
              <input
                className={`${OPS_INPUT_CLASS} mt-1 w-36 text-right`}
                defaultValue={item.actual_unit_cost || ""}
                min="0"
                name={`actual_unit_cost::${item.id}`}
                step="0.01"
                type="number"
              />
            </label>
            <div className="text-xs font-semibold text-primary-dark/55">
              Line total:
              <span className="ml-1 text-primary-dark">
                {formatZmw(item.actual_total)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-primary-dark/55">
          Priced total so far: <span className="text-primary-dark">{formatZmw(request.actual_total)}</span>
        </p>
        <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
          <Send className="size-4" aria-hidden="true" />
          Save prices and send to Finance
        </button>
      </div>
    </form>
  );
}

function FinanceCostDecisionForm({ request }: { request: OpsMaterialRequestSummary }) {
  return (
    <div className="rounded-md border border-emerald-300/40 bg-emerald-50/40 p-4">
      <div className="mb-3 flex flex-col gap-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-700">
          Finance — approve cost
        </p>
        <p className="text-sm leading-6 text-primary-dark/70">
          Procurement has priced this request at{" "}
          <strong>ZMW {formatZmw(request.actual_total)}</strong>. Approve to release for
          ordering, or reject with a reason so Procurement can renegotiate.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <form action={decideMaterialRequestCostAction}>
          <input name="request_id" type="hidden" value={request.id} />
          <input name="decision" type="hidden" value="approve" />
          <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Approve cost
          </button>
        </form>
        <details className="rounded-md border border-red-300/40 bg-white">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-3 py-2 text-sm font-bold text-red-700 transition hover:text-red-800 [&::-webkit-details-marker]:hidden">
            <XCircle className="size-4" aria-hidden="true" />
            Reject with reason
          </summary>
          <form
            action={decideMaterialRequestCostAction}
            className="grid gap-2 border-t border-red-200 p-3"
          >
            <input name="request_id" type="hidden" value={request.id} />
            <input name="decision" type="hidden" value="reject" />
            <label className={OPS_LABEL_CLASS}>
              Reason (required)
              <textarea
                className={`${OPS_INPUT_CLASS} min-h-24`}
                minLength={4}
                name="comment"
                placeholder="e.g. Quoted unit price is well above market — re-source with two more suppliers."
                required
              />
            </label>
            <button className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`} type="submit">
              Send rejection to Procurement
            </button>
          </form>
        </details>
      </div>
    </div>
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
  const scopeParam = firstParam(params.scope);
  const scope = scopeParam === "site" || scopeParam === "general" ? scopeParam : undefined;
  const [requestPage, siteOptions, supplierOptions] = await Promise.all([
    fetchPaginatedOpsMaterialRequests({
      listState,
      query: listState.query,
      scope,
      status: status || undefined,
    }),
    fetchActiveSiteOptions(),
    fetchActiveSupplierOptions(),
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
      <OpsRealtimeRefresh tables={["material_requests", "material_request_items", "approval_requests"]} />
      <OpsPageHeader
        eyebrow="Engineering to Procurement"
        title="Material requests"
        description="Raise site material needs, collect line items, and submit controlled requests into approval before procurement action."
        actions={
          <>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/approvals">
              <FileCheck2 className="size-4" aria-hidden="true" />
              Approvals
            </Link>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/rfq-po">
              <ClipboardList className="size-4" aria-hidden="true" />
              Request for Quotation and Purchase Order
            </Link>
            {canCreate ? (
              <a className={OPS_PRIMARY_BUTTON_CLASS} href={createRequestHref}>
                <PackagePlus className="size-4" aria-hidden="true" />
                New request
              </a>
            ) : null}
          </>
        }
      />

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
              <OpsScopeSitePicker sites={siteOptions} />
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
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
              <div className="lg:col-span-6">
                <p className="mb-2 text-sm font-semibold text-primary-dark">Line items</p>
                <OpsLineItemsEditor suppliers={supplierOptions} />
              </div>
              <div className="flex items-end lg:col-span-6">
                <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full sm:w-auto`} type="submit">
                  <Plus className="size-4" aria-hidden="true" />
                  Create request
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
            {
              label: "Type",
              name: "scope",
              options: [
                { label: "All types", value: "" },
                { label: "Project site", value: "site" },
                { label: "General / Office", value: "general" },
              ],
              value: scope ?? "",
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

              const showPricingForm =
                request.status === "pricing_pending" &&
                canAttachMaterialRequestPricing(auth.profile.role) &&
                request.items.length > 0;

              const showFinanceDecisionForm =
                request.status === "priced" &&
                canApproveMaterialRequestCost(auth.profile.role);

              const canCancel = canCancelOpsMaterialRequest(
                auth.profile.id,
                auth.profile.role,
                request,
              );
              const canArchive = canArchiveOpsMaterialRequest(auth.profile.role, request);

              return (
                <article className="p-5" id={`mr-${request.id}`} key={request.id}>
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
                        {request.scope === "general"
                          ? "General / Office"
                          : request.site
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
                      <a
                        className={OPS_SECONDARY_BUTTON_CLASS}
                        href={`/api/ops/pdf/material-request/${request.id}`}
                        target="_blank"
                        rel="noopener"
                      >
                        Download PDF
                      </a>
                      {request.status === "approved" ||
                      request.status === "ordered" ||
                      request.status === "closed" ? (
                        <a
                          className={OPS_PRIMARY_BUTTON_CLASS}
                          href={`/api/ops/pdf/material-request-po/${request.id}`}
                          target="_blank"
                          rel="noopener"
                        >
                          <FileCheck2 className="size-4" aria-hidden="true" />
                          Purchase Order PDF
                        </a>
                      ) : null}
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

                  <div className="mt-4">
                    <OpsChainTracker steps={buildMaterialRequestChainSteps(request)} />
                  </div>

                  <div className="mt-4 grid gap-4">
                    <MaterialRequestItems
                      canEdit={canEdit}
                      request={request}
                      supplierOptions={supplierOptions}
                    />
                    {canEdit ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        <AddItemForm
                          requestId={request.id}
                          supplierOptions={supplierOptions}
                        />
                        <ImportMaterialItemsForm requestId={request.id} />
                      </div>
                    ) : null}
                    {showPricingForm ? <ProcurementPricingForm request={request} /> : null}
                    {showFinanceDecisionForm ? (
                      <FinanceCostDecisionForm request={request} />
                    ) : null}
                  </div>

                  {canEdit ? (
                    <details className="mt-4 rounded-md border border-primary-dark/10">
                      <summary
                        className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-bold text-primary-dark transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Pencil className="size-4" aria-hidden="true" />
                          Edit request details
                        </span>
                        <span className="text-xs uppercase tracking-[0.12em] text-primary-dark/45">
                          Open
                        </span>
                      </summary>
                      <form
                        action={updateMaterialRequestHeaderAction}
                        className="grid gap-3 border-t border-primary-dark/10 p-4 md:grid-cols-4"
                      >
                        <input name="request_id" type="hidden" value={request.id} />
                        <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
                          Title
                          <input className={OPS_INPUT_CLASS} defaultValue={request.title} name="title" required />
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Priority
                          <select
                            className={OPS_INPUT_CLASS}
                            defaultValue={request.priority}
                            name="priority"
                          >
                            <option value="low">Low</option>
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                          </select>
                        </label>
                        <label className={OPS_LABEL_CLASS}>
                          Needed by
                          <input
                            className={OPS_INPUT_CLASS}
                            defaultValue={request.needed_by ?? ""}
                            name="needed_by"
                            type="date"
                          />
                        </label>
                        <label className={`${OPS_LABEL_CLASS} md:col-span-4`}>
                          Description
                          <textarea
                            className={`${OPS_INPUT_CLASS} min-h-20`}
                            defaultValue={request.description}
                            name="description"
                          />
                        </label>
                        <div className="md:col-span-4">
                          <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                            <Pencil className="size-4" aria-hidden="true" />
                            Save changes
                          </button>
                        </div>
                      </form>
                    </details>
                  ) : null}

                  {canCancel || canArchive ? (
                    <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-primary-dark/10 pt-4">
                      {canCancel ? (
                        <details className="rounded-md border border-red-200 bg-red-50/40">
                          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-sm font-bold text-red-700 hover:text-red-800 [&::-webkit-details-marker]:hidden">
                            <AlertTriangle className="size-4" aria-hidden="true" />
                            Cancel request
                          </summary>
                          <form
                            action={cancelMaterialRequestAction}
                            className="grid gap-2 border-t border-red-200 p-3"
                          >
                            <input name="request_id" type="hidden" value={request.id} />
                            <label className={OPS_LABEL_CLASS}>
                              Reason (optional)
                              <input className={OPS_INPUT_CLASS} name="reason" placeholder="Brief reason shown to the requester" />
                            </label>
                            <button
                              className="inline-flex items-center justify-center gap-2 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-bold text-red-700 transition hover:bg-red-100"
                              type="submit"
                            >
                              Confirm cancel
                            </button>
                          </form>
                        </details>
                      ) : null}
                      {canArchive ? (
                        <form action={archiveMaterialRequestAction}>
                          <input name="request_id" type="hidden" value={request.id} />
                          <button
                            className="inline-flex items-center gap-2 rounded-md border border-primary-dark/15 bg-white px-3 py-1.5 text-sm font-bold text-primary-dark/70 hover:bg-primary-dark/5"
                            type="submit"
                          >
                            Archive
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}

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
          <OpsEmptyState
            icon={ClipboardList}
            title={
              hasActiveListFilter
                ? "No material requests match these filters"
                : "No material requests yet"
            }
            description={
              hasActiveListFilter
                ? "Try clearing the search or switching the status filter — drafts, submitted, and priced sit in different buckets."
                : "When a site engineer raises a material need, it appears here for procurement to act on. Use the form above to create the first draft."
            }
            actions={
              hasActiveListFilter
                ? [{ href: "/ops/material-requests", label: "Clear filters" }]
                : canCreate
                  ? [{ href: createRequestHref, label: "Create the first request" }]
                  : [{ href: "/ops", label: "Back to overview", variant: "secondary" }]
            }
          />
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
