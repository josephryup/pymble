/**
 * Module content library for the departmental workbooks.
 *
 * ONE source, seven documents. Each department's workbook is this library
 * filtered by what that department can actually open — taken from OPS_MODULES
 * in src/lib/ops/constants.ts, not from anybody's memory of it. Writing seven
 * documents by hand would guarantee they disagree within a month.
 *
 * Per module:
 *   purpose  — one sentence, what it is for
 *   flow     — the states a record passes through, in order (omit if the
 *              module is a register or a report rather than a workflow)
 *   how      — how to operate it, as instructions
 *   ifNot    — [what was skipped, what happens]. The section people need.
 *   sla      — what the system counts as late, where there is a rule
 */

const M = {};

// ── Procurement ────────────────────────────────────────────────────────────

M["material-requests"] = {
  purpose:
    "Getting materials to a site, with the company knowing what was ordered, what it cost, and which work it was for.",
  flow: [
    ["Draft", "Requester builds the request and adds line items"],
    ["Submitted", "Sent for approval"],
    ["Operations approved", "Projects Manager, then Operations Manager"],
    ["Pricing", "Procurement attaches the actual supplier prices"],
    ["Priced", "Procurement sends it to Finance"],
    ["Cost approved", "Finance Manager or Accountant approves the money"],
    ["Ordered", "Procurement raises and issues the purchase order"],
    ["Delivered", "Requester or site manager confirms the goods arrived"],
    ["Closed", "Stores, or automatically on full delivery"],
  ],
  how: [
    "Add every line item before submitting — a request with no lines cannot be submitted.",
    "Name the supplier on each line. Pick one from the register if they are on it; type the name if they are not.",
    "You do not need to pick a cost code. The system derives it: your choice first, then the material schedule line the item matches, then the request's budget line, then the site's unplanned / contingency budget.",
    "Site requests under K25,000 go Projects Manager then Operations Manager. K25,000 and over adds the Managing Director. Office and general requests go to the Operations Manager only.",
    "If there is no active Projects Manager, the Managing Director covers that step.",
    "Requests marked IT are confidential and visible only to leadership, IT, Procurement and Finance.",
  ],
  ifNot: [
    ["No supplier is named on any line", "The request cannot be sent to Finance. The screen says so from the moment you add items — you do not have to wait until you press Send."],
    ["The supplier is typed rather than picked from the register", "Still blocked, but the cheap fix is to add them to the supplier register. Recording comparison prices also clears it."],
    ["The request is K1,000,000 or more", "Comparison prices are the only way through. Use Record comparison prices on the request itself."],
    ["No cost code can be derived", "The spend charges unplanned / contingency, so it will not appear against the work it was actually for. That usually means the item is not on the site's material schedule."],
    ["Procurement prices it but never presses Send to Finance", "The request sits in Pricing indefinitely. This is the most common way a request goes quiet."],
    ["Finance approves but nobody raises the purchase order", "The money is reserved but never committed. The budget looks more spent than it is, and the site never gets the goods."],
    ["The purchase order is raised but never issued", "Same as above. A draft order is not an order."],
    ["Delivery is never confirmed", "The cost never becomes actual, so it never reaches the accounts."],
  ],
  sla: [
    ["Waiting for approval", "2 days"],
    ["Waiting for pricing", "2 days"],
    ["Approved but not ordered (a reservation)", "60 days, or as soon as the needed-by date is 30 days past"],
  ],
};

M["boq"] = {
  purpose:
    "The list of everything a project is planned to consume, with quantities. It is what makes planned-versus-actual possible.",
  flow: [
    ["Draft", "Quantity Surveyor, Engineer or Projects Manager writes the schedule and its lines"],
    ["Pricing pending", "Submitted to Procurement"],
    ["Priced", "Procurement has attached unit rates and transport estimates"],
    ["Issued", "Locked in — and this is what generates the project budget"],
  ],
  how: [
    "Give each line a description, unit, quantity and a cost code. The cost code is what lets material requests inherit the right charge.",
    "Procurement prices the schedule, not Engineering. Engineering owns the quantities; Procurement owns the rates.",
    "Issuing generates or updates the site's project budget, one budget line per category, inheriting the cost code from the schedule lines it was summed from.",
    "A revision supersedes the previous schedule rather than deleting it. Categories the revision no longer covers are zeroed, not removed, because spend may already reference them.",
    "Material requests match against schedules that are priced OR issued, so a schedule still with Procurement already helps requests charge correctly.",
  ],
  ifNot: [
    ["No schedule is created for a site", "Every request on that site charges contingency. Variance reporting is impossible — the system can tell you how much was spent but not what on."],
    ["A schedule is drafted but never priced", "Requests can still match against it once priced, but no budget is generated."],
    ["A schedule is priced but never issued", "No project budget is created. Issuing is what generates it."],
    ["A schedule line has no cost code", "Requests matching that line inherit nothing and fall through to contingency."],
  ],
};

M["rfq-po"] = {
  purpose:
    "Recording the prices you compared, and turning an approved request into a purchase order the supplier can act on.",
  flow: [
    ["Requisition draft", "Built from a material request, or from scratch"],
    ["Issued / quoted", "Prices recorded against the lines"],
    ["Awarded", "The chosen supplier per line"],
    ["Purchase order draft", "Created from the requisition, one per supplier"],
    ["Approval pending → approved", "Where the order needs its own approval"],
    ["Issued", "The commitment. This is what tells the site the goods are coming"],
    ["Partially received → closed", "As Stores receipts against it"],
  ],
  how: [
    "Suppliers are never invited through this system. Procurement gathers prices by phone, WhatsApp, email or counter visit and records what was compared.",
    "A requisition can be built from a material request at Pricing, Priced, MD review, Approved or Partially ordered. You do not have to wait for approval.",
    "Issuing a purchase order is a separate, deliberate act from creating it. Creating an order commits nothing; issuing it does.",
    "Issuing an order records the committed cost against the budget and relieves the reservation the approval took.",
    "A part-delivery is normal: the request stays on the Procurement queue for a second round rather than closing.",
  ],
  ifNot: [
    ["An order is created but never issued", "Nothing is committed, nothing is recorded against the budget, and the supplier has no instruction. The request stays open."],
    ["A requisition is converted but the orders are left as drafts", "The material request stays open and correctly so. It advances when an order is actually issued, not before."],
    ["Comparison prices are not recorded above the tender threshold", "The request cannot reach Finance. The threshold is K1,000,000."],
  ],
  sla: [["Purchase order waiting to be issued", "1 day"]],
};

M["suppliers"] = {
  purpose: "The approved register of who the company buys from.",
  how: [
    "A supplier is active, on hold, or archived. Only an active supplier counts as approved to trade with.",
    "Adding a typed supplier name to the register is what clears the tender gate on a material request below the threshold — it is usually the cheapest fix.",
    "Record supplier performance events (delivery, quality, commercial, safety, communication, compliance) as they happen. They are worth nothing recalled at year end.",
    "Suppliers and subcontractors are distinguished by kind: vendor, subcontractor, or both.",
  ],
  ifNot: [
    ["A supplier used regularly is never added to the register", "Every request naming them is blocked until somebody records comparison prices instead. The register entry is a one-time job; the comparison is per request."],
    ["A supplier is left active after they should be on hold", "Requests naming them pass without the extra check they should get."],
  ],
};

M["stores-inventory"] = {
  purpose:
    "What the company physically holds, where it is, and what has moved in or out.",
  flow: [
    ["Goods received note", "Recorded against a purchase order line when the delivery arrives"],
    ["Stock movement", "Receipt, issue, transfer or adjustment"],
    ["Purchase order closes", "Once everything ordered has been received"],
  ],
  how: [
    "Locations are central store, site store, yard, or vehicle. Every movement is between locations.",
    "A goods received note is the receipt evidence for a delivery, and the basis of the three-way match between order, receipt and invoice.",
    "Receipting in full closes the purchase order and the material request behind it.",
    "An adjustment records a stock count difference — use the reason field, because an unexplained adjustment is indistinguishable from a loss.",
  ],
  ifNot: [
    ["No goods received note is recorded", "Delivery is confirmed on somebody's word alone. The three-way match has nothing to work with, and an overcharge on the supplier invoice cannot be caught."],
    ["Issues to site are not recorded", "Stock on hand is overstated, and the site appears not to have received material it is using."],
  ],
};

M["delivery-exceptions"] = {
  purpose:
    "Recording when a delivery was late, short, over, damaged or wrong, so the supplier record reflects it.",
  flow: [["Open"], ["Investigating"], ["Resolved"], ["Closed"]],
  how: [
    "Raise the exception when the delivery is received, not later. Types are late, short, over, damaged, wrong item, and quality.",
    "Severity is low, medium, high or critical — it drives who is notified.",
    "Resolving an exception is a statement that the matter is settled with the supplier, not that time has passed.",
  ],
  ifNot: [
    ["Exceptions are not raised", "Supplier performance looks perfect on paper. The register cannot tell you who is reliable, which is the only reason to keep it."],
  ],
  sla: [["An open exception", "2 days"]],
};

// ── Finance ────────────────────────────────────────────────────────────────

M["project-budgets"] = {
  purpose:
    "What a project is allowed to spend, per kind of work, so overspend is visible while it is happening rather than afterwards.",
  flow: [
    ["Draft", "A plan somebody is writing. It controls nothing"],
    ["Active", "Live. This is what spend is measured against. One per site"],
    ["Locked", "Closed to edits, still measuring"],
    ["Archived", "Superseded"],
  ],
  how: [
    "Every budget line needs an amount and a cost code. A line without a cost code cannot be saved, and a budget with one cannot be activated.",
    "Activating is the moment a plan starts governing. On activation the system links every open request on that site to the budget, codes any uncoded items, and reports what it did.",
    "Set a contingency amount. Off-schedule spend lands on the contingency leaf by design, and without an allowance there is nothing to measure it against.",
    "Only one budget can be active per site. Lock or archive the old one before activating a new one.",
    "A budget can also be generated automatically by issuing a material schedule.",
  ],
  ifNot: [
    ["The budget is left in draft", "Nothing is measured. Every request on that site reports as unfunded, and Finance gets a record-why prompt on every approval. The budget-health panel lists exactly which sites are in this state."],
    ["A budget line has no cost code", "The money on that line is invisible to the availability bands, the roll-up and every variance report. The system refuses to activate the budget and names the lines."],
    ["No contingency amount is set", "You will get record-why on every off-schedule request, indefinitely."],
  ],
  extra: {
    title: "The spending bands",
    intro: "When Finance approves a cost, the system reports where that leaves the budget.",
    table: {
      headers: ["Band", "When", "What happens"],
      rows: [
        ["OK", "Under 90% used", "Approve normally"],
        ["Warning", "Over 90%", "Shown, no extra step"],
        ["Record why", "Over 100%", "Approval allowed, but a reason is required. Finance Manager notified"],
        ["Escalate", "Over 110%, or no live budget", "Approval allowed, and the MD and GM are notified"],
      ],
      widths: [1700, 2400, 4926],
    },
    note: "Spend is never blocked. It is made visible — blocking a site mid-pour helps nobody. One exception: the contingency line asks for a reason rather than escalating even when unfunded, because off-schedule spend legitimately lands there all day and an escalation that fires on everything is one people learn to ignore.",
  },
};

M["cost-codes"] = {
  purpose:
    "The one key that links what was planned, what was requested, what was committed and what was actually spent.",
  how: [
    "The company library holds 53 approved codes, each mapped to a general ledger account. Finance and the MD control the library.",
    "A project's own list assembles itself from use: picking a library code provisions it onto the project the first time it is used, under a default General phase.",
    "Spend always charges a leaf, never a phase. A budget line may sit on a phase, because a phase total is the roll-up of its leaves.",
    "Code 90.90 is unplanned / contingency, 90.30 is transport, and 95.00 means uncategorised — to be broken down.",
    "Recoding after approval is allowed and recorded. It is a correction, not a breach.",
  ],
  ifNot: [
    ["A record has no cost code", "It is invisible to every band, roll-up and variance report at once. Money without a code still exists — it just cannot be reported against anything."],
    ["Everything charges 90.90 contingency", "That is the system telling you the material schedules are empty, not that the work was unplanned."],
  ],
};

M["payment-requests"] = {
  purpose: "Paying suppliers and other bills.",
  flow: [
    ["Draft"],
    ["Submitted"],
    ["Finance review"],
    ["Approved"],
    ["Paid"],
  ],
  how: [
    "Attach the supplier invoice or receipt. A payment request without evidence is a request to trust somebody's memory.",
    "Marking a request paid is what posts it to the accounts. Paying from the bank without marking it here leaves your payables overstated.",
    "Loan instalments never come through here — see Loans.",
  ],
  ifNot: [
    ["Submitted but never reviewed", "It sits. Nothing chases it beyond the flag."],
    ["Approved but never marked paid", "The supplier may have been paid from the bank, but the system still shows it owing."],
  ],
  sla: [["Any stage", "2 days"]],
};

M["loans"] = {
  purpose: "Money the company has borrowed, what it owes, and what it has repaid.",
  how: [
    "The principal you borrow is a liability, not an expense. When you repay, the principal portion reduces what you owe and only the interest portion is a cost.",
    "This is why loan instalments never appear as payment requests — recording them that way would double-count the money and overstate costs.",
    "Add the provider, create the facility (amount, rate, term, and flat or reducing balance), record the drawdown when the money arrives, then record each repayment.",
    "Flat versus reducing balance is not a detail. On the same nominal rate the two can differ by roughly 80% in total interest. Pick what the agreement says.",
    "The system splits principal from interest on each repayment for you.",
  ],
  ifNot: [
    ["A repayment is not recorded", "The balance stays too high and arrears are flagged against you incorrectly."],
    ["The drawdown is not recorded", "The cash appears in the bank with no matching liability. The accounts will not balance."],
    ["The wrong interest basis is chosen", "Every projected figure for that loan is wrong, by a lot."],
    ["An instalment is missed", "The daily sweep catches it and flags arrears — the one thing here nobody would otherwise discover by opening a page."],
  ],
};

M["invoices"] = {
  purpose: "Bills the company issues to its customers.",
  flow: [["Draft"], ["Sent"], ["Paid"]],
  how: [
    "An invoice needs a customer. If the customer is not on the master list, add them first.",
    "Sending an invoice posts it to the accounts as revenue and a receivable.",
    "Marking it paid posts the receipt and clears the receivable.",
  ],
  ifNot: [
    ["An invoice is left in draft", "It is not revenue, not a receivable, and not chased."],
    ["Payment is received but not recorded", "The customer keeps appearing as owing you money."],
  ],
};

M["receivables"] = {
  purpose: "What customers owe the company, and how long they have owed it.",
  how: [
    "Ageing is calculated from the invoice date. An invoice with no due date cannot be judged overdue reliably.",
    "This is a view over invoices — fix a wrong figure on the invoice, not here.",
  ],
  ifNot: [["Invoices are not raised in the system", "Receivables shows nothing owing, whatever the reality."]],
};

M["customers"] = {
  purpose: "The master list of who the company invoices.",
  how: ["Add the customer before the first invoice. Everything downstream — invoices, receivables, ageing, project profitability — keys off this record."],
  ifNot: [["A customer is not on the list", "No invoice can be raised for them at all."]],
};

M["finance-overview"] = {
  purpose: "One screen showing where the money is across projects, budgets and the ledger.",
  how: [
    "The Cost subledger and general ledger panel is the integrity check: it compares what operations recorded against what reached the accounts.",
    "Zero unposted is the healthy state. If it is not zero, use the button beside the number to post the outstanding entries.",
    "The Reservations awaiting procurement panel shows approved spend nobody has ordered. Anything over 60 days is flagged.",
  ],
  ifNot: [["The unposted count is left non-zero", "Operations and the accounts disagree by that amount, and the difference grows quietly."]],
};

M["chart-of-accounts"] = {
  purpose: "The list of accounts every journal posts to.",
  how: [
    "Each cost code in the library maps to an account here. That mapping is what lets operational spend reach the ledger automatically.",
    "Changing an account's code or type affects every report built on it. Treat it as a controlled change.",
  ],
  ifNot: [["A cost code has no account mapped", "Spend on that code cannot post to the ledger and appears on the reconciliation as a break."]],
};

M["general-ledger-journal"] = {
  purpose: "Every accounting entry the system has posted, and why.",
  how: [
    "Most journals are posted automatically by an operational event — an invoice sent, a payment marked paid, a delivery confirmed, a payroll run completed.",
    "Each journal names its source record, so you can always trace a figure back to the thing that caused it.",
  ],
  ifNot: [["Operational steps are skipped", "The journal simply has no entry. A thin ledger usually means an unfinished workflow, not a quiet month."]],
};

M["trial-balance"] = { purpose: "Every account and its balance, proving debits equal credits.", how: ["Run it before producing the Profit and Loss or Balance Sheet. If it does not balance, no statement built on it is worth reading."] };
M["profit-and-loss"] = { purpose: "Income and expenses for a period.", how: ["Built from posted journals only. Costs that never posted do not appear, which is why the reconciliation on Finance Overview matters."] };
M["balance-sheet"] = { purpose: "What the company owns and owes at a point in time.", how: ["Loans appear here as liabilities. This is why recording a drawdown matters — cash without the matching liability makes the sheet wrong."] };
M["cash-flow-statement"] = { purpose: "Where cash came from and went during a period.", how: ["Driven by payments and receipts actually marked as such. A payment made in the bank but not marked paid here will not appear."] };
M["finance-legacy-projects"] = { purpose: "Closed projects retained for reference and comparison.", how: ["Use it to sanity-check a new budget against what a similar finished project actually cost."] };

// ── Operations ─────────────────────────────────────────────────────────────

M["overview"] = {
  purpose: "Today's priorities, live project signals and workflow pressure in one place.",
  how: ["Start here. My Queue shows what is waiting on you specifically; the rest is context."],
};

M["sites"] = {
  purpose: "The project and site register — the record everything else hangs off.",
  how: [
    "A site carries its supervisor, client, location and map coordinates.",
    "Sites have a stage and a status. A site that is closing should say so, because it changes what people expect to see on it.",
    "Almost every other module keys off the site: budgets, requests, schedules, attendance, reports.",
  ],
  ifNot: [["A site is not created before work starts", "Requests, attendance and reports have nowhere to attach, and the spend cannot be traced to a project."]],
};

M["workers"] = {
  purpose: "Casual and permanent site workers, and their rates.",
  how: ["A worker must exist here before attendance can be captured for them.", "Worker type — casual or permanent — decides which payroll engine pays them."],
  ifNot: [["A worker is not registered", "They cannot be marked present and will not be paid by the system."]],
};

M["attendance"] = {
  purpose: "Who was on site, on which day.",
  how: [
    "Pay is a fixed daily rate for each attended day — K60 flat — plus separately entered overtime. Base pay is never scaled by hours worked.",
    "Presence is present, late, or absent.",
    "Attendance can be captured in the app or entered manually, and works offline on site.",
  ],
  ifNot: [["A day is not captured", "That worker is not paid for it. Payroll builds only from what attendance recorded."]],
};

M["subcontractors"] = {
  purpose: "Firms working under the company on a project, and what they are owed.",
  how: [
    "Subcontractor payments notify Finance and the MD, and appear in a Finance queue on the subcontractors screen.",
    "A subcontractor is a supplier of kind subcontractor or both — the same register.",
  ],
  ifNot: [["A payment is agreed off-system", "It is not in the budget, not in the ledger and not visible to Finance until somebody remembers."]],
};

M["contracts"] = {
  purpose: "Works orders and employment contracts, from drafting through signature.",
  flow: [["Draft"], ["Review"], ["Approved"], ["Sent for signature"], ["Signed / active"], ["Completed or terminated"]],
  how: [
    "Contracts are built from a standard template, then every clause can be edited per contract.",
    "Two template kinds: works order (for a supplier or subcontractor) and employment.",
    "Signatures are rendered server-side onto the document — the signed PDF is the record.",
    "A contract can carry a cost code, so the commitment is visible against the project.",
  ],
  ifNot: [["Work starts before the contract is signed", "There is no agreed scope or price to hold anyone to, and the commitment is invisible to the budget."]],
};

// ── Engineering ────────────────────────────────────────────────────────────

M["daily-site-reports"] = {
  purpose: "What happened on site each day — progress, labour, plant, materials, delays, safety and commercial events.",
  flow: [["Draft"], ["Submitted"], ["Reviewed"], ["Closed"]],
  how: [
    "One report per site per day. Entries are typed: progress, labour, equipment, material, delay, HSE, commercial.",
    "Record delays on the day they happen with the reason. A delay reconstructed weeks later is worth very little in a claim.",
    "Reports can be written offline and sync when there is signal.",
  ],
  ifNot: [["Daily reports are not written", "There is no contemporaneous record of delay or disruption. Extension-of-time and loss-and-expense claims depend almost entirely on this."]],
};

M["engineering-controls"] = {
  purpose: "Site instructions, quality inspections, material tests, snags and the drawing register.",
  flow: [["Site instruction: draft → issued → acknowledged → closed"], ["Inspection: planned → completed → action required → closed"], ["Snag: open → in progress → resolved → verified"]],
  how: [
    "A site instruction is a formal direction. Issue it, and get it acknowledged — an unacknowledged instruction is a conversation, not an instruction.",
    "Inspections record a result per item: pass, fail, observation, or not applicable. A fail creates a finding with a category.",
    "Material tests run scheduled → submitted → passed or failed.",
    "Drawings are current, superseded or archived. Superseding is how you stop people building from an old sheet.",
  ],
  ifNot: [
    ["An instruction is issued but never acknowledged", "There is no proof the site received it."],
    ["A snag is resolved but never verified", "Nobody has confirmed the fix. Verification is a separate step for a reason."],
    ["A drawing revision is not superseded", "Two current versions of the same drawing exist, and somebody will build from the wrong one."],
  ],
};

M["site-checklists"] = {
  purpose: "Structured checks at the points where work must not proceed unchecked.",
  how: [
    "Templates are fixed in code so a checklist means the same thing on every site.",
    "Hold points can be overridden where circumstances require it, and the override is recorded.",
    "The Project Manager sign-off gate cannot be overridden.",
  ],
  ifNot: [["A checklist is skipped", "The hold point it protects was never checked, and there is no record of who decided to proceed."]],
};

M["project-schedule"] = {
  purpose: "The programme: tasks, milestones and progress against plan.",
  how: [
    "Milestones carry a status — planned, on track, at risk, and so on.",
    "Tasks can carry a cost code, which links the programme to the money.",
    "Overdue tasks escalate automatically.",
  ],
  ifNot: [["The programme is not maintained", "Progress reporting becomes opinion, and slippage is discovered rather than predicted."]],
};

// ── Commercial ─────────────────────────────────────────────────────────────

M["quotations"] = {
  purpose: "Prices the company offers to customers.",
  flow: [["Draft"], ["Sent"], ["Accepted / declined / expired"]],
  how: [
    "An accepted quotation can be converted into the downstream records rather than retyped.",
    "Set the expiry. An open-ended quotation is a price you have to honour indefinitely.",
  ],
  ifNot: [["A quotation is not marked accepted or declined", "The pipeline figure is wrong, and nothing downstream is created."]],
};

M["commercial-maturity"] = {
  purpose: "Interim payment certificates, variations and claims — the commercial position on a contract.",
  flow: [
    ["IPC: draft → submitted → certified → invoiced → paid"],
    ["Variation: draft → submitted → priced → approved → closed"],
    ["Claim: draft → submitted → under review → agreed → closed"],
  ],
  how: [
    "A variation is a change to the scope. Price it before seeking approval — an approved variation with no price is an argument waiting to happen.",
    "Claims are typed: extension of time, loss and expense, acceleration, disruption, prolongation, or variation dispute.",
    "An IPC becomes an invoice once certified. That is the link between the commercial position and the money.",
  ],
  ifNot: [
    ["A variation is instructed but not recorded", "The work is done and not paid for. This is the single most expensive omission in the module."],
    ["An IPC is certified but never invoiced", "The certified amount is never billed."],
  ],
};

// ── HSE ────────────────────────────────────────────────────────────────────

M["hse-incidents"] = {
  purpose: "Incidents, near misses and the corrective actions that follow.",
  flow: [["Reported"], ["Investigating"], ["Action required"], ["Closed"]],
  how: [
    "Report on the day. Types run from near miss and first aid through to lost time, property damage and environmental.",
    "Severity is low, medium, high or critical, and drives who is notified immediately.",
    "Every corrective action has an owner and runs open → in progress → completed → verified.",
    "A near miss is worth reporting precisely because nothing happened. It is the cheapest lesson available.",
  ],
  ifNot: [
    ["An incident is not reported", "There is no record for the regulator, the insurer, or the next investigation."],
    ["A corrective action is completed but not verified", "Nobody has confirmed it actually works."],
  ],
  sla: [["An open corrective action", "escalates on the HSE sweep"]],
};

M["hse-compliance"] = {
  purpose: "Risk assessments, toolbox talks, PPE issue and safety inspections.",
  how: [
    "A risk assessment belongs to the activity, not the site — reuse and revise it rather than rewriting it per job.",
    "Toolbox talks run planned → completed, and record who attended. The attendance is the evidence.",
    "PPE issue is tracked per person: issued, then returned.",
    "Inspections run planned → completed → action required → closed, with findings tracked to closure.",
  ],
  ifNot: [
    ["A toolbox talk is held but attendance is not recorded", "You cannot show who was briefed, which is the whole point of the record."],
    ["PPE is issued without recording it", "There is no basis for replacement, and no evidence it was provided."],
  ],
};

M["hse-weekly"] = {
  purpose: "The weekly safety position, compiled for leadership.",
  how: ["Compiled from incidents, inspections, talks and actions already recorded. Record during the week and the report writes itself."],
  ifNot: [["The week's events were not recorded as they happened", "The report has to be reconstructed from memory, and it will be wrong."]],
};

// ── HR ─────────────────────────────────────────────────────────────────────

M["employees"] = {
  purpose: "Permanent staff records, contracts, documents and leave.",
  flow: [["Leave: draft → submitted → approved → completed"]],
  how: [
    "The employee record carries the contract, statutory numbers and the documents. It is the source for payroll and payslips.",
    "Leave balances accrue monthly and automatically.",
    "Employee documents are visible to HR and the employee, not to the wider company.",
  ],
  ifNot: [
    ["An employee record is incomplete", "Payroll cannot compute statutory deductions correctly, and the payslip will be wrong."],
    ["Leave is taken but not recorded", "The balance is wrong and the absence is unexplained on attendance."],
  ],
};

M["staff"] = {
  purpose: "The people directory and who holds which role in the system.",
  how: ["A person's role decides what they can open and what they can approve. Changing a role changes their authority immediately."],
  ifNot: [["A leaver's account is left active", "They keep whatever access the role carries."]],
};

M["staff-payroll"] = {
  purpose: "Monthly payroll for permanent staff, with statutory deductions.",
  flow: [["Draft"], ["Approved"], ["Completed"]],
  how: [
    "Completing a run posts it to the general ledger and the cost spine. That posting is what makes payroll appear in the accounts.",
    "Payslips are released to employees only after approval, and each person sees only their own.",
    "The tax number is snapshotted onto the payslip, so a later change does not rewrite history.",
  ],
  ifNot: [
    ["A run is approved but never completed", "Nobody is recorded as paid, and nothing reaches the accounts."],
    ["A run is completed but shows no journal", "It predates automatic posting. It appears on the Finance reconciliation and needs Finance to act."],
  ],
};

M["payroll"] = {
  purpose: "Payroll for casual site workers, built from attendance.",
  flow: [["Draft"], ["Approved"], ["Disbursing"], ["Completed"]],
  how: [
    "Built from attendance: a fixed daily rate per attended day plus recorded overtime.",
    "Payouts are tracked per worker — pending, sent, or failed. A failed payout needs following up individually.",
  ],
  ifNot: [["Attendance was not captured", "The worker is not in the run at all. Payroll cannot pay what attendance did not record."]],
};

M["recruitment"] = {
  purpose: "Vacancies and the applicants against them.",
  flow: [["New"], ["Screening"], ["Shortlisted"], ["Interview"], ["Offer"], ["Hired"]],
  how: ["Move applicants through the stages as they progress. Hired should trigger creating the employee record."],
  ifNot: [["A hire is not converted into an employee record", "The person exists in recruitment and nowhere else — no contract, no payroll, no access."]],
};

// ── Fleet ──────────────────────────────────────────────────────────────────

M["equipment"] = {
  purpose: "Plant and equipment, who has it, and what it costs to run.",
  flow: [["Request: draft → submitted → approved → allocated → closed"]],
  how: [
    "Equipment is available, allocated, in maintenance, or inactive.",
    "Ownership matters: company owned, hired, or leased. Hired plant costs money every day it sits idle on a site.",
    "Fuel logs and maintenance jobs attach to the equipment record.",
  ],
  ifNot: [
    ["An allocation is not closed when the plant comes back", "It shows as still on site and cannot be allocated elsewhere."],
    ["Hired plant is not returned promptly", "The hire cost continues and nothing in the system objects."],
  ],
  sla: [["An equipment request awaiting decision", "2 days"]],
};

M["fleet-logistics"] = {
  purpose: "Vehicle movements and transport requests.",
  flow: [["Draft"], ["Submitted"], ["Approved"], ["Scheduled"], ["Completed"]],
  how: ["Request types cover staff transport, material delivery and plant movement.", "Scheduling is what tells the driver. An approved request that is never scheduled does not happen."],
  ifNot: [["A request is approved but not scheduled", "Nobody is assigned to it and the movement does not take place."]],
  sla: [["A transport request awaiting decision", "2 days"]],
};

// ── Cross-cutting ──────────────────────────────────────────────────────────

M["approvals"] = {
  purpose: "Everything waiting for your decision, in one place.",
  how: [
    "An approval has ordered steps. Yours becomes actionable when the steps before it are done.",
    "A rejection needs a reason. The requester sees it and acts on it.",
    "Cancelling the underlying record withdraws its approval automatically — you will not be asked to authorise something that no longer exists.",
  ],
  ifNot: [["An approval is left sitting", "Everything behind it stops. Approvals are flagged as late after 2 days and then escalate."]],
  sla: [["Any approval step", "2 days"]],
};

M["approval-rules"] = {
  purpose: "The thresholds and chains that decide who approves what.",
  how: [
    "The material request threshold is K25,000 — above it the Managing Director is added as a final step.",
    "The competitive tender threshold is K1,000,000 — at or above it, recorded comparison prices are the only way through.",
    "Budget bands: warn at 90%, record-why at 100%, escalate at 110%.",
    "Raising a threshold can only ever shorten a chain, so change it deliberately.",
  ],
};

M["notifications"] = { purpose: "What the system needs you to know about.", how: ["Notifications are deduplicated, so a repeated event updates the existing notice rather than adding another.", "An action link takes you straight to the record."] };
M["inbox"] = { purpose: "Conversations and mentions on records.", how: ["Mentioning someone notifies them and links them to the record in question."] };
M["my-sites"] = { purpose: "The sites you are assigned to, with field shortcuts.", how: ["This is the site-team home: attendance, daily reports and photos in one place, and it works offline."] };
M["documents"] = {
  purpose: "The company document register, with version control.",
  how: [
    "A document is a group with versions. Uploading a new file supersedes the previous version rather than replacing it.",
    "Five visibility tiers: public, management, finance, MD-restricted, and private. The owner and the MD can always see their own.",
    "A document can also be shared with named people, and a direct share beats the visibility tier.",
  ],
  ifNot: [["A revision is uploaded as a new document instead of a new version", "Two documents claim to be current and the version history is lost."]],
};
M["photos"] = { purpose: "Site photographs, tagged by purpose.", how: ["Tags are progress, delivery and safety. A delivery photo is evidence; tag it as one.", "Photos can be captured offline and sync later."] };
M["archive"] = { purpose: "Records that have been archived rather than deleted.", how: ["Archiving is reversible and keeps the audit trail. Deleting is not the same thing and is rarely correct."] };
M["activity-log"] = { purpose: "Who did what, and when.", how: ["Every significant action is recorded with its actor, the record, and a summary. This is where a disputed change gets settled."] };
M["glossary"] = { purpose: "What the system's terms mean.", how: ["If a word on a screen is unfamiliar, it is defined here rather than guessed at."] };
M["modules"] = { purpose: "Every module, what it does, and whether you can open it.", how: ["Use it to find a screen you know exists but cannot locate."] };
M["settings"] = { purpose: "Your profile, signature and preferences.", how: ["Your signature is used on documents you sign, so set it before you first need it."] };
M["it-help-request"] = { purpose: "Raising an IT problem.", how: ["Describe what you were doing when it happened. A ticket saying 'it does not work' takes three messages to become useful."] };
M["it-handbook"] = { purpose: "IT policies and how-to guides.", how: ["Read the acceptable-use and data-protection policies once. They are short and they are binding."] };
M["department-reports"] = {
  purpose: "The weekly reporting chain from contributor to manager to leadership.",
  flow: [["Contributor draft"], ["Submitted to manager"], ["Manager compiles"], ["To MD / GM"]],
  how: [
    "Contributors submit theirs; the manager compiles the department report from them.",
    "Reminders fire on Monday and Tuesday until last week's compiled report exists.",
  ],
  ifNot: [["A contributor does not submit", "The manager compiles the department's week with a hole in it."]],
  sla: [["A department report", "2 days"]],
};
M["executive-dashboard"] = { purpose: "The company position for leadership.", how: ["Built from what the modules recorded. A blank panel is usually an unfinished workflow rather than a quiet week."] };

// Department report modules all share one shape.
for (const id of [
  "dept-reports-procurement",
  "dept-reports-finance",
  "dept-reports-operations",
  "dept-reports-engineering",
  "dept-reports-commercial",
  "dept-reports-hse",
  "dept-reports-hr",
]) {
  M[id] = {
    purpose: "Your department's own weekly report and its history.",
    how: [
      "Write it from what the system already holds rather than from memory — the figures are there.",
      "The manager compiles the department report from the contributors' submissions.",
    ],
    ifNot: [["The report is skipped", "Leadership sees no position for your department that week, and reminders continue on Monday and Tuesday."]],
  };
}

module.exports = { MODULE_CONTENT: M };
