import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileText,
  PackageCheck,
  Plus,
  Receipt,
  Send,
  TrendingUp,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsInlineEmpty } from "@/components/ops/OpsInlineEmpty";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import {
  OpsAgeingPanel,
  OpsCashflowChartPanel,
} from "@/components/ops/OpsFinanceKpiPanels";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsListControls, OpsPaginationControls } from "@/components/ops/OpsListControls";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { OpsRecordActivityPanel } from "@/components/ops/OpsRecordActivityPanel";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  approvePaymentRequestAction,
  cancelPaymentRequestAction,
  createPaymentRequestAction,
  markPaymentRequestPaidAction,
  rejectPaymentRequestAction,
  reviewPaymentRequestAction,
  submitPaymentRequestAction,
} from "@/lib/ops/finance-actions";
import {
  canApproveOpsPaymentRequest,
  canCancelOpsPaymentRequest,
  canCreateOpsPaymentRequest,
  canPayOpsPaymentRequest,
  canRejectOpsPaymentRequest,
  canReviewOpsPaymentRequest,
  canSubmitOpsPaymentRequest,
} from "@/lib/ops/finance-permissions";
import {
  fetchFinanceBudgetLineOptions,
  fetchFinancePurchaseOrderOptions,
  fetchOpsFinanceAgeingDashboard,
  fetchOpsFinanceCashflowDashboard,
  fetchOpsPaymentRequestStats,
  fetchPaginatedOpsPaymentRequests,
  type OpsPaymentRequestSummary,
} from "@/lib/ops/finance";
import {
  fetchOpsCashflowChart,
  fetchOpsReceivablesAgeing,
  fetchOpsSupplierAgeing,
} from "@/lib/ops/finance-kpis";
import type { OpsFinanceAgeingBucket } from "@/lib/ops/finance-reporting";
import { parseOpsListState } from "@/lib/ops/listing";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { formatOpsUserName } from "@/lib/ops/roles";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import { fetchActiveSupplierOptions } from "@/lib/ops/suppliers";
import {
  firstParam,
  noticeFromParams,
  OPS_DANGER_BUTTON_CLASS,
  OPS_FOCUS_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  OPS_TABLE_CLASS,
  OPS_TD_CLASS,
  OPS_TD_NUM_CLASS,
  OPS_TH_CLASS,
  OPS_TH_NUM_CLASS,
  OPS_THEAD_CLASS,
  OPS_TR_CLASS,
  type OpsSearchParams,
  OPS_NOTICE_WARNING_CLASS,
  opsStatusBadgeClass,
} from "@/lib/ops/ui";
import { OpsTableShell } from "@/components/ops/OpsTableShell";
import type { OpsPaymentRequestStatus, OpsPaymentRequestType } from "@/lib/ops/types";
import { formatOpsLabel as formatLabel, formatOpsDate as formatDate, formatOpsDateTime as formatDateTime } from "@/lib/ops/format";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const PAYMENT_REQUEST_STATUS_OPTIONS: Array<{
  label: string;
  value: OpsPaymentRequestStatus | "";
}> = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Submitted", value: "submitted" },
  { label: "Finance review", value: "finance_review" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Paid", value: "paid" },
  { label: "Cancelled", value: "cancelled" },
];

const PAYMENT_REQUEST_TYPE_OPTIONS: Array<{
  label: string;
  value: OpsPaymentRequestType;
}> = [
  { label: "Supplier invoice", value: "supplier_invoice" },
  { label: "Expense", value: "expense" },
  { label: "Subcontractor", value: "subcontractor" },
  { label: "Payroll", value: "payroll" },
  { label: "Tax", value: "tax" },
  { label: "Other", value: "other" },
];

function statusFromParam(value: string | undefined) {
  return PAYMENT_REQUEST_STATUS_OPTIONS.some((status) => status.value === value)
    ? (value as OpsPaymentRequestStatus | "")
    : "";
}

function paymentRequestNotice(params: OpsSearchParams) {
  const created = noticeFromParams(
    params,
    "payment_request",
    "Payment request created.",
  );

  if (created) {
    return created;
  }

  const updated = firstParam(params.updated);
  const messages: Record<string, string> = {
    approved: "Payment request approved and committed to project costs.",
    attachment: "Payment request attachment uploaded.",
    cancelled: "Payment request cancelled.",
    comment: "Payment request comment added.",
    finance_review: "Payment request moved to finance review.",
    paid: "Payment request marked as paid and posted to project costs.",
    rejected: "Payment request rejected.",
    submitted: "Payment request submitted.",
  };

  return updated && messages[updated]
    ? {
        message: messages[updated],
        tone: "success" as const,
      }
    : null;
}

function formatMoney(value: number, currencyCode = "ZMW") {
  return new Intl.NumberFormat("en-ZM", {
    currency: currencyCode,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function ageingClass(bucket: OpsFinanceAgeingBucket) {
  if (bucket === "current") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (bucket === "due_soon") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-red-200 bg-red-50 text-red-700";
}

function formatAgeingDelta(daysUntilDue: number | null) {
  if (daysUntilDue === null) {
    return "No due date";
  }

  if (daysUntilDue < 0) {
    return `${Math.abs(daysUntilDue)} days overdue`;
  }

  if (daysUntilDue === 0) {
    return "Due today";
  }

  return `${daysUntilDue} days left`;
}

function PaymentMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-bold text-foreground">{value}</dd>
    </div>
  );
}

function MarkPaidForm({ paymentRequest }: { paymentRequest: OpsPaymentRequestSummary }) {
  return (
    <details className="rounded-md border border-border">
      <summary
        className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
      >
        <span className="inline-flex items-center gap-2">
          <CreditCard className="size-4" aria-hidden="true" />
          Mark paid
        </span>
        <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Open
        </span>
      </summary>
      <form action={markPaymentRequestPaidAction} className="grid gap-3 border-t border-border p-4">
        <input name="payment_request_id" type="hidden" value={paymentRequest.id} />
        <label className={OPS_LABEL_CLASS}>
          Payment reference
          <input className={OPS_INPUT_CLASS} name="payment_reference" placeholder="Bank ref or voucher no." />
        </label>
        <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
          <CreditCard className="size-4" aria-hidden="true" />
          Post paid
        </button>
      </form>
    </details>
  );
}

export default async function OpsPaymentRequestsPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/payment-requests")) {
    notFound();
  }

  const listState = parseOpsListState(params, { defaultPageSize: 8 });
  const status = statusFromParam(firstParam(params.status));
  const [
    paymentRequestPage,
    stats,
    ageingDashboard,
    cashflowDashboard,
    siteOptions,
    supplierOptions,
    budgetLineOptions,
    purchaseOrderOptions,
    cashflowChart,
    supplierAgeing,
    receivablesAgeing,
  ] = await Promise.all([
    fetchPaginatedOpsPaymentRequests({
      listState,
      query: listState.query,
      status: status || undefined,
    }),
    fetchOpsPaymentRequestStats(),
    fetchOpsFinanceAgeingDashboard(),
    fetchOpsFinanceCashflowDashboard(),
    fetchActiveSiteOptions(),
    fetchActiveSupplierOptions(),
    fetchFinanceBudgetLineOptions(),
    fetchFinancePurchaseOrderOptions(),
    fetchOpsCashflowChart(),
    fetchOpsSupplierAgeing(),
    fetchOpsReceivablesAgeing(),
  ]);
  const notice = paymentRequestNotice(params);
  const canCreate = canCreateOpsPaymentRequest(auth.profile.role);
  const hasActiveListFilter = listState.query.length > 0 || Boolean(status);
  const createPanelParams = new URLSearchParams();

  if (listState.query) {
    createPanelParams.set("q", listState.query);
  }

  if (status) {
    createPanelParams.set("status", status);
  }

  createPanelParams.set("create", "payment_request");
  const createPaymentHref = `/ops/payment-requests?${createPanelParams.toString()}#payment-request-create-panel`;
  const openCreatePanel = firstParam(params.create) === "payment_request";

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh tables={["payment_requests", "approval_requests"]} />
      <OpsPageHeader
        eyebrow="Finance and Accounts"
        title="Payment requests"
        description="Supplier bills, expenses, approval handoff, payment status, and project cost posting."
        actions={
          <>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/project-budgets">
              <Banknote className="size-4" aria-hidden="true" />
              Budgets
            </Link>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/rfq-po">
              <PackageCheck className="size-4" aria-hidden="true" />
              Requests for Quotation and Purchase Orders
            </Link>
            {canCreate ? (
              <a className={OPS_PRIMARY_BUTTON_CLASS} href={createPaymentHref}>
                <Plus className="size-4" aria-hidden="true" />
                New payment
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
          href="/ops/payment-requests?status=draft#payment-request-register"
          icon={FileText}
          label="Draft"
          tone={stats.draft > 0 ? "warn" : "default"}
          hint="Not submitted"
          value={String(stats.draft)}
        />
        <OpsKpiCard
          href="/ops/payment-requests?status=submitted#payment-request-register"
          icon={Send}
          label="Submitted/review"
          tone={stats.submitted > 0 ? "warn" : "default"}
          hint="Needs finance"
          value={String(stats.submitted)}
        />
        <OpsKpiCard
          href="/ops/payment-requests?status=approved#payment-request-register"
          icon={CheckCircle2}
          label="Approved"
          tone={stats.approved > 0 ? "warn" : "default"}
          hint="Awaiting pay"
          value={String(stats.approved)}
        />
        <OpsKpiCard
          href="/ops/payment-requests#payment-request-register"
          icon={Receipt}
          label="Unpaid exposure"
          tone={stats.unpaidAmount > 0 ? "warn" : "default"}
          hint="Submitted plus approved"
          value={formatMoney(stats.unpaidAmount)}
        />
      </section>

      <OpsCashflowChartPanel data={cashflowChart} />

      <div className="grid gap-4 xl:grid-cols-2">
        <OpsAgeingPanel
          description="Outstanding supplier payment requests by days since submission."
          emptyMessage="No outstanding payment requests."
          eyebrow="Supplier ageing"
          summary={supplierAgeing}
          title="Payables ageing 0/30/60/90"
        />
        <OpsAgeingPanel
          description="Outstanding sent client invoices by days since issue."
          emptyMessage="No outstanding receivables."
          eyebrow="Receivables ageing"
          summary={receivablesAgeing}
          title="Receivables ageing 0/30/60/90"
        />
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <OpsDashboardPanel
          eyebrow="Payables ageing"
          title="Supplier payment pressure"
          actions={
            <a className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/payment-requests?status=approved#payment-request-register">
              <CalendarClock className="size-4" aria-hidden="true" />
              Approved
            </a>
          }
        >
          <div className="grid gap-3 min-[520px]:grid-cols-2 lg:grid-cols-5">
            {ageingDashboard.buckets.map((bucket) => (
              <div
                className={`rounded-md border px-3 py-2 ${ageingClass(bucket.bucket)}`}
                key={bucket.bucket}
              >
                <p className="text-xs font-bold uppercase tracking-[0.12em]">
                  {bucket.label}
                </p>
                <p className="mt-1 font-heading text-xl font-bold">
                  {formatMoney(bucket.amount)}
                </p>
                <p className="mt-1 text-xs font-semibold">{bucket.count} requests</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
            <dl className="grid gap-3">
              <PaymentMetric
                label="Total unpaid"
                value={formatMoney(ageingDashboard.totalUnpaid)}
              />
              <PaymentMetric
                label="Due soon"
                value={formatMoney(ageingDashboard.dueSoonAmount)}
              />
              <PaymentMetric
                label="Overdue"
                value={formatMoney(ageingDashboard.overdueAmount)}
              />
            </dl>
            <div className="rounded-md border border-border">
              <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Attention queue
                </p>
                <AlertTriangle className="size-4 text-orange-600" aria-hidden="true" />
              </div>
              {ageingDashboard.attentionItems.length > 0 ? (
                <ul className="divide-y divide-border">
                  {ageingDashboard.attentionItems.map((item) => (
                    <li className="px-3 py-3" key={item.id}>
                      <div className="flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-foreground">
                            {item.request_number} - {item.title}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {item.supplier
                              ? `${item.supplier.supplier_code} / ${item.supplier.legal_name}`
                              : "No supplier linked"}
                          </p>
                        </div>
                        <div className="shrink-0 text-left min-[520px]:text-right">
                          <p className="text-sm font-bold text-foreground">
                            {formatMoney(item.amount)}
                          </p>
                          <p className="text-xs font-semibold text-orange-700">
                            {formatAgeingDelta(item.days_until_due)}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <OpsInlineEmpty>No due-soon or overdue payment requests.</OpsInlineEmpty>
              )}
            </div>
          </div>
        </OpsDashboardPanel>

        <OpsDashboardPanel eyebrow="Cashflow" title="Next 30 day signal">
          <dl className="grid gap-3 min-[520px]:grid-cols-2">
            <PaymentMetric
              label="Open receivables"
              value={formatMoney(cashflowDashboard.openReceivables)}
            />
            <PaymentMetric
              label="Payables due"
              value={formatMoney(cashflowDashboard.next30Payables)}
            />
            <PaymentMetric
              label="Net signal"
              value={formatMoney(cashflowDashboard.netNext30)}
            />
            <PaymentMetric
              label="Overdue payables"
              value={formatMoney(cashflowDashboard.overduePayables)}
            />
            <PaymentMetric
              label="Received this month"
              value={formatMoney(cashflowDashboard.receivedThisMonth)}
            />
            <PaymentMetric
              label="Paid this month"
              value={formatMoney(cashflowDashboard.paidThisMonth)}
            />
          </dl>
          <div className="mt-4 rounded-md border border-border px-3 py-3">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <TrendingUp className="size-4 text-primary-blue" aria-hidden="true" />
              Receivables mix
            </div>
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Draft invoices</dt>
                <dd className="font-bold text-foreground">
                  {formatMoney(cashflowDashboard.draftReceivables)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Sent invoices</dt>
                <dd className="font-bold text-foreground">
                  {formatMoney(cashflowDashboard.sentReceivables)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Approved payables</dt>
                <dd className="font-bold text-foreground">
                  {formatMoney(cashflowDashboard.approvedPayables)}
                </dd>
              </div>
            </dl>
          </div>
        </OpsDashboardPanel>
      </section>

      {canCreate ? (
        <details
          className="scroll-mt-24 rounded-lg border border-border bg-card"
          id="payment-request-create-panel"
          open={openCreatePanel}
        >
          <summary
            className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
              <Receipt className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-xl font-bold text-foreground">
                Create payment request
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Link a supplier bill or expense to a site, optional PO, and optional budget line.
              </span>
            </span>
            <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Open
            </span>
          </summary>
          {siteOptions.length === 0 ? (
            <div className="border-t border-border p-5">
              <div className={OPS_NOTICE_WARNING_CLASS}>
                Add at least one active site before creating payment requests.
              </div>
            </div>
          ) : (
            <form
              action={createPaymentRequestAction}
              className="grid gap-4 border-t border-border p-5 min-[520px]:grid-cols-2 lg:grid-cols-6"
            >
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Purchase order
                <select className={OPS_INPUT_CLASS} defaultValue="" name="purchase_order_id">
                  <option value="">No PO link</option>
                  {purchaseOrderOptions.map((purchaseOrder) => (
                    <option key={purchaseOrder.id} value={purchaseOrder.id}>
                      {purchaseOrder.po_number} - {purchaseOrder.title} /{" "}
                      {formatMoney(purchaseOrder.total_amount)}
                    </option>
                  ))}
                </select>
              </label>
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
                Supplier
                <select className={OPS_INPUT_CLASS} defaultValue="" name="supplier_id">
                  <option value="">No supplier</option>
                  {supplierOptions.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.supplier_code} - {supplier.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Budget line
                <select className={OPS_INPUT_CLASS} defaultValue="" name="budget_line_id">
                  <option value="">No budget line</option>
                  {budgetLineOptions.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.budget?.budget_number ?? "Budget"} / {line.cost_code || line.category} -{" "}
                      {line.description}
                    </option>
                  ))}
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Type
                <select className={OPS_INPUT_CLASS} defaultValue="supplier_invoice" name="payment_type">
                  {PAYMENT_REQUEST_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Amount
                <input
                  className={OPS_INPUT_CLASS}
                  min="0.01"
                  name="requested_amount"
                  required
                  step="0.01"
                  type="number"
                />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Due date
                <input className={OPS_INPUT_CLASS} name="due_date" type="date" />
              </label>
              <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
                Invoice reference
                <input className={OPS_INPUT_CLASS} name="invoice_reference" />
              </label>
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-6`}>
                Title
                <input className={OPS_INPUT_CLASS} name="title" required />
              </label>
              <label className={`${OPS_LABEL_CLASS} min-[520px]:col-span-2 lg:col-span-6`}>
                Description
                <textarea className={`${OPS_INPUT_CLASS} min-h-24`} name="description" />
              </label>
              <div className="flex items-end min-[520px]:col-span-2 lg:col-span-6">
                <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`} type="submit">
                  <Plus className="size-4" aria-hidden="true" />
                  Create payment
                </button>
              </div>
            </form>
          )}
        </details>
      ) : null}

      <section
        className="scroll-mt-24 rounded-lg border border-border bg-card"
        id="payment-request-register"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Payment register
            </p>
            <h2 className="font-heading text-xl font-bold text-foreground">
              Supplier bills and expenses
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {paymentRequestPage.pagination.total} matching requests filtered by status and search.
            </p>
          </div>
          <Receipt className="size-6 shrink-0 text-primary-blue" aria-hidden="true" />
        </div>
        <OpsListControls
          action="/ops/payment-requests"
          filters={[
            {
              label: "Status",
              name: "status",
              options: PAYMENT_REQUEST_STATUS_OPTIONS,
              value: status,
            },
          ]}
          placeholder="Search request number, title, invoice reference, or payment reference"
          query={listState.query}
          resultLabel="payment requests"
        />

        {paymentRequestPage.items.length > 0 ? (
          <div className="divide-y divide-border">
            {paymentRequestPage.items.map((paymentRequest) => {
              const canSubmit = canSubmitOpsPaymentRequest(
                auth.profile.id,
                auth.profile.role,
                paymentRequest,
              );
              const canReview = canReviewOpsPaymentRequest(auth.profile.role, paymentRequest);
              const canApprove = canApproveOpsPaymentRequest(auth.profile.role, paymentRequest);
              const canReject = canRejectOpsPaymentRequest(auth.profile.role, paymentRequest);
              const canPay = canPayOpsPaymentRequest(auth.profile.role, paymentRequest);
              const canCancel = canCancelOpsPaymentRequest(
                auth.profile.id,
                auth.profile.role,
                paymentRequest,
              );
              const canManageActivity =
                canSubmit || canReview || canApprove || canReject || canPay || canCancel;

              return (
                <article className="p-5" key={paymentRequest.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading text-lg font-bold text-foreground">
                          {paymentRequest.request_number}
                        </h3>
                        <span
                          className={opsStatusBadgeClass(paymentRequest.status)}
                        >
                          {formatLabel(paymentRequest.status)}
                        </span>
                        <span className="inline-flex rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                          {formatLabel(paymentRequest.payment_type)}
                        </span>
                      </div>
                      <p className="mt-2 font-bold text-foreground">{paymentRequest.title}</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {paymentRequest.site
                          ? `${paymentRequest.site.code} - ${paymentRequest.site.name}`
                          : "Site unavailable"}{" "}
                        /{" "}
                        {paymentRequest.supplier
                          ? `${paymentRequest.supplier.supplier_code} - ${paymentRequest.supplier.legal_name}`
                          : "No supplier linked"}
                      </p>
                    </div>
                    <div className="grid gap-2 min-[520px]:grid-cols-2 lg:min-w-56 lg:grid-cols-1">
                      {canSubmit ? (
                        <form action={submitPaymentRequestAction}>
                          <input name="payment_request_id" type="hidden" value={paymentRequest.id} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
                            confirmText="Submit payment request"
                          >
                            <Send className="size-4" aria-hidden="true" />
                            Submit
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                      {canReview ? (
                        <form action={reviewPaymentRequestAction}>
                          <input name="payment_request_id" type="hidden" value={paymentRequest.id} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
                            confirmText="Start finance review"
                          >
                            <ClipboardCheck className="size-4" aria-hidden="true" />
                            Review
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                      {canApprove ? (
                        <form action={approvePaymentRequestAction}>
                          <input name="payment_request_id" type="hidden" value={paymentRequest.id} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_PRIMARY_BUTTON_CLASS} w-full`}
                            confirmText="Approve payment request"
                          >
                            <CheckCircle2 className="size-4" aria-hidden="true" />
                            Approve
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                      {canReject ? (
                        <form action={rejectPaymentRequestAction}>
                          <input name="payment_request_id" type="hidden" value={paymentRequest.id} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_DANGER_BUTTON_CLASS} w-full`}
                            confirmText="Reject payment request"
                          >
                            <XCircle className="size-4" aria-hidden="true" />
                            Reject
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                      {canCancel ? (
                        <form action={cancelPaymentRequestAction}>
                          <input name="payment_request_id" type="hidden" value={paymentRequest.id} />
                          <OpsConfirmSubmitButton
                            className={`${OPS_DANGER_BUTTON_CLASS} w-full`}
                            confirmText="Cancel payment request"
                          >
                            Cancel
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  <dl className="mt-4 grid gap-3 md:grid-cols-5">
                    <PaymentMetric
                      label="Amount"
                      value={formatMoney(paymentRequest.requested_amount, paymentRequest.currency_code)}
                    />
                    <PaymentMetric label="Due date" value={formatDate(paymentRequest.due_date)} />
                    <PaymentMetric
                      label="Invoice ref"
                      value={paymentRequest.invoice_reference || "Not recorded"}
                    />
                    <PaymentMetric
                      label="PO"
                      value={paymentRequest.purchase_order?.po_number ?? "Not linked"}
                    />
                    <PaymentMetric
                      label="Budget"
                      value={paymentRequest.budget?.budget_number ?? "Not linked"}
                    />
                  </dl>

                  <dl className="mt-3 grid gap-3 md:grid-cols-4">
                    <PaymentMetric
                      label="Requested by"
                      value={formatOpsUserName(
                        paymentRequest.requested_by_user?.full_name,
                        paymentRequest.requested_by_user?.id,
                      )}
                    />
                    <PaymentMetric
                      label="Approved"
                      value={formatDateTime(paymentRequest.approved_at)}
                    />
                    <PaymentMetric label="Paid" value={formatDateTime(paymentRequest.paid_at)} />
                    <PaymentMetric
                      label="Cost status"
                      value={paymentRequest.cost_entry?.status ?? "Not posted"}
                    />
                  </dl>

                  {paymentRequest.description ? (
                    <p className="mt-4 rounded-md border border-border px-3 py-3 text-sm leading-6 text-muted-foreground">
                      {paymentRequest.description}
                    </p>
                  ) : null}

                  {paymentRequest.items.length > 0 ? (
                    <OpsTableShell className="mt-4">
                      <table className={`${OPS_TABLE_CLASS} min-w-[680px]`}>
                        <caption className="sr-only">
                          Payment request line items with budget links, quantity, unit cost, and total.
                        </caption>
                        <thead className={OPS_THEAD_CLASS}>
                          <tr>
                            <th className={OPS_TH_CLASS} scope="col">Line</th>
                            <th className={OPS_TH_CLASS} scope="col">Description</th>
                            <th className={OPS_TH_CLASS} scope="col">Budget line</th>
                            <th className={OPS_TH_NUM_CLASS} scope="col">Qty</th>
                            <th className={OPS_TH_NUM_CLASS} scope="col">Unit cost</th>
                            <th className={OPS_TH_NUM_CLASS} scope="col">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paymentRequest.items.map((item) => (
                            <tr className={OPS_TR_CLASS} key={item.id}>
                              <td className={`${OPS_TD_CLASS} font-bold text-foreground`}>
                                {item.line_number}
                              </td>
                              <td className={`${OPS_TD_CLASS} text-muted-foreground`}>
                                {item.description}
                              </td>
                              <td className={`${OPS_TD_CLASS} text-muted-foreground`}>
                                {item.budget_line?.cost_code || "Not linked"}
                              </td>
                              <td className={`${OPS_TD_NUM_CLASS} text-muted-foreground`}>
                                {item.quantity}
                              </td>
                              <td className={`${OPS_TD_NUM_CLASS} text-muted-foreground`}>
                                {formatMoney(item.unit_cost, paymentRequest.currency_code)}
                              </td>
                              <td className={`${OPS_TD_NUM_CLASS} font-semibold text-foreground`}>
                                {formatMoney(item.line_total, paymentRequest.currency_code)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </OpsTableShell>
                  ) : null}

                  {canPay ? (
                    <div className="mt-4">
                      <MarkPaidForm paymentRequest={paymentRequest} />
                    </div>
                  ) : null}

                  <OpsRecordActivityPanel
                    canManage={canManageActivity}
                    sourceId={paymentRequest.id}
                    sourceTable="payment_requests"
                  />
                </article>
              );
            })}
          </div>
        ) : (
          <OpsEmptyState
            icon={Receipt}
            title={
              hasActiveListFilter
                ? "No payment requests match these filters"
                : "No payment requests yet"
            }
            description={
              hasActiveListFilter
                ? "Try clearing the search or switching the status filter — drafts, submitted, approved, and paid sit in different buckets."
                : "Supplier bills and staff expense reimbursements appear here when raised for approval."
            }
            actions={
              hasActiveListFilter
                ? [{ href: "/ops/payment-requests", label: "Clear filters" }]
                : canCreate
                  ? [{ href: createPaymentHref, label: "Create the first payment request" }]
                  : [{ href: "/ops/rfq-po", label: "Open Purchase Orders", variant: "secondary" }]
            }
          />
        )}
        <OpsPaginationControls
          basePath="/ops/payment-requests"
          filters={[
            {
              label: "Status",
              name: "status",
              options: [],
              value: status,
            },
          ]}
          pagination={paymentRequestPage.pagination}
          query={listState.query}
          resultLabel="payment requests"
        />
      </section>
    </div>
  );
}
