# Pymble Finance — Native Accounting Build (GL spine)

Status tracker for building QuickBooks-equivalent accounting **natively** into the
ops workspace. Direction (2026-06-30): build the capabilities QuickBooks gives us
in-house — **not** an external QuickBooks/Xero/Sage API integration. Rationale:
Zambian construction context (ZMW, ZRA/NAPSA/PAYE/WCF/TPIN) where the statutory
pieces are exactly what an external tool can't cover, and we already own ~80% of
the financial data as subledgers.

## The core idea

We have the **subledgers** (AP via `payment_requests`, AR via `invoices`, payroll,
inventory/GRN, `subcontractor_payments`, commercial retention/IPC) but no **general
ledger**. The plan adds a GL spine — `chart_of_accounts` → `journal_entries` →
`journal_lines` + a posting engine that generalizes the existing
`project_cost_entries` (committed→posted) pattern. Financial statements (Trial
Balance, P&L, Balance Sheet, Cash Flow) then become queries over `journal_lines`.

## Confirmed design decisions

1. **Accrual basis** (construction needs WIP/retention/accruals; ZRA VAT is invoice-based).
2. **Job costing via journal-line tags** — every line carries optional `site_id` + `cost_code`,
   so company P&L and per-site job P&L come from one ledger.
3. **4-digit numeric account codes** with classed ranges (1000s assets … 6000s opex).
4. **ZMW functional currency**; USD accounts allowed; FX revaluation deferred.

## Phases & status

| Phase | Scope | Status |
| --- | --- | --- |
| **0 — Finance cockpit** | `/ops/finance` landing page composing existing fetchers (cashflow, ageing, variance, job P&L, commercial KPIs). No schema change. | **Done** (verify green) |
| **0b — Chart of Accounts** | `chart_of_accounts` table + seeded Zambian construction COA (68 accounts) + read-only admin page `/ops/finance/accounts`. Migration applied to remote DB. | **Done** (verify green) |
| **1 — GL spine** | `journal_entries` / `journal_lines` + atomic `post_journal_entry` RPC + immutability/balance triggers + posting engine. Invoice issue/paid/void, bill approve/pay, and payroll disbursement all wired; Trial Balance + Journal pages live. | **Done** |
| 2 — Banking | Bank/cash accounts + reconciliation; "mark paid" already credits Bank-Main 1010, but there's no real bank-account abstraction or statement reconciliation yet. | Planned |
| **3 — Statements** | Profit & Loss, Balance Sheet, Cash Flow Statement as pure queries over the trial balance / journal lines (`gl-statements.ts`). Since-inception (no period filter — matches Trial Balance until period close lands). Pages live at `/ops/finance/{profit-and-loss,balance-sheet,cash-flow-statement}`. | **Done** |
| **4 — Subledger gap-fills** | Customers master (done — see below). Still planned: expenses/petty-cash, VAT/WHT centre, credit notes, customer/supplier statements, fixed assets. | **In progress** |
| 5 — Close & FX | Period close/lock, multi-currency revaluation. | Planned |

## GL discipline rules (apply from Phase 1)

- Journals are **immutable** — reverse, never edit.
- Every posting **balances** (Σ debits = Σ credits), enforced at the DB layer.
- **Period close** locks the past; no journal posts into a closed period without a reversing entry.

## Chart of Accounts — seeded tree

Control accounts marked ⊕ (posted only by subledgers); contra marked ⊖.

| Code | Account | Type | Notes |
| --- | --- | --- | --- |
| 1000 | Current Assets | asset | header |
| 1010 | Bank — Main Operating (ZMW) | asset | bank |
| 1020 | Bank — USD | asset | bank, USD |
| 1030 | Petty Cash | asset | |
| 1040 | Mobile Money Float | asset | |
| 1100 | Accounts Receivable ⊕ | asset | control → invoices |
| 1150 | Retention Receivable ⊕ | asset | held by clients ← commercial |
| 1200 | Work in Progress (uncertified) | asset | |
| 1250 | Input VAT (recoverable) ⊕ | asset | control |
| 1300 | Staff / Subcontractor Advances | asset | ← cash_advances, staff_advances |
| 1350 | Prepayments | asset | |
| 1400 | Inventory / Stock on Hand ⊕ | asset | ← stock valuation |
| 1500 | Non-Current Assets | asset | header |
| 1510 / 1515 | Plant & Equipment — Cost / Accum. Depr. ⊖ | asset | |
| 1520 / 1525 | Motor Vehicles — Cost / Accum. Depr. ⊖ | asset | |
| 1530 / 1535 | Office Equipment — Cost / Accum. Depr. ⊖ | asset | |
| 2000 | Current Liabilities | liability | header |
| 2010 | Accounts Payable ⊕ | liability | control → payment_requests |
| 2050 | Subcontractor Payable ⊕ | liability | ← subcontractor_payments |
| 2080 | Retention Payable ⊕ | liability | held from subcontractors |
| 2100 | Output VAT (payable) ⊕ | liability | control |
| 2150 | VAT Control — net due to ZRA | liability | |
| 2200 | PAYE Payable (ZRA) ⊕ | liability | ← payroll |
| 2210 | NAPSA Payable ⊕ | liability | employee + employer |
| 2220 | WCF Payable ⊕ | liability | employer |
| 2300 | Accruals | liability | |
| 2350 | Net Wages Payable | liability | ← payroll |
| 2400 | Customer Deposits / Advances | liability | |
| 2500 | Non-Current Liabilities | liability | header |
| 2510 / 2520 | Bank Loans / Asset Finance & Leases | liability | |
| 3000 | Equity | equity | header |
| 3010 / 3020 / 3030 / 3040 | Share Capital / Retained Earnings / Current-Year Earnings / Director's Account | equity | 3030 system |
| 4000 | Income | income | header |
| 4010 / 4020 / 4030 | Contract Revenue — Certified (IPC) / Variations / Claims | income | ← commercial |
| 4100 / 4200 | Other Income / Interest Income | income | |
| 5000 | Cost of Sales (direct project cost) | expense | header; tagged site_id+cost_code |
| 5010–5090 | Materials, Subcontractor, Direct Labour, Plant Hire, Fuel, Preliminaries, Maintenance, Transport, Other Direct | expense | |
| 6000 | Operating Expenses (overhead) | expense | header |
| 6010–6900 | Office Salaries, Rent, Utilities, IT & Software, Professional Fees, Insurance, Depreciation, Bank Charges, Marketing, Employer NAPSA/WCF, Other | expense | |

## Posting coverage (live)

| Event | Hook | Journal | Reversal |
| --- | --- | --- | --- |
| Invoice sent | `invoice-actions.ts` → `updateInvoiceStatus` | Dr AR / Cr Revenue / Cr Output VAT | On void → contra via `reverseOpsJournalSafe` |
| Invoice paid | `invoice-actions.ts` → `updateInvoiceStatus` | Dr Bank / Cr AR | — (terminal; void blocked once paid) |
| Bill approved | `finance-actions.ts` → `approvePaymentRequestAction` | Dr Cost-of-sales (by payment type, site-tagged) / Cr AP | Not needed — reject/cancel only reachable pre-approval |
| Bill paid | `finance-actions.ts` → `markPaymentRequestPaidAction` | Dr AP / Cr Bank | — (terminal) |
| Payroll disbursed | `payroll-actions.ts` → `completePayrollRunAction` | Dr Direct Labour / Cr Bank+PAYE+NAPSA(ee)+Advances; Dr Employer Statutory / Cr NAPSA(er)+WCF | Not needed — cancel blocked once completed |

All posting is **best-effort and non-blocking** (`postInvoiceJournalSafe`, `postPaymentRequestJournalSafe`, `postPayrollRunJournalSafe` in `gl-posting.ts`) — a GL sync failure never blocks the operational action, and logs to `audit_events` (`journal_entry.post_failed`) when it happens. Idempotent via the `(source_table, source_id, source_event)` unique index — re-running an action is a safe no-op.

## Customers master (Phase 4, first slice)

Closes the audit's flagged AR gap: invoices previously carried only a free-text `client_name`. Added a `customers` table (mirrors the `suppliers` register's shape — code, legal/trading name, TPIN, contact, status, archive lifecycle) with an optional `customer_id` FK on `invoices` (nullable, `on delete set null` — existing invoices untouched, no backfill). Register at `/ops/customers` (list, create, archive/reactivate — mirrors the Suppliers page, trimmed of contacts/performance-events subsystems for this first pass). The invoice create form gained an optional "Customer" picker above the existing free-text `client_name`/`tpin` fields, which remain the display source of truth — this is additive, not a replacement, so nothing about existing invoice behavior changed. Visibility: leadership + `manager` + `finance_manager` + `accountant` + `quantity_surveyor`, matching who can create invoices. Verified end-to-end in a rolled-back DB transaction: create a customer → link an invoice via `customer_id` → join back successfully.

Deliberately out of scope for this slice: backfilling `customer_id` onto historical invoices, and customer statements (a later Phase 4 item once ageing-by-customer is worth building).

## Statements — how they're computed (Phase 3)

All three read from `ops_trial_balance` (now exposing `account_subtype` for the P&L cost-of-sales/opex split), via a shared `fetchOpsLedgerAccountBalances()` base query in `gl.ts`. Aggregation is pure and unit-tested in `gl-statements.ts`:

- **Profit & Loss** — income accounts: `credit - debit`. Cost-of-sales (`account_subtype = 'cogs'`, i.e. 5010–5090): `debit - credit`. Everything else under `expense`: operating expenses. `grossProfit = income - cogs`, `netProfit = grossProfit - opex`.
- **Balance Sheet** — assets: `debit - credit`. Liabilities/equity: `credit - debit`. Revenue/expense accounts are never auto-closed into equity (that's period close, Phase 5), so the P&L's `netProfit` is folded in as a computed **Current Year Earnings** line — this is what makes `Assets = Liabilities + Equity` hold before any close happens. Verified against real ledger postings in a rolled-back DB transaction: the identity holds exactly.
- **Cash Flow Statement** — direct method. Every posted journal line touching a `bank`/`cash` subtype account, grouped by the subledger `source_table` that caused it (`invoices` → "Receipts from customers", `payment_requests` → "Payments to suppliers and subcontractors", `payroll_runs` → "Payments to employees"). Net movement reconciles to the ledger's cash balance by construction (same debit-credit sign convention as the Balance Sheet's asset rows).

## Posting map (built in Phase 1)

| Event (already emitted) | Dr | Cr |
| --- | --- | --- |
| Invoice sent | 1100 AR | 4010 Revenue · 2100 Output VAT |
| Invoice paid | 1010 Bank | 1100 AR |
| Bill approved (accrual) | 50xx Cost (cost_code, site-tagged) · 1250 Input VAT | 2010 AP |
| Bill paid | 2010 AP | 1010 Bank |
| Payroll posted | 5030/6010 Gross | 2350 Net · 2200 PAYE · 2210 NAPSA (employer: 6110 → 2210/2220) |
| GRN received | 1400 Inventory | 2010 AP |
| Stock issued to site | 5010 Materials (site-tagged) | 1400 Inventory |
| IPC retention held | 1150 Retention Receivable | 1100 AR |
| Depreciation run | 6080 Depreciation | 15x5 Accum. Depreciation |
