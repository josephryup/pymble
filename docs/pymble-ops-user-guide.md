# Pymble Operations — User Guide

This guide explains how to use **Pymble Operations** (`ops.pymbleconstruction.com`) for each
staff role. It covers getting into the system, what each role can see and do, and the typical
daily workflow per role.

> Access is **invitation only**. There is no public sign-up. A new account always starts with an
> email invitation sent by the Developer, Managing Director, General Manager, or Human Resource.

---

## 1. Getting started (everyone)

### Receiving your invitation
1. You will receive an email titled from **Pymble Operations** with a secure sign-in link.
2. Click the link. It opens Pymble Operations and signs you in automatically.
3. You land on your **Profile** page with a welcome message.
4. Under **Password**, set a new password (at least 8 characters) and confirm it. This is the
   password you will use to sign in from now on.
5. Optionally update your **Full name** and **Phone**, then **Save profile**.

> If you never set a password after accepting the invite, use **Forgot password** on the login
> page to set one before you can sign in with email + password.

### Signing in
1. Go to `https://ops.pymbleconstruction.com/ops/login`.
2. Enter your email and password, then **Sign in**.

### Forgot / reset password
1. On the login page, type your email in the **Email** field.
2. Click **Forgot password**. If the account exists, a reset email is sent (the message is the
   same whether or not the email is registered, for security).
3. Open the email, click the link, and you are taken to **Profile → Password** to set a new one.

### Your profile (everyone)
The **Profile** page is available to every role and includes:
- **Personal details** — update your name and phone (email is fixed).
- **Password** — change your password at any time.
- **Employee Self-Service** — if HR has linked an employee record to your account, you can see
  your employee number, leave balances, training/certificate status, request leave, and upload or
  download your own HR documents.
- **Session** — sign out of the current browser.

---

## 2. How access works

- Every role sees a **curated navigation menu** with only the modules relevant to that role.
- The **Overview** dashboard and **Profile** are available to all operational roles.
- Sensitive actions (creating staff, approving over a threshold, deactivating accounts) are
  further restricted inside each module, even for roles that can open the page.
- The **Developer** role can see and do everything; it is the technical administrator account.

---

## 3. Roles at a glance

| Role | Primary focus |
| --- | --- |
| Developer | Technical administrator — full access, system settings, account recovery |
| Managing Director | Top executive — full visibility, final approvals |
| General Manager | Company-wide operations leadership and approvals |
| Operations Manager | Day-to-day site delivery, requests, procurement coordination |
| Projects Manager | Project delivery, BOQ, budgets, commercial follow-through |
| Engineer | Site engineering, QA/QC, daily reports, materials |
| Procurement Manager | Sourcing, RFQs, purchase orders, supplier management |
| Procurement | Buying and supplier coordination |
| Procurement Assistant | Supporting procurement and stores administration |
| Quantity Surveyor | Measurement, BOQ, valuations, claims, invoices |
| Finance Manager | Budgets, payments, invoices, supplier ageing |
| Accountant | Day-to-day finance processing and records |
| HSE Officer | Safety incidents, inspections, compliance |
| HSE Assistant Officer | Supports HSE recording and compliance |
| Human Resource | Staff accounts, employees, leave, payroll inputs |
| Admin / Receptionist | Front-office support, records, basic HR/attendance |

---

## 4. Staff account management (who can invite whom)

Account creation and deactivation happen under **Staff** (`/ops/staff`), available to the
Developer, Managing Director, General Manager, and Human Resource.

**Who can create which role:**

| Creator | Can create |
| --- | --- |
| Developer | Any role |
| Managing Director | Any role |
| General Manager | Any role **except** Managing Director |
| Human Resource | Any role **except** Managing Director and General Manager |

**Rules:**
- Only **one active Managing Director** account is allowed at a time.
- A creator can only deactivate accounts at or below their own authority (e.g. a General Manager
  cannot deactivate a Managing Director; nobody can deactivate the Developer).
- Creating a staff member sends them an **email invitation** automatically.
- You **cannot deactivate your own account**.

> **Setup prerequisite for invitations & resets:** invite and password-reset emails are sent
> through Supabase Auth's email service. For reliable delivery in production, custom SMTP must be
> configured in the Supabase dashboard (see `docs/pymble-ops-setup.md` → "Invite and
> password-reset email"). Without it, these emails are heavily rate-limited.

---

## 5. Role-by-role guide

Each role below lists the **modules visible in its menu** (verified against the live access
rules) and a typical workflow.

### Developer (technical administrator)
**Sees:** Everything — all operations, commercial, records, engineering, procurement, finance,
fleet, HSE, HR, and executive modules, plus **Staff** and **Settings**.
**Use it for:** First-time setup, creating the Managing Director account, configuring company
**Settings** (HQ details, invoice defaults, approval thresholds), and recovering access. The
Developer can override approval decisions.

### Managing Director
**Sees:** Every module, including **Executive Dashboard**, **Staff**, and **Settings**.
**Workflow:** Review the Executive Dashboard for cashflow, project delay, profitability, safety,
and risk; clear high-level **Approvals**; oversee staffing. Final sign-off authority.

### General Manager
**Sees:** Every operational, commercial, finance, fleet, HSE, HR, and executive module, plus
**Staff** and **Settings**.
**Workflow:** Run company-wide operations, action the **Approvals** queue, monitor the
**Executive Dashboard**, and manage staff (except the Managing Director).

### Operations Manager
**Sees:** Overview, Projects and Sites, Workers, Attendance, Approvals, Notifications, Photos,
Documents, Daily Site Reports, Material Requests, Site Instructions and QA/QC, Suppliers, RFQs and
Purchase Orders, Stores and Inventory, Delivery Exceptions, Payment Requests, Equipment, Fleet and
Logistics, Incidents and Actions, HSE Compliance.
**Workflow:** Coordinate sites and crews, record/review **Attendance**, raise and approve
**Material Requests**, push approved requests into procurement, track **Stores** and **Delivery
Exceptions**, and keep site delivery moving.

### Projects Manager
**Sees:** Overview, Projects and Sites, Workers, Attendance, Approvals, Notifications, BOQ,
Photos, Documents, Daily Site Reports, Material Requests, Site Instructions and QA/QC, Suppliers,
RFQs and Purchase Orders, Stores and Inventory, Delivery Exceptions, Project Budgets, Payment
Requests, Equipment, Fleet and Logistics, Incidents and Actions, HSE Compliance, IPCs/Variations/Claims.
**Workflow:** Own project delivery end to end — **BOQ**, **Project Budgets**, daily progress via
**Daily Site Reports**, engineering control through **Site Instructions and QA/QC**, and
commercial follow-through via **IPCs, Variations, and Claims**.

### Engineer
**Sees:** Overview, Projects and Sites, Workers, Attendance, Approvals, Notifications, BOQ,
Photos, Documents, Daily Site Reports, Material Requests, Site Instructions and QA/QC, Stores and
Inventory, Delivery Exceptions, Equipment, Fleet and Logistics, Incidents and Actions, HSE
Compliance, IPCs/Variations/Claims.
**Workflow:** Capture **Daily Site Reports**, issue and inspect **Site Instructions / QA/QC**
(tests, snags, drawings), raise **Material Requests**, and log safety items.

### Procurement Manager
**Sees:** Overview, Projects and Sites, Approvals, Notifications, BOQ, Documents, Daily Site
Reports, Material Requests, Suppliers, RFQs and Purchase Orders, Stores and Inventory, Delivery
Exceptions, Payment Requests, Equipment, Fleet and Logistics.
**Workflow:** Turn approved **Material Requests** into **RFQs**, compare supplier quotes, award
into **Purchase Orders**, manage PO approvals and issuance, and maintain **Suppliers**.

### Procurement
**Sees:** Overview, Projects and Sites, Approvals, Notifications, BOQ, Documents, Material
Requests, Suppliers, RFQs and Purchase Orders, Stores and Inventory, Delivery Exceptions, Payment
Requests, Equipment, Fleet and Logistics.
**Workflow:** Run day-to-day buying — prepare RFQs, capture supplier quotes, progress POs, and
coordinate deliveries and stores.

### Procurement Assistant
**Sees:** Overview, Projects and Sites, Approvals, Notifications, BOQ, Documents, Material
Requests, Suppliers, RFQs and Purchase Orders, Stores and Inventory, Delivery Exceptions.
**Workflow:** Support procurement — assemble RFQ packages, record supplier details, log
deliveries and **Delivery Exceptions**, and keep stores records current.

### Quantity Surveyor
**Sees:** Overview, Projects and Sites, Approvals, Notifications, BOQ, Invoices, Documents, Daily
Site Reports, Material Requests, Site Instructions and QA/QC, Suppliers, RFQs and Purchase Orders,
Stores and Inventory, Delivery Exceptions, Project Budgets, Payment Requests, Equipment, Fleet and
Logistics, IPCs/Variations/Claims.
**Workflow:** Measure and value work — maintain **BOQ**, track **Project Budgets**, prepare
**Invoices**, and manage **IPCs, Variations, and Claims**.

### Finance Manager
**Sees:** Overview, Projects and Sites, Workers, Attendance, Approvals, Notifications, Payroll,
BOQ, Invoices, Documents, Daily Site Reports, Suppliers, RFQs and Purchase Orders, Stores and
Inventory, Delivery Exceptions, Project Budgets, Payment Requests, Equipment, Fleet and Logistics,
IPCs/Variations/Claims.
**Workflow:** Control budgets and cashflow — approve **Project Budgets**, process **Payment
Requests**, review supplier ageing, raise client **Invoices**, and oversee **Payroll** runs.

### Accountant
**Sees:** Same modules as Finance Manager (Overview, Projects and Sites, Workers, Attendance,
Approvals, Notifications, Payroll, BOQ, Invoices, Documents, Daily Site Reports, Suppliers, RFQs
and Purchase Orders, Stores and Inventory, Delivery Exceptions, Project Budgets, Payment Requests,
Equipment, Fleet and Logistics, IPCs/Variations/Claims).
**Workflow:** Day-to-day finance processing — capture **Payment Requests**, reconcile invoices
and supplier records, and support payroll and budget tracking.

### HSE Officer
**Sees:** Overview, Projects and Sites, Workers, Attendance, Approvals, Notifications, Photos,
Documents, Daily Site Reports, Site Instructions and QA/QC, Equipment, Fleet and Logistics,
Incidents and Actions, HSE Compliance.
**Workflow:** Record **Incidents and Actions** (near misses, investigations, corrective actions)
and manage **HSE Compliance** — PPE, toolbox talks, training, inspections, risk assessments, and
audit actions. Attach **Photos** as evidence.

### HSE Assistant Officer
**Sees:** Same modules as HSE Officer.
**Workflow:** Support HSE recording — log toolbox talks, inspections, PPE issues, and incident
details; help close corrective actions.

### Human Resource
**Sees:** Overview, Projects and Sites, Workers, Attendance, Approvals, Notifications, Payroll,
Documents, **Staff**, Fleet and Logistics, Employees and Leave.
**Workflow:** Manage **Staff** accounts (invite/deactivate within HR authority), maintain
**Employees and Leave** (employee files, recruitment, contracts, appraisals, leave approvals, HR
documents), and feed **Payroll** and **Attendance**.

### Admin / Receptionist
**Sees:** Overview, Projects and Sites, Workers, Attendance, Approvals, Notifications, Payroll,
Documents, Fleet and Logistics, Employees and Leave.
**Workflow:** Front-office support — keep **Workers** and **Attendance** records current, help
with **Employees and Leave** administration, manage **Documents**, and coordinate **Fleet and
Logistics** bookings.

---

## 6. Common workflows across roles

- **Approvals:** Submitted records (requests, POs, budgets, payments) flow into the **Approvals**
  queue of the roles authorised to decide them. Approvers review, then approve or reject with a
  reason; history is kept for traceability.
- **Notifications:** The **Notifications** page lists alerts and workflow messages that need your
  attention. Clear them as you action items.
- **Documents:** Upload, version, and review controlled internal documents. Access follows role.
- **Photos:** Capture progress, delivery, and safety photo logs against a site.

---

## 7. Support

- **Email:** see the support address shown in the app footer / `OPS_BRAND.supportEmail`.
- **Account locked out or no invite email?** Ask a Developer, Managing Director, General Manager,
  or Human Resource to re-send the invitation or confirm your account is active.
