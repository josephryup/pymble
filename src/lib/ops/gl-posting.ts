import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  buildInvoiceIssueJournal,
  buildInvoicePaymentJournal,
  buildPaymentRequestAccrualJournal,
  buildPaymentRequestSettlementJournal,
  buildInvoiceReceiptJournal,
  buildPayrollDisbursementJournal,
  buildStaffPayrollDisbursementJournal,
  type OpsGlPostingInput,
  type OpsInvoiceForPosting,
  type OpsPaymentRequestForPosting,
} from "@/lib/ops/gl-journal-builders";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsPaymentRequestType } from "@/lib/ops/types";

export {
  OPS_GL_ACCOUNTS,
  buildInvoiceIssueJournal,
  buildInvoicePaymentJournal,
  buildPaymentRequestAccrualJournal,
  buildPaymentRequestSettlementJournal,
  buildPayrollDisbursementJournal,
  buildStaffPayrollDisbursementJournal,
  opsPaymentExpenseAccount,
} from "@/lib/ops/gl-journal-builders";
export type {
  OpsGlPostingInput,
  OpsGlPostingLine,
  OpsInvoiceForPosting,
  OpsPaymentRequestForPosting,
  OpsPayrollRunForPosting,
  OpsStaffPayrollRunForPosting,
} from "@/lib/ops/gl-journal-builders";

/**
 * GL posting engine. Turns subledger events into balanced double-entry journals
 * via the atomic public.post_journal_entry(jsonb) RPC. The RPC validates
 * balance + account postability inside one transaction, so a bad payload rolls
 * back cleanly and never leaves a half-written entry. Re-posting the same
 * (source_table, source_id, source_event) hits a unique index and is treated as
 * an idempotent no-op.
 */

export type OpsGlPostingResult = {
  entryId: string | null;
  duplicate: boolean;
};

const POSTGRES_UNIQUE_VIOLATION = "23505";

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function postOpsJournalEntry(
  input: OpsGlPostingInput,
): Promise<OpsGlPostingResult> {
  const supabase = getOpsSupabaseServiceClient();
  const payload = {
    entry_date: input.entryDate ?? null,
    memo: input.memo,
    currency_code: input.currencyCode ?? "ZMW",
    source_table: input.sourceTable ?? null,
    source_id: input.sourceId ?? null,
    source_event: input.sourceEvent ?? null,
    created_by: input.createdBy ?? null,
    is_system: true,
    lines: input.lines.map((line) => ({
      account_code: line.account_code,
      debit: line.debit ?? 0,
      credit: line.credit ?? 0,
      description: line.description ?? "",
      site_id: line.site_id ?? null,
      cost_code: line.cost_code ?? "",
    })),
  };

  const { data, error } = await supabase.rpc("post_journal_entry", { payload });

  if (error) {
    // Already posted for this source event — idempotent no-op, not a failure.
    if ((error as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION) {
      return { entryId: null, duplicate: true };
    }
    throw error;
  }

  return { entryId: (data as string) ?? null, duplicate: false };
}

/**
 * Post the cash for one receipt. Best-effort, like every other posting hook:
 * the money has already been received and recorded, and a GL hiccup must not
 * roll that back.
 */
export async function postInvoiceReceiptJournalSafe(
  receiptId: string,
  actorUserId: string,
): Promise<void> {
  try {
    const supabase = getOpsSupabaseServiceClient();
    const { data, error } = await supabase
      .from("invoice_receipts")
      .select(
        "id, amount, received_on, invoice:invoices!invoice_receipts_invoice_id_fkey(invoice_number, site_id)",
      )
      .eq("id", receiptId)
      .maybeSingle<{
        id: string;
        amount: number | string;
        received_on: string;
        invoice:
          | { invoice_number: string; site_id: string | null }
          | { invoice_number: string; site_id: string | null }[]
          | null;
      }>();

    if (error) {
      throw error;
    }
    if (!data) {
      return;
    }

    const invoice = Array.isArray(data.invoice) ? (data.invoice[0] ?? null) : data.invoice;
    const amount = round2(Number(data.amount ?? 0));

    if (!invoice || amount <= 0) {
      return;
    }

    const journal = buildInvoiceReceiptJournal({
      amount,
      id: data.id,
      invoice_number: invoice.invoice_number,
      received_on: data.received_on,
      site_id: invoice.site_id,
    });

    const result = await postOpsJournalEntry({ ...journal, createdBy: actorUserId });

    // Stamped back so the receipt can show, and reverse, its own entry.
    if (result.entryId) {
      await supabase
        .from("invoice_receipts")
        .update({ journal_entry_id: result.entryId })
        .eq("id", receiptId);
    }
  } catch (error: unknown) {
    await logPostingFailure({
      actorUserId,
      entityId: receiptId,
      entityType: "invoice_receipt",
      sourceTable: "invoice_receipts",
      detail: `invoice receipt ${receiptId}`,
      error,
    });
  }
}

async function logPostingFailure(input: {
  actorUserId: string;
  entityId: string;
  entityType: string;
  sourceTable: string;
  detail: string;
  error: unknown;
}) {
  await recordOpsAuditEvent({
    action: "journal_entry.post_failed",
    actorUserId: input.actorUserId,
    entityId: input.entityId,
    entityType: input.entityType,
    metadata: {
      detail: input.detail,
      error: input.error instanceof Error ? input.error.message : "Unknown GL posting error",
    },
    moduleKey: "finance",
    sourceId: input.entityId,
    sourceTable: input.sourceTable,
    summary: `GL posting failed: ${input.detail}`,
  }).catch(() => null);
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

type RawInvoiceForPosting = {
  id: string;
  invoice_number: string;
  client_name: string;
  site_id: string;
  subtotal: number | string;
  vat_amount: number | string;
  total_amount: number | string;
  revenue_treatment: "current_period" | "opening_balance" | null;
};

/**
 * Best-effort posting hook for invoice lifecycle events. Never throws — a GL
 * sync failure must not block the operational action — and logs to audit_events
 * so a failed posting is visible.
 */
export async function postInvoiceJournalSafe(
  invoiceId: string,
  event: "issued" | "paid",
  actorUserId: string,
): Promise<void> {
  try {
    const supabase = getOpsSupabaseServiceClient();
    const { data, error } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, client_name, site_id, subtotal, vat_amount, total_amount, revenue_treatment",
      )
      .eq("id", invoiceId)
      .maybeSingle<RawInvoiceForPosting>();

    if (error) {
      throw error;
    }
    if (!data) {
      return;
    }

    const invoice: OpsInvoiceForPosting = {
      id: data.id,
      invoice_number: data.invoice_number,
      client_name: data.client_name,
      site_id: data.site_id,
      subtotal: Number(data.subtotal ?? 0),
      vat_amount: Number(data.vat_amount ?? 0),
      total_amount: Number(data.total_amount ?? 0),
      // Without this the opening-balance branch in the builder could never
      // fire, and a pre-system debt would credit revenue.
      revenue_treatment: data.revenue_treatment,
    };

    if (invoice.total_amount <= 0) {
      return;
    }

    const entryDate = new Date().toISOString().slice(0, 10);
    const input =
      event === "issued"
        ? buildInvoiceIssueJournal(invoice, entryDate)
        : buildInvoicePaymentJournal(invoice, entryDate);

    await postOpsJournalEntry({ ...input, createdBy: actorUserId });
  } catch (error: unknown) {
    await logPostingFailure({
      actorUserId,
      entityId: invoiceId,
      entityType: "invoice",
      sourceTable: "invoices",
      detail: `invoice ${invoiceId} (${event})`,
      error,
    });
  }
}

// ---------------------------------------------------------------------------
// Payment requests (accounts payable)
// ---------------------------------------------------------------------------

export type PostPaymentRequestInput = {
  id: string;
  request_number: string;
  title: string;
  /** Null for legacy-project and overhead payables. */
  site_id: string | null;
  payment_type: OpsPaymentRequestType;
  requested_amount: number | string;
  payment_reference?: string;
  cost_treatment?: "opening_balance" | "current_period" | null;
};

export async function postPaymentRequestJournalSafe(
  input: PostPaymentRequestInput,
  event: "accrued" | "paid",
  actorUserId: string,
): Promise<void> {
  try {
    const amount = Number(input.requested_amount ?? 0);
    if (amount <= 0) {
      return;
    }

    const bill: OpsPaymentRequestForPosting = {
      id: input.id,
      request_number: input.request_number,
      title: input.title,
      site_id: input.site_id,
      payment_type: input.payment_type,
      amount: round2(amount),
      payment_reference: input.payment_reference,
      cost_treatment: input.cost_treatment ?? null,
    };

    const entryDate = new Date().toISOString().slice(0, 10);
    const journal =
      event === "accrued"
        ? buildPaymentRequestAccrualJournal(bill, entryDate)
        : buildPaymentRequestSettlementJournal(bill, entryDate);

    await postOpsJournalEntry({ ...journal, createdBy: actorUserId });
  } catch (error: unknown) {
    await logPostingFailure({
      actorUserId,
      entityId: input.id,
      entityType: "payment_request",
      sourceTable: "payment_requests",
      detail: `payment request ${input.request_number} (${event})`,
      error,
    });
  }
}

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

type RawPayrollItem = {
  gross_pay: number | string | null;
  advance_deduction: number | string | null;
  net_pay: number | string | null;
  paye_amount: number | string | null;
  napsa_employee: number | string | null;
  napsa_employer: number | string | null;
  wcf_employer: number | string | null;
};

export async function postPayrollRunJournalSafe(
  runId: string,
  actorUserId: string,
): Promise<void> {
  try {
    const supabase = getOpsSupabaseServiceClient();
    const { data: run, error: runError } = await supabase
      .from("payroll_runs")
      .select("id, period_label")
      .eq("id", runId)
      .maybeSingle<{ id: string; period_label: string }>();

    if (runError) {
      throw runError;
    }
    if (!run) {
      return;
    }

    const { data: itemData, error: itemError } = await supabase
      .from("payroll_run_items")
      .select(
        "gross_pay, advance_deduction, net_pay, paye_amount, napsa_employee, napsa_employer, wcf_employer",
      )
      .eq("payroll_run_id", runId);

    if (itemError) {
      throw itemError;
    }

    const items = (itemData ?? []) as RawPayrollItem[];
    if (items.length === 0) {
      return;
    }

    const sum = (key: keyof RawPayrollItem) =>
      round2(items.reduce((total, item) => total + Number(item[key] ?? 0), 0));

    const summary = {
      id: run.id,
      period_label: run.period_label,
      gross: sum("gross_pay"),
      net: sum("net_pay"),
      paye: sum("paye_amount"),
      napsa_employee: sum("napsa_employee"),
      napsa_employer: sum("napsa_employer"),
      wcf: sum("wcf_employer"),
      advances: sum("advance_deduction"),
    };

    if (summary.gross <= 0) {
      return;
    }

    const entryDate = new Date().toISOString().slice(0, 10);
    const journal = buildPayrollDisbursementJournal(summary, entryDate);
    await postOpsJournalEntry({ ...journal, createdBy: actorUserId });
  } catch (error: unknown) {
    await logPostingFailure({
      actorUserId,
      entityId: runId,
      entityType: "payroll_run",
      sourceTable: "payroll_runs",
      detail: `payroll run ${runId}`,
      error,
    });
  }
}

type RawStaffPayrollItem = RawPayrollItem & {
  nhima_employee: number | string | null;
  nhima_employer: number | string | null;
};

/**
 * Post the staff payroll journal.
 *
 * The sibling of postPayrollRunJournalSafe, for the salaried engine, which
 * until now posted nothing at all: `staff_payroll_runs` had no journal path,
 * so every completed staff run was invisible to the general ledger.
 *
 * Same failure contract as the rest of this module — the run has already been
 * marked paid by the time this is called, so a posting failure is logged and
 * swallowed rather than rolling back a disbursement that really happened.
 */
export async function postStaffPayrollRunJournalSafe(
  runId: string,
  actorUserId: string,
): Promise<void> {
  try {
    const supabase = getOpsSupabaseServiceClient();
    const { data: run, error: runError } = await supabase
      .from("staff_payroll_runs")
      .select("id, period_label")
      .eq("id", runId)
      .maybeSingle<{ id: string; period_label: string }>();

    if (runError) {
      throw runError;
    }
    if (!run) {
      return;
    }

    const { data: itemData, error: itemError } = await supabase
      .from("staff_payroll_items")
      .select(
        "gross_pay, advance_deduction, net_pay, paye_amount, napsa_employee, napsa_employer, nhima_employee, nhima_employer, wcf_employer",
      )
      .eq("staff_payroll_run_id", runId);

    if (itemError) {
      throw itemError;
    }

    const items = (itemData ?? []) as RawStaffPayrollItem[];
    if (items.length === 0) {
      return;
    }

    const sum = (key: keyof RawStaffPayrollItem) =>
      round2(items.reduce((total, item) => total + Number(item[key] ?? 0), 0));

    const summary = {
      id: run.id,
      period_label: run.period_label,
      gross: sum("gross_pay"),
      net: sum("net_pay"),
      paye: sum("paye_amount"),
      napsa_employee: sum("napsa_employee"),
      napsa_employer: sum("napsa_employer"),
      nhima_employee: sum("nhima_employee"),
      nhima_employer: sum("nhima_employer"),
      wcf: sum("wcf_employer"),
      advances: sum("advance_deduction"),
    };

    if (summary.gross <= 0) {
      return;
    }

    const entryDate = new Date().toISOString().slice(0, 10);
    const journal = buildStaffPayrollDisbursementJournal(summary, entryDate);
    await postOpsJournalEntry({ ...journal, createdBy: actorUserId });
  } catch (error: unknown) {
    await logPostingFailure({
      actorUserId,
      entityId: runId,
      entityType: "staff_payroll_run",
      sourceTable: "staff_payroll_runs",
      detail: `staff payroll run ${runId}`,
      error,
    });
  }
}

// ---------------------------------------------------------------------------
// Reversal — contra a previously posted entry (void / cancel of the source).
// ---------------------------------------------------------------------------

type RawReversalAccount = { code: string };
type RawReversalLine = {
  debit: number | string;
  credit: number | string;
  description: string;
  site_id: string | null;
  cost_code: string;
  account: RawReversalAccount | RawReversalAccount[] | null;
};
type RawReversalEntry = {
  memo: string;
  currency_code: string;
  lines: RawReversalLine[] | null;
};

/**
 * Posts a contra of the journal previously raised for (sourceTable, sourceId,
 * originalEvent) — debits become credits and vice versa — so a void/cancel
 * unwinds its accrual without ever mutating the immutable original. Idempotent
 * (the reversal carries its own `<event>_reversed` source event); a no-op when
 * the original was never posted.
 */
export async function reverseOpsJournalSafe(
  sourceTable: string,
  sourceId: string,
  originalEvent: string,
  actorUserId: string,
): Promise<void> {
  try {
    const supabase = getOpsSupabaseServiceClient();
    const { data, error } = await supabase
      .from("journal_entries")
      .select(
        "memo, currency_code, lines:journal_lines!journal_lines_entry_id_fkey(debit, credit, description, site_id, cost_code, account:chart_of_accounts!journal_lines_account_id_fkey(code))",
      )
      .eq("source_table", sourceTable)
      .eq("source_id", sourceId)
      .eq("source_event", originalEvent)
      .eq("status", "posted")
      .maybeSingle<RawReversalEntry>();

    if (error) {
      throw error;
    }
    if (!data || !data.lines || data.lines.length === 0) {
      return;
    }

    const lines = data.lines
      .map((line) => {
        const account = Array.isArray(line.account) ? line.account[0] : line.account;
        const originalDebit = Number(line.debit ?? 0);
        const originalCredit = Number(line.credit ?? 0);
        return {
          account_code: account?.code ?? "",
          // Swap sides to contra the original.
          debit: originalCredit > 0 ? originalCredit : undefined,
          credit: originalDebit > 0 ? originalDebit : undefined,
          description: `Reversal: ${line.description}`,
          site_id: line.site_id,
          cost_code: line.cost_code,
        };
      })
      .filter((line) => line.account_code.length > 0);

    if (lines.length < 2) {
      return;
    }

    await postOpsJournalEntry({
      memo: `Reversal of ${data.memo}`,
      currencyCode: data.currency_code,
      sourceTable,
      sourceId,
      sourceEvent: `${originalEvent}_reversed`,
      createdBy: actorUserId,
      lines,
    });
  } catch (error: unknown) {
    await logPostingFailure({
      actorUserId,
      entityId: sourceId,
      entityType: sourceTable,
      sourceTable,
      detail: `reversal of ${originalEvent} for ${sourceId}`,
      error,
    });
  }
}
