import type { OpsPaymentRequestType } from "@/lib/ops/types";

/**
 * Pure double-entry journal builders. No I/O — turns a subledger record into a
 * balanced set of journal lines so the shape can be unit-tested in isolation
 * from the database. The posting engine (gl-posting.ts) feeds the result to the
 * atomic post_journal_entry RPC.
 */

// Stable account codes the engine posts against (see chart_of_accounts seed).
export const OPS_GL_ACCOUNTS = {
  bankMain: "1010",
  accountsReceivable: "1100",
  staffAdvances: "1300",
  inputVat: "1250",
  accountsPayable: "2010",
  subcontractorPayable: "2050",
  retainedEarnings: "3020",
  outputVat: "2100",
  payePayable: "2200",
  napsaPayable: "2210",
  wcfPayable: "2220",
  nhimaPayable: "2230",
  contractRevenueCertified: "4010",
  materials: "5010",
  subcontractorCosts: "5020",
  directLabour: "5030",
  officeSalaries: "6010",
  otherDirectCosts: "5090",
  employerStatutory: "6110",
} as const;

export type OpsGlPostingLine = {
  account_code: string;
  debit?: number;
  credit?: number;
  description?: string;
  site_id?: string | null;
  cost_code?: string;
};

export type OpsGlPostingInput = {
  entryDate?: string;
  memo: string;
  currencyCode?: string;
  sourceTable?: string;
  sourceId?: string;
  sourceEvent?: string;
  createdBy?: string | null;
  lines: OpsGlPostingLine[];
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Invoices (accounts receivable)
// ---------------------------------------------------------------------------

export type OpsInvoiceForPosting = {
  id: string;
  invoice_number: string;
  client_name: string;
  site_id: string;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  /**
   * `opening_balance` means the debt predates this system. Mirrors the payables
   * side's cost_treatment; see buildInvoiceIssueJournal for what it changes.
   */
  revenue_treatment?: "current_period" | "opening_balance" | null;
};

/**
 * Invoice issued / sent → recognise revenue and the receivable.
 *   Dr Accounts Receivable (gross)
 *     Cr Contract Revenue (net)
 *     Cr Output VAT (tax) — omitted when zero so every line stays single-sided.
 *
 * Unless the invoice is an OPENING BALANCE, in which case the credit goes to
 * **Retained Earnings** instead:
 *   Dr Accounts Receivable (gross)
 *     Cr Retained Earnings (gross)
 *
 * The distinction is not presentational. A debt carried in from before the
 * system was earned in a period that is already closed; crediting revenue
 * would invent that much current-year income, so K800,000 of old client debt
 * would show up as K800,000 of trading. Under `opening_balance` the entry
 * touches the balance sheet only: the receivable appears, profit does not move.
 *
 * The exact mirror of the payables side, where `cost_treatment:
 * "opening_balance"` debits retained earnings rather than an expense. And no
 * VAT line, ever — decision D7: the original invoice already declared the
 * output VAT, and declaring it again would double-count it to ZRA. The
 * database enforces vat_amount = 0 on these
 * (invoices_opening_balance_no_vat), so the branch below cannot silently drop
 * a VAT figure that was actually present.
 */
export function buildInvoiceIssueJournal(
  invoice: OpsInvoiceForPosting,
  entryDate: string,
): OpsGlPostingInput {
  const isOpeningBalance = invoice.revenue_treatment === "opening_balance";

  const lines: OpsGlPostingLine[] = [
    {
      account_code: OPS_GL_ACCOUNTS.accountsReceivable,
      debit: invoice.total_amount,
      site_id: invoice.site_id,
      description: `Receivable ${invoice.invoice_number}`,
    },
    isOpeningBalance
      ? {
          account_code: OPS_GL_ACCOUNTS.retainedEarnings,
          credit: invoice.total_amount,
          site_id: invoice.site_id,
          description: `Opening balance ${invoice.invoice_number}`,
        }
      : {
          account_code: OPS_GL_ACCOUNTS.contractRevenueCertified,
          credit: invoice.subtotal,
          site_id: invoice.site_id,
          description: `Revenue ${invoice.invoice_number}`,
        },
  ];

  if (!isOpeningBalance && invoice.vat_amount > 0) {
    lines.push({
      account_code: OPS_GL_ACCOUNTS.outputVat,
      credit: invoice.vat_amount,
      description: `Output VAT ${invoice.invoice_number}`,
    });
  }

  return {
    entryDate,
    memo: isOpeningBalance
      ? `Opening balance ${invoice.invoice_number} — ${invoice.client_name}`
      : `Invoice ${invoice.invoice_number} — ${invoice.client_name}`,
    sourceTable: "invoices",
    sourceId: invoice.id,
    sourceEvent: "invoice_issued",
    lines,
  };
}

/**
 * Invoice paid → clear the receivable into the bank.
 *   Dr Bank (gross)
 *     Cr Accounts Receivable (gross)
 */
export function buildInvoicePaymentJournal(
  invoice: OpsInvoiceForPosting,
  entryDate: string,
): OpsGlPostingInput {
  return {
    entryDate,
    memo: `Invoice ${invoice.invoice_number} payment received`,
    sourceTable: "invoices",
    sourceId: invoice.id,
    sourceEvent: "invoice_paid",
    lines: [
      {
        account_code: OPS_GL_ACCOUNTS.bankMain,
        debit: invoice.total_amount,
        site_id: invoice.site_id,
        description: `Receipt ${invoice.invoice_number}`,
      },
      {
        account_code: OPS_GL_ACCOUNTS.accountsReceivable,
        credit: invoice.total_amount,
        site_id: invoice.site_id,
        description: `Clear receivable ${invoice.invoice_number}`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Payment requests (accounts payable)
// ---------------------------------------------------------------------------

const PAYMENT_TYPE_ACCOUNT: Record<OpsPaymentRequestType, string> = {
  supplier_invoice: OPS_GL_ACCOUNTS.materials,
  subcontractor: OPS_GL_ACCOUNTS.subcontractorCosts,
  payroll: OPS_GL_ACCOUNTS.directLabour,
  expense: OPS_GL_ACCOUNTS.otherDirectCosts,
  tax: OPS_GL_ACCOUNTS.otherDirectCosts,
  other: OPS_GL_ACCOUNTS.otherDirectCosts,
};

export function opsPaymentExpenseAccount(type: OpsPaymentRequestType) {
  return PAYMENT_TYPE_ACCOUNT[type] ?? OPS_GL_ACCOUNTS.otherDirectCosts;
}

/**
 * Which liability account a payable sits in.
 *
 * Subcontractor balances have their own account (2050) because they behave
 * differently from trade payables — they carry retention, they are certified
 * rather than invoiced, and they are the balance a director is most often asked
 * to quote. Collapsing them into 2010 makes that number unobtainable without
 * re-deriving it from source documents.
 */
export function opsPaymentPayableAccount(type: OpsPaymentRequestType) {
  return type === "subcontractor"
    ? OPS_GL_ACCOUNTS.subcontractorPayable
    : OPS_GL_ACCOUNTS.accountsPayable;
}

export type OpsPaymentRequestForPosting = {
  id: string;
  request_number: string;
  title: string;
  /** Null for a legacy-project or overhead payable — journal_lines allows it. */
  site_id: string | null;
  payment_type: OpsPaymentRequestType;
  amount: number;
  payment_reference?: string;
  /**
   * Only set for a legacy-project payable. `opening_balance` means the cost was
   * already recognised in closed accounts and only the unpaid liability is
   * being brought onto the books.
   */
  cost_treatment?: "opening_balance" | "current_period" | null;
};

/**
 * Payment request approved → accrue the cost and the payable.
 *   Dr Cost of Sales account (by payment type, site-tagged)
 *     Cr Accounts Payable
 */
export function buildPaymentRequestAccrualJournal(
  bill: OpsPaymentRequestForPosting,
  entryDate: string,
): OpsGlPostingInput {
  return {
    entryDate,
    memo: `Bill ${bill.request_number} — ${bill.title}`,
    sourceTable: "payment_requests",
    sourceId: bill.id,
    sourceEvent: "payment_accrued",
    lines: [
      {
        // A payable for a COMPLETED project is last year's cost. Debiting an
        // expense account today would drop a prior period's cost into this
        // year's P&L and understate current-year profit by the size of the
        // backlog — a real misstatement, not a presentational one. Under
        // `opening_balance` the debit goes to equity instead, so the entry
        // touches the balance sheet only: the liability appears, profit does
        // not move.
        account_code:
          bill.cost_treatment === "opening_balance"
            ? OPS_GL_ACCOUNTS.retainedEarnings
            : opsPaymentExpenseAccount(bill.payment_type),
        debit: bill.amount,
        site_id: bill.site_id,
        description:
          bill.cost_treatment === "opening_balance"
            ? `Opening balance ${bill.request_number}`
            : `Cost ${bill.request_number}`,
      },
      {
        account_code: opsPaymentPayableAccount(bill.payment_type),
        credit: bill.amount,
        description: `Payable ${bill.request_number}`,
      },
    ],
  };
}

/**
 * Payment request paid → settle the payable from the bank.
 *   Dr Accounts Payable
 *     Cr Bank
 */
export function buildPaymentRequestSettlementJournal(
  bill: OpsPaymentRequestForPosting,
  entryDate: string,
): OpsGlPostingInput {
  return {
    entryDate,
    memo: `Bill ${bill.request_number} paid`,
    sourceTable: "payment_requests",
    sourceId: bill.id,
    sourceEvent: "payment_paid",
    lines: [
      {
        // Settlement is identical whichever way the payable was accrued — the
        // liability is cleared from the same account it was raised in.
        account_code: opsPaymentPayableAccount(bill.payment_type),
        debit: bill.amount,
        description: `Settle ${bill.request_number}`,
      },
      {
        account_code: OPS_GL_ACCOUNTS.bankMain,
        credit: bill.amount,
        description: bill.payment_reference
          ? `Payment ${bill.payment_reference}`
          : `Payment ${bill.request_number}`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Payroll (statutory)
// ---------------------------------------------------------------------------

export type OpsPayrollRunForPosting = {
  id: string;
  period_label: string;
  gross: number;
  net: number;
  paye: number;
  napsa_employee: number;
  napsa_employer: number;
  wcf: number;
  advances: number;
};

/**
 * Payroll run disbursed → recognise the labour cost, the statutory payables, the
 * advance recovery, and the net paid out. Balances because, per the payslip,
 * gross = net + PAYE + employee NAPSA + advances, and the employer block
 * (NAPSA + WCF) is internally balanced.
 *   Dr Direct Labour (gross)
 *     Cr Bank (net) · Cr PAYE Payable · Cr NAPSA Payable (employee) · Cr Advances
 *   Dr Employer Statutory (employer NAPSA + WCF)
 *     Cr NAPSA Payable (employer) · Cr WCF Payable
 */
export function buildPayrollDisbursementJournal(
  run: OpsPayrollRunForPosting,
  entryDate: string,
): OpsGlPostingInput {
  const lines: OpsGlPostingLine[] = [
    {
      account_code: OPS_GL_ACCOUNTS.directLabour,
      debit: run.gross,
      description: `Wages ${run.period_label}`,
    },
  ];

  if (run.net > 0) {
    lines.push({
      account_code: OPS_GL_ACCOUNTS.bankMain,
      credit: run.net,
      description: `Net pay ${run.period_label}`,
    });
  }
  if (run.paye > 0) {
    lines.push({
      account_code: OPS_GL_ACCOUNTS.payePayable,
      credit: run.paye,
      description: `PAYE ${run.period_label}`,
    });
  }
  if (run.napsa_employee > 0) {
    lines.push({
      account_code: OPS_GL_ACCOUNTS.napsaPayable,
      credit: run.napsa_employee,
      description: `NAPSA employee ${run.period_label}`,
    });
  }
  if (run.advances > 0) {
    lines.push({
      account_code: OPS_GL_ACCOUNTS.staffAdvances,
      credit: run.advances,
      description: `Advance recovery ${run.period_label}`,
    });
  }

  const employer = round2(run.napsa_employer + run.wcf);
  if (employer > 0) {
    lines.push({
      account_code: OPS_GL_ACCOUNTS.employerStatutory,
      debit: employer,
      description: `Employer NAPSA/WCF ${run.period_label}`,
    });
    if (run.napsa_employer > 0) {
      lines.push({
        account_code: OPS_GL_ACCOUNTS.napsaPayable,
        credit: run.napsa_employer,
        description: `NAPSA employer ${run.period_label}`,
      });
    }
    if (run.wcf > 0) {
      lines.push({
        account_code: OPS_GL_ACCOUNTS.wcfPayable,
        credit: run.wcf,
        description: `WCF ${run.period_label}`,
      });
    }
  }

  return {
    entryDate,
    memo: `Payroll ${run.period_label} disbursed`,
    sourceTable: "payroll_runs",
    sourceId: run.id,
    sourceEvent: "payroll_disbursed",
    lines,
  };
}

export type OpsStaffPayrollRunForPosting = OpsPayrollRunForPosting & {
  nhima_employee: number;
  nhima_employer: number;
};

/**
 * Staff payroll disbursed.
 *
 * Structurally the same as the casual wages journal, with two differences that
 * are not cosmetic:
 *
 *   • the debit goes to **Office Salaries (6010)**, an operating expense, not
 *     Direct Labour (5030), which is cost of sales. Salaried staff are not
 *     chargeable to a contract; casual site workers are. Posting both to 5030
 *     would inflate cost of sales and flatter overheads.
 *   • NHIMA is deducted from staff pay and matched by the employer. Casual
 *     payroll has no NHIMA line at all, which is why the casual builder has no
 *     account for it.
 *
 * Until now staff payroll posted NOTHING — `postPayrollRunJournalSafe` handles
 * only the casual engine, so K149,486 of disbursed salary never reached the
 * general ledger.
 *
 *   Dr Office Salaries (gross)
 *     Cr Bank (net) · Cr PAYE · Cr NAPSA (employee) · Cr NHIMA (employee)
 *     Cr Staff Advances
 *   Dr Employer Statutory (employer NAPSA + WCF + NHIMA)
 *     Cr NAPSA Payable · Cr WCF Payable · Cr NHIMA Payable
 */
export function buildStaffPayrollDisbursementJournal(
  run: OpsStaffPayrollRunForPosting,
  entryDate: string,
): OpsGlPostingInput {
  const lines: OpsGlPostingLine[] = [
    {
      account_code: OPS_GL_ACCOUNTS.officeSalaries,
      debit: run.gross,
      description: `Staff salaries ${run.period_label}`,
    },
  ];

  const credit = (account_code: string, amount: number, description: string) => {
    if (amount > 0) {
      lines.push({ account_code, credit: amount, description });
    }
  };

  credit(OPS_GL_ACCOUNTS.bankMain, run.net, `Net pay ${run.period_label}`);
  credit(OPS_GL_ACCOUNTS.payePayable, run.paye, `PAYE ${run.period_label}`);
  credit(
    OPS_GL_ACCOUNTS.napsaPayable,
    run.napsa_employee,
    `NAPSA employee ${run.period_label}`,
  );
  credit(
    OPS_GL_ACCOUNTS.nhimaPayable,
    run.nhima_employee,
    `NHIMA employee ${run.period_label}`,
  );
  credit(
    OPS_GL_ACCOUNTS.staffAdvances,
    run.advances,
    `Advance recovery ${run.period_label}`,
  );

  const employer = round2(run.napsa_employer + run.wcf + run.nhima_employer);
  if (employer > 0) {
    lines.push({
      account_code: OPS_GL_ACCOUNTS.employerStatutory,
      debit: employer,
      description: `Employer NAPSA/WCF/NHIMA ${run.period_label}`,
    });
    credit(
      OPS_GL_ACCOUNTS.napsaPayable,
      run.napsa_employer,
      `NAPSA employer ${run.period_label}`,
    );
    credit(OPS_GL_ACCOUNTS.wcfPayable, run.wcf, `WCF ${run.period_label}`);
    credit(
      OPS_GL_ACCOUNTS.nhimaPayable,
      run.nhima_employer,
      `NHIMA employer ${run.period_label}`,
    );
  }

  return {
    entryDate,
    memo: `Staff payroll ${run.period_label} disbursed`,
    sourceTable: "staff_payroll_runs",
    sourceId: run.id,
    sourceEvent: "staff_payroll_disbursed",
    lines,
  };
}

export type OpsInvoiceReceiptForPosting = {
  amount: number;
  id: string;
  invoice_number: string;
  received_on: string;
  site_id: string | null;
};

/**
 * Cash received against an invoice.
 *
 * Posted PER RECEIPT rather than once when an invoice flips to paid, which is
 * what `buildInvoicePaymentJournal` did. Two consequences, both wanted:
 *
 *   • a part payment posts the cash it actually was, on the day it arrived,
 *     rather than nothing until the balance happens to clear;
 *   • the entry date is the day the money landed, not the day someone got
 *     round to recording it — which is what makes a bank reconciliation
 *     possible at all.
 *
 * Keyed on the receipt, so each one posts exactly once and a cancellation can
 * contra that receipt alone (reverseOpsJournalSafe) without disturbing the
 * others against the same invoice.
 *
 *   Dr Bank · Cr Accounts Receivable
 */
export function buildInvoiceReceiptJournal(
  receipt: OpsInvoiceReceiptForPosting,
): OpsGlPostingInput {
  return {
    entryDate: receipt.received_on,
    memo: `Receipt against invoice ${receipt.invoice_number}`,
    sourceTable: "invoice_receipts",
    sourceId: receipt.id,
    sourceEvent: "invoice_receipt_received",
    lines: [
      {
        account_code: OPS_GL_ACCOUNTS.bankMain,
        debit: receipt.amount,
        site_id: receipt.site_id,
        description: `Receipt ${receipt.invoice_number}`,
      },
      {
        account_code: OPS_GL_ACCOUNTS.accountsReceivable,
        credit: receipt.amount,
        site_id: receipt.site_id,
        description: `Clear receivable ${receipt.invoice_number}`,
      },
    ],
  };
}
