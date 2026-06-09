# Pymble Ops Role Permission Matrix

Last updated: 2026-06-07

This document records the approved production role model for Pymble Operations. Update it whenever role behavior, account limits, module visibility, or staff-management rules change.

## Account Hierarchy

| Role | Account count | Staff account powers | Delete/deactivate limits | Access register visibility |
| --- | --- | --- | --- | --- |
| Developer | One | Full technical superadmin | Cannot be deleted or deactivated in the app | Hidden |
| Managing Director | One | Can create and deactivate every operational role | Cannot delete or deactivate Developer | Visible |
| General Manager | Many | Can create and deactivate staff except Managing Director | Cannot delete or deactivate Developer or Managing Director | Visible |
| Human Resource | Many | Can create and deactivate staff except Managing Director and General Manager | Cannot delete or deactivate Developer, Managing Director, or General Manager | Visible |
| Operations Manager | Many | None for staff accounts | Cannot deactivate staff accounts | Visible |
| Projects Manager | Many | None for staff accounts | Cannot deactivate staff accounts | Visible |
| Procurement Manager | Many | None for staff accounts | Cannot deactivate staff accounts | Visible |
| Quantity Surveyor | Many | None for staff accounts | Cannot deactivate staff accounts | Visible |
| Procurement | Many | None for staff accounts | Cannot deactivate staff accounts | Visible |
| Procurement Assistant | Many | None for staff accounts | Cannot deactivate staff accounts | Visible |
| Finance Manager | Many | None for staff accounts | Cannot deactivate staff accounts | Visible |
| Accountant | Many | None for staff accounts | Cannot deactivate staff accounts | Visible |
| Engineer | Many | None for staff accounts | Cannot deactivate staff accounts | Visible |
| HSE Officer | Many | None for staff accounts | Cannot deactivate staff accounts | Visible |
| HSE Assistant Officer | Many | None for staff accounts | Cannot deactivate staff accounts | Visible |
| Admin / Receptionist | Many | None for staff accounts | Cannot deactivate staff accounts | Visible |

## Module Visibility Rule

- Developer sees every ready module and every registry entry.
- Managing Director sees every ready module.
- General Manager sees executive and operational oversight modules required for management.
- Human Resource sees HR, staff, profile, fleet people logistics, and relevant administrative controls.
- Each department role sees only the modules needed for its operational workflow.
- Planned or registry-only modules do not appear in the daily sidebar.
- `/ops/modules` remains a role-aware registry, not a sidebar item.

## Enforcement Points

- Source policy: `src/lib/ops/role-policy.ts`
- Route visibility: `src/lib/ops/constants.ts` and `src/lib/ops/permissions.ts`
- Staff creation/deactivation: `src/lib/ops/permissions.ts`
- Staff server actions: `src/lib/ops/staff-actions.ts`
- Regression tests: `tests/ops-production-readiness.test.ts` and `tests/ops-permissions.test.ts`

## Production Rule

Any future permission change must update this document, the role policy source file, and the focused tests in the same work session.
