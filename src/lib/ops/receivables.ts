import {
  createOpsFinanceAgeingBucketSummaries,
  getOpsFinanceAgeingBucket,
  getOpsFinanceCalendarDayDelta,
  getOpsFinanceTodayIso,
  type OpsFinanceAgeingBucket,
  type OpsFinanceAgeingBucketSummary,
} from "@/lib/ops/finance-reporting";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Receivables — what clients owe, derived.
 *
 * R5 of docs/pymble-ops-payables-receivables-split-2026-08.md. Decision D6:
 * there is no receivables table and no `amount_paid` column. A receivable is
 * not a thing to create — it is a state an invoice is in:
 *
 *     outstanding = total_amount − sum(live receipts)
 *
 * So an invoice IS a receivable the instant it exists, with no sync step, no
 * background job and nothing that can drift. Voiding an invoice removes the
 * receivable; recording a receipt shrinks it. Nothing has to be kept in step,
 * because there is only ever one record of the debt.
 *
 * Derived in TypeScript rather than a SQL view to match the house pattern
 * (budget-availability.ts, finance-kpis.ts, procurement-fulfilment.ts): the
 * arithmetic stays testable without a database, which matters here because the
 * register is empty and only fixtures can prove any of it.
 */

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/**
 * Where an invoice stands on being settled.
 *
 * Derived, never stored — `overdue` in particular is a question, not a state:
 * store it and it is wrong by the next morning. The `status` column keeps its
 * own meaning (the workflow: draft → sent → paid); this is about the money.
 */
export type OpsReceivableSettlement =
  | "draft"
  | "awaiting"
  | "part_paid"
  | "settled";

export type OpsReceivableRow = {
  bucket: OpsFinanceAgeingBucket;
  client_name: string;
  customer_id: string | null;
  /** Negative when not yet due. Null when there is no due date to measure. */
  days_overdue: number | null;
  due_date: string | null;
  invoice_id: string;
  invoice_number: string;
  issued_at: string;
  /** Outstanding less retention — what can actually be chased today. */
  collectable: number;
  outstanding: number;
  received: number;
  retention: number;
  /** True for a debt brought on from before the system (credits equity). */
  is_opening_balance: boolean;
  settlement: OpsReceivableSettlement;
  site_code: string | null;
  total: number;
};

export type OpsReceivableDebtor = {
  client_name: string;
  customer_id: string | null;
  invoice_count: number;
  /** Longest any of this debtor's invoices has been past due. */
  oldest_overdue_days: number | null;
  outstanding: number;
  overdue: number;
};

export type OpsReceivablesSummary = {
  /** Live receivables, worst first. Drafts are excluded — see draft_value. */
  rows: OpsReceivableRow[];
  buckets: OpsFinanceAgeingBucketSummary[];
  debtors: OpsReceivableDebtor[];
  /** Sent, not yet settled. The headline. */
  total_outstanding: number;
  /** Of that, past its due date. */
  total_overdue: number;
  /**
   * Invoiced but not collectable until release. Reported apart from overdue on
   * purpose: retention is money the contract says we cannot have yet, and
   * folding it into overdue makes a compliant client look like a bad payer.
   */
  total_retention: number;
  /** Outstanding less retention — the number worth chasing. */
  total_collectable: number;
  /** Raised but never sent. Not a receivable: nobody has been asked to pay. */
  draft_value: number;
  draft_count: number;
  /** Debt carried in from before the system, within the outstanding total. */
  opening_balance_value: number;
};

// ---------------------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------------------

export type OpsInvoiceForReceivables = {
  client_name: string;
  customer_id: string | null;
  due_date: string | null;
  id: string;
  invoice_number: string;
  issued_at: string;
  retention_amount: number;
  revenue_treatment: string;
  site_code: string | null;
  status: string;
  total_amount: number;
};

export type OpsReceiptForReceivables = {
  amount: number;
  /** Cancelled receipts are excluded by the caller; kept for clarity. */
  cancelled: boolean;
  invoice_id: string;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function settlementOf(
  status: string,
  received: number,
  outstanding: number,
): OpsReceivableSettlement {
  if (status === "draft") return "draft";
  if (outstanding <= 0) return "settled";
  return received > 0 ? "part_paid" : "awaiting";
}

export function summariseReceivables(
  invoices: OpsInvoiceForReceivables[],
  receipts: OpsReceiptForReceivables[],
  today = getOpsFinanceTodayIso(),
): OpsReceivablesSummary {
  const receivedByInvoice = new Map<string, number>();
  for (const receipt of receipts) {
    if (receipt.cancelled) continue;
    receivedByInvoice.set(
      receipt.invoice_id,
      roundMoney((receivedByInvoice.get(receipt.invoice_id) ?? 0) + receipt.amount),
    );
  }

  const rows: OpsReceivableRow[] = [];
  const buckets = createOpsFinanceAgeingBucketSummaries();
  const debtors = new Map<string, OpsReceivableDebtor>();

  let totalOutstanding = 0;
  let totalOverdue = 0;
  let totalRetention = 0;
  let totalCollectable = 0;
  let draftValue = 0;
  let draftCount = 0;
  let openingBalanceValue = 0;

  for (const invoice of invoices) {
    const received = receivedByInvoice.get(invoice.id) ?? 0;
    const outstanding = roundMoney(Math.max(invoice.total_amount - received, 0));
    const settlement = settlementOf(invoice.status, received, outstanding);

    if (settlement === "draft") {
      draftValue = roundMoney(draftValue + invoice.total_amount);
      draftCount += 1;
      continue;
    }

    if (settlement === "settled") {
      continue;
    }

    // Retention can only be withheld from money still owed — once a client has
    // paid all but the retention, what is left IS the retention.
    const retention = roundMoney(Math.min(invoice.retention_amount, outstanding));
    const collectable = roundMoney(Math.max(outstanding - retention, 0));
    const bucket = getOpsFinanceAgeingBucket(invoice.due_date, today);
    const daysUntilDue = getOpsFinanceCalendarDayDelta(invoice.due_date, today);
    const daysOverdue = daysUntilDue === null ? null : -daysUntilDue;
    const isOverdue = daysOverdue !== null && daysOverdue > 0;
    const isOpeningBalance = invoice.revenue_treatment === "opening_balance";

    rows.push({
      bucket,
      client_name: invoice.client_name,
      collectable,
      customer_id: invoice.customer_id,
      days_overdue: daysOverdue,
      due_date: invoice.due_date,
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      is_opening_balance: isOpeningBalance,
      issued_at: invoice.issued_at,
      outstanding,
      received,
      retention,
      settlement,
      site_code: invoice.site_code,
      total: invoice.total_amount,
    });

    totalOutstanding = roundMoney(totalOutstanding + outstanding);
    totalRetention = roundMoney(totalRetention + retention);
    totalCollectable = roundMoney(totalCollectable + collectable);
    if (isOverdue) {
      totalOverdue = roundMoney(totalOverdue + outstanding);
    }
    if (isOpeningBalance) {
      openingBalanceValue = roundMoney(openingBalanceValue + outstanding);
    }

    const summary = buckets.find((entry) => entry.bucket === bucket);
    if (summary) {
      summary.amount = roundMoney(summary.amount + outstanding);
      summary.count += 1;
    }

    // Keyed on the customer where there is one, else the typed client name —
    // an invoice with no customer link still represents a real debtor, and
    // dropping it would understate what is owed.
    const key = invoice.customer_id ?? `name:${invoice.client_name.trim().toUpperCase()}`;
    const debtor =
      debtors.get(key) ??
      {
        client_name: invoice.client_name,
        customer_id: invoice.customer_id,
        invoice_count: 0,
        oldest_overdue_days: null,
        outstanding: 0,
        overdue: 0,
      };

    debtor.invoice_count += 1;
    debtor.outstanding = roundMoney(debtor.outstanding + outstanding);
    if (isOverdue) {
      debtor.overdue = roundMoney(debtor.overdue + outstanding);
      if (debtor.oldest_overdue_days === null || daysOverdue! > debtor.oldest_overdue_days) {
        debtor.oldest_overdue_days = daysOverdue;
      }
    }
    debtors.set(key, debtor);
  }

  // Worst first: most overdue, then largest. This list is opened to decide who
  // to call, and the answer belongs at the top.
  rows.sort((a, b) => {
    const aDays = a.days_overdue ?? Number.NEGATIVE_INFINITY;
    const bDays = b.days_overdue ?? Number.NEGATIVE_INFINITY;
    if (aDays !== bDays) return bDays - aDays;
    return b.outstanding - a.outstanding;
  });

  const debtorRows = [...debtors.values()].sort((a, b) => {
    if (a.overdue !== b.overdue) return b.overdue - a.overdue;
    return b.outstanding - a.outstanding;
  });

  return {
    buckets,
    debtors: debtorRows,
    draft_count: draftCount,
    draft_value: draftValue,
    opening_balance_value: openingBalanceValue,
    rows,
    total_collectable: totalCollectable,
    total_outstanding: totalOutstanding,
    total_overdue: totalOverdue,
    total_retention: totalRetention,
  };
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

type RawInvoice = {
  client_name: string;
  customer_id: string | null;
  due_date: string | null;
  id: string;
  invoice_number: string;
  issued_at: string;
  retention_amount: number | string | null;
  revenue_treatment: string;
  site: { code: string } | { code: string }[] | null;
  status: string;
  total_amount: number | string | null;
};

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export async function fetchOpsReceivables(
  today = getOpsFinanceTodayIso(),
): Promise<OpsReceivablesSummary> {
  const supabase = getOpsSupabaseServiceClient();

  const [invoiceResult, receiptResult] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, client_name, customer_id, status, issued_at, due_date, total_amount, retention_amount, revenue_treatment, site:sites!invoices_site_id_fkey(code)",
      )
      .is("deleted_at", null)
      .is("archived_at", null)
      .is("cancelled_at", null),
    supabase
      .from("invoice_receipts")
      .select("invoice_id, amount, cancelled_at")
      .is("cancelled_at", null),
  ]);

  if (invoiceResult.error) {
    throw invoiceResult.error;
  }
  if (receiptResult.error) {
    throw receiptResult.error;
  }

  const invoices = ((invoiceResult.data ?? []) as unknown as RawInvoice[]).map((row) => {
    const site = Array.isArray(row.site) ? (row.site[0] ?? null) : row.site;
    return {
      client_name: row.client_name,
      customer_id: row.customer_id,
      due_date: row.due_date,
      id: row.id,
      invoice_number: row.invoice_number,
      issued_at: row.issued_at,
      retention_amount: toNumber(row.retention_amount),
      revenue_treatment: row.revenue_treatment,
      site_code: site?.code ?? null,
      status: row.status,
      total_amount: toNumber(row.total_amount),
    };
  });

  const receipts = ((receiptResult.data ?? []) as Array<{
    invoice_id: string;
    amount: number | string | null;
    cancelled_at: string | null;
  }>).map((row) => ({
    amount: toNumber(row.amount),
    cancelled: Boolean(row.cancelled_at),
    invoice_id: row.invoice_id,
  }));

  return summariseReceivables(invoices, receipts, today);
}

// ---------------------------------------------------------------------------
// Receipt history, for the invoice register
// ---------------------------------------------------------------------------

export type OpsInvoiceReceipt = {
  amount: number;
  bank_reference: string;
  cancellation_reason: string;
  cancelled_at: string | null;
  id: string;
  invoice_id: string;
  method: string;
  notes: string;
  received_on: string;
  recorded_by_name: string | null;
};

/**
 * Receipts for a set of invoices, cancelled ones included.
 *
 * A reversed receipt still shows: the correction is part of the cash record,
 * and hiding it would leave a GL entry with no visible cause.
 */
export async function fetchOpsInvoiceReceipts(
  invoiceIds: string[],
): Promise<Map<string, OpsInvoiceReceipt[]>> {
  const out = new Map<string, OpsInvoiceReceipt[]>();

  if (invoiceIds.length === 0) {
    return out;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("invoice_receipts")
    .select(
      "id, invoice_id, amount, received_on, method, bank_reference, notes, cancelled_at, cancellation_reason, recorded_by:users!invoice_receipts_recorded_by_fkey(full_name)",
    )
    .in("invoice_id", invoiceIds)
    .order("received_on", { ascending: false });

  if (error) {
    throw error;
  }

  for (const row of (data ?? []) as unknown as Array<{
    id: string;
    invoice_id: string;
    amount: number | string;
    received_on: string;
    method: string;
    bank_reference: string;
    notes: string;
    cancelled_at: string | null;
    cancellation_reason: string;
    recorded_by: { full_name: string } | { full_name: string }[] | null;
  }>) {
    const recorder = Array.isArray(row.recorded_by)
      ? (row.recorded_by[0] ?? null)
      : row.recorded_by;

    const list = out.get(row.invoice_id) ?? [];
    list.push({
      amount: toNumber(row.amount),
      bank_reference: row.bank_reference,
      cancellation_reason: row.cancellation_reason,
      cancelled_at: row.cancelled_at,
      id: row.id,
      invoice_id: row.invoice_id,
      method: row.method,
      notes: row.notes,
      received_on: row.received_on,
      recorded_by_name: recorder?.full_name ?? null,
    });
    out.set(row.invoice_id, list);
  }

  return out;
}

/** Live receipts total for one invoice — cancelled rows excluded. */
export function receivedTotal(receipts: OpsInvoiceReceipt[] | undefined) {
  return roundMoney(
    (receipts ?? [])
      .filter((receipt) => !receipt.cancelled_at)
      .reduce((sum, receipt) => sum + receipt.amount, 0),
  );
}
