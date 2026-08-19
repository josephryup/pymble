# Pymble Ops — User Workbook

**How the system works, who does what, and what it means when something is not done.**

Version 1.0 · 19 August 2026 · Covers Material Requests, Project Budgets, Material Schedules, Loans, and the money that runs through them.

---

## How to read this workbook

Every module below follows the same shape:

1. **What it is for** — in one sentence.
2. **The steps** — who does what, in order.
3. **What happens if you don't** — the consequence of skipping a step. This is the part most people need.
4. **How long each stage should take** — what the system counts as late.

Two words are used precisely throughout:

- **Live** — the record is governing something. A *live* budget controls spend. A *draft* one does not.
- **Charged** — money has been attached to a specific piece of work. Money that is not charged still exists; it just cannot be reported against anything.

---

## Part 1 — Material Requests

### What it is for

Getting materials to a site, with the company knowing what was ordered, what it cost, and which work it was for.

### The nine stations

A request moves through these in order. It cannot skip one, and it cannot go backwards.

| # | Station | Who acts | What they do |
|---|---|---|---|
| 1 | **Draft** | Requester | Builds the request and adds line items |
| 2 | **Submitted** | Requester | Sends it for approval |
| 3 | **Operations approved** | Projects Manager, then Operations Manager | Confirms the materials are right for the job |
| 4 | **Pricing** | Procurement | Attaches the actual supplier prices |
| 5 | **Priced** | Procurement | Sends it to Finance |
| 6 | **Cost approved** | Finance Manager or Accountant | Approves the money |
| 7 | **Ordered** | Procurement | Raises and issues the purchase order |
| 8 | **Delivered** | Requester or site manager | Confirms the goods arrived |
| 9 | **Closed** | Stores, or automatically on full delivery | Done |

### Who can do what

| Action | Roles |
|---|---|
| **Raise a request** | Operations Manager, Projects Manager, Procurement Manager, Procurement, Procurement Assistant, Quantity Surveyor, Engineer, Manager, Supervisor, HSE Officer, HSE Assistant, MD, GM, Owner |
| **Approve (Operations)** | Projects Manager, then Operations Manager |
| **Approve above K25,000** | The above, then **Managing Director** |
| **Attach supplier prices** | Procurement Manager, Procurement, Procurement Assistant, MD, Owner |
| **Approve the cost** | Finance Manager, Accountant, MD, Owner |
| **Raise the purchase order** | Procurement Manager, Procurement |
| **Confirm delivery** | The person who raised it, or any Operations/Projects/Procurement manager |
| **See every request** | MD, GM, Operations Manager, Projects Manager, Procurement Manager, Procurement, Manager, Owner |

Everyone else sees **only the requests they raised themselves.**

### The approval chain in plain terms

- **Site request under K25,000:** Projects Manager → Operations Manager.
- **Site request K25,000 or over:** Projects Manager → Operations Manager → **Managing Director**.
- **Office or general request:** Operations Manager only (no Projects Manager — there is no project to check it against).
- **If there is no active Projects Manager**, the Managing Director covers that step directly.

### What happens if you don't

| If this is not done | What happens |
|---|---|
| **You don't name a supplier on a line** | The request **cannot be sent to Finance.** The screen will say so from the moment you add items — you do not have to wait until you press Send. Fix: pick a supplier from the register, or type the name. |
| **You type a supplier who is not on the register** | The request is still blocked, but with a cheaper fix: either **add them to the supplier register**, or **record one set of comparison prices**. Either one clears it. |
| **The request is K1,000,000 or more** | Comparison prices are the **only** way through. Use *Record comparison prices* on the request itself. |
| **You don't set a cost code** | Nothing blocks — the system works it out for you (see below). But if it cannot find a match, the spend charges the site's **unplanned / contingency** budget, which means it will not appear against the work it was actually for. |
| **Procurement prices it but never presses Send to Finance** | The request sits in **Pricing** forever. Nobody is notified. This is the single most common way a request goes quiet. |
| **Finance approves but nobody raises the purchase order** | The money is **reserved** against the budget but never committed. The budget looks more spent than it is, and the site never gets the goods. |
| **The purchase order is raised but never issued** | Same as above. A draft order is not an order. |
| **Delivery is never confirmed** | The cost stays as *committed* and never becomes *actual*, so it never reaches the accounts. |

### How the cost code is worked out for you

You do **not** need to pick a cost code. The system tries, in this order:

1. **What you picked**, if you picked one. Your choice always wins.
2. **The material schedule line** the item is linked to, or matches by name.
3. **The budget line** the request already draws against.
4. **The site's unplanned / contingency budget** — the last resort.

If your request lands on contingency, that is the system telling you the item is **not on the site's material schedule.** That is usually true and worth knowing.

**Office and IT requests have no project**, so they charge a **cost centre** (IT or Head Office) instead of a cost code. That is correct, not a gap.

### How long each stage should take

The system counts a request as **late** and escalates it after:

| Stage | Late after |
|---|---|
| Waiting for approval | **2 days** |
| Waiting for pricing | **2 days** |
| Purchase order waiting to be issued | **1 day** |
| Approved but not yet ordered (a "reservation") | **60 days**, or as soon as the needed-by date is 30 days past |

Escalations go to the person whose queue it is sitting in, then to their manager.

---

## Part 2 — Material Schedules

### What it is for

The list of everything a project is planned to consume, with quantities. It is the thing that makes "planned versus actual" possible.

### The steps

| # | Stage | Who | What |
|---|---|---|---|
| 1 | **Draft** | Quantity Surveyor, Engineer, Projects Manager, Engineering Manager | Writes the schedule and its lines |
| 2 | **Pricing** | Quantity Surveyor submits; **Procurement** prices it | Unit rates and transport estimates per line |
| 3 | **Priced** | Procurement | Prices attached |
| 4 | **Issued** | Projects Manager, Quantity Surveyor, GM, MD | Locks it in — **and generates the project budget** |

### Who can do what

| Action | Roles |
|---|---|
| **Create and edit** | Quantity Surveyor, Engineer, Engineering Manager, Projects Manager, GM, MD, Manager, Owner |
| **Price it** | Procurement Manager, Procurement, Procurement Assistant |
| **Issue it** | Projects Manager, Quantity Surveyor, GM, MD, Manager, Owner |
| **Archive it** | The above, plus Operations Manager |

### What happens if you don't

> **This is the most important section in this workbook.**

**As of 19 August 2026, the material schedules are effectively empty** — 10 schedules exist, only one has been issued, and it has no lines on it.

The consequence, measured on the live system:

- **465 of 468 material request line items — K2.26 million — charge "unplanned / contingency"**, because there is no schedule line to match them to.
- Only **three** items in the entire company charge real work (cement, PPE, labour).
- **Planned-versus-actual variance is meaningless.** Every report will say the project is 100% unplanned, because as far as the system knows, it is.

Nothing is broken and nothing is lost — the money is all recorded. But until the schedules are populated, the system can tell you **how much** was spent and **not what on**.

| If this is not done | What happens |
|---|---|
| **No schedule is created** | Every request on that site charges contingency. Variance reporting is impossible. |
| **A schedule is drafted but never priced** | Requests can still match against it (matching works on *priced* and *issued* schedules), but no budget is generated. |
| **A schedule is priced but never issued** | **No project budget is created.** Issuing is what generates the budget. |
| **A schedule line has no cost code** | Requests matching that line inherit nothing and fall through to contingency. |

**When you do populate the schedules**, existing requests will not reclassify themselves automatically — ask the developer to run the re-derivation pass, which moves contingency-coded items onto their proper schedule lines.

---

## Part 3 — Project Budgets

### What it is for

Saying what a project is allowed to spend, per kind of work, so that overspend is visible while it is happening rather than afterwards.

### The four states

| State | What it means |
|---|---|
| **Draft** | A plan somebody is writing. **It controls nothing.** |
| **Active** | Live. This is what spend is measured against. **One per site.** |
| **Locked** | Closed to edits, still measuring. |
| **Archived** | Superseded. |

> **A draft budget does not measure anything.** It is shown on screen as *planned*, so you can see the figure — but no control, band, or report treats it as funding. **Activation is the moment a plan starts governing.**

### The steps

1. **Create the budget** for the site — Finance Manager, Accountant, Quantity Surveyor, Projects Manager, GM, MD, Owner.
2. **Add lines**, each with an amount and a **cost code**. A line without a cost code cannot be saved.
3. **Activate it** — Finance Manager, GM, MD, Owner.
4. On activation the system **links every open request on that site to the budget**, codes any uncoded items, and tells you what it did.

### Who can do what

| Action | Roles |
|---|---|
| **Create a budget** | Finance Manager, Accountant, Quantity Surveyor, Projects Manager, GM, MD, Manager, Owner |
| **Add / edit lines** | Finance Manager, GM, MD, Manager, Owner |
| **Activate** | Finance Manager, GM, MD, Manager, Owner |
| **Lock / archive** | Finance Manager, GM, MD, Owner |
| **View** | Operations Manager, Projects Manager, Procurement Manager, Procurement, Quantity Surveyor, Accountant, plus all of the above |

### What happens if you don't

| If this is not done | What happens |
|---|---|
| **The budget is left in draft** | **Nothing is measured.** Every request on that site reports as unfunded, and Finance gets a "record why" prompt on every approval. The budget-health strip on the Project Budgets page lists exactly which sites are in this state. |
| **A budget line has no cost code** | Money on that line is invisible to every band, roll-up and variance report. The system now refuses to activate a budget in this state and names the lines. |
| **No contingency amount is set** | Off-schedule spend has nothing to be measured against. You will get "record why it is needed" on every such request, forever. Set a contingency figure. |
| **Two budgets are active on one site** | Cannot happen — the system allows one. Lock or archive the old one first. |

### The spending bands

When Finance approves a cost, the system reports where that leaves the budget:

| Band | When | What happens |
|---|---|---|
| **OK** | Under 90% used | Approve normally |
| **Warning** | Over 90% | Shown, no extra step |
| **Record why** | Over 100% | Approval allowed, but a reason is required. Finance Manager is notified. |
| **Escalate** | Over 110%, or the code has no live budget | Approval allowed, and the **MD and GM** are notified |

**Spend is never blocked.** It is made visible. That is deliberate — blocking a site mid-pour helps nobody.

**One exception:** the contingency line asks for a reason rather than escalating, even when it is unfunded. Off-schedule spend legitimately lands there all day, and an escalation that fires on everything is one people learn to ignore.

---

## Part 4 — Loans

### What it is for

Tracking money the company has borrowed, what it owes, and what it has repaid.

### The key idea — read this first

**A loan is not a bill.** The principal you borrow is a **liability**, not an expense. When you repay:

- the **principal** portion reduces what you owe;
- only the **interest** portion is a cost.

This is why loan instalments never appear as payment requests. Recording them that way would double-count the money and overstate your costs.

### The steps

1. **Add the provider** (the bank or lender).
2. **Create the facility** — amount, rate, term, and whether interest is **flat** or **reducing balance**.
3. **Record the drawdown** when the money arrives. This posts to the accounts.
4. **Record each repayment** as it is made. The system splits principal from interest for you.

> **Flat versus reducing balance is not a detail.** On the same nominal rate, the two can differ by roughly **80%** in total interest. Pick the one the agreement actually says.

### Who can do what

| Action | Roles |
|---|---|
| **View loans** | MD, Owner, GM, Finance Manager, Accountant, Operations Manager |
| **Create / edit a facility** | MD, Owner, Finance Manager, Operations Manager |
| **Record a repayment** | MD, Owner, Finance Manager, **Accountant** |

Recording a repayment moves cash and posts a ledger entry, so it is deliberately limited to Finance — Operations can set a loan up but cannot post against it.

### What happens if you don't

| If this is not done | What happens |
|---|---|
| **A repayment is not recorded** | The balance stays too high, and arrears are flagged against you incorrectly. |
| **The drawdown is not recorded** | The cash appears in the bank with no matching liability. The accounts will not balance. |
| **The wrong interest basis is chosen** | Every projected figure for that loan is wrong, by a lot. |
| **A missed instalment** | The daily sweep catches it and flags arrears. This is the one thing in the module nobody would otherwise discover by opening a page — it happens on a date, in silence. |

---

## Part 5 — Payment Requests

### What it is for

Paying suppliers and other bills.

### The steps

| # | Stage | Who |
|---|---|---|
| 1 | **Draft** | Finance, Operations Manager, Projects Manager, Procurement Manager, Procurement, Quantity Surveyor, Accountant |
| 2 | **Submitted** | The creator |
| 3 | **Finance review** | Finance Manager, Accountant, GM, MD |
| 4 | **Approved** | Finance Manager, GM, MD, Owner |
| 5 | **Paid** | Finance Manager, MD, Owner |

### What happens if you don't

| If this is not done | What happens |
|---|---|
| **Submitted but never reviewed** | It sits. As of 19 Aug 2026, **14 of 15 payment requests in the system are in this state** — nothing has ever been marked paid. |
| **Approved but never marked paid** | The supplier may have been paid in the bank, but the system still shows it owing. Your payables are overstated. |
| **Late** | Flagged after **2 days** at any stage. |

---

## Part 6 — What the money does behind the scenes

You do not need to operate this, but understanding it explains most "why does the report say that?" questions.

Every cost moves through **stations**, and each one relieves the last so nothing is counted twice:

| Station | When it happens | Meaning |
|---|---|---|
| **Reserved** | Finance approves the cost | Funds are held. Nothing is ordered yet. |
| **Committed** | The purchase order is issued | The company is now contractually on the hook. |
| **Accrued** | Goods received, invoice not yet in | The cost is real but unbilled. |
| **Actual** | Delivery confirmed | The cost has landed. |
| **Paid** | Money has left | Settled. |
| **Released** | Cancelled | Funds go back to the budget. |

**Why a budget can look exhausted when it isn't:** approved-but-never-ordered requests hold a *reservation*. If Procurement never raises the order, that money sits reserved indefinitely. Finance can see these on the Finance page under "Reservations awaiting procurement" — anything over **60 days** is flagged.

---

## Part 7 — Quick reference: who owns what

| Module | Owns the day-to-day | Approves | Sees everything |
|---|---|---|---|
| **Material requests** | Site teams, Procurement | Projects Manager → Operations Manager → (MD over K25,000) | MD, GM, Operations, Projects, Procurement |
| **Pricing** | Procurement | — | Procurement, leadership |
| **Cost approval** | Finance | Finance Manager, Accountant | Finance, leadership |
| **Material schedules** | Quantity Surveyor, Engineering | Projects Manager / QS issue it | Commercial, Engineering, leadership |
| **Project budgets** | Finance | Finance Manager, GM, MD | Finance, Commercial, Operations, leadership |
| **Loans** | Finance | Finance Manager, MD | Finance, MD, GM, Operations |
| **Payment requests** | Finance | Finance Manager, GM, MD | Finance, leadership |

---

## Part 8 — The five things most likely to go wrong

Ranked by how often they actually happened in the first three months of use.

1. **A request stops at Pricing.** Procurement saves prices but never presses *Send to Finance*. Check the Pricing queue weekly.
2. **A budget stays in draft.** It looks finished, so nobody activates it — and it measures nothing until they do. The budget-health strip now names these.
3. **Nobody raises the purchase order after Finance approves.** The money is reserved and the site waits.
4. **A schedule is never issued**, so no budget is generated and every request charges contingency.
5. **Payment requests are submitted and never reviewed.** They do not chase themselves beyond the 2-day flag.

Every one of these is now visible on a screen. None of them was before.

---

## Part 9 — Where to look when something seems wrong

| Question | Where |
|---|---|
| "Why is my request stuck?" | Open it — the banner on the request says exactly what is blocking it and what clears it |
| "Where has the money gone on this site?" | Project Budgets → the site's budget |
| "What is late?" | Your inbox / My Queue |
| "Why does this charge contingency?" | The item's cost code badge — it means no schedule line matched |
| "Is the accounting complete?" | Finance page → *Cost subledger ⇄ general ledger*. Zero unposted is healthy |
| "What is wrong with our budgets?" | Project Budgets → the budget-health strip at the top |

---

*This workbook describes the system as it behaves after the August 2026 workflow remediation. Where a figure is quoted, it was measured on the live system on 19 August 2026.*
