import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  summariseReceivables,
  type OpsInvoiceForReceivables,
  type OpsReceiptForReceivables,
} from "../src/lib/ops/receivables";

/**
 * Receivables, derived (decision D6).
 *
 * There is no receivables table and no `amount_paid` column: outstanding is
 * total minus live receipts, computed here. So this file is the only place the
 * definition exists, and — with an empty register — the only thing that can
 * prove it.
 */

const TODAY = "2026-08-11";

const invoice = (
  overrides: Partial<OpsInvoiceForReceivables> = {},
): OpsInvoiceForReceivables => ({
  client_name: "LUSAKA CITY COUNCIL",
  customer_id: "c1",
  due_date: "2026-08-31",
  id: crypto.randomUUID(),
  invoice_number: "INV-0001",
  issued_at: "2026-08-01",
  retention_amount: 0,
  revenue_treatment: "current_period",
  site_code: "0002",
  status: "sent",
  total_amount: 0,
  ...overrides,
});

const receipt = (
  invoice_id: string,
  amount: number,
  cancelled = false,
): OpsReceiptForReceivables => ({ amount, cancelled, invoice_id });

describe("outstanding is the invoice minus what came in", () => {
  it("is the full total when nothing has been received", () => {
    const summary = summariseReceivables([invoice({ total_amount: 224_000 })], [], TODAY);

    assert.equal(summary.total_outstanding, 224_000);
    assert.equal(summary.rows[0].received, 0);
    assert.equal(summary.rows[0].settlement, "awaiting");
  });

  it("shrinks by a part payment and says so", () => {
    // Part payment is normal on a construction contract, and the old binary
    // draft/sent/paid status could not express it at all.
    const one = invoice({ total_amount: 224_000 });
    const summary = summariseReceivables([one], [receipt(one.id, 80_000)], TODAY);

    assert.equal(summary.total_outstanding, 144_000);
    assert.equal(summary.rows[0].received, 80_000);
    assert.equal(summary.rows[0].settlement, "part_paid");
  });

  it("sums several receipts against one invoice", () => {
    const one = invoice({ total_amount: 100_000 });
    const summary = summariseReceivables(
      [one],
      [receipt(one.id, 25_000), receipt(one.id, 25_000), receipt(one.id, 10_000)],
      TODAY,
    );

    assert.equal(summary.total_outstanding, 40_000);
  });

  it("ignores a cancelled receipt", () => {
    // Cancellation is how a mis-keyed receipt is undone; the row stays for the
    // audit trail but must not reduce the debt.
    const one = invoice({ total_amount: 100_000 });
    const summary = summariseReceivables(
      [one],
      [receipt(one.id, 40_000), receipt(one.id, 60_000, true)],
      TODAY,
    );

    assert.equal(summary.total_outstanding, 60_000);
  });

  it("drops a fully settled invoice out of receivables entirely", () => {
    const one = invoice({ total_amount: 50_000 });
    const summary = summariseReceivables([one], [receipt(one.id, 50_000)], TODAY);

    assert.equal(summary.rows.length, 0);
    assert.equal(summary.total_outstanding, 0);
  });

  it("never reports a negative balance when a client overpays", () => {
    const one = invoice({ total_amount: 50_000 });
    const summary = summariseReceivables([one], [receipt(one.id, 60_000)], TODAY);

    assert.equal(summary.total_outstanding, 0);
    assert.equal(summary.rows.length, 0);
  });
});

describe("a draft is not a receivable", () => {
  it("is counted separately, because nobody has been asked to pay", () => {
    const summary = summariseReceivables(
      [
        invoice({ status: "draft", total_amount: 90_000 }),
        invoice({ status: "sent", total_amount: 10_000 }),
      ],
      [],
      TODAY,
    );

    assert.equal(summary.total_outstanding, 10_000);
    assert.equal(summary.draft_value, 90_000);
    assert.equal(summary.draft_count, 1);
    assert.equal(summary.rows.length, 1);
  });
});

describe("ageing measures lateness, not age", () => {
  it("buckets a not-yet-due invoice as current however old it is", () => {
    // The bug this whole schema change fixes: bucketing on days-since-issue
    // called this overdue. It was issued 6 weeks ago and is not due for 3.
    const summary = summariseReceivables(
      [invoice({ due_date: "2026-09-01", issued_at: "2026-07-01", total_amount: 5_000 })],
      [],
      TODAY,
    );

    assert.equal(summary.rows[0].bucket, "current");
    assert.equal(summary.total_overdue, 0);
    assert.equal(summary.rows[0].days_overdue, -21);
  });

  it("counts an invoice past its due date as overdue", () => {
    const summary = summariseReceivables(
      [invoice({ due_date: "2026-07-27", total_amount: 5_000 })],
      [],
      TODAY,
    );

    assert.equal(summary.rows[0].days_overdue, 15);
    assert.equal(summary.rows[0].bucket, "overdue_1_30");
    assert.equal(summary.total_overdue, 5_000);
  });

  it("treats an invoice with no due date as current rather than guessing", () => {
    // No customer means no terms. An invented deadline produces a debtor
    // chased for a date nobody agreed to.
    const summary = summariseReceivables(
      [invoice({ customer_id: null, due_date: null, total_amount: 5_000 })],
      [],
      TODAY,
    );

    assert.equal(summary.rows[0].bucket, "current");
    assert.equal(summary.rows[0].days_overdue, null);
    assert.equal(summary.total_overdue, 0);
  });

  it("puts the bucket totals on the outstanding balance, not the invoice face", () => {
    const one = invoice({ due_date: "2026-06-01", total_amount: 100_000 });
    const summary = summariseReceivables([one], [receipt(one.id, 70_000)], TODAY);

    const bucket = summary.buckets.find((entry) => entry.bucket === "overdue_61_plus");
    assert.equal(bucket?.amount, 30_000);
    assert.equal(bucket?.count, 1);
  });
});

describe("retention is not a late payment", () => {
  it("is held apart from what can be chased", () => {
    // A client withholding contractual retention is not a bad payer, and
    // folding it into overdue makes them look like one.
    const summary = summariseReceivables(
      [invoice({ retention_amount: 20_000, total_amount: 200_000 })],
      [],
      TODAY,
    );

    assert.equal(summary.total_outstanding, 200_000);
    assert.equal(summary.total_retention, 20_000);
    assert.equal(summary.total_collectable, 180_000);
  });

  it("cannot exceed what is still owed once most of the invoice is paid", () => {
    // Paid all but the retention: what remains IS the retention, and nothing
    // is collectable.
    const one = invoice({ retention_amount: 20_000, total_amount: 200_000 });
    const summary = summariseReceivables([one], [receipt(one.id, 180_000)], TODAY);

    assert.equal(summary.total_outstanding, 20_000);
    assert.equal(summary.total_retention, 20_000);
    assert.equal(summary.total_collectable, 0);
  });
});

describe("debtors", () => {
  it("rolls several invoices up per client, worst first", () => {
    const summary = summariseReceivables(
      [
        invoice({ client_name: "A", customer_id: "a", due_date: "2026-09-30", total_amount: 90_000 }),
        invoice({ client_name: "B", customer_id: "b", due_date: "2026-07-01", total_amount: 10_000 }),
        invoice({ client_name: "B", customer_id: "b", due_date: "2026-08-01", total_amount: 5_000 }),
      ],
      [],
      TODAY,
    );

    assert.equal(summary.debtors.length, 2);
    // B owes less overall but is the one actually late.
    assert.equal(summary.debtors[0].client_name, "B");
    assert.equal(summary.debtors[0].outstanding, 15_000);
    assert.equal(summary.debtors[0].overdue, 15_000);
    assert.equal(summary.debtors[0].oldest_overdue_days, 41);
    assert.equal(summary.debtors[0].invoice_count, 2);
  });

  it("still counts a debtor with no customer record", () => {
    // Dropping unlinked invoices would understate what is owed.
    const summary = summariseReceivables(
      [invoice({ client_name: "WALK IN", customer_id: null, total_amount: 3_000 })],
      [],
      TODAY,
    );

    assert.equal(summary.debtors.length, 1);
    assert.equal(summary.debtors[0].client_name, "WALK IN");
    assert.equal(summary.total_outstanding, 3_000);
  });
});

describe("opening balances", () => {
  it("age and get chased like any other debt, but are reported apart", () => {
    // A pre-system debt is real money owed — it belongs in the ageing. It is
    // tracked separately only so a backlog catch-up can be explained rather
    // than read as trading revenue.
    const summary = summariseReceivables(
      [
        invoice({ revenue_treatment: "opening_balance", due_date: "2026-06-30", total_amount: 800_000 }),
        invoice({ total_amount: 50_000 }),
      ],
      [],
      TODAY,
    );

    assert.equal(summary.total_outstanding, 850_000);
    assert.equal(summary.opening_balance_value, 800_000);
    assert.equal(summary.total_overdue, 800_000);
    assert.equal(summary.rows[0].is_opening_balance, true);
  });
});

describe("the register is empty today", () => {
  it("reports zeros rather than failing", () => {
    const summary = summariseReceivables([], [], TODAY);

    assert.equal(summary.total_outstanding, 0);
    assert.equal(summary.rows.length, 0);
    assert.equal(summary.debtors.length, 0);
    assert.equal(summary.buckets.length, 5);
  });
});

// ---------------------------------------------------------------------------
// Cash posts once, and only once (R6)
// ---------------------------------------------------------------------------

const ACTIONS = readFileSync(
  join(import.meta.dirname, "..", "src", "lib", "ops", "invoice-actions.ts"),
  "utf8",
);

describe("there is exactly one path for money in", () => {
  it("settling in full writes a receipt rather than flipping a status", () => {
    // Both paths must converge, or the same payment posts twice: once as the
    // invoice-level "paid" journal and once per receipt.
    assert.match(ACTIONS, /await settleInvoiceByReceipt\(/);
    assert.match(ACTIONS, /async function settleInvoiceByReceipt\(/);
  });

  it("both entry points post through writeInvoiceReceipt", () => {
    const writes = ACTIONS.match(/await writeInvoiceReceipt\(/g) ?? [];
    assert.equal(writes.length, 2, "recordInvoiceReceiptAction and settleInvoiceByReceipt");
  });

  it("the invoice-level paid journal is no longer reachable", () => {
    // updateInvoiceStatus used to accept "paid" and post the full amount.
    // Narrowed to "sent", so the double-post cannot be re-introduced without
    // changing the type.
    assert.match(ACTIONS, /async function updateInvoiceStatus\(id: string, status: "sent"/);
    assert.match(ACTIONS, /postInvoiceJournalSafe\(data\.id, "issued", userId\)/);
    assert.doesNotMatch(ACTIONS, /postInvoiceJournalSafe\([^)]*"paid"/);
  });

  it("refuses an over-payment instead of absorbing it", () => {
    assert.match(ACTIONS, /parsed\.data\.amount > outstanding/);
    assert.match(ACTIONS, /credit note/);
  });

  it("reverses rather than deletes a mistaken receipt", () => {
    assert.match(ACTIONS, /reverseOpsJournalSafe\(\s*"invoice_receipts",/);
    assert.doesNotMatch(ACTIONS, /from\("invoice_receipts"\)\s*\.delete\(/);
  });

  it("reopens the invoice when a receipt that settled it is reversed", () => {
    assert.match(ACTIONS, /outstanding > 0 && invoice\.status === "paid"/);
    assert.match(ACTIONS, /paid_at: null, status: "sent"/);
  });

  it("requires a reason for a reversal", () => {
    assert.match(ACTIONS, /reason\.length === 0/);
  });
});

// ---------------------------------------------------------------------------
// Opening balances credit equity, not revenue (R7)
// ---------------------------------------------------------------------------

const BUILDERS = readFileSync(
  join(import.meta.dirname, "..", "src", "lib", "ops", "gl-journal-builders.ts"),
  "utf8",
);

describe("an opening balance must not invent revenue", () => {
  it("credits retained earnings instead of contract revenue", () => {
    // The whole reason revenue_treatment exists. Crediting revenue would turn
    // K800,000 of old client debt into K800,000 of this year's trading.
    assert.match(BUILDERS, /const isOpeningBalance = invoice\.revenue_treatment === "opening_balance"/);
    assert.match(
      BUILDERS,
      /isOpeningBalance\s*\?\s*\{\s*account_code: OPS_GL_ACCOUNTS\.retainedEarnings/,
    );
  });

  it("declares no output VAT on one", () => {
    // Decision D7: the original invoice already declared it, and declaring it
    // again would double-count it to ZRA.
    assert.match(BUILDERS, /if \(!isOpeningBalance && invoice\.vat_amount > 0\)/);
  });

  it("is carried through from the row, or the branch could never fire", () => {
    // The wiring failure that has bitten this codebase repeatedly: a correct
    // builder fed a field nobody selected.
    const posting = readFileSync(
      join(import.meta.dirname, "..", "src", "lib", "ops", "gl-posting.ts"),
      "utf8",
    );

    assert.match(posting, /total_amount, revenue_treatment/);
    assert.match(posting, /revenue_treatment: data\.revenue_treatment/);
  });

  it("is loaded as sent, dated when the original was raised", () => {
    // Dating it today would report a years-old backlog as entirely current,
    // which is the opposite of why it is being loaded.
    assert.match(ACTIONS, /revenue_treatment: "opening_balance"/);
    assert.match(ACTIONS, /source: "opening_balance"/);
    assert.match(ACTIONS, /status: "sent"/);
    assert.match(ACTIONS, /vat_amount: 0/);
    assert.match(ACTIONS, /cannot be dated in the future/);
  });
});

describe("billing an accepted quotation", () => {
  it("refuses anything that has not been accepted", () => {
    assert.match(ACTIONS, /quotation\.status !== "accepted"/);
  });

  it("uses the quotation's own VAT rate, not today's org setting", () => {
    // The client agreed a specific figure; re-deriving it from a rate that has
    // since changed would bill a different number.
    assert.match(ACTIONS, /const vatRate = Number\(quotation\.vat_rate \?\? 0\)/);
  });

  it("will not raise a second invoice for the same quotation", () => {
    assert.match(ACTIONS, /\.eq\("source", "quotation"\)/);
    assert.match(ACTIONS, /has already been invoiced as/);
  });

  it("raises a draft, so someone checks it before the client sees it", () => {
    assert.match(ACTIONS, /source: "quotation",/);
  });
});
