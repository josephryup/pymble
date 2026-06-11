# Pymble Operations — System Operation & Workflow Guide

A practical, department-by-department guide to **operating** Pymble Operations day to day, and how
work flows end to end across the system. It is aligned to the company's Odoo ERP requirement (the
eight departments) and pairs with:

- **[User Guide](./pymble-ops-user-guide.md)** — what each role sees.
- **[Workflow Guide](./pymble-ops-workflow-guide.md)** — the record chain reference.
- **[Audit & Roadmap](./pymble-ops-audit-and-roadmap.md)** — gaps and the build plan.
- **[Workflow Infographic](./pymble-ops-workflow-infographic.svg)** — the one-page visual of everything below.

---

## 1. Operating principles

Pymble Operations replaces phone calls and WhatsApp with a traceable system of record. Three rules
make it work:

1. **Raise it in the system, not on the phone.** Every material need, equipment request, incident,
   leave request, and payment starts as a record — never a call. The record is the request.
2. **The system routes the work.** Once a record is raised, the right role is notified and the
   record moves through approval automatically. Nobody chases.
3. **Leadership reviews dashboards, not operations.** The Managing Director sees summaries and
   approves above threshold; the MD does not field daily operational calls.

Every action is written to the **audit trail** with who did it and when. Approvals, notifications,
and documents are attached to the records they belong to.

---

## 2. The end-to-end flow (one paragraph)

A site is set up with a budget and a measured **BOQ**. When materials are needed, the site raises a
**Material Request**; once approved it becomes an **RFQ** that goes to **suppliers**; quotes are
compared and the best is awarded into a **Purchase Order**, which runs through threshold-based
**approval** and is **issued** to the supplier. Goods arrive and are booked in via a **Goods
Received Note** into **Stores**; shortages or damage are logged as **Delivery Exceptions**. The
client is billed via **Invoices**; suppliers and expenses are paid via **Payment Requests**.
Throughout, **Daily Site Reports**, **Attendance/Payroll**, **Engineering QA/QC**, **HSE**, and
**Equipment/Fleet** capture what happens on the ground. Commercial value is governed through
**IPCs, Variations, and Claims**, and the **Executive Dashboard** rolls it all up for leadership.

---

## 3. Department operating procedures

Each section gives the **modules used**, the **daily routine**, and the **workflow chain** from the
ERP requirement.

### 3.1 Engineering / Site Delivery

**Modules:** Projects & Sites · Daily Site Reports · Material Requests · Equipment · Site
Instructions & QA/QC · Photos · Workers · Attendance.

**Daily routine (Site Engineer / Site Agent):**
1. Open the **site** and confirm today's stage and progress.
2. File the **Daily Site Report** — labour on site, plant used, materials consumed, concrete
   quantities, delays, productivity notes, and photos.
3. Raise **Material Requests** for what the site needs next, with quantities and required-by dates.
4. Raise **Equipment Requests** for plant and transport.
5. Run **QA/QC inspections**, issue **Site Instructions**, log **tests** and **snags**, and upload
   **drawings**.
6. Record **attendance** for the crew.

**Workflow chain:** Site Engineer raises material request → Procurement receives → Finance sees
budget impact → Operations approves logistics → MD sees dashboard summary only.

**What good looks like:** material delays are visible automatically; no engineer phones the MD to
say "materials are not on site."

### 3.2 Procurement & Supply Chain

**Modules:** Material Requests (incoming) · Suppliers · RFQs & Purchase Orders · Stores & Inventory
· Delivery Exceptions · Equipment/Fleet.

**Daily routine (Procurement Manager / Buyer / Storekeeper):**
1. Review **approved Material Requests** in the queue.
2. Generate **RFQs** (use "Create RFQ from BOQ line" or from a material request) and **invite
   suppliers**.
3. Record **supplier quotes**, run the **comparative analysis**, and **award** the best into a
   draft **PO**.
4. **Submit the PO for approval** and, once approved, **issue** it to the supplier.
5. **Storekeeper:** book deliveries in with a **Goods Received Note**, keep stock levels current,
   and log any **Delivery Exception** (shortage/damage) with evidence.
6. Maintain the **Supplier Database**: prices, credit terms, delivery periods, performance.

**Workflow chain:** Site raises request → Procurement receives → RFQ generated → comparative
analysis → approval workflow → PO issued → delivery tracked.

### 3.3 Finance & Accounts

**Modules:** Project Budgets · Payment Requests · Invoices · Payroll · Commercial (IPCs).

**Daily routine (Finance Manager / Accountant):**
1. **Verify budgets** when procurement raises POs — confirm the spend is within the project budget.
2. Progress **Payment Requests** through approval; watch supplier ageing.
3. Raise client **Invoices** (with VAT) against issued BOQs/sites; track receivables.
4. Run **Payroll** from attendance; manage advances and disbursement.
5. Monitor **project cost** by category (labour, fuel, materials, equipment, subcontractors,
   overheads) and budget variance.

**Workflow chain:** Procurement raises PO → Finance verifies budget → payment approval workflow →
MD approves above threshold only.

> This is the most important department for ERP success: real-time project profitability, cashflow
> forecasting, supplier ageing, and IPC payment tracking all live here.

### 3.4 Operations

**Modules:** Equipment · Fleet & Logistics · Fuel/Maintenance · Approvals.

**Daily routine (Operations Manager / Fleet Coordinator / Transport Officer):**
1. **Schedule equipment** against site requests.
2. Track **fuel** and **maintenance** per asset.
3. Coordinate **transport**, **accommodation**, and **labour movement**.
4. Confirm Finance sees equipment costs automatically.

**Workflow chain:** Engineering requests equipment → Operations schedules → Fleet tracks fuel &
maintenance → Finance sees equipment costs automatically.

### 3.5 HSE (Health, Safety & Environment)

**Modules:** Incidents & Actions · HSE Compliance · Photos · Documents.

**Daily routine (HSE Officer / Safety Officer):**
1. Log **incidents and near-misses immediately**, attach **photos**, assign an **investigation**,
   and track **corrective actions** to closure.
2. Run **toolbox talks**, **site inspections**, **risk assessments**, and **compliance audits**.
3. Manage **PPE** issuance and **safety training** records.

**Workflow chain:** Incident occurs → logged immediately → photos attached → investigation assigned
→ corrective actions tracked.

> For clients like Rubis, UNHCR, and KfW, the audit trail, incident traceability, and compliance
> documentation are contractual expectations. The system centralises all of it.

### 3.6 Admin & HR

**Modules:** Employees & Leave · Recruitment · Attendance · Payroll · Documents.

**Daily routine (HR Manager / HR Officer / Reception):**
1. **Recruitment:** publish a vacancy (job posting), receive **CV uploads** from the careers page,
   screen and progress applicants through hiring stages, and prepare offers.
2. Maintain **employee files**, **contracts**, **appraisals**, and **HR documents**.
3. Approve **leave requests**; keep **attendance** and **payroll inputs** accurate.
4. Coordinate **accommodation**.

**Workflow chain:** Recruitment — vacancy raised → CVs uploaded → interview scoring → offer letter.
Staff management — leave requests → attendance → payroll integration → appraisals.

### 3.7 Quantity Surveying & Commercial

**Modules:** BOQ · Project Budgets · Invoices · IPCs / Variations / Claims · Suppliers.

**Daily routine (Commercial Manager / Quantity Surveyor / Cost Engineer):**
1. Build and maintain **BOQs** (manual entry, CSV import, or attach the original PDF); nominate
   line suppliers to feed procurement.
2. Prepare **IPCs / valuations**; manage **variations** and **claims**.
3. Track **contract milestones**, **retention**, and **commercial risk**.
4. Watch **profitability, margins, and cashflow** per project.

This department controls profitability, claims, variations, and margins — protect it.

### 3.8 Management / Executive

**Modules:** Executive Dashboard · Approvals · Documents.

**The MD operates by exception:**
- Review the **Executive Dashboard**: cashflow, project completion %, delayed projects, outstanding
  receivables, supplier liabilities, equipment utilisation, profitability by project, staff
  productivity.
- **Approve only above the threshold.** Everything below is handled by the chain.
- Do **not** take daily operational calls — the dashboard replaces them.

---

## 4. Approvals, notifications, documents, audit (cross-cutting)

- **Approvals:** submitted records (material requests, POs, budgets, payments, payroll) flow to the
  authorised approver's **Approvals** queue. Approve/reject with a reason; history is retained.
  Purchase orders use a threshold chain (default: Procurement Manager → Finance Manager → Managing
  Director above the threshold).
- **Notifications:** action-needed alerts are pushed to the responsible role; clear them as you act.
- **Documents & attachments:** any record supports versioned file attachments (PDF/Word/Excel/CSV/
  images) stored with company/restricted/private visibility.
- **Audit trail:** every create/update/decision is logged with the actor and timestamp and shown in
  the workspace timeline.

---

## 5. KPIs the system is built to surface

| Department | Key KPIs |
| --- | --- |
| Engineering | Project completion %, delays vs baseline, rework %, material wastage %, productivity, reporting compliance, defects |
| Procurement | Lead time, supplier delivery performance, stock accuracy, shortages, purchase savings, cycle time |
| Finance | Cashflow forecast accuracy, supplier ageing, project gross margin, payment turnaround, budget variance, receivables, closing speed |
| Operations | Equipment uptime, fuel consumption, maintenance compliance, labour utilisation, mobilisation efficiency |
| HSE | LTIFR, near misses, PPE compliance, training completion, audit scores |
| HR | Staff turnover, recruitment turnaround, attendance compliance, appraisal completion, productivity |
| Commercial | Gross profit %, variation recovery %, cost variance, IPC turnaround, budget accuracy |
| Executive | Cashflow, completion %, delayed projects, receivables, supplier liabilities, utilisation, profitability, productivity |

> Several of these KPIs are not yet computed in the app. The **[Audit & Roadmap](./pymble-ops-audit-and-roadmap.md)**
> (Phases B–E) sequences the work to deliver them.

---

## 6. Site lifecycle (progress tracking)

Sites move through a defined lifecycle so progress is visible to everyone and rolls up to the MD's
"Project completion %":

```
planning → mobilizing → in_progress → handover → completed
                              │
                              ├──▶ on_hold      (paused, can resume)
                              └──▶ cancelled     (terminated)
```

Each site also carries a **progress %** (0–100) maintained by the Projects/Operations Manager.
Editing a site's stage, progress, budget, supervisor, or coordinates is restricted to delivery
leadership; archiving and deletion are leadership/Developer-only (see the Audit & Roadmap for the
authority matrix).
