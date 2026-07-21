# Pymble Operations — Team Guide

**System:** ops.pymbleconstruction.com  
**Updated:** June 2026

This guide covers every role in the Pymble Operations workspace: what each role can see, what actions they can take, and the step-by-step flow for each major process. Read your role section plus the department section that applies to you.

---

## Table of Contents

1. [How Access Works](#how-access-works)
2. [Role Reference Table](#role-reference-table)
3. [Leadership Roles](#leadership-roles)
4. [Operations Department](#operations-department)
5. [Engineering Department](#engineering-department)
6. [Procurement Department](#procurement-department)
7. [Finance Department](#finance-department)
8. [HSE Department](#hse-department)
9. [HR and Administration Department](#hr-and-administration-department)
10. [Commercial Department](#commercial-department)
11. [Site Supervisors and Managers](#site-supervisors-and-managers)
12. [Cross-Department Flows](#cross-department-flows)

---

## How Access Works

Every staff member signs in at **ops.pymbleconstruction.com** using the email invitation sent by HR or the Managing Director.

- Your **role** is set when your account is created.
- You only see modules relevant to your role — other modules are hidden from the sidebar.
- Some records are further restricted: for example, Department Reports are only visible within the originating department (and to leadership once submitted).
- All actions are logged in an audit trail. Nothing is permanently deleted; records are archived.

**Offline use:** The site works offline on mobile. Forms you submit while offline are held in an outbox and sent automatically when connectivity returns. A sync indicator appears in the top-right corner.

---

## Role Reference Table

| Role | Label | Department |
|---|---|---|
| `developer` | Developer | System |
| `owner` | Owner | Executive |
| `managing_director` | Managing Director | Executive |
| `general_manager` | General Manager | Executive |
| `manager` | Manager | Operations |
| `operations_manager` | Operations Manager | Operations |
| `projects_manager` | Projects Manager | Operations |
| `engineering_manager` | Engineering Manager | Engineering |
| `engineer` | Engineer | Engineering |
| `quantity_surveyor` | Quantity Surveyor | Commercial |
| `procurement_manager` | Procurement Manager | Procurement |
| `procurement` | Procurement Officer | Procurement |
| `procurement_assistant` | Procurement Assistant | Procurement |
| `finance_manager` | Finance Manager | Finance |
| `accountant` | Accountant | Finance |
| `hse_officer` | HSE Officer | HSE |
| `hse_assistant_officer` | HSE Assistant Officer | HSE |
| `human_resource` | Human Resource Manager | HR |
| `hr` | HR Officer | HR |
| `admin_receptionist` | Admin / Receptionist | HR/Admin |
| `supervisor` | Supervisor | Site |
| `crew` | Crew Member | Site (no login) |

---

## Leadership Roles

**Applies to:** Owner · Managing Director · General Manager · Developer

### What you can access
All modules without exception — every department's data is visible to leadership.

### Leadership-specific features

#### Department Reports Dashboard
Navigate to **Department Reports** → you see the leadership dashboard, not the department list.

- **Summary tiles** at the top show: Pending Review, Needs Revision, Acknowledged This Month, Active Departments.
- Departments with pending or revision-requested reports appear **first** (highlighted in blue).
- Each department card shows the latest report title, date, and status. Click the report title to open it.
- Click **View all [Department] reports →** on any card to drill into that department's full list.
- Click **← All departments** to return to the dashboard.

**Reviewing a report:**
1. Open the report from the dashboard.
2. Scroll to the **Leadership decision** panel.
3. Add optional review notes.
4. Click **Acknowledge** (report is accepted) or **Request revisions** (returned to the submitter).
5. The submitter receives a notification automatically.

#### Approval Queue
Leadership approves Purchase Orders, Payment Requests, and other escalated records via the **Approvals** module. Each approval shows the record details, amount, and the approval chain.

#### Executive Dashboard
Go to **Executive Dashboard** for the cross-department health view: action queues, cashflow, delay flags, safety summary, and profitability.

#### Payroll
Leadership can see all payroll data, approve payroll runs, and mark them as paid. See the [Payroll Flow](#payroll-flow) in the HR section for the full process.

#### Staff Management
Leadership can create new staff accounts via **Staff → Invite staff**. Set the role, send the invite. The staff member receives an email to set their password.

---

## Operations Department

**Roles:** Operations Manager · Projects Manager · Manager · Supervisor

### Operations Manager / Projects Manager

#### Modules accessible
Overview · Sites · Workers · Attendance · Approvals · Notifications · Payroll · Material Requests · RFQ and PO · Stores and Inventory · Delivery Exceptions · Project Budgets · Payment Requests · Equipment · Fleet and Logistics · Daily Site Reports · Department Reports · Subcontractors · Photos · Documents · Suppliers · BOQ

#### Key flows

**Attendance → Payroll loop:**
1. Go to **Attendance**. Select a site.
2. Record daily attendance for each worker: hours worked, clock-in / clock-out. The system calculates standard pay and overtime pay automatically.
3. When ready, approve the attendance record. Approved records become available for payroll.
4. Go to **Payroll** → **Create payroll run**. Enter the period label (e.g. "June Week 2"), start and end date. Click **Create run**.
5. Review the line items — each worker shows Gross, OT Hours, OT Pay, Advance Deducted, and Net Pay.
6. Click **Approve** on the run to send it to Finance for payment.

**Cash advance:**
1. Go to **Payroll** → **Record cash advance**.
2. Select the worker, enter the amount and issue date. Add a note (e.g. "School fees").
3. Submit. The advance shows as **Open** until a payroll run deducts it.
4. To remove an advance that should not be deducted, click **Archive** next to the advance. Only open (non-deducted) advances can be archived.

**Worker management:**
1. Go to **Workers** → **Add worker**. Fill in: code, name, trade, phone, daily rate, site assignment, worker type (Casual/Permanent), MoMo details.
2. To edit an existing worker (e.g. update daily rate), find the worker in the table and click **Edit worker details** — a form expands in-place. Change what you need and click **Save**.
3. To remove a worker, click **Archive**. The worker disappears from active lists but their payroll history is preserved.

**Material requests:**
1. Go to **Material Requests** → **New request**. Select site, add line items (item name, quantity, unit, estimated cost). Submit.
2. A manager or leadership approves the request.
3. Once approved, Procurement picks it up for RFQ/PO.

**Subcontractors:**
1. Go to **Subcontractors** → **Add subcontractor**. Enter company name, registration number, contact, and compliance documents.
2. Once verified, allocate the subcontractor to project tasks with agreed rates.
3. Track interim payments, retention, and final payment from the subcontractor record.

### Supervisor / Manager (Site)

#### Modules accessible
Overview · Sites · Workers · Attendance · Approvals · Notifications · Material Requests · Stores and Inventory · Delivery Exceptions · Daily Site Reports · Project Schedule · Equipment · HSE modules · Photos · Documents

#### Key flows

**Daily site report:**
1. Go to **Daily Site Reports** → **New report**.
2. Select site, fill in: work activities, labour count, equipment on site, materials used, delays, weather, productivity notes.
3. Submit. The report is visible to engineering managers and leadership.

**Attendance recording:**
1. Go to **Attendance** → select your site.
2. For each worker on site today, click **Record attendance**. Enter clock-in and clock-out times. The system calculates hours and pay.
3. Submit the record. A manager or engineering manager will approve it.

**Material request:**
1. Go to **Material Requests** → **New request**.
2. Select site, add what you need. Submit for approval.

**Delivery inspection:**
1. When materials arrive, go to **Stores and Inventory** → **Post delivery**.
2. Match the delivery to the Purchase Order. Record actual quantities received.
3. If anything is wrong (short delivery, damage), go to **Delivery Exceptions** → **Log exception**. Attach a photo.

---

## Engineering Department

**Roles:** Engineering Manager · Engineer

### Engineering Manager

#### Modules accessible
Overview · Sites · Workers · Attendance · Approvals · Notifications · Material Requests · RFQ and PO · Stores and Inventory · Delivery Exceptions · Daily Site Reports · Engineering Controls (SI/QA/QC) · Project Schedule · Equipment · Photos · Documents · Department Reports · Subcontractors

#### Key flows

**Department report (Engineering):**
1. Go to **Department Reports** → **New report**.
2. Select department: **Engineering**. Choose period (Weekly/Monthly/Quarterly/Ad hoc).
3. Set period start and end dates. Add a title (e.g. "June 2026 Engineering Monthly Report").
4. Write the narrative — progress summary, milestones, risks, upcoming work.
5. Optionally add metrics as JSON (e.g. `{"tasks_completed": 12, "snags_open": 3}`).
6. Click **Draft a report** to save without submitting, or go to the report detail and click **Submit for review** when ready.
7. Leadership receives a notification. They acknowledge or request revisions.
8. If revision is requested, the report returns to draft. Edit it and resubmit.

**Project schedule:**
1. Go to **Project Schedule**. Select a site.
2. Add tasks: task name, planned start/end date, assigned engineer.
3. Engineers update progress percentage daily.
4. Overdue tasks are flagged automatically and a notification is sent to the Engineering Manager.

**Site instructions and QA/QC:**
1. Go to **Engineering Controls**.
2. Raise a **Site Instruction**: select site, describe the instruction, attach drawings if needed.
3. Log **Inspections** and **Tests** per activity.
4. Open **Snags** for defects found. Close snags once rectified with evidence.

**Attendance approval:**
Engineering Managers approve attendance records submitted by supervisors for their site.

### Engineer

#### Modules accessible
Overview · Sites · Attendance · Approvals · Notifications · Material Requests · Stores and Inventory · Delivery Exceptions · Daily Site Reports · Engineering Controls · Project Schedule · Photos · Documents · Department Reports

#### Key flows

**Progress updates:**
1. Go to **Project Schedule** → find your assigned tasks.
2. Update the percentage complete for each task.
3. The system recalculates site completion automatically.

**Daily site report:**
Same as Supervisor above.

**Material requests:**
1. Go to **Material Requests** → **New request**.
2. List items needed with quantities and estimated costs. Submit.

---

## Procurement Department

**Roles:** Procurement Manager · Procurement Officer · Procurement Assistant

### Procurement Manager

#### Modules accessible
Overview · Sites · Workers · Attendance · Approvals · Notifications · Material Requests · RFQ and PO · Stores and Inventory · Delivery Exceptions · Project Budgets · Payment Requests · Equipment · Suppliers · BOQ · Documents · Department Reports · Subcontractors

#### Key flows

**RFQ to Purchase Order flow:**
1. Go to **RFQ and PO** → **New RFQ**.
2. Fill in: title, site, description, link to a material request (optional), due date.
3. Add line items: item name, specification, quantity, unit, estimated cost.
4. **Invite suppliers**: click **Invite supplier** on each line. Add supplier from the master list or type a free-text name.
5. Once suppliers are invited, the RFQ status becomes **Issued**.
6. When quotes are received, go to the RFQ → **Record quote** for each supplier. Enter their quoted total.
7. Compare quotes. Click **Award** on the best quote. A draft Purchase Order is created automatically.
8. Go to the Purchase Order → review the title and amount. If corrections are needed, click **Edit purchase order**, update the title or total amount, click **Save changes**.
9. Click **Request approval** to send the PO for approval. Leadership approves above the threshold.
10. Once approved, click **Issue PO**. The status becomes **Issued**.
11. Download the PDF to send to the supplier.

**Department report (Procurement):**
Same flow as Engineering Manager, but select department: **Procurement**.

**Supplier management:**
1. Go to **Suppliers** → **Add supplier**.
2. Enter company name, registration, contact details, compliance documents.
3. Set status to **Active** when verified.

### Procurement Officer / Assistant

#### Modules accessible
Overview · Sites · Attendance · Approvals · Notifications · Material Requests · RFQ and PO · Stores and Inventory · Delivery Exceptions · Suppliers · Documents

#### Key flows

**Recording quotes and managing RFQs:**
Same as Procurement Manager except: cannot award quotes or issue POs. These require Procurement Manager or above.

**Stores and delivery:**
1. Go to **Stores and Inventory** → **Post delivery** when materials arrive.
2. Select the Purchase Order. Enter quantities received and batch/lot number.
3. If short or damaged, log in **Delivery Exceptions**.

---

## Finance Department

**Roles:** Finance Manager · Accountant

### Finance Manager

#### Modules accessible
Overview · Sites · Workers · Attendance · Approvals · Notifications · Payroll · Invoices · Project Budgets · Payment Requests · Equipment · Suppliers · BOQ · Documents · Department Reports · Subcontractors

#### Key flows

**Department report (Finance):**
Finance Manager submits periodic reports for the Finance department. Same flow as Engineering Manager.

**Payment requests:**
1. Go to **Payment Requests** → **New request**.
2. Select supplier, site, invoice reference, amount. Attach supporting documents.
3. Submit. Finance Manager approves internally; Managing Director approves above the threshold.
4. Once approved, payment is processed externally. Mark the request as paid.

**Invoices:**
1. Go to **Invoices** → **New invoice**.
2. Select client (project), add line items (description, quantity, rate). The system applies VAT automatically.
3. Review the ZRA-compliant invoice number (auto-generated, monotonically increasing per ZRA rules).
4. Download the PDF. Send to the client.

**Project budgets:**
1. Go to **Project Budgets**. Select a site.
2. Set approved budget per cost category.
3. The system tracks actual spend versus budget in real time.

**Payroll approval (Finance sign-off):**
Finance Manager can select staff for a payroll run, set whether NAPSA/NHIMA/WCF contributions apply to each employee, approve the run, and click **Mark paid** once staff are paid via MoMo or cash. PAYE remains calculated for included staff. Payroll runs must not be marked paid until funds leave the account.

### Accountant

#### Modules accessible
Overview · Sites · Attendance · Approvals · Notifications · Payroll · Invoices · Project Budgets · Payment Requests · Suppliers · BOQ · Documents · Department Reports

Same flows as Finance Manager for routine work. Cannot manage staff accounts or settings.

---

## HSE Department

**Roles:** HSE Officer · HSE Assistant Officer

### HSE Officer

#### Modules accessible
Overview · Sites · Attendance · Approvals · Notifications · Daily Site Reports · HSE Incidents and Actions · HSE Compliance · Weekly HSE Report · Photos · Documents · Department Reports

#### Key flows

**Incident report:**
1. Go to **Incidents and Actions** → **Log incident**.
2. Select site, incident type (Incident/Near Miss/Unsafe Condition), date/time, description.
3. Assign a corrective action: responsible person, due date.
4. Submit. The system notifies site management.
5. When the corrective action is complete, close it with evidence (photo or note).

**Toolbox talk:**
1. Go to **HSE Compliance** → **New toolbox talk**.
2. Select site, topic, date. List attendees.
3. Submit.

**Weekly HSE report:**
1. Go to **Weekly HSE Report** → **New report**.
2. The form auto-populates from the week's incident and compliance records.
3. Review, add narrative, submit to leadership.

**Department report (HSE):**
HSE Officer submits periodic reports for the HSE department. Same flow as Engineering Manager, select department: **HSE**.

### HSE Assistant Officer

Same flows as HSE Officer. Cannot approve corrective actions or submit the Weekly HSE Report without the HSE Officer's review.

---

## HR and Administration Department

**Roles:** Human Resource Manager · HR Officer · Admin / Receptionist

### Human Resource Manager

#### Modules accessible
Overview · Sites · Workers · Attendance · Approvals · Notifications · Payroll · Employees and Leave · Recruitment · Documents · Photos · Department Reports · Staff (invite/manage accounts)

#### Key flows

**Department report (HR):**
Submits periodic reports for the HR department. Same flow as Engineering Manager, select department: **HR**.

**Onboarding a new employee:**
1. Go to **Employees and Leave** → **Add employee**. Fill in personal details, job title, employment type, start date, contract.
2. Go to **Staff** → **Invite staff**. Enter the same email, assign their role. They receive an invitation email.
3. If they will work on site, go to **Workers** → **Add worker**. Create their crew record with daily rate and MoMo details.

**Leave management:**
1. Go to **Employees and Leave** → find the employee.
2. Record approved leave: type (Annual/Sick/Maternity/Other), start and end dates.
3. The system calculates remaining leave balance.

**Payroll — HR view:**
1. Go to **Payroll** → review open cash advances. Archive advances that should not be deducted.
2. Review payroll runs. HR does not approve payroll runs — that is Operations Manager and Finance Manager — but HR monitors run accuracy.

**Recruitment:**
1. Go to **Recruitment** → **Post job**.
2. Applications submitted through the website appear here.
3. Move candidates through stages: Applied → Shortlisted → Interviewed → Offered → Hired.

### HR Officer

Same as Human Resource Manager except cannot manage staff accounts or access the Payroll module.

### Admin / Receptionist

#### Modules accessible
Overview · Approvals · Notifications · Documents · Employees and Leave · Recruitment · Photos

Limited to record lookup, document management, and recruitment support. Cannot submit reports or manage payroll.

---

## Commercial Department

**Roles:** Quantity Surveyor · (Finance Manager and above for sign-off)

### Quantity Surveyor

#### Modules accessible
Overview · Sites · Approvals · Notifications · Material Requests · RFQ and PO · Stores and Inventory · Delivery Exceptions · Project Budgets · Payment Requests · Suppliers · BOQ · Engineering Controls · Project Schedule · Commercial (IPC/Variations/Claims) · Documents · Department Reports

#### Key flows

**Bill of Quantities:**
1. Go to **Bill of Quantities**. Select site.
2. Add BOQ sections and line items: description, unit, quantity, rate. The system computes totals.
3. BOQ lines can seed RFQ creation directly — click **Create RFQ** from a BOQ line.

**Interim Payment Certificate:**
1. Go to **IPC, Variations and Claims** → **New IPC**.
2. Select project, measurement period. Record quantities completed against BOQ lines.
3. The system calculates the certified amount.
4. Submit for commercial manager / MD approval.

**Variations:**
1. Go to **IPC, Variations and Claims** → **New variation**.
2. Describe the scope change, add cost/time impact. Submit for approval.

**Department report (Commercial):**
Quantity Surveyor submits periodic reports for the Commercial department. Select department: **Commercial** when creating the report.

---

## Site Supervisors and Managers

**Role:** Supervisor · Manager

These roles operate at site level and focus on day-to-day delivery rather than office processes.

#### Daily routine
1. **Morning** → go to **Attendance** → record who is on site today, clock-in times.
2. **During the day** → record material deliveries in **Stores and Inventory**. Log any delivery problems in **Delivery Exceptions**. Take site photos in **Photos**.
3. **End of day** → fill in the **Daily Site Report**. Record what was done, how many workers, equipment used, progress against plan, issues.
4. **Attendance close-out** → enter clock-out times. Submit for engineering manager approval.

#### Material needs
When site is running low on materials, raise a **Material Request** — don't wait until you run out. The request goes through procurement.

#### Safety
Report any incident immediately in **Incidents and Actions**, even near misses. Attend toolbox talks and confirm attendance is recorded in **HSE Compliance**.

---

## Cross-Department Flows

### Full procurement cycle

```
Site need identified (Supervisor / Engineer)
        ↓
Material Request raised → approved by Engineering Manager / Operations Manager
        ↓
Procurement raises RFQ → invites suppliers
        ↓
Suppliers quote → Procurement records quotes
        ↓
Procurement Manager awards best quote → PO created
        ↓
PO sent for approval (MD / GM if above threshold)
        ↓
PO issued → PDF sent to supplier
        ↓
Delivery arrives → Stores records receipt against PO
        ↓
Delivery Exception raised if short/damaged
        ↓
Finance processes payment request against PO
```

### Payroll cycle (monthly or fortnightly)

```
Supervisors record daily attendance
        ↓
Engineering Manager / Operations Manager approves attendance records
        ↓
Operations Manager creates payroll run (selects period)
        ↓
System aggregates: gross pay, overtime, cash advance deductions, net pay
        ↓
Operations Manager approves payroll run
        ↓
Finance Manager reviews and marks paid after MoMo/cash disbursement
```

### Department report cycle

```
Department Head (Engineering/Procurement/Finance/HSE/HR/Commercial/Executive)
        drafts report (Weekly/Monthly/Quarterly)
        ↓
Submits for review → MD and GM receive notification
        ↓
MD/GM opens Department Reports dashboard → reviews each submitted report
        ↓
Acknowledges (closes the loop) OR requests revisions (returned to head)
        ↓
Head revises, resubmits if revisions were requested
```

### Subcontractor payment cycle

```
Subcontractor onboarded → KYC documents verified
        ↓
Allocated to project task with agreed rate and scope
        ↓
Progress recorded against task (Project Schedule)
        ↓
Interim payment certificate raised by Quantity Surveyor
        ↓
Finance raises payment request against the certificate
        ↓
MD approves → payment released
        ↓
Retention tracked until final completion
```

---

## Permission Quick Reference

| Action | Minimum role required |
|---|---|
| Create staff accounts | Managing Director / Owner / Developer |
| Edit system settings | Leadership only |
| Approve payroll run | Operations Manager |
| Mark payroll paid | Finance Manager |
| Archive cash advance | Operations Manager and above |
| Edit worker details / daily rate | Operations Manager · Projects Manager · Engineering Manager · HR |
| Archive worker | HR Manager · Leadership |
| Create PO / RFQ | Procurement Manager · Operations Manager · Projects Manager · Leadership |
| Edit draft/rejected PO | Same as create |
| Submit PO for approval | Same as create |
| Approve PO | Managing Director / General Manager (via Approval workflow) |
| Issue PO | After PO is approved — same create roles |
| Submit department report | Department heads (Engineering / Procurement / Finance / HSE / HR / Commercial managers, Leadership) |
| Review department report | Managing Director / General Manager / Owner / Developer |
| Approve attendance | Engineering Manager · Operations Manager · Projects Manager · Leadership |
| Log HSE incident | All HSE + site delivery roles |
| View payroll | Leadership · HR · Finance only |
| View department reports | Own department only; Leadership sees all |

---

*For access problems or role changes, contact the Managing Director or HR Manager.*
