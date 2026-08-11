# Payables and receivables — separation audit and receivables design

**Date:** 2026-08-11
**Trigger:** receivables figures appearing on the Payment Requests page; request to rename
Payment Requests to Payables and to build out receivables properly.
**Status:** audit and proposal. Nothing implemented.

---

## 1. The leak, precisely

`/ops/payment-requests` renders three receivables things:

| What | Where |
| --- | --- |
| "Receivables ageing 0/30/60/90" panel | [page.tsx:406](<../src/app/ops/(workspace)/payment-requests/page.tsx>) |
| "Open receivables" KPI | page.tsx:500 |
| "Receivables mix" — draft vs sent | page.tsx:527 |

It fetches `fetchOpsReceivablesAgeing()` directly, and reads `openReceivables`,
`draftReceivables` and `sentReceivables` off `fetchOpsFinanceCashflowDashboard()`.

**Why it happened is the important part.** Receivables has no home in Finance. In
`constants.ts`, Invoices and Customers are in the **`commercial`** nav group; Payment
Requests is in **`finance`**. So when someone needed a finance-side view of what clients
owe, the only finance page that existed got it bolted on. The panels are not misplaced by
accident — they are misplaced because the correct page does not exist.

That also answers the framing: receivables *is* Finance's work, but the system files it
under Commercial. Fixing the grouping is part of the fix.

---

## 2. Renaming Payment Requests → Payables

**Recommendation: rename the label now, keep the route and the table.**

The user-facing title, description and page heading are free to change and reversible. The
route is not:

| Thing | Count |
| --- | --- |
| Files referencing `ops/payment-requests` | 16 |
| Occurrences of that path | 49 |
| Occurrences of the `payment_requests` key (module key, source table, audit) | 77 |

The route string is load-bearing in four places that outlive a rename:

- **notification deep links** — `actionHref` values already sent to people's inboxes and
  push notifications; changing the route breaks every historical one;
- **`module_access` / `canAccessOpsHref`** — permissions are keyed on the href;
- **audit history** — `module_key: "payment_requests"` and `source_table:
  "payment_requests"` on every existing event, which is what the finance metrics now read;
- **RLS policies** on the `payment_requests` table.

So: change **"Payment Requests" → "Payables"** in the nav title, the page header, and the
description. Leave `/ops/payment-requests`, the table, and the keys alone. If the URL
matters later, do it as its own change with a permanent redirect and a migration of the
stored hrefs — not folded into this work.

---

## 3. Receivables has never been used

Every table on the receivables side is empty:

```
customers                        0
invoices                         0
commercial_contracts             0
commercial_ipcs                  0
commercial_valuations            0
commercial_claims                0
commercial_retention_releases    0
commercial_contract_milestones   0
commercial_cashflow_forecasts    0
quotations                      15
```

The quotations are the tell. Fifteen exist, carrying real money — **one accepted at
K224,000, two sent at K772,400** — and:

- **none has a `customer_id`** (the column exists on the table),
- **none has a `site_id`**,
- **none has `converted_at`**.

So the chain's first link is broken. There is no customer master, so nothing can become an
invoice, so there are no receivables, so the ageing panel on the payables page has always
rendered zeros. `convertQuotationToProjectAction` exists but only creates a project — there
is no quotation → invoice path at all.

---

## 4. The invoice model cannot represent a receivable

Even with data, `invoices` is a tax document rather than a receivable. What is missing:

| Missing | Consequence |
| --- | --- |
| **`due_date`** | `fetchOpsReceivablesAgeing` buckets on days since `sent_at`. That is **age, not lateness** — a 45-day-old invoice on 60-day terms is not overdue but reports in the 31-60 bucket. Every "overdue" figure today is wrong by construction. |
| **`amount_paid`** | Status is `draft \| sent \| paid`, so a part payment cannot be recorded. On construction contracts part payment is normal, not exceptional. |
| **a receipt record** | Nothing captures the date, amount, method or bank reference of money received. `markInvoicePaidAction` flips a status and posts a journal; the cash event itself is not stored, so collections and DSO are unanswerable. |
| **`retention_amount`** | Retention is invoiced but not collectable. `commercial_ipcs.retention_amount` exists; invoices do not carry it, so retention is indistinguishable from a slow payer. |
| **line items** | There is no `invoice_items` table — an invoice carries one `subtotal`. Workable for a certified-valuation invoice, but it means an invoice cannot be built from a quotation or a valuation. |

## 4a. Two competing receivable concepts

`commercial_ipcs` runs `draft → submitted → certified → invoiced → paid`, carries
`retention_amount`, and holds an `invoice_id`. That is the construction-native receivable —
a payment certificate. `invoices` is a standalone document with its own paid flag.

**Nobody has decided which is the receivable of record**, and the two both track "paid".
That decision has to come before the module is built, or the two will disagree.

**Recommendation: the invoice is the receivable of record; the IPC is what authorises it.**
An IPC is the client agreeing what is owed; the invoice is the demand; receipts settle it.
Retention carries from the IPC onto the invoice. One place tracks cash: receipts.

---

## 4b. Invoice section clean-up

Three changes requested, and two of them are smaller than they look.

**Move Invoices (and Customers) into the `finance` nav group.** They are in `commercial`
today, which is the root cause in §1. Group only — the route, permissions and table are
untouched.

**Invoice number: already automatic, just overridable.** `ops_next_invoice_number(prefix)`
and the `invoice_number_counters` table already exist, and `createInvoiceAction` already
falls back to them. The only reason a number can be typed is
`invoice_number: z.string().trim().max(80).optional()` in the schema plus the field on the
form. Removing both makes it always generated — and closes a duplicate-number hole, since a
hand-typed number bypasses the counter entirely. Nothing new to build.

**BOQ link: already nullable, so just drop it from the form.** `boq_id` transforms empty to
null, so no data depends on it being set. Remove it from the schema and the form.

**Leave the `boq_id` column in place.** Dropping a column is irreversible, `commercial_ipcs`
carries its own `boq_id`, and an unused nullable column costs nothing. Remove the field
from the UI now; drop the column later if it is still unused.

**Replace it with something that earns its place.** The BOQ link was trying to answer "where
did this invoice come from", badly. Give the invoice a `source` instead:

```
invoices.source: 'manual' | 'quotation' | 'ipc' | 'opening_balance'
       .source_id uuid   -- the quotation or IPC it came from
```

That is the question the BOQ link was reaching for, and it makes the two conversion paths in
§5 traceable.

---

## 4c. How receivables get populated — the important design call

The request is "once an invoice is generated, receivables should be populated" and "there
should be a manual way too". Both are right; the obvious implementation of the first one is
a trap.

### Do not populate a receivables table

The tempting reading is: on invoice creation, insert a row into a `receivables` table. That
gives two records of the same debt, and they will drift. This codebase has been bitten by
exactly this class of bug three times in the last week alone — the `paid` cost station that
was never written, `approved_at` meaning two different things, and the finance-leak detector
that exists *because* the spine drifted before. A synced copy of a number is a number that
will eventually be wrong, and nobody will know which side is right.

**A receivable is not a thing to create. It is a state an invoice is in.**

```
outstanding = total_amount − sum(receipts)
```

So receivables is a **derived view** over `invoices` + `invoice_receipts`:

- **"Populated the moment an invoice is generated"** — satisfied exactly, with no sync step,
  no background job, and no possibility of a missing or stale row. The invoice *is* the
  receivable.
- Voiding an invoice removes the receivable. Recording a receipt reduces it. Nothing to
  keep in step.
- It mirrors payables, where the payable is the `payment_requests` row and not a copy of it.

### Manual population is an opening-balance invoice

The real need behind "manually populate receivables" is almost certainly **debt that
predates the system** — money clients owe from before anyone was keying invoices. That is
the same problem as completed-project payables, which this system has already solved and
shipped.

Payables side, already live: `charge_target: 'legacy_project'` with
`cost_treatment: 'opening_balance'`, and `affectsCurrentYearProfit()` to keep it out of
this year's P&L. The journal debits **Retained Earnings** instead of an expense, so the
liability appears on the balance sheet and profit does not move.

Do the mirror image:

```
invoices.revenue_treatment: 'current_period' | 'opening_balance'
```

- `current_period` — normal. Dr Accounts Receivable · **Cr Revenue**.
- `opening_balance` — a pre-system debt. Dr Accounts Receivable · **Cr Retained Earnings**.

This is the part that matters: **without it, keying K800,000 of old client debt would
fabricate K800,000 of this year's revenue.** The receivable and the ageing are real either
way; the revenue is not. The payables side already refuses to make that mistake, and the
receivables side must not make it either.

The benefits of doing it this way rather than a separate manual-entry form:

- one ledger, one ageing, one debtor list — an opening-balance invoice ages and gets chased
  like any other, because it is a real debt;
- Finance learns **one** concept, and it is the concept they already know from payables;
- reporting can separate a one-off backlog catch-up from genuine trading, exactly as
  `affectsCurrentYearProfit` already does for costs — so bringing old debts onto the books
  can be explained rather than read as revenue exploding.

Reuse `ops_legacy_cost_treatment`'s shape (`opening_balance`, `current_period`) so the two
sides read alike, and add the receivables predicate alongside the existing one:

```ts
affectsCurrentYearRevenue({ revenue_treatment })   // false for opening_balance
```

### So there are three ways an invoice comes into being, not two

| Source | Who | Revenue treatment |
| --- | --- | --- |
| Accepted quotation → invoice | Finance | `current_period` |
| Certified IPC → invoice | QS certifies, Finance raises | `current_period` |
| Manual / opening balance | Finance | either, and the form must ask |

All three land in the same `invoices` table, so all three are receivables the instant they
exist.

---

## 5. Proposed receivables design

### Workflow

Two entry paths that converge:

```
Contract work:
  Contract → Valuation → IPC (client certifies) → Invoice → Receipt(s) → Settled
                                    │
                                    └── retention withheld, released later

Ad-hoc / small work:
  Quotation (accepted) → Invoice → Receipt(s) → Settled
```

Both end at **invoice + receipts**, which is what makes one receivables ledger possible.

**Who does what.** QS values and drives certification; Finance raises the invoice, chases
it, and records receipts. `canCreateInvoice` already spans Quantity Surveyor, Finance
Manager, Accountant and leadership — the split is right, it just has nothing to act on.

### How it gets populated

In dependency order — each step is useless before the one above it:

1. **Customer master.** Backfill from the 15 quotations, which already carry
   `client_name`, `client_tpin`, `client_email`, `client_phone`, `client_address` inline.
   That is recovered data, not invented.
2. **Link quotations to customers and sites.** Both columns exist and are null on all 15.
3. **Payment terms on the customer** (e.g. 30 days), so `due_date` can be derived rather
   than typed. This is what makes ageing mean lateness.
4. **Accepted quotation → draft invoice.** The accepted K224,000 quotation is the obvious
   first real receivable.
5. **Certified IPC → draft invoice**, carrying the certified amount and retention.
6. **Receipts.** A new `invoice_receipts` table: invoice, date, amount, method, bank
   reference, recorded by. Partial receipts sum against `total_amount`.

### Schema changes needed

```
invoices
  + due_date date                    -- derived from customer payment terms
  + retention_amount numeric         -- invoiced, not yet collectable
  + revenue_treatment ops_legacy_cost_treatment default 'current_period'   -- §4c
  + source text default 'manual'     -- manual | quotation | ipc | opening_balance
  + source_id uuid                   -- the quotation or IPC behind it
  status: add 'part_paid'; 'overdue' is DERIVED, never stored
  - invoice_number stays, but is always generated (§4b)
  - boq_id: removed from the form, column left in place

customers
  + payment_terms_days int

new: invoice_receipts
  invoice_id, received_on, amount, method, bank_reference, recorded_by, notes
```

**No `amount_paid` column and no `receivables` table.** Both would be copies of something
the receipts already say, and a copy is what drifts (§4c). Outstanding is
`total_amount − sum(receipts)`, computed in a view. `overdue` likewise: it is
`due_date < today AND outstanding > 0`, which is a question, not a state to store — store it
and it goes stale at midnight.

### How it should show

Mirror the payables page so Finance learns one shape, not two:

- **KPIs** — invoiced this period · collected this period · outstanding · overdue
- **Ageing by DUE DATE** — current / 1-30 / 31-60 / 61-90 / 90+, using
  `getOpsFinanceAgeingBucket`, which already buckets on a due date and is already correct;
  it is simply never given one
- **Debtor list**, worst first, oldest overdue at the top
- **Retention held**, separately — earned, invoiced, not collectable. Never mixed into
  overdue
- **Per invoice** — raise → send → record receipt(s) → settled, with the receipt history
  visible

### GL

`buildInvoiceIssueJournal` and `buildInvoicePaymentJournal` already exist and are correct.
Receipts should post the payment journal per receipt rather than once at "paid", so a part
payment posts the cash it actually was. Retention needs its own account — `2080 Retention
Payable` exists but is the *payable* side; a receivable-side retention account is required
(or retention stays in AR and is reported separately, which is simpler and defensible).

---

## 6. Suggested order

1. **Split the pages and regroup.** Move the three receivables panels off
   `/ops/payment-requests`, rename it **Payables** (label only, §2), and move Invoices +
   Customers into the `finance` nav group. Presentation only.
2. **Invoice clean-up (§4b).** Drop the BOQ field and the invoice-number field from the form
   and schema so the number is always generated. Small, and it closes a duplicate-number
   hole.
3. **Customer master + payment terms.** Backfill from the 15 quotations' inline client
   fields, then link `quotations.customer_id`. **This is the gate — nothing downstream works
   before it**, and it is a data job more than a code job.
4. **Schema:** `due_date`, `retention_amount`, `revenue_treatment`, `source`, and
   `invoice_receipts`.
5. **Receivables view + page** at `/ops/receivables`, derived over invoices + receipts
   (§4c). Ageing by due date becomes true here, and DSO becomes answerable.
6. **Receipts UI, and the GL journal per receipt** rather than once at "paid".
7. **The three invoice sources:** manual/opening-balance first (it needs no other module),
   then accepted quotation → invoice, then certified IPC → invoice.

Steps 1–2 are cheap and can ship immediately. Step 3 is the one that decides whether any of
this becomes real. Step 7's first item is what lets Finance load the existing debt book
without waiting for the contract and IPC modules to be used.

---

## 7. Decisions

**Decided 2026-08-11:** D6 — receivables is a **derived view**, never a populated table.
D7 — opening-balance invoices carry the **gross owed with zero VAT** and a note, since the
original invoice already accounted for the VAT.

### Phase status

- **R1 — DONE 2026-08-11.** Payables/receivables page split, label rename, nav regroup.
- **R2 — DONE 2026-08-11.** Invoice clean-up: BOQ and manual invoice number removed.
- R3 — customer master + payment terms (the gate).
- R4 — schema: `due_date`, `retention_amount`, `revenue_treatment`, `source`,
  `invoice_receipts`.
- R5 — receivables view + `/ops/receivables`.
- R6 — receipts UI, GL per receipt.
- R7 — the three invoice sources, opening-balance first.

### Still open

- **D1 — Receivable of record: invoice, or IPC?** Recommendation: invoice, with the IPC as
  its authority. Both currently track "paid".
- **D2 — Route rename.** Recommendation: label only for now; route later with redirects.
- **D3 — Retention presentation.** Recommendation: keep it in AR but report it as its own
  line, never inside overdue. A separate GL account is cleaner but more work.
- **D4 — Does an invoice need approval before sending?** Payables have a Finance gate.
  Receivables currently do not — anyone who can create can send. Worth deciding, since an
  invoice is outward-facing to a client.
- **D5 — Who records a receipt?** Recommendation: Finance Manager and Accountant only,
  matching who marks a payable paid.
- **D6 — Is receivables a derived view or a table?** Recommendation (§4c): **derived**. A
  populated table is a second copy of the same debt, and copies drift. Worth deciding
  explicitly, because it is the one choice here that is expensive to reverse later.
- **D7 — Do opening-balance invoices need a VAT figure?** A pre-system debt may already have
  been invoiced for VAT under the old process, in which case re-declaring output VAT would
  double-count it to ZRA. Recommendation: opening-balance invoices carry the gross owed with
  **zero VAT** and a note, since the original invoice already accounted for it. Confirm with
  whoever files the returns.
- **D8 — Drop `invoices.boq_id`?** Recommendation: not yet. Remove it from the form now,
  drop the column only once nothing references it.
