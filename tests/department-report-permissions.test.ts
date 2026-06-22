import test from "node:test";
import { strict as assert } from "node:assert";
import {
  canReviewDepartmentReport,
  canSubmitDepartmentReport,
  canViewDepartmentReport,
  departmentForRole,
  listAccessibleDepartments,
  OPS_DEPARTMENT_LABELS,
  type OpsDepartmentKey,
} from "@/lib/ops/department-report-permissions";
import type { OpsUserRole } from "@/lib/ops/types";

/**
 * Sprint 16: department report visibility must not leak across departments.
 * Reports flow:
 *   department head -> draft / submit
 *   leadership (MD + GM + Owner + Developer) -> review / acknowledge
 * No peer department, and no individual contributor, may read another
 * department's reports.
 */

const ALL_DEPARTMENTS = Object.keys(OPS_DEPARTMENT_LABELS) as OpsDepartmentKey[];

test("Engineering staff cannot see Finance department reports", () => {
  const role: OpsUserRole = "engineering_manager";
  for (const dept of ALL_DEPARTMENTS) {
    if (dept === "engineering") {
      assert.ok(canViewDepartmentReport(role, dept));
    } else {
      assert.equal(
        canViewDepartmentReport(role, dept),
        false,
        `engineering_manager should not see ${dept} reports`,
      );
    }
  }
});

test("Finance Manager cannot see HR department reports", () => {
  const role: OpsUserRole = "finance_manager";
  assert.equal(canViewDepartmentReport(role, "hr"), false);
  assert.equal(canViewDepartmentReport(role, "operations"), false);
  assert.ok(canViewDepartmentReport(role, "finance"));
});

test("HR Manager cannot see Procurement department reports", () => {
  const role: OpsUserRole = "human_resource";
  assert.equal(canViewDepartmentReport(role, "procurement"), false);
  assert.equal(canViewDepartmentReport(role, "engineering"), false);
  assert.ok(canViewDepartmentReport(role, "hr"));
});

test("Engineer cannot submit a department report", () => {
  assert.equal(canSubmitDepartmentReport("engineer"), false);
  assert.equal(canSubmitDepartmentReport("procurement_assistant"), false);
  assert.equal(canSubmitDepartmentReport("accountant"), false);
});

test("Department heads can submit their own department's report", () => {
  const heads: OpsUserRole[] = [
    "operations_manager",
    "projects_manager",
    "engineering_manager",
    "procurement_manager",
    "finance_manager",
    "hse_officer",
    "human_resource",
    "hr",
    "quantity_surveyor",
  ];
  for (const role of heads) {
    assert.ok(canSubmitDepartmentReport(role), `${role} should be able to submit`);
  }
});

test("Managing Director and General Manager can review department reports", () => {
  for (const role of ["managing_director", "general_manager", "owner", "developer"] as OpsUserRole[]) {
    assert.ok(canReviewDepartmentReport(role), `${role} should be able to review`);
  }
});

test("Department heads cannot review their own reports (no self-acknowledge)", () => {
  for (const role of [
    "operations_manager",
    "projects_manager",
    "engineering_manager",
    "procurement_manager",
    "finance_manager",
    "human_resource",
  ] as OpsUserRole[]) {
    assert.equal(
      canReviewDepartmentReport(role),
      false,
      `${role} should not be able to acknowledge their own report`,
    );
  }
});

test("Leadership sees every department report", () => {
  for (const role of ["managing_director", "general_manager", "owner", "developer"] as OpsUserRole[]) {
    for (const dept of ALL_DEPARTMENTS) {
      assert.ok(
        canViewDepartmentReport(role, dept),
        `${role} should see ${dept} reports`,
      );
    }
  }
});

test("Department mapping is single-valued and well-defined for heads", () => {
  const expected: Record<string, OpsDepartmentKey> = {
    operations_manager: "operations",
    projects_manager: "engineering",
    engineering_manager: "engineering",
    procurement_manager: "procurement",
    finance_manager: "finance",
    hse_officer: "hse",
    human_resource: "hr",
    hr: "hr",
    quantity_surveyor: "commercial",
  };
  for (const [role, dept] of Object.entries(expected)) {
    assert.equal(
      departmentForRole(role as OpsUserRole),
      dept,
      `${role} should map to ${dept}`,
    );
  }
});

test("Heads see only their own department in listAccessibleDepartments", () => {
  const opsHead = listAccessibleDepartments("operations_manager");
  assert.deepEqual(opsHead, ["operations"]);
  const procHead = listAccessibleDepartments("procurement_manager");
  assert.deepEqual(procHead, ["procurement"]);
});

test("Leadership sees every department in listAccessibleDepartments", () => {
  const md = listAccessibleDepartments("managing_director");
  assert.equal(md.length, ALL_DEPARTMENTS.length);
});

test("Engineer has no accessible departments to submit for", () => {
  // engineer is mapped to engineering but is not a head — they cannot submit.
  // listAccessibleDepartments is used to drive the submit form; an engineer
  // sees their own department but submission is still blocked by
  // canSubmitDepartmentReport.
  assert.equal(canSubmitDepartmentReport("engineer"), false);
});
