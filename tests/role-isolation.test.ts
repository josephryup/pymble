import test from "node:test";
import { strict as assert } from "node:assert";
import {
  canAccessExecutiveDashboard,
  canAccessOpsHref,
  canManageEngineeringTeam,
  canReceiveEngineeringEscalations,
  canSeeCrossDepartmentSummary,
} from "@/lib/ops/permissions";
import {
  isLeadershipRole,
  isOperationsManagerRole,
} from "@/lib/ops/roles";
import { getOpsApprovalsDepartmentsForRole } from "@/lib/ops/approvals-departments";
import { canCreateOpsMaterialRequest } from "@/lib/ops/material-request-permissions";
import type { OpsUserRole } from "@/lib/ops/types";

/**
 * Role-isolation matrix. Asserts who CAN and CANNOT see each privileged
 * surface in the workspace. The point is to fail loudly the moment a role
 * acquires new visibility — accidentally or otherwise.
 *
 * Per the Pymble organogram (see docs/pymble-ops-workflow-design.md Part 17):
 *  - Managing Director, General Manager, Developer, Owner: executive view
 *  - Operations Manager: operations, plus commercial, project budgets and
 *    payment requests (added 2026-07-26 by request). Still NO executive view
 *    and NO HR data, and no budget approval / lock authority — those stay with
 *    Finance and leadership.
 *  - Engineering Manager: oversees engineers; sees engineering / site /
 *    commercial / HSE; does NOT see HR, payroll, executive
 *  - Department managers: their own department only
 */

const LEADERSHIP: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "owner",
];

const OPERATIONAL_MANAGERS: OpsUserRole[] = [
  "operations_manager",
  "projects_manager",
  "engineering_manager",
];

const DEPARTMENT_MANAGERS: OpsUserRole[] = [
  "operations_manager",
  "projects_manager",
  "engineering_manager",
  "procurement_manager",
  "finance_manager",
  "hse_officer",
  "human_resource",
];

const NON_LEADERSHIP_ROLES: OpsUserRole[] = [
  "operations_manager",
  "projects_manager",
  "engineering_manager",
  "procurement_manager",
  "quantity_surveyor",
  "procurement",
  "procurement_assistant",
  "finance_manager",
  "accountant",
  "engineer",
  "hse_officer",
  "hse_assistant_officer",
  "human_resource",
  "admin_receptionist",
  "supervisor",
  "crew",
];

test("Executive dashboard is leadership-only", () => {
  for (const role of LEADERSHIP) {
    assert.equal(
      canAccessExecutiveDashboard(role),
      true,
      `${role} should access executive dashboard`,
    );
  }

  for (const role of NON_LEADERSHIP_ROLES) {
    assert.equal(
      canAccessExecutiveDashboard(role),
      false,
      `${role} must NOT access executive dashboard (organogram)`,
    );
  }
});

test("Operations Manager has no executive privilege", () => {
  const role: OpsUserRole = "operations_manager";
  assert.equal(isLeadershipRole(role), false);
  assert.equal(isOperationsManagerRole(role), true);
  assert.equal(canAccessExecutiveDashboard(role), false);
  assert.equal(canSeeCrossDepartmentSummary(role), false);
  assert.equal(canAccessOpsHref(role, "/ops/executive"), false);
});

test("Engineering Manager exists and reports up to leadership", () => {
  const role: OpsUserRole = "engineering_manager";
  assert.equal(canManageEngineeringTeam(role), true);
  assert.equal(canReceiveEngineeringEscalations(role), true);
  // EM is below leadership on the org chart
  assert.equal(isLeadershipRole(role), false);
  assert.equal(canAccessExecutiveDashboard(role), false);
  // EM has approvals visibility in operations + commercial + HSE departments
  const departments = getOpsApprovalsDepartmentsForRole(role).map((d) => d.key);
  assert.ok(departments.includes("operations"), "EM should see operations approvals");
  assert.ok(departments.includes("commercial"), "EM should see commercial approvals");
  assert.ok(departments.includes("hse"), "EM should see HSE approvals");
  assert.equal(
    departments.includes("finance"),
    false,
    "EM should NOT see finance approvals",
  );
  assert.equal(
    departments.includes("hr"),
    false,
    "EM should NOT see HR approvals",
  );
});

test("Department managers do not see other departments' privileged data", () => {
  // Finance Manager should not be able to navigate the HR-only employees page
  assert.equal(canAccessOpsHref("finance_manager", "/ops/employees"), false);
  // HR should not see finance ledgers
  assert.equal(canAccessOpsHref("human_resource", "/ops/payment-requests"), false);
  // Procurement Manager should not see payroll
  assert.equal(canAccessOpsHref("procurement_manager", "/ops/payroll"), false);
  // HSE Officer should not see executive dashboard
  assert.equal(canAccessOpsHref("hse_officer", "/ops/executive"), false);
});

test("Leadership has full route access", () => {
  for (const role of LEADERSHIP) {
    assert.equal(canAccessOpsHref(role, "/ops/executive"), true);
    assert.equal(canAccessOpsHref(role, "/ops/staff"), true);
    assert.equal(canAccessOpsHref(role, "/ops/payroll"), true);
  }
});

test("Every department manager has approvals visibility in their own department", () => {
  const expectations: Array<[OpsUserRole, ReturnType<typeof getOpsApprovalsDepartmentsForRole>[number]["key"]]> = [
    ["operations_manager", "operations"],
    ["projects_manager", "operations"],
    ["engineering_manager", "operations"],
    ["procurement_manager", "procurement"],
    ["finance_manager", "finance"],
    ["hse_officer", "hse"],
    ["human_resource", "hr"],
  ];
  for (const [role, ownDept] of expectations) {
    const deps = getOpsApprovalsDepartmentsForRole(role).map((d) => d.key);
    assert.ok(
      deps.includes(ownDept),
      `${role} must see ${ownDept} department approvals tab`,
    );
  }
});

test("Department managers never see the 'all' tab on approvals", () => {
  // 'all' tab is reserved for leadership only
  for (const role of DEPARTMENT_MANAGERS) {
    const deps = getOpsApprovalsDepartmentsForRole(role).map((d) => d.key);
    assert.equal(
      deps.includes("all"),
      false,
      `${role} (department manager) must NOT see the 'all' tab`,
    );
  }
});

test("HSE can reach Material Requests to raise PPE requisitions", () => {
  // HSE orders PPE / safety equipment through the material request flow, so the
  // nav + page access must be granted, not just the create permission.
  for (const role of ["hse_officer", "hse_assistant_officer"] as OpsUserRole[]) {
    assert.equal(
      canAccessOpsHref(role, "/ops/material-requests"),
      true,
      `${role} should be able to open Material Requests`,
    );
  }
});

test("Every material-request creator role can reach the page", () => {
  // The bug that hid PPE requisitions from HSE: a role could create a material
  // request (backend permission) but not open the page (nav/access list).
  // Guard the invariant — create permission implies page access. (Viewers like
  // engineering_manager may have access without create; that direction is fine.)
  for (const role of [...LEADERSHIP, ...NON_LEADERSHIP_ROLES]) {
    if (canCreateOpsMaterialRequest(role)) {
      assert.equal(
        canAccessOpsHref(role, "/ops/material-requests"),
        true,
        `${role} can create material requests but cannot open the page`,
      );
    }
  }
});

test("Operational managers can be re-asserted exhaustively", () => {
  // Sanity: the OPERATIONAL_MANAGERS array is just a subset of DEPARTMENT_MANAGERS;
  // make sure neither array drifted independently.
  for (const role of OPERATIONAL_MANAGERS) {
    assert.ok(
      DEPARTMENT_MANAGERS.includes(role),
      `${role} should also appear in DEPARTMENT_MANAGERS list`,
    );
  }
});
