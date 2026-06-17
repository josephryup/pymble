# Pymble Operations — System Walkthrough

A step-by-step tour of the system you can read straight through with the Pymble
team. It follows **one project's life** — from set-up to payment — so every role
sees their part of the chain and how it hands off to the next.

> Plan ~45 minutes if you walk through every step. If you have less time, the
> shorter routes are flagged ⏱️ at each section.
>
> Pair this with:
> - **[User Guide](./pymble-ops-user-guide.md)** — what each role sees in their menu.
> - **[Operations Guide](./pymble-ops-operations-guide.md)** — day-to-day procedures per department.
> - **[Workflow Infographic](./pymble-ops-workflow-infographic.svg)** — the one-page visual to show on screen.

---

## Before you start

**Open** `https://ops.pymbleconstruction.com` in a fresh browser tab.

**Sign in** as the Developer or Managing Director account. The Developer can see
**everything**, which is what you want for a full demo.

> If you're demoing without going online, run `npm run dev` and visit
> `http://localhost:3000/ops` — the dev sign-in is the same.

You should land on the **Overview** dashboard. If you land on Profile, your role
doesn't have overview access — sign in as Developer / MD instead.

---

## The narrative

The team has just won the **"Nandos Rubis Kitwe"** project. We'll walk through:

1. **Set the project up** (site, BOQ, team)
2. **A Site Engineer raises a material request** (Engineering)
3. **Procurement turns it into an RFQ, gets quotes, issues a PO** (Procurement)
4. **Finance approves the payment threshold; the PO is issued** (Approvals + Finance)
5. **Goods arrive at site** (Stores)
6. **Site logs daily progress, HSE captures an incident** (Engineering + HSE)
7. **HR posts a new vacancy on the public site, a candidate applies** (HR)
8. **Finance bills the client and the MD reviews the executive dashboard** (Finance + Executive)

Every step shows the same record at three angles: **who creates it**, **what
they see**, and **who's notified next**.

---

## 1. Project setup — Sites & BOQ

⏱️ *5 minutes*

### 1a. Create the site

**Click** Projects and Sites in the left nav (or visit `/ops/sites`).

- Top of the page: "Project site register". Three KPI tiles: **Matching sites**,
  **Avg completion**, **Shown budget**.
- Below: an **Add site** form. Fill in:
  - **Code** `NRK-001`
  - **Site name** `Nandos Rubis Kitwe`
  - **Location** `Kitwe, Copperbelt`
  - **Stage** Planning
  - **Progress %** 0
  - **Supervisor** the Site Agent's name
  - **Client** `Rubis Energy`
  - **Budget ZMW** `4500000`
  - **Latitude / Longitude** (optional — drops a pin on the overview map)
- Click **Add site**.

Below the form, the site appears in the register with a green progress bar at
**0%** and a blue **Planning** stage badge.

### 1b. Edit & progress (this is new — show this)

In the new site's row click **Manage → Edit site** (the ⋯ panel).

- Change **Stage** to `mobilizing` and **Progress %** to `15`.
- Click **Save changes**.

The badge goes blue *Mobilizing*, the progress bar fills to 15%, and the
**Avg completion** KPI at the top updates. Point out:
- **Stages are**: Planning → Mobilizing → In progress → Handover → Completed
  (with on-hold and cancelled as side branches).
- Only the **Developer, MD, GM, Operations Manager, and Projects Manager** can
  edit. Archive is **leadership only**. Hard delete is **Developer only**.

### 1c. Build the BOQ

**Click** BOQ in the left nav (`/ops/boq`).

- Click **New BOQ** top right.
- Pick the site (`NRK-001 - Nandos Rubis Kitwe`), title `Foundation works`,
  version `1`, status `Draft`. Click **Create document**.
- Add line items the slow way OR show the **CSV import**:
  - Open the BOQ's "Import line items from CSV" panel.
  - Mention the format: `description, unit, quantity, rate` (optional `actual`,
    `supplier_code`). 2 MB / 1000 rows cap.
- Open "Add measured line item" instead and add one manually:
  - `Cement` / `bags` / `200` / `350` / actual `0` / **Supplier** pick one if
    you have any (or leave as "No nominated supplier")
  - Click **Add line item**.

Point out the **"RFQ"** action on the line item row — clicking it deep-links
into the RFQ create form with **site, item, quantity, unit, unit estimate, and
supplier pre-filled**. That's the BOQ → RFQ shortcut.

---

## 2. Material request — the Engineering side

⏱️ *3 minutes*

> Use this section to show how a **Site Engineer** raises work that lands in
> the right person's queue without phoning anyone.

**Click** Material Requests in the left nav (`/ops/material-requests`).

- Top of the page shows KPI cards (drafts, submitted, in-review, approved).
- Click **New request**.
- Fill in:
  - **Site** Nandos Rubis Kitwe
  - **Title** `Cement & sand for foundation pour`
  - **Priority** Normal
  - **Needed by** ~7 days from today
  - **Description** *"Foundation pour for blocks A-C scheduled next week"*
- Click **Create request**.

The request appears with status **Draft**. Click into it to add items, then
click **Submit approval**. Status flips to **Submitted**.

**Now look at the Chain Tracker** (new) — the strip showing:
**Requested → Submitted → Approved → Procured (RFQ/PO) → Closed**

Each step shows the date it happened. The current step is highlighted; past
steps are checkmarks; future steps are greyed out. **This is the workflow
visibility the PDF asked for** — an engineer can see exactly where their
request sits without making a phone call.

---

## 3. Approvals — the chain in action

⏱️ *3 minutes*

Open a new tab as the **MD** or **GM** (or use the role preview panel on local
to swap to them).

**Click** Approvals in the left nav (`/ops/approvals`).

- The submitted material request is in the queue.
- Open it. **Approve** with a comment (or reject if you want to show the path).
- Back on the request, the Chain Tracker now shows **Approved** with today's
  date.

Point out:
- The **My Queue** widget on the Overview dashboard (top of `/ops`) is the
  fastest way to find what's waiting on you. Each role sees only what's theirs.
- The audit trail (Workspace Timeline panel) now shows **your name and role**
  next to the action — e.g. *"Material request approved · 2 minutes ago · John
  Mwape · Managing Director"*.

---

## 4. Procurement — RFQ → Quotes → PO

⏱️ *6 minutes*

> Switch role: **Procurement Manager** (or stay as Developer).

### 4a. Create the RFQ

**Click** RFQs and Purchase Orders (`/ops/rfq-po`) → **New RFQ**.

Note that you can also use the **"RFQ"** shortcut on a BOQ line item (back in
the BOQ page) — that pre-fills everything. For the demo, fill it manually:
- **Site** Nandos Rubis Kitwe
- **Linked material request** select the approved request
- **Invite supplier** pick one
- **Title** `Foundation cement & sand`
- **First item** `Cement 50kg bags` / qty 200 / unit `bags` / estimate 350
- Click **Create RFQ**.

If you picked an "Invite supplier", the RFQ is created **and the supplier is
auto-invited to quote** in one step. Show the supplier quote slot that appeared.

### 4b. Record a quote and award

Open the RFQ's invitation. Click **Record quote** and enter a total of e.g.
`72000` ZMW. Click **Award quote** to convert it into a draft Purchase Order.

### 4c. Submit the PO for approval

Open the new PO. Click **Submit for approval**.

The PO uses a **threshold chain**: Procurement Manager → Finance Manager → MD
above the threshold (currently 50,000 ZMW). Walk through:
- The configured threshold is on `/ops/settings` → approval workflow.
- Show the PO appearing in **Finance's My Queue** (open `/ops` as Finance).

### 4d. Approve & issue

As Finance Manager / MD, **approve** the PO. Back on the PO, click **Issue PO**.
Status changes to **Issued**.

---

## 5. Goods received — Stores

⏱️ *2 minutes*

**Click** Stores and Inventory (`/ops/stores-inventory`).

- Click **Post GRN**. Pick the PO. Enter received quantities.
- Click **Post**. Stock balance increases. If something's short or damaged,
  click **Log delivery exception** — show the new exception in
  `/ops/delivery-exceptions`.

The PDF's pain point — *"materials are not on site"* — is now visible:
- The original material request's **Chain Tracker** shows **Procured** is now
  done.
- **Avg completion** on Sites can be bumped (back at `/ops/sites`).
- Stores inventory has updated balances.

---

## 6. Daily site reporting & HSE

⏱️ *4 minutes*

### 6a. Daily Site Report

**Click** Daily Site Reports (`/ops/daily-site-reports`) → **New report**.

- Site, date, labour count, plant hours, materials consumed, delays, productivity.
- Add notes and attach a photo or two via the documents panel on the row.

### 6b. HSE incident

**Click** Incidents and Actions (`/ops/hse`) → **Report incident**.

- Site, type (first aid / lost time / near miss), severity, description.
- Attach a photo (drag/drop into the activity panel).
- Click **Create incident**.

Open the new incident → click **Start investigation** → fill in root cause →
**Close** when corrective actions are tracked.

**Show the HSE KPI panel** at the top of `/ops/hse`:
- **LTIFR** (lost-time injury frequency rate) over the last 365 days
- **TRIFR** (all recordable)
- **PPE compliance %**, inspection avg score, audit avg score, training currency.

These are the safety KPIs the PDF specifically asks for (LTIFR, PPE compliance,
audit scores).

---

## 7. HR — Recruitment end-to-end

⏱️ *5 minutes*

> This one is brand-new. Worth showing in detail because it's the only feature
> with a public website hand-off.

### 7a. Publish a vacancy

**Click** Recruitment (`/ops/recruitment`) → **Create job posting**.

- Title `Site Engineer`, department `Engineering`, type `Full time`,
  location `Lusaka`.
- Add Summary / Description / Responsibilities / Requirements.
- Tick **Publish to website now** → **Create posting**.

The posting appears with a green **Published** badge.

### 7b. The public side

**Open** `https://pymbleconstruction.com/careers` (or local `/careers`).

- Show the **public Careers page**: hero, the list of open positions
  (your `Site Engineer` is there with its type/department/location chips).
- Scroll to **Apply online**. Show the form:
  - Position dropdown, name, email, phone, LinkedIn URL, cover letter, **CV
    upload (PDF/Word, max 10 MB)**.
- Fill it in with test details, click **Submit application**.
- Confirmation message appears.

### 7c. Back in ops

Return to `/ops/recruitment` (or refresh).

- The new application is in the **Applications** list with a blue **New** badge.
- Click **Download CV** to fetch the file (it's a signed R2 URL).
- Open **Record interview score** — enter a score 0–5 and notes.
- Open **Generate offer letter** — enter the position, start date, salary.
  Click **Generate offer letter**. A real letterheaded offer letter is built and
  stored. **Click Offer letter** to download it.

The application's stage chip flips to **Offer**.

> Tell the team: HR and leadership get a **notification** when a candidate
> applies on the public site — so they don't need to refresh the page.

---

## 8. Finance — bill the client, view the dashboard

⏱️ *4 minutes*

### 8a. Raise an invoice

**Click** Invoices (`/ops/invoices`) → **New invoice**.

- Site, client name pre-filled, VAT 16% applied, lines pulled from the BOQ.
- **Create** → status `Draft`. Click **Send** → status flips to `Sent`.

### 8b. Show the finance dashboards

**Click** Payment Requests (`/ops/payment-requests`).

Scroll past the KPI cards. The big additions to look at:

- **Cashflow** panel: forecast inflow / outflow / net + actual net by period.
  This comes from the commercial cashflow forecast records.
- **Supplier ageing** (left) and **Receivables ageing** (right): the classic
  **0-30 / 31-60 / 61-90 / 90+** buckets with totals per bucket and a top-8
  list of the oldest outstanding items. Direct from the PDF's "supplier ageing"
  and "outstanding receivables" requirements.

### 8c. Commercial KPIs

**Click** IPCs, Variations, and Claims (`/ops/commercial`).

Scroll to the **Commercial KPIs** panel — three chips with trend arrows:
- **Gross profit %** (revenue − cost / revenue, with the ZMW figures below)
- **Variation recovery %** (approved / submitted)
- **IPC turnaround (avg days)** from submitted to paid

---

## 9. Executive — the MD's lens

⏱️ *3 minutes*

Switch to **Managing Director** (or use role preview).

**Click** Executive Dashboard (`/ops/executive`).

Walk through the headline KPIs the PDF says the MD should see:
- **Cashflow** signals
- **Project completion %** (now real, driven by the site progress field)
- **Outstanding receivables**, **supplier liabilities**
- **Equipment utilisation**, **profitability by project**, **staff productivity**

Back on `/ops` (Overview), the same MD profile sees:
- **My Queue** widget — what's awaiting their decision (above-threshold POs, etc).
- **Workspace timeline** — recent activity with **who did it and their role**
  next to each event.
- **Action queue** — SLA escalations: stale RFQs, POs pending approval too long,
  payment requests aged, budget variances over 5%.

Close by saying: *"This is what the PDF meant by 'MD reviews summaries, not
takes phone calls.' Every line on this dashboard is a record you can click into
to see who did what."*

---

## 10. Field/mobile note

⏱️ *1 minute*

On a phone or tablet, point to the **Install Pymble Operations** banner at the
top of any ops page:
- Android/Chrome → tap **Install**.
- iOS Safari → tap **Share → Add to Home Screen**.

The app now opens full-screen, off the home screen. Useful for site engineers
who file daily reports and capture attendance from the field. Once dismissed,
the banner stays away for 14 days.

---

## Closing the demo

Three points to land at the end:

1. **The chain is visible.** Every record now shows its position in the
   workflow without phone calls.
2. **Each role sees their queue.** No more "what do I do today?" — open `/ops`
   and the **My Queue** widget tells you.
3. **The MD sees summaries, not calls.** Executive dashboard, escalation queue,
   and the audit trail with names + roles cover the visibility the PDF wanted.

If anyone asks **"what's still on the roadmap?"** — point to
**[Audit & Roadmap](./pymble-ops-audit-and-roadmap.md)**. Phases A–F are done.
Phase G (loans tracking, role splits, barcode, programme Gantt) is the backlog
parked for after launch.
