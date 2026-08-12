# Loans payable — design

**Date:** 2026-08-11
**Status:** L1–L5 built and verified 2026-08-11.

---

## 1. The thing to get right first: a loan is not a payable

The obvious implementation is to key each loan repayment as a payment request. It would be
wrong in three ways at once, and the wrongness compounds every month:

- **The principal is not an expense.** Drawing K500,000 of loan is
  `Dr Bank / Cr Bank Loans` — cash in, liability up. Booked as a payable it becomes
  K500,000 of costs that never happened, and the year's profit is understated by the whole
  loan.
- **A repayment is two different things in one payment.** Part reduces the liability;
  part is interest expense. A payment request carries one amount and one account, so the
  split is lost — and the split is the only part that belongs on the P&L.
- **The balance sheet never balances.** Nothing is tracking what is still owed, so
  "what do we owe the bank" has no answer.

Current state: **no loan tables exist.** The chart already carries `2510 Bank Loans` and
`2520 Asset Finance and Leases` on the liability side, and `4200 Interest Income` on the
income side — but there is **no interest EXPENSE account**, which is the one a borrower
needs. That gap is itself a sign the system has only ever modelled lending money out, never
borrowing it.

## 2. What "populated as payables" should mean

The request is to see loans as payables, and that instinct is right — Finance needs
upcoming instalments in the same picture as supplier bills, because they compete for the
same cash.

But *appearing in the payables picture* and *being a `payment_requests` row* are different
things, and only the first is wanted:

| | |
| --- | --- |
| **Yes** | Loan instalments show in what-is-due, cashflow, and the finance dashboard alongside supplier obligations |
| **No** | Loan instalments become `payment_requests` rows |

Reasons for the split. A payable is a supplier's invoice awaiting approval; a loan
instalment is a contractual obligation already agreed at signing — there is nothing to
approve, and routing it through the approval chain invents a decision nobody makes. The
journal is different in kind (`Dr Bank Loans + Dr Interest / Cr Bank`, not
`Dr Expense / Cr AP`). And a second path into the cash ledger is exactly the double-posting
problem just fixed in R6, where "mark paid" and per-receipt posting would each have booked
the same money.

So: **loans get their own record and their own posting, and the payables view reads them.**

## 3. Model

Same discipline as receivables (decision D6): **the balance is derived, never stored.**

```
loan_providers
  id, name, kind (bank | microfinance | asset_financier | shareholder | other),
  contact fields, notes, is_active

loans
  provider_id, reference, purpose, kind (term_loan | asset_finance | overdraft | shareholder)
  principal, currency, drawdown_date
  interest_rate, rate_basis (flat | reducing_balance)     -- see §4
  term_months, repayment_frequency (monthly | quarterly)
  first_payment_date
  status (draft | active | settled | written_off | cancelled)
  security_notes, site_id | cost_centre_id            -- what it funded
  gl_liability_account_id                              -- 2510 or 2520

loan_repayments
  loan_id, due_date, paid_on, reference
  total_amount, principal_portion, interest_portion, fees
  status (scheduled | paid | missed | waived)
  journal_entry_id
```

**Outstanding = principal − sum(principal_portion of paid repayments).** One record of the
debt, nothing to sync, nothing to drift.

The schedule is generated as `scheduled` rows at drawdown and then *edited to match the
lender's own schedule* if it differs. Rounding on a final instalment is real, and the
bank's paper is the contract — a computed schedule that disagrees with it by K3.47 will
cost someone an afternoon every year.

## 4. The decision that changes the arithmetic: flat vs reducing balance

This is not a preference, it is two different loans:

- **Flat rate** — interest = `principal × rate × years`, divided evenly across instalments.
  Total repayable is known at signing. Common in Zambian microfinance and asset finance.
- **Reducing balance** — interest each period = `outstanding × periodic rate`. Standard
  bank amortisation; interest falls as the principal is repaid.

On a K500,000 loan at 20% over 3 years, flat charges K300,000 of interest and reducing
balance charges roughly K167,000. **Assuming the wrong one misstates interest expense by
about 80%**, every month, in the same direction.

Recommendation: **support both**, with `rate_basis` on the loan and the schedule generated
accordingly. It is one extra branch in one pure function, and guessing wrong is not
recoverable without re-keying every schedule.

## 5. General ledger

Needs one new account — recommend **`6120 Interest and Finance Charges`**, expense, beside
the existing `6110 Employer Statutory Contributions`.

| Event | Journal |
| --- | --- |
| Drawdown | `Dr Bank 1010` · `Cr Bank Loans 2510` (or `2520` for asset finance) |
| Repayment | `Dr Bank Loans` (principal) · `Dr Interest 6120` (interest) · `Dr Bank Charges 6090` (fees) · `Cr Bank 1010` |
| Interest accrual (optional, month-end) | `Dr Interest 6120` · `Cr Accruals 2300` |

Only the interest and fee lines touch profit. The principal moves between two balance-sheet
accounts and never appears in the P&L — which is precisely what keying it as a payable
would have got wrong.

## 6. What it makes answerable

None of these can be answered today:

- What do we owe, in total, and to whom?
- How much cash goes out on debt service next month? (belongs in the 30-day cash signal
  beside payables due)
- How much of this year's cost is interest rather than work?
- Which loans are secured against what?
- Are we current, or is an instalment missed?
- What is the true cost of the asset-financed plant — capital plus finance?

## 7. Suggested phases

1. **L1 — DONE 2026-08-11.** `loan_providers`, `loans`, `loan_repayments`, the `6120
   Interest and Finance Charges` account, and the pure schedule generator supporting both
   rate bases. 18 tests against worked examples.
2. **L2 — DONE 2026-08-11.** `/ops/loans` under Finance: register with exposure by lender,
   per-loan schedule, derived balance, next payment and arrears — plus recording a lender
   and a facility, since a register with no way to add to it stays empty forever. 8 further
   tests on the register arithmetic.

   Permissions are deliberately **narrower than the rest of Finance**: a loan register is
   the company's debt position and its security arrangements, which the finance-BRIDGE
   roles (Operations, Projects, Procurement, QS) have no need of. View is leadership +
   Finance; creating a facility is leadership + Finance Manager only.
3. **L3 — DONE 2026-08-11.** Drawdown posting (`draft` → `active`), repayment with the
   three-way split posting, and schedule correction against the lender's paper. 17 further
   tests.

   Two guards worth knowing. The **split must add up to what left the bank** — otherwise
   `post_journal_entry` rejects the unbalanced entry *after* the instalment is already
   marked paid, leaving a loan that looks repaid with nothing in the ledger behind it. And
   **no repayment before the drawdown is posted**, because until then the liability is not
   on the balance sheet to reduce.

   Schedule correction was added here rather than deferred: the generated schedule is a
   good default, not the contract. Only unpaid instalments can be amended — a paid one has
   posted a journal and needs a reversal instead.
4. **L4 — DONE 2026-08-11.** Debt service in the Payables 30-day cash signal, plus
   reversing a repayment keyed in error. 9 further tests.

   The visibility point matters: the panel is gated on `canViewOpsLoans`, which is narrower
   than the Payables page itself. Payables is open to Operations, Projects, Procurement and
   the QS; the company's debt position is not theirs to see. The register is not even
   queried for those roles — gating the render while still fetching would cost a query for
   nothing and put the figures in logs.

   What is shared is the cash number only. Instalments are still not `payment_requests`
   rows and never appear in the payables register; a test asserts `loan-actions.ts` never
   mentions `payment_requests` at all.

   Reversal was folded in here rather than deferred: every other cash record in this ledger
   has one, and a mis-keyed loan payment is as likely as a mis-keyed receipt. The journal is
   contra'd, the instalment returns to `scheduled`, and a settled facility reopens.
5. **L5 — DONE 2026-08-11.** Daily arrears sweep and borrowing in the finance report
   metrics. 10 further tests.

   The sweep rides the existing escalations cron rather than a new one, because a missed
   instalment is the one thing here nobody discovers by opening a page — it happens on a
   date, in silence, and the penalty interest lands weeks later. It marks the instalment
   `missed` (still owed, the status only records that the date went by), sends **one notice
   per facility rather than per instalment**, and keys the notice on the arrears COUNT so a
   fresh miss reappears but the same arrears do not nag every morning — the dated-key
   mistake the notification audit found. It runs separately from the escalation sweep and
   is caught, so neither can take the other down.

   Five report metrics: interest paid, principal repaid, total debt service, borrowing
   outstanding, and arrears. **Interest leads and principal repaid sits beside it on
   purpose** — a reader shown only debt service would take K22,222 for expense where only
   K8,333 is.

## 8. Decisions

**Decided 2026-08-11.**

- **L-D1 — rate basis: BOTH.** `rate_basis` is set per loan; the schedule generator branches.
- **Facilities held: bank term loan, asset finance / lease, shareholder / director loan.**
  **No overdraft**, so the no-schedule fluctuating-balance case (L-D4) is not built — the
  `kind` enum leaves room for it without the machinery.
- **L-D2 — lender master:** yes, a small `loan_providers` table.
- **L-D3 — asset finance lives here**, posting to `2520`, linkable to equipment.

Note on shareholder loans: often interest-free and repayable on demand, so the model must
tolerate a zero rate and no schedule. The reducing-balance generator degenerates correctly
at 0% (equal principal instalments, no interest), and a loan with no term simply has no
scheduled rows.

### Superseded

## 8a. Original open decisions

- **L-D1 — Which rate basis do your loans use?** Flat, reducing balance, or a mix. Gates
  §4; both are supportable, but I need to know which to default to and which to test
  against real figures.
- **L-D2 — Lender master, or a name on each loan?** Recommendation: a small
  `loan_providers` table. Same reasoning as the customer master — "how much do we owe
  Stanbic across all facilities" is unanswerable against free text.
- **L-D3 — Does asset finance belong here or in Equipment?** Recommendation: here, with a
  link to the equipment record. The finance agreement is a liability regardless of what it
  bought, and splitting it would put half the obligation somewhere Finance does not look.
- **L-D4 — Overdrafts?** They have no schedule — interest accrues on a fluctuating balance.
  Recommendation: model as a loan with `kind: overdraft` and no schedule, capturing the
  limit and periodic interest charges only. Confirm you have one before I build it.
