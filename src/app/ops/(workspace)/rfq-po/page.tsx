import {
  Archive,
  ClipboardList,
  FileCheck2,
  FilePlus2,
  PackagePlus,
  Pencil,
  Plus,
  Send,
  ShoppingCart,
  XCircle,
} from "lucide-react";
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { OpsLineItemsEditor } from "@/components/ops/OpsLineItemsEditor";
import { OpsScopeSitePicker } from "@/components/ops/OpsScopeSitePicker";
import { OpsImportTemplateLinks } from "@/components/ops/OpsImportTemplateLinks";
import { requireOpsUser } from "@/lib/ops/auth";
import { parseOpsListState } from "@/lib/ops/listing";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  addRfqItemAction,
  archiveRfqAction,
  cancelRfqAction,
  convertRfqToPurchaseOrdersAction,
  createRfqAction,
  createRfqFromMaterialRequestAction,
  importRfqItemsAction,
  issuePurchaseOrderAction,
  submitPurchaseOrderForApprovalAction,
  updatePurchaseOrderAction,
  updateRfqAction,
  updateRfqItemAction,
} from "@/lib/ops/rfq-po-actions";
import {
  canAddOpsRfqItem,
  canArchiveOpsRfq,
  canCancelOpsRfq,
  canCreateOpsRfq,
  canEditOpsPurchaseOrder,
  canEditOpsRfq,
  canIssueOpsPurchaseOrder,
  canManageOpsRfq,
  canSubmitOpsPurchaseOrderForApproval,
} from "@/lib/ops/rfq-po-permissions";
import {
  fetchApprovedMaterialRequestOptions,
  fetchOpsRfqPoStats,
  fetchPaginatedOpsRfqs,
  type OpsPurchaseOrderSummary,
  type OpsRfqSummary,
} from "@/lib/ops/rfq-po";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import { fetchActiveSupplierOptions } from "@/lib/ops/suppliers";
import type {
  OpsPurchaseOrderStatus,
  OpsRfqStatus,
  OpsUserRole,
} from "@/lib/ops/types";
import {
  firstParam,
  formatZmw,
  noticeFromParams,
  OPS_DANGER_BUTTON_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const RFQ_STATUS_OPTIONS: Array<{
  label: string;
  value: OpsRfqStatus | "";
}> = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Issued", value: "issued" },
  { label: "Quoted", value: "quoted" },
  { label: "Awarded", value: "awarded" },
  { label: "Closed", value: "closed" },
  { label: "Cancelled", value: "cancelled" },
];

function rfqStatusFromParam(value: string | undefined) {
  return RFQ_STATUS_OPTIONS.some((status) => status.value === value)
    ? (value as OpsRfqStatus | "")
    : "";
}

function rfqPoNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "rfq", "RFQ created as a draft.");

  if (created) {
    return created;
  }

  const updated = firstParam(params.updated);

  if (updated === "items_imported") {
    const imported = firstParam(params.imported) ?? "0";
    const skipped = firstParam(params.skipped) ?? "0";
    return {
      message: `Imported ${imported} RFQ item${imported === "1" ? "" : "s"}${
        skipped !== "0" ? ` (${skipped} row${skipped === "1" ? "" : "s"} skipped)` : ""
      }.`,
      tone: "success" as const,
    };
  }

  const messages: Record<string, string> = {
    item_added: "RFQ item added.",
    item_updated: "RFQ item updated.",
    rfq_updated: "RFQ updated.",
    po_exists: "This quote already has a draft purchase order.",
    quote_awarded: "Supplier quote awarded and draft purchase order created.",
    quote_recorded: "Supplier quote recorded.",
    po_issued: "Purchase order issued.",
    po_updated: "Purchase order updated.",
    rfq_cancelled: "Requisition cancelled.",
    rfq_archived: "Requisition archived. Restore it from the Archive.",
    rfq_converted: "Requisition converted into draft purchase orders, grouped by supplier.",
    attachment: "RFQ attachment uploaded.",
    comment: "RFQ comment added.",
  };

  return updated && messages[updated]
    ? {
        message: messages[updated],
        tone: "success" as const,
      }
    : null;
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function statusClass(status: OpsRfqStatus) {
  if (status === "awarded" || status === "closed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "issued" || status === "quoted") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-orange-200 bg-orange-50 text-orange-700";
}

function poStatusClass(status: OpsPurchaseOrderStatus) {
  if (status === "approved" || status === "issued" || status === "closed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "approval_pending" || status === "partially_received") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "rejected") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-orange-200 bg-orange-50 text-orange-700";
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

type RfqValueMetricProps = {
  label: string;
  value: string;
};

function RfqValueMetric({ label, value }: RfqValueMetricProps) {
  return (
    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
        {label}
      </dt>
      <dd className="mt-1 font-heading text-lg font-bold text-primary-dark">{value}</dd>
    </div>
  );
}

type RfqSupplierOption = { id: string; label: string; supplier_code: string };

function itemSupplierLabel(
  item: OpsRfqSummary["items"][number],
  supplierOptions: RfqSupplierOption[],
) {
  if (item.supplier_id) {
    const match = supplierOptions.find((option) => option.id === item.supplier_id);
    return match ? match.label : "Selected supplier";
  }
  if (item.supplier_name_freeform) {
    return `${item.supplier_name_freeform} (manual)`;
  }
  return "No supplier nominated";
}

function EditRfqItemForm({
  item,
  supplierOptions,
}: {
  item: OpsRfqSummary["items"][number];
  supplierOptions: RfqSupplierOption[];
}) {
  return (
    <details className="rounded-md border border-primary-dark/10">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-semibold text-primary-dark/65">
        <Pencil className="size-3.5" aria-hidden="true" />
        Edit line
      </summary>
      <form
        action={updateRfqItemAction}
        className="grid gap-3 border-t border-primary-dark/10 p-3 min-[520px]:grid-cols-2 lg:grid-cols-6"
      >
        <input name="rfq_item_id" type="hidden" value={item.id} />
        <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
          Item
          <input
            className={OPS_INPUT_CLASS}
            defaultValue={item.item_name}
            name="item_name"
            required
          />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Quantity
          <input
            className={OPS_INPUT_CLASS}
            defaultValue={item.quantity}
            min="0.01"
            name="quantity"
            required
            step="0.01"
            type="number"
          />
        </label>
        <label className={OPS_LABEL_CLASS}>
          Unit
          <input className={OPS_INPUT_CLASS} defaultValue={item.unit} name="unit" required />
        </label>
        <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
          Unit estimate
          <input
            className={OPS_INPUT_CLASS}
            defaultValue={item.estimated_unit_cost}
            min="0"
            name="estimated_unit_cost"
            step="0.01"
            type="number"
          />
        </label>
        <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
          Actual unit price
          <input
            className={OPS_INPUT_CLASS}
            defaultValue={item.actual_unit_cost}
            min="0"
            name="actual_unit_cost"
            step="0.01"
            type="number"
          />
        </label>
        <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
          Supplier
          <select
            className={OPS_INPUT_CLASS}
            defaultValue={item.supplier_id ?? ""}
            name="supplier_id"
          >
            <option value="">No master-list supplier</option>
            {supplierOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.supplier_code} - {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
          Or type a supplier (if not on the list)
          <input
            className={OPS_INPUT_CLASS}
            defaultValue={item.supplier_name_freeform ?? ""}
            name="supplier_name_freeform"
            placeholder="Manual supplier name"
          />
        </label>
        <label className={`${OPS_LABEL_CLASS} lg:col-span-4`}>
          Specification
          <input
            className={OPS_INPUT_CLASS}
            defaultValue={item.specification}
            name="specification"
          />
        </label>
        <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
          Notes
          <input className={OPS_INPUT_CLASS} defaultValue={item.notes} name="notes" />
        </label>
        <div className="flex items-end lg:col-span-6">
          <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full sm:w-auto`} type="submit">
            <Pencil className="size-4" aria-hidden="true" />
            Save line
          </button>
        </div>
      </form>
    </details>
  );
}

function RfqItems({
  rfq,
  canEdit,
  supplierOptions,
}: {
  rfq: OpsRfqSummary;
  canEdit: boolean;
  supplierOptions: RfqSupplierOption[];
}) {
  if (rfq.items.length === 0) {
    return (
      <p className="rounded-md border border-orange-200 bg-orange-50 px-3 py-3 text-sm text-orange-800">
        No RFQ line items have been added yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-primary-dark/10">
      <table className="min-w-full divide-y divide-primary-dark/10 text-sm">
        <caption className="sr-only">Line items for {rfq.rfq_number}</caption>
        <thead className="bg-primary-dark/[0.03] text-left text-xs uppercase tracking-[0.12em] text-primary-dark/52">
          <tr>
            <th className="px-3 py-3" scope="col">
              Item
            </th>
            <th className="px-3 py-3" scope="col">
              Quantity
            </th>
            <th className="px-3 py-3" scope="col">
              Supplier
            </th>
            <th className="px-3 py-3" scope="col">
              Estimate
            </th>
            <th className="px-3 py-3" scope="col">
              Actual
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-primary-dark/10">
          {rfq.items.map((item) => (
            <Fragment key={item.id}>
              <tr>
                <td className="px-3 py-3 align-top">
                  <p className="font-bold text-primary-dark">{item.item_name}</p>
                  {item.specification ? (
                    <p className="mt-1 max-w-lg text-xs leading-5 text-primary-dark/55">
                      {item.specification}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3 align-top font-semibold text-primary-dark/70">
                  {item.quantity.toLocaleString("en-ZM")} {item.unit}
                </td>
                <td className="px-3 py-3 align-top text-primary-dark/70">
                  {itemSupplierLabel(item, supplierOptions)}
                </td>
                <td className="px-3 py-3 align-top">
                  <p className="font-bold text-primary-dark">{formatZmw(item.estimated_total)}</p>
                  <p className="mt-1 text-xs text-primary-dark/45">
                    {formatZmw(item.estimated_unit_cost)} per {item.unit}
                  </p>
                </td>
                <td className="px-3 py-3 align-top">
                  {item.actual_unit_cost > 0 ? (
                    <>
                      <p className="font-bold text-primary-dark">{formatZmw(item.actual_total)}</p>
                      <p className="mt-1 text-xs text-primary-dark/45">
                        {formatZmw(item.actual_unit_cost)} per {item.unit}
                      </p>
                    </>
                  ) : (
                    <span className="text-xs text-primary-dark/45">Not priced</span>
                  )}
                </td>
              </tr>
              {canEdit ? (
                <tr>
                  <td className="px-3 pb-3 pt-0" colSpan={5}>
                    <EditRfqItemForm item={item} supplierOptions={supplierOptions} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditRfqForm({ rfq }: { rfq: OpsRfqSummary }) {
  return (
    <details className="rounded-md border border-primary-dark/10">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-primary-dark transition hover:text-primary-blue [&::-webkit-details-marker]:hidden">
        <Pencil className="size-4" aria-hidden="true" />
        Edit RFQ details
      </summary>
      <form
        action={updateRfqAction}
        className="grid gap-3 border-t border-primary-dark/10 p-3 lg:grid-cols-6"
      >
        <input name="rfq_id" type="hidden" value={rfq.id} />
        <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
          Title
          <input className={OPS_INPUT_CLASS} defaultValue={rfq.title} name="title" required />
        </label>
        <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
          Due date
          <input
            className={OPS_INPUT_CLASS}
            defaultValue={rfq.due_date ?? ""}
            name="due_date"
            type="date"
          />
        </label>
        <label className={`${OPS_LABEL_CLASS} lg:col-span-6`}>
          Description
          <input
            className={OPS_INPUT_CLASS}
            defaultValue={rfq.description}
            name="description"
          />
        </label>
        <div className="flex items-end lg:col-span-6">
          <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full sm:w-auto`} type="submit">
            <Pencil className="size-4" aria-hidden="true" />
            Save RFQ
          </button>
        </div>
      </form>
    </details>
  );
}

function AddRfqItemForm({
  rfqId,
  supplierOptions,
}: {
  rfqId: string;
  supplierOptions: RfqSupplierOption[];
}) {
  return (
    <details className="rounded-md border border-primary-dark/10">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-primary-dark transition hover:text-primary-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue [&::-webkit-details-marker]:hidden">
        <PackagePlus className="size-4" aria-hidden="true" />
        Add item
      </summary>
      <form
        action={addRfqItemAction}
        className="grid gap-3 border-t border-primary-dark/10 p-3 min-[520px]:grid-cols-2 lg:grid-cols-6"
      >
        <input name="rfq_id" type="hidden" value={rfqId} />
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
        <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
          Actual unit price
          <input className={OPS_INPUT_CLASS} min="0" name="actual_unit_cost" step="0.01" type="number" />
        </label>
        <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
          Supplier
          <select className={OPS_INPUT_CLASS} defaultValue="" name="supplier_id">
            <option value="">No master-list supplier</option>
            {supplierOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.supplier_code} - {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
          Or type a supplier (if not on the list)
          <input
            className={OPS_INPUT_CLASS}
            name="supplier_name_freeform"
            placeholder="Manual supplier name"
          />
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

function ImportRfqItemsForm({ rfqId }: { rfqId: string }) {
  return (
    <details className="rounded-md border border-primary-dark/10">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-primary-dark transition hover:text-primary-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue [&::-webkit-details-marker]:hidden">
        <FilePlus2 className="size-4" aria-hidden="true" />
        Import items (CSV / Excel / PDF)
      </summary>
      <form action={importRfqItemsAction} className="grid gap-3 border-t border-primary-dark/10 p-3">
        <input name="rfq_id" type="hidden" value={rfqId} />
        <p className="text-xs leading-5 text-primary-dark/55">
          Upload a supplier price list or requisition. Recognised columns: item / description,
          unit, quantity, estimate, actual price, and supplier (code or name — unmatched names are
          kept as a typed supplier). The first row must be the header.
        </p>
        <OpsImportTemplateLinks kind="requisitions" />
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

function PurchaseOrderActions({
  purchaseOrder,
  role,
}: {
  purchaseOrder: OpsPurchaseOrderSummary;
  role: OpsUserRole;
}) {
  const canSubmit = canSubmitOpsPurchaseOrderForApproval(role, purchaseOrder);
  const canIssue = canIssueOpsPurchaseOrder(role, purchaseOrder);
  const canEdit = canEditOpsPurchaseOrder(role, purchaseOrder);

  if (!canSubmit && !canIssue && !canEdit && !purchaseOrder.approval_request_id) {
    return null;
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="grid gap-2 min-[520px]:grid-cols-2">
        {purchaseOrder.approval_request_id ? (
          <Link
            className={`${OPS_SECONDARY_BUTTON_CLASS} justify-center`}
            href={`/ops/approvals/${purchaseOrder.approval_request_id}`}
          >
            <ClipboardList className="size-4" aria-hidden="true" />
            View approval
          </Link>
        ) : null}
        {canSubmit ? (
          <form action={submitPurchaseOrderForApprovalAction}>
            <input name="purchase_order_id" type="hidden" value={purchaseOrder.id} />
            <OpsConfirmSubmitButton
              className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
              confirmText="Confirm request"
            >
              <Send className="size-4" aria-hidden="true" />
              {purchaseOrder.status === "rejected" ? "Resubmit approval" : "Request approval"}
            </OpsConfirmSubmitButton>
          </form>
        ) : null}
        {canIssue ? (
          <form action={issuePurchaseOrderAction}>
            <input name="purchase_order_id" type="hidden" value={purchaseOrder.id} />
            <OpsConfirmSubmitButton
              className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
              confirmText="Confirm issue"
            >
              <FileCheck2 className="size-4" aria-hidden="true" />
              Issue PO
            </OpsConfirmSubmitButton>
          </form>
        ) : null}
      </div>
      {canEdit ? (
        <details className="rounded-md border border-primary-dark/10">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-primary-dark/65">
            Edit purchase order
          </summary>
          <form
            action={updatePurchaseOrderAction}
            className="space-y-3 border-t border-primary-dark/10 p-3"
          >
            <input name="purchase_order_id" type="hidden" value={purchaseOrder.id} />
            <label className={OPS_LABEL_CLASS}>
              Title
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={purchaseOrder.title}
                name="title"
                required
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Total amount ({purchaseOrder.currency_code})
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={purchaseOrder.total_amount}
                min="0"
                name="total_amount"
                required
                step="0.01"
                type="number"
              />
            </label>
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`} type="submit">
              Save changes
            </button>
          </form>
        </details>
      ) : null}
    </div>
  );
}

export default async function OpsRfqPoPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/rfq-po")) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 8 });
  const status = rfqStatusFromParam(firstParam(params.status));
  const scopeParam = firstParam(params.scope);
  const scope = scopeParam === "site" || scopeParam === "general" ? scopeParam : undefined;
  const [rfqPage, stats, siteOptions, supplierOptions, materialRequestOptions] =
    await Promise.all([
      fetchPaginatedOpsRfqs({
        listState,
        query: listState.query,
        scope,
        status: status || undefined,
      }),
      fetchOpsRfqPoStats(),
      fetchActiveSiteOptions(),
      fetchActiveSupplierOptions(),
      fetchApprovedMaterialRequestOptions(),
    ]);
  const rfqs = rfqPage.items;
  const canCreate = canCreateOpsRfq(auth.profile.role);
  const canManage = canManageOpsRfq(auth.profile.role);
  // Only finance-approved requests can seed a brand-new requisition; ordered /
  // closed ones have already been procured.
  const approvableRequests = materialRequestOptions.filter(
    (request) => request.status === "approved",
  );
  const notice = rfqPoNotice(params);
  const hasActiveListFilter = listState.query.length > 0 || Boolean(status);
  const pageEstimatedTotal = rfqs.reduce((sum, rfq) => sum + rfq.estimated_total, 0);
  const pageActualTotal = rfqs.reduce(
    (sum, rfq) => sum + rfq.items.reduce((s, item) => s + item.actual_total, 0),
    0,
  );
  const pagePurchaseOrderTotal = rfqs.reduce(
    (sum, rfq) =>
      sum + rfq.purchase_orders.reduce((poSum, purchaseOrder) => poSum + purchaseOrder.total_amount, 0),
    0,
  );
  const createPanelParams = new URLSearchParams();

  if (listState.query) {
    createPanelParams.set("q", listState.query);
  }

  if (status) {
    createPanelParams.set("status", status);
  }

  createPanelParams.set("create", "rfq");
  const createRfqHref = `/ops/rfq-po?${createPanelParams.toString()}#rfq-create-panel`;
  const openCreatePanel = firstParam(params.create) === "rfq";

  // Pre-fill values when a requisition is seeded from another module (e.g. a BOQ line).
  const prefillSiteId = firstParam(params.site_id) ?? "";
  const prefillSupplierId = firstParam(params.supplier_id) ?? "";
  const prefillTitle = firstParam(params.title) ?? "";
  const prefillItemName = firstParam(params.item_name) ?? "";
  const prefillQuantity = firstParam(params.quantity) ?? "";
  const prefillUnit = firstParam(params.unit) ?? "each";
  const prefillUnitCost = firstParam(params.estimated_unit_cost) ?? "";

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsPageHeader
        eyebrow="Procurement workflow"
        title="Requisitions and Purchase Orders"
        description="Approved material needs, per-item supplier nomination, draft purchase orders grouped by supplier, approvals, and issue controls. Suppliers are not invited externally — the team records who each line is going to internally."
        actions={
          <>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/material-requests">
              <ClipboardList className="size-4" aria-hidden="true" />
              Material requests
            </Link>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/suppliers">
              <PackagePlus className="size-4" aria-hidden="true" />
              Suppliers
            </Link>
            {canCreate ? (
              <a className={OPS_PRIMARY_BUTTON_CLASS} href={createRfqHref}>
                <FilePlus2 className="size-4" aria-hidden="true" />
                New requisition
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

      <section className="grid gap-4 min-[720px]:grid-cols-4">
        <OpsKpiCard
          href="/ops/rfq-po"
          icon={ShoppingCart}
          label="Open RFQs"
          tone={stats.openRfqs > 0 ? "warn" : "default"}
          trend={stats.openRfqs > 0 ? "Review" : "Clear"}
          value={stats.openRfqs.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/rfq-po?status=issued"
          icon={Send}
          label="Issued RFQs"
          trend="In progress"
          value={stats.issuedRfqs.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/rfq-po"
          icon={ClipboardList}
          label="Draft POs"
          tone={stats.draftPurchaseOrders > 0 ? "warn" : "default"}
          trend={stats.draftPurchaseOrders > 0 ? "Approval" : "Clear"}
          value={stats.draftPurchaseOrders.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/rfq-po?status=awarded"
          icon={FileCheck2}
          label="Awarded RFQs"
          tone="good"
          trend="Awarded"
          value={stats.awardedRfqs.toLocaleString("en-ZM")}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.75fr)]">
        <OpsDashboardPanel eyebrow="Visible values" title="Current procurement selection">
          <dl className="grid gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
            <RfqValueMetric label="Estimate shown" value={formatZmw(pageEstimatedTotal)} />
            <RfqValueMetric label="Actual shown" value={formatZmw(pageActualTotal)} />
            <RfqValueMetric label="PO value shown" value={formatZmw(pagePurchaseOrderTotal)} />
          </dl>
        </OpsDashboardPanel>

        <OpsDashboardPanel eyebrow="Procurement flow" title="RFQ to PO movement">
          <div className="grid gap-3">
            {[
              { label: "Open RFQs", value: stats.openRfqs },
              { label: "Issued RFQs", value: stats.issuedRfqs },
              { label: "Awarded RFQs", value: stats.awardedRfqs },
              { label: "Draft POs", value: stats.draftPurchaseOrders },
            ].map((item) => (
              <div
                className="flex items-center justify-between gap-3 rounded-md border border-primary-dark/10 px-3 py-2"
                key={item.label}
              >
                <span className="text-sm font-bold text-primary-dark">{item.label}</span>
                <span className="font-heading text-lg font-bold text-primary-dark">
                  {item.value.toLocaleString("en-ZM")}
                </span>
              </div>
            ))}
          </div>
        </OpsDashboardPanel>
      </div>

      {canCreate && approvableRequests.length > 0 ? (
        <section className="rounded-lg border border-primary-blue/30 bg-primary-blue/[0.03] p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
              <FilePlus2 className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-heading text-lg font-bold text-primary-dark">
                Procure an approved material request
              </h2>
              <p className="mt-1 text-sm text-primary-dark/60">
                Pick a finance-approved request — its site, every line item, and its
                prices are pulled in automatically. Then nominate a supplier per line
                and convert it into purchase orders. The request closes on conversion.
              </p>
            </div>
          </div>
          <form
            action={createRfqFromMaterialRequestAction}
            className="grid gap-3 min-[520px]:grid-cols-[1fr_auto] min-[520px]:items-end"
          >
            <label className={OPS_LABEL_CLASS}>
              Approved material request
              <select
                className={OPS_INPUT_CLASS}
                defaultValue=""
                name="material_request_id"
                required
              >
                <option value="" disabled>
                  Select an approved material request
                </option>
                {approvableRequests.map((request) => (
                  <option key={request.id} value={request.id}>
                    {request.request_number} - {request.title}
                    {request.site ? ` / ${request.site.code}` : " / general"}
                  </option>
                ))}
              </select>
            </label>
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              <FilePlus2 className="size-4" aria-hidden="true" />
              Build requisition
            </button>
          </form>
        </section>
      ) : null}

      {canCreate ? (
        <details
          className="rounded-lg border border-primary-dark/10 bg-white"
          id="rfq-create-panel"
          open={openCreatePanel}
        >
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:bg-primary-dark/[0.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
                <FilePlus2 className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-heading text-lg font-bold text-primary-dark">
                  Create requisition
                </span>
                <span className="mt-1 block text-sm text-primary-dark/60">
                  Site, approved request link, deadline, and one or more line items with a supplier each.
                </span>
              </span>
            </span>
            <Plus className="size-5 shrink-0 text-primary-blue" aria-hidden="true" />
          </summary>
          {siteOptions.length === 0 ? (
            <div className="border-t border-primary-dark/10 p-5">
              <div className="rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                Add at least one active site before creating RFQs.
              </div>
            </div>
          ) : (
            <form
              action={createRfqAction}
              className="grid gap-4 border-t border-primary-dark/10 p-5 min-[520px]:grid-cols-2 lg:grid-cols-6"
            >
              <OpsScopeSitePicker
                defaultSiteId={
                  siteOptions.some((site) => site.id === prefillSiteId) ? prefillSiteId : null
                }
                sites={siteOptions}
              />
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Approved material request
                <select className={OPS_INPUT_CLASS} defaultValue="" name="material_request_id">
                  <option value="">No linked material request</option>
                  {materialRequestOptions.map((request) => (
                    <option key={request.id} value={request.id}>
                      {request.request_number} - {request.title}
                      {request.site ? ` / ${request.site.code}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Due date
                <input className={OPS_INPUT_CLASS} name="due_date" type="date" />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
                RFQ title
                <input className={OPS_INPUT_CLASS} defaultValue={prefillTitle} name="title" required />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
                Description
                <input className={OPS_INPUT_CLASS} name="description" />
              </label>
              <div className="lg:col-span-6">
                <p className="mb-2 text-sm font-semibold text-primary-dark">Line items</p>
                <OpsLineItemsEditor
                  firstItemDefaults={{
                    estimated_unit_cost: prefillUnitCost || undefined,
                    item_name: prefillItemName || undefined,
                    quantity: prefillQuantity || undefined,
                    supplier_id: prefillSupplierId || null,
                    unit: prefillUnit || undefined,
                  }}
                  suppliers={supplierOptions}
                  withActualCost
                />
              </div>
              <div className="flex items-end min-[520px]:col-span-2 lg:col-span-6 lg:justify-end">
                <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full min-[520px]:w-auto`} type="submit">
                  <Plus className="size-4" aria-hidden="true" />
                  Create requisition
                </button>
              </div>
            </form>
          )}
        </details>
      ) : null}

      <OpsDashboardPanel
        actions={<ShoppingCart className="size-6 shrink-0 text-primary-blue" aria-hidden="true" />}
        eyebrow="Procurement packages"
        title="RFQ register"
      >
        <div className="-mx-5 -mb-5">
          <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 p-5">
            <p className="text-sm text-primary-dark/60">
              {rfqPage.pagination.total} matching RFQ records.
            </p>
          </div>
        <OpsListControls
          action="/ops/rfq-po"
          filters={[
            {
              label: "Status",
              name: "status",
              options: RFQ_STATUS_OPTIONS,
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
          placeholder="Search requisition number, title, or description"
          query={listState.query}
          resultLabel="requisitions"
        />

        {rfqs.length > 0 ? (
          <div className="divide-y divide-primary-dark/10">
            {rfqs.map((rfq) => {
              const canAddItem = canAddOpsRfqItem(auth.profile.role, rfq);
              const canCancel = canCancelOpsRfq(auth.profile.role, rfq);
              const canArchive = canArchiveOpsRfq(auth.profile.role);
              const canEditRfq = canEditOpsRfq(auth.profile.role, rfq);
              const rfqActualTotal = rfq.items.reduce((sum, item) => sum + item.actual_total, 0);
              const nominatedSuppliers = rfq.items.filter(
                (item) => item.supplier_id || item.supplier_name_freeform,
              ).length;

              return (
                <article className="p-5" key={rfq.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading text-lg font-bold text-primary-dark">
                          {rfq.rfq_number}
                        </h3>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(
                            rfq.status,
                          )}`}
                        >
                          {formatLabel(rfq.status)}
                        </span>
                      </div>
                      <p className="mt-2 font-bold text-primary-dark">{rfq.title}</p>
                      <p className="mt-1 text-sm leading-6 text-primary-dark/62">
                        {rfq.scope === "general"
                          ? "General / Office"
                          : rfq.site
                            ? `${rfq.site.code} - ${rfq.site.name}`
                            : "Site unavailable"}{" "}
                        / due {formatDate(rfq.due_date)}
                      </p>
                      {rfq.material_request ? (
                        <p className="mt-1 text-sm text-primary-dark/55">
                          Material request: {rfq.material_request.request_number} -{" "}
                          {rfq.material_request.title}
                        </p>
                      ) : null}
                      {rfq.description ? (
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-primary-dark/60">
                          {rfq.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-2 lg:min-w-44">
                      {rfq.status !== "closed" && rfq.status !== "cancelled" ? (
                        <form action={convertRfqToPurchaseOrdersAction}>
                          <input name="rfq_id" type="hidden" value={rfq.id} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
                            confirmText="Confirm convert"
                          >
                            <FileCheck2 className="size-4" aria-hidden="true" />
                            Convert to Purchase Orders
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                      {canCancel ? (
                        <form action={cancelRfqAction}>
                          <input name="rfq_id" type="hidden" value={rfq.id} />
                          <input name="confirm" type="hidden" value="cancel" />
                          <OpsConfirmSubmitButton
                            className={`${OPS_DANGER_BUTTON_CLASS} w-full`}
                            confirmText="Confirm cancel"
                          >
                            <XCircle className="size-4" aria-hidden="true" />
                            Cancel requisition
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                      {canArchive ? (
                        <form action={archiveRfqAction}>
                          <input name="rfq_id" type="hidden" value={rfq.id} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_SECONDARY_BUTTON_CLASS} w-full`}
                            confirmText="Confirm archive"
                          >
                            <Archive className="size-4" aria-hidden="true" />
                            Archive
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  <dl className="mt-4 grid gap-3 md:grid-cols-5">
                    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        Items
                      </dt>
                      <dd className="mt-1 font-bold text-primary-dark">{rfq.items.length}</dd>
                    </div>
                    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        Estimate
                      </dt>
                      <dd className="mt-1 font-bold text-primary-dark">
                        {formatZmw(rfq.estimated_total)}
                      </dd>
                    </div>
                    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        Suppliers set
                      </dt>
                      <dd className="mt-1 font-bold text-primary-dark">
                        {nominatedSuppliers} / {rfq.items.length}
                      </dd>
                    </div>
                    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        Actual total
                      </dt>
                      <dd className="mt-1 font-bold text-primary-dark">
                        {rfqActualTotal > 0 ? formatZmw(rfqActualTotal) : "Not priced"}
                      </dd>
                    </div>
                    <div className="rounded-md border border-primary-dark/10 px-3 py-2">
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                        Created
                      </dt>
                      <dd className="mt-1 font-bold text-primary-dark">
                        {formatDateTime(rfq.created_at)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 grid gap-4">
                    {canEditRfq ? <EditRfqForm rfq={rfq} /> : null}
                    <RfqItems
                      canEdit={canEditRfq}
                      rfq={rfq}
                      supplierOptions={supplierOptions}
                    />
                    {canAddItem ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        <AddRfqItemForm rfqId={rfq.id} supplierOptions={supplierOptions} />
                        <ImportRfqItemsForm rfqId={rfq.id} />
                      </div>
                    ) : null}
                  </div>

                  {rfq.purchase_orders.length > 0 ? (
                    <section className="mt-5">
                      <div className="mb-3 flex items-center gap-2">
                        <ClipboardList className="size-4 text-primary-blue" aria-hidden="true" />
                        <h4 className="font-heading text-base font-bold text-primary-dark">
                          Purchase orders
                        </h4>
                      </div>
                      <ul className="grid gap-3 md:grid-cols-2">
                        {rfq.purchase_orders.map((po) => (
                          <li className="rounded-md border border-primary-dark/10 p-3" key={po.id}>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-bold text-primary-dark">{po.po_number}</p>
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${poStatusClass(
                                  po.status,
                                )}`}
                              >
                                {formatLabel(po.status)}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-primary-dark/65">
                              {po.title}
                            </p>
                            <p className="mt-2 font-heading text-xl font-bold text-primary-dark">
                              {formatZmw(po.total_amount)}
                            </p>
                            {po.approved_at ? (
                              <p className="mt-1 text-xs text-primary-dark/45">
                                Approved {formatDateTime(po.approved_at)}
                              </p>
                            ) : null}
                            {po.issued_at ? (
                              <p className="mt-1 text-xs text-primary-dark/45">
                                Issued {formatDateTime(po.issued_at)}
                              </p>
                            ) : null}
                            <PurchaseOrderActions
                              purchaseOrder={po}
                              role={auth.profile.role}
                            />
                            <a
                              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-blue hover:underline"
                              href={`/api/ops/pdf/purchase-order/${po.id}`}
                              target="_blank"
                              rel="noopener"
                            >
                              Download PDF
                            </a>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  <OpsRecordActivityPanel
                    canManage={canCreate || canManage}
                    sourceId={rfq.id}
                    sourceTable="rfqs"
                  />
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
            <ShoppingCart className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-primary-dark">
                {hasActiveListFilter ? "No matching RFQs" : "No RFQs yet"}
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-primary-dark/60">
                {hasActiveListFilter
                  ? "Adjust the search or status filter to widen the requisition register."
                  : "Create the first RFQ after the supplier register has active suppliers."}
              </p>
            </div>
          </div>
        )}
        <OpsPaginationControls
          basePath="/ops/rfq-po"
          filters={[
            {
              label: "Status",
              name: "status",
              options: [],
              value: status,
            },
          ]}
          pagination={rfqPage.pagination}
          query={listState.query}
          resultLabel="RFQs"
        />
        </div>
      </OpsDashboardPanel>
    </div>
  );
}
