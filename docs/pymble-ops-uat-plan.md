# Pymble Ops UAT Plan

Last updated: 2026-06-07

Use this plan for employee prototype testing and final production acceptance. Each role should test with a real invited account in the Pymble Supabase project, not a shared login.

## Local Role Preview

Before inviting real testers, developers can preview role-specific dashboards locally without creating Supabase Auth users.

- Run the app with `npm run dev`.
- Open `http://localhost:3000/ops/login`.
- Use the **Local role preview** panel to choose Developer, Managing Director, Finance Manager, HSE Officer, or any other approved production role.
- Preview mode is read-only. The app blocks ops API calls, document downloads, uploads, server actions, and other non-read workspace requests while the preview cookie is active.
- Use **Stop preview** or **Sign out** before returning to real Supabase authentication.
- This tool is local-only. It is disabled in production builds and on non-local hosts.

Local preview is for layout, navigation, route visibility, and dashboard scan checks. Final UAT still needs real invited accounts because Supabase Auth, email links, RLS, staff lifecycle, approvals, document permissions, and audit trails must be verified with real sessions.

## Test Rules

- Test on `https://ops.pymbleconstruction.com` for production acceptance and `http://localhost:3000/ops` for local prototype checks.
- Record the tester name, role, date, browser, device, pass/fail result, and notes.
- Do not use the Developer account for business UAT except technical verification.
- Every failed scenario needs a screenshot, the route, the exact action attempted, and expected behavior.
- Sensitive workflows must confirm both UI behavior and resulting records.

## Core Smoke Scripts

| Scenario | Roles | Expected result |
| --- | --- | --- |
| Sign in, open Overview, open Profile, sign out | Every invited role | Session stays active, profile loads, sign out returns to login |
| Sidebar visibility check | Every invited role | User sees only role-relevant modules; Developer sees all; `/ops/modules` is not in the sidebar |
| Create site and set headquarters coordinates | Developer, Managing Director, General Manager | Site appears in Projects and Sites; overview map and settings remain usable |
| Upload document and download it | Developer, Managing Director, document uploader | File is stored privately and download uses authenticated route |
| Submit approval and decide it | Requesting role plus approver role | Approval timeline, notifications, and source status update correctly |
| Create material request to PO to GRN | Engineer or PM, Procurement, Finance/MD | Request, approval, RFQ/PO, issued PO, GRN, and stock movement connect |
| Create delivery exception from GRN | Procurement or Operations | Exception appears with supplier/site links and lifecycle controls |
| Finance bridge | Finance Manager or Accountant | Budget, payment request, ageing, and cost entry surfaces load without blocked forms |
| Fleet and logistics | Operations, HR, HSE, Finance | Transport/accommodation/labour records, operator document watch, and profitability panels load |
| HSE incident to corrective action | HSE Officer, Operations, Engineer | Incident lifecycle, corrective action, notifications, and email health panel work |
| Employee and leave workflow | Human Resource, Admin/Receptionist, employee self-service | Employee file, leave, onboarding, HR documents, and profile self-service work as expected |
| Commercial controls | Quantity Surveyor, Projects Manager, Finance | Contract, valuation, IPC, variation, claim, retention, and cashflow paths load |
| Executive dashboard | Developer, Managing Director, General Manager | Executive route loads; non-leadership roles cannot access it |

## Role-Specific Acceptance

| Role | Must pass before launch |
| --- | --- |
| Developer | Readiness command, hidden account behavior, all modules accessible, protected readiness health check |
| Managing Director | Full module visibility, approval decisions, executive dashboard, staff invitation except Developer deletion |
| General Manager | Management dashboards, staff creation excluding MD, module visibility, approval oversight |
| Human Resource | Staff invitation excluding MD/GM, employee records, leave, HR documents, self-service checks |
| Operations Manager | Sites, attendance, material requests, daily reports, delivery exceptions, equipment, fleet, HSE visibility |
| Projects Manager | Project delivery, material requests, daily reports, engineering controls, suppliers, finance bridge visibility |
| Procurement Manager | Suppliers, RFQs, POs, stores, delivery exceptions, supplier performance |
| Quantity Surveyor | BOQ, project budgets, commercial controls, daily reports, procurement visibility |
| Procurement | Supplier/RFQ/PO/stores execution without staff-management powers |
| Procurement Assistant | Procurement support actions without management-only controls |
| Finance Manager | Invoices, budgets, payment requests, cashflow, supplier ageing, executive source links where allowed |
| Accountant | Finance execution routes without executive or HSE/HR-sensitive access |
| Engineer | Field reporting, material requests, engineering controls, HSE incident creation, stores visibility |
| HSE Officer | HSE incident/compliance/risk/audit workflows and HSE email health |
| HSE Assistant Officer | HSE support workflows without leadership-only staff controls |
| Admin / Receptionist | HR/admin visibility and employee support workflows without staff-account creation |

## Sign-Off

Production launch is not signed off until:

- All core smoke scripts pass.
- Managing Director accepts executive, approval, and staff workflows.
- HR accepts staff-account and employee-record behavior.
- Finance accepts budget/payment/invoice/commercial handoffs.
- Operations/Projects accepts site, procurement, fleet, and daily report workflows.
- HSE accepts incident, compliance, training, email alert, and audit flows.
- Developer confirms readiness checks, environment variables, cron, R2, Supabase, and rollback plan.
