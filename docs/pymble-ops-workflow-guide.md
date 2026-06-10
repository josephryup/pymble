# Pymble Operations — End-to-End Workflow Guide

This guide describes how work flows across **Pymble Operations** from project setup to payment.
It shows the order records are created, which module each step lives in, the role that usually
performs it, and how each record feeds the next. Use it alongside the per-role
**[User Guide](./pymble-ops-user-guide.md)**.

> Legend: **Module** = where the action happens · **Role** = who usually does it · **Feeds** =
> the next record it creates or pre-fills.

---

## The big picture

```
Site setup ─▶ BOQ / Budget ─▶ Material Request ─▶ RFQ ─▶ Supplier Quotes ─▶ Purchase Order
   │                                                                              │
   │                                                                              ▼
   │                                                                   Goods Received (GRN)
   │                                                                              │
   ▼                                                                              ▼
Daily Site Reports ◀── Site delivery ──▶ Stores & Inventory ──▶ Delivery Exceptions (if any)
   │                                                                              │
   ▼                                                                              ▼
Engineering QA/QC, HSE, Attendance/Payroll          Invoices ─▶ Payment Requests ─▶ Finance
                                                                              │
                                                                              ▼
                                                          Commercial: IPCs, Variations, Claims
                                                                              │
                                                                              ▼
                                                                   Executive Dashboard
```

Every mutation is captured in the **audit trail**, and approval-bound steps raise items into the
**Approvals** queue and **Notifications**.

---

## Phase 1 — Set up the project foundation

| Step | Module | Role | Feeds |
| --- | --- | --- | --- |
| 1. Create the **site/project** (code, client, budget, location) | Projects and Sites | Ops Manager / Projects Manager / Leadership | Everything below is scoped to a site |
| 2. Add **workers** to the crew pool | Workers | Site delivery / HR | Attendance, payroll, labour allocation |
| 3. Register **suppliers** (profile, contacts, compliance) | Suppliers | Procurement | RFQs, POs, BOQ line supplier |

**Why first:** sites, workers, and suppliers are the reference data every downstream record links
to. Create at least one site before a BOQ, and suppliers before sourcing.

---

## Phase 2 — Build the commercial baseline (BOQ & Budget)

| Step | Module | Role | Feeds |
| --- | --- | --- | --- |
| 1. Create a **BOQ** header (site, title, version, draft/issued) | BOQ | QS / Projects Manager / Commercial | The measured scope of work |
| 2. Add **measured line items** — manually, or **import a CSV** | BOQ | QS / Commercial | Budgeted value per line |
| 3. Optionally **nominate a supplier** on a line | BOQ | QS / Procurement | Pre-fills the supplier when the line is sourced into an RFQ |
| 4. Attach the **original BOQ PDF** (documents panel) | BOQ | QS / Commercial | Reference record |
| 5. Set the **project budget** and cost lines | Project Budgets | Finance / Projects Manager | Budget variance tracking |

### BOQ details that matter
- **CSV import format:** header row required, columns `description, unit, quantity, rate`
  (optional `actual`, `supplier code`). Supplier codes are matched to active suppliers; unmatched
  codes import the line without a supplier and are reported back in the success message.
- **PDF / scanned BOQ:** upload via the document/activity panel on the BOQ (PDF, Word, Excel, CSV,
  images up to 25 MB). This stores a versioned, access-controlled copy in the document register.
- **Issued vs draft:** keep a BOQ **draft** while measuring; mark it **issued** to freeze it as the
  stable source for invoices and IPCs.

---

## Phase 3 — Source materials (Request → RFQ → Quotes → PO)

| Step | Module | Role | Feeds |
| --- | --- | --- | --- |
| 1. Raise a **Material Request** for site needs | Material Requests | Site delivery / Engineer | Approved request available to procurement |
| 2. **Approve** the material request | Approvals | Ops Manager / Leadership | Unlocks RFQ creation |
| 3. Create an **RFQ** (from a material request, or from a **BOQ line**) | RFQs and Purchase Orders | Procurement | Supplier quote requests |
| 4. **Invite suppliers** to quote | RFQs and Purchase Orders | Procurement | One quote slot per supplier |
| 5. **Record supplier quotes** (totals, validity) | RFQs and Purchase Orders | Procurement | Comparable quotes |
| 6. **Award** the best quote → draft **Purchase Order** | RFQs and Purchase Orders | Procurement Manager / Leadership | Draft PO |
| 7. **Submit PO for approval** (threshold-based) | RFQs and Purchase Orders / Approvals | Procurement Manager → Finance → MD | Approved PO |
| 8. **Issue** the approved PO to the supplier | RFQs and Purchase Orders | Procurement Manager / Leadership | Order placed |

### How BOQ feeds the RFQ (the new shortcut)
On any BOQ line, use **RFQ / "Create RFQ from this line"**. This opens the RFQ create form with the
site, item description, unit, quantity, and unit estimate **pre-filled**, and — if the line has a
nominated supplier — that **supplier pre-selected**. On submit, the RFQ is created and the supplier
is **auto-invited** to quote, so the package is immediately ready. You can still add more items and
invite more suppliers afterwards.

### PO approval thresholds
Purchase orders run through the configured approval chain (default: Procurement Manager → Finance
Manager → Managing Director above the threshold). Thresholds are set in **Settings / approval
workflow** and can be adjusted by leadership.

---

## Phase 4 — Receive & control stock

| Step | Module | Role | Feeds |
| --- | --- | --- | --- |
| 1. Post a **Goods Received Note (GRN)** against the PO | Stores and Inventory | Stores / Procurement | Stock added to site |
| 2. Track **stock levels, issues, transfers, adjustments** | Stores and Inventory | Stores / Site delivery | Live inventory balances |
| 3. Log **delivery problems** (shortage, damage) | Delivery Exceptions | Stores / Procurement | Follow-up + supplier performance event |
| 4. Record **supplier performance** outcomes | Suppliers | Procurement | Supplier scoring for future RFQs |

---

## Phase 5 — Run site delivery

| Step | Module | Role | Feeds |
| --- | --- | --- | --- |
| 1. Capture **Daily Site Reports** (labour, plant, materials, delays) | Daily Site Reports | Engineer / Site delivery | Progress + productivity record |
| 2. Record **attendance** for the crew | Attendance | Site delivery / HR | Payroll-ready labour history |
| 3. Issue **Site Instructions** and run **QA/QC** (tests, snags, drawings) | Site Instructions and QA/QC | Engineer | Engineering control + close-out |
| 4. Manage **equipment, fuel, maintenance, transport, accommodation** | Equipment / Fleet and Logistics | Ops Manager / Fleet | Plant availability + logistics cost |
| 5. Record **HSE** incidents, PPE, toolbox talks, inspections, training | Incidents and Actions / HSE Compliance | HSE Officer | Safety record + corrective actions |

---

## Phase 6 — Payroll for site labour

| Step | Module | Role | Feeds |
| --- | --- | --- | --- |
| 1. Record **cash advances** if used | Payroll | Finance / HR | Deducted in the run |
| 2. Build a **payroll run** from attendance | Payroll | Finance / HR | Draft run |
| 3. **Approve** the run | Approvals / Payroll | Leadership / Finance | Approved payout |
| 4. Mark **disbursement** progress | Payroll | Finance | Closed run |

---

## Phase 7 — Bill the client & manage cash out

| Step | Module | Role | Feeds |
| --- | --- | --- | --- |
| 1. Raise a client **Invoice** (linked to BOQ/site, VAT applied) | Invoices | Finance / QS | Client receivable + PDF |
| 2. Submit **Payment Requests** for supplier/expense payments | Payment Requests | Finance / Procurement | Approval + cashflow impact |
| 3. **Approve** payment requests | Approvals | Finance Manager / Leadership | Authorised payment |
| 4. Review **supplier ageing** and cashflow | Payment Requests / Finance | Finance | Cash position |

---

## Phase 8 — Commercial maturity & executive oversight

| Step | Module | Role | Feeds |
| --- | --- | --- | --- |
| 1. Prepare **IPCs / valuations** | IPCs, Variations, and Claims | QS / Commercial | Certified progress value |
| 2. Manage **variations and claims** | IPCs, Variations, and Claims | QS / Commercial | Contract value changes |
| 3. Track **contract milestones, retention, risk, forecasts** | IPCs, Variations, and Claims | QS / Commercial | Commercial position |
| 4. Monitor the whole portfolio | Executive Dashboard | MD / GM | Cashflow, delay, margin, safety, risk |

---

## Cross-cutting flows (every phase)

- **Approvals:** threshold- and role-based. Submitted records (material requests, POs, budgets,
  payments, payroll) appear in the **Approvals** queue for authorised approvers.
- **Notifications:** action-needed alerts are pushed to the responsible roles.
- **Documents & attachments:** any record (BOQ, RFQ, PO, GRN, invoice, HSE, HR, etc.) supports
  versioned file attachments through its activity panel, stored in the document register with
  company/restricted/private visibility.
- **Comments & audit trail:** internal comments and a full audit history are kept on every record.

---

## Quick reference — what creates what

| This record… | …is created from | …and feeds |
| --- | --- | --- |
| BOQ line (with supplier) | BOQ | RFQ (pre-filled item + supplier) |
| Material Request | Site need | RFQ |
| RFQ | Material Request **or** BOQ line | Supplier quotes |
| Supplier Quote | RFQ invitation | Purchase Order (on award) |
| Purchase Order | Awarded quote | GRN, Payment Request |
| GRN | Purchase Order | Stores stock, Delivery Exception |
| Invoice | BOQ / site | Client receivable |
| Payment Request | PO / expense | Finance cash-out |
| IPC / Variation / Claim | BOQ / contract | Commercial position, Executive Dashboard |
