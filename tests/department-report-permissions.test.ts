import test from "node:test";
import { strict as assert } from "node:assert";
import {
  canFileDepartmentReport,
  canReviewDepartmentReport,
  canReviewDepartmentReportRecord,
  canSubmitDepartmentReport,
  canViewDepartmentReport,
  canViewDepartmentReportRecord,
  departmentForRole,
  departmentsCompiledBy,
  listAccessibleDepartments,
  OPS_DEPARTMENT_LABELS,
  reviewerRolesForReport,
  type OpsDepartmentKey,
} from "@/lib/ops/department-report-permissions";
import type { OpsUserRole } from "@/lib/ops/types";

/**
 * Two-tier weekly reporting chain:
 *   contributor (engineer / HSE officer / procurement officer)
 *     -> individual report -> line manager reviews
 *   line manager (PM / Procurement Manager / Ops Manager / ...)
 *     -> compiled department report -> MD (+GM where routed)
 * Reports are isolated: no peer department access, and contributors never
 * see a colleague's individual report.
 */

const ALL_DEPARTMENTS = Object.keys(OPS_DEPARTMENT_LABELS) as OpsDepartmentKey[];

test("Engineering staff cannot see Finance department reports", () => {
  const role: OpsUserRole = "engineering_manager";
  assert.ok(canViewDepartmentReport(role, "engineering"));
  for (const dept of ALL_DEPARTMENTS) {
    if (dept === "engineering") continue;
    assert.equal(
      canViewDepartmentReport(role, dept),
      false,
      `engineering_manager should not see ${dept} reports`,
    );
  }
});

test("Finance and HR stay isolated from other departments", () => {
  assert.equal(canViewDepartmentReport("finance_manager", "hr"), false);
  assert.equal(canViewDepartmentReport("finance_manager", "operations"), false);
  assert.ok(canViewDepartmentReport("finance_manager", "finance"));
  assert.equal(canViewDepartmentReport("human_resource", "procurement"), false);
  assert.ok(canViewDepartmentReport("human_resource", "hr"));
});

test("Projects Manager compiles Engineering, HSE and Commercial", () => {
  assert.deepEqual(departmentsCompiledBy("projects_manager").sort(), [
    "commercial",
    "engineering",
    "hse",
  ]);
  assert.ok(canViewDepartmentReport("projects_manager", "engineering"));
  assert.ok(canViewDepartmentReport("projects_manager", "hse"));
  assert.ok(canViewDepartmentReport("projects_manager", "commercial"));
  // Ops + procurement compiled reports also route TO the PM for review.
  assert.ok(canViewDepartmentReport("projects_manager", "operations"));
  assert.ok(canViewDepartmentReport("projects_manager", "procurement"));
  assert.equal(canViewDepartmentReport("projects_manager", "finance"), false);
  assert.deepEqual(listAccessibleDepartments("projects_manager").sort(), [
    "commercial",
    "engineering",
    "hse",
    "operations",
    "procurement",
  ]);
});

test("Contributors file individual reports; managers file compiled ones", () => {
  assert.ok(canFileDepartmentReport("engineer", "engineering", "individual"));
  assert.equal(canFileDepartmentReport("engineer", "engineering", "compiled"), false);
  assert.ok(canFileDepartmentReport("hse_officer", "hse", "individual"));
  assert.ok(canFileDepartmentReport("procurement", "procurement", "individual"));
  assert.equal(canFileDepartmentReport("procurement", "procurement", "compiled"), false);
  // QS follows the engineer workflow: individual to the PM, not compiled.
  assert.ok(canFileDepartmentReport("quantity_surveyor", "commercial", "individual"));
  assert.equal(canFileDepartmentReport("quantity_surveyor", "commercial", "compiled"), false);

  assert.ok(canFileDepartmentReport("projects_manager", "engineering", "compiled"));
  assert.ok(canFileDepartmentReport("projects_manager", "hse", "compiled"));
  assert.ok(canFileDepartmentReport("projects_manager", "commercial", "compiled"));
  assert.ok(canFileDepartmentReport("procurement_manager", "procurement", "compiled"));
  assert.ok(canFileDepartmentReport("operations_manager", "operations", "compiled"));
  assert.ok(canFileDepartmentReport("accountant", "finance", "compiled"));
  assert.ok(canFileDepartmentReport("it_manager", "it", "compiled"));

  // Cross-department filing stays blocked.
  assert.equal(canFileDepartmentReport("engineer", "finance", "individual"), false);
  assert.equal(canFileDepartmentReport("it_manager", "finance", "compiled"), false);

  for (const role of ["engineer", "hse_officer", "procurement", "accountant"] as OpsUserRole[]) {
    assert.ok(canSubmitDepartmentReport(role), `${role} should be able to file reports`);
  }
});

test("Reports route per the organogram", () => {
  // Engineers, HSE & QS -> Projects Manager.
  assert.deepEqual(reviewerRolesForReport({ department: "engineering", scope: "individual" }), [
    "projects_manager",
    "engineering_manager",
  ]);
  assert.deepEqual(reviewerRolesForReport({ department: "hse", scope: "individual" }), [
    "projects_manager",
  ]);
  assert.deepEqual(reviewerRolesForReport({ department: "commercial", scope: "individual" }), [
    "projects_manager",
  ]);
  // PM's engineering/commercial compiled reports -> MD; HSE compiled -> MD + GM.
  assert.deepEqual(reviewerRolesForReport({ department: "engineering", scope: "compiled" }), [
    "managing_director",
  ]);
  assert.deepEqual(reviewerRolesForReport({ department: "commercial", scope: "compiled" }), [
    "managing_director",
  ]);
  assert.deepEqual(reviewerRolesForReport({ department: "hse", scope: "compiled" }), [
    "managing_director",
    "general_manager",
  ]);
  // Operations compiled -> MD + PM + GM.
  assert.deepEqual(reviewerRolesForReport({ department: "operations", scope: "compiled" }), [
    "managing_director",
    "projects_manager",
    "general_manager",
  ]);
  // Procurement Manager's compiled report -> GM + MD + PM.
  assert.deepEqual(reviewerRolesForReport({ department: "procurement", scope: "compiled" }), [
    "general_manager",
    "managing_director",
    "projects_manager",
  ]);
  // Accountant & HR -> MD + GM. IT Manager -> MD only.
  assert.deepEqual(reviewerRolesForReport({ department: "finance", scope: "compiled" }), [
    "managing_director",
    "general_manager",
  ]);
  assert.deepEqual(reviewerRolesForReport({ department: "hr", scope: "compiled" }), [
    "managing_director",
    "general_manager",
  ]);
  assert.deepEqual(reviewerRolesForReport({ department: "it", scope: "compiled" }), [
    "managing_director",
  ]);
});

test("Line managers review individual reports but not their own compiled tier", () => {
  const individual = { department: "engineering", scope: "individual" } as const;
  const compiled = { department: "engineering", scope: "compiled" } as const;

  assert.ok(canReviewDepartmentReportRecord("projects_manager", individual));
  assert.equal(canReviewDepartmentReportRecord("projects_manager", compiled), false);
  assert.ok(canReviewDepartmentReportRecord("managing_director", compiled));
  assert.ok(canReviewDepartmentReportRecord("developer", compiled));
  // A peer contributor never reviews.
  assert.equal(canReviewDepartmentReportRecord("engineer", individual), false);
});

test("Named final reviewers can review and see compiled reports routed to them", () => {
  const opsCompiled = { department: "operations", scope: "compiled" } as const;
  const procCompiled = { department: "procurement", scope: "compiled" } as const;
  assert.ok(canReviewDepartmentReportRecord("projects_manager", opsCompiled));
  assert.ok(canReviewDepartmentReportRecord("projects_manager", procCompiled));
  // But NOT the tier-1 reports inside those departments.
  assert.equal(
    canReviewDepartmentReportRecord("projects_manager", {
      department: "operations",
      scope: "individual",
    }),
    false,
  );
  assert.ok(
    canViewDepartmentReportRecord("projects_manager", "user-pm", {
      created_by: "user-om",
      department: "operations",
      scope: "compiled",
      submitted_by: "user-om",
    }),
  );
  assert.equal(
    canViewDepartmentReportRecord("projects_manager", "user-pm", {
      created_by: "user-sup",
      department: "operations",
      scope: "individual",
      submitted_by: "user-sup",
    }),
    false,
  );
});

test("Contributors never see a colleague's individual report", () => {
  const mine = {
    created_by: "user-a",
    department: "engineering",
    scope: "individual",
    submitted_by: null,
  } as const;
  const colleagues = {
    created_by: "user-b",
    department: "engineering",
    scope: "individual",
    submitted_by: "user-b",
  } as const;
  const compiled = {
    created_by: "user-pm",
    department: "engineering",
    scope: "compiled",
    submitted_by: "user-pm",
  } as const;

  assert.ok(canViewDepartmentReportRecord("engineer", "user-a", mine));
  assert.equal(canViewDepartmentReportRecord("engineer", "user-a", colleagues), false);
  // The compiled report the Projects Manager files to the MD reads upward
  // only — the team it reports on must not see it.
  assert.equal(canViewDepartmentReportRecord("engineer", "user-a", compiled), false);
  // The line manager sees the whole department, both tiers.
  assert.ok(canViewDepartmentReportRecord("projects_manager", "user-pm", colleagues));
  // Another department sees nothing.
  assert.equal(canViewDepartmentReportRecord("finance_manager", "user-f", colleagues), false);
  assert.equal(canViewDepartmentReportRecord("finance_manager", "user-f", compiled), false);
  // Leadership sees everything.
  assert.ok(canViewDepartmentReportRecord("managing_director", "user-md", colleagues));
});

test("A manager's report to the MD is invisible to their own department", () => {
  // Every tier-1 contributor, against the compiled report filed above them.
  const cases: Array<[OpsUserRole, OpsDepartmentKey]> = [
    ["engineer", "engineering"],
    ["hse_officer", "hse"],
    ["quantity_surveyor", "commercial"],
    ["procurement", "procurement"],
    ["supervisor", "operations"],
  ];
  for (const [role, department] of cases) {
    assert.equal(
      canViewDepartmentReportRecord(role, "user-x", {
        created_by: "user-boss",
        department,
        scope: "compiled",
        submitted_by: "user-boss",
      }),
      false,
      `${role} should not see the compiled ${department} report`,
    );
  }
});

test("The Operations Manager reads every department but reviews none", () => {
  const role: OpsUserRole = "operations_manager";
  for (const dept of ALL_DEPARTMENTS) {
    assert.ok(canViewDepartmentReport(role, dept), `OM should see ${dept} reports`);
    // Both tiers, including reports they neither wrote nor received.
    for (const scope of ["individual", "compiled"] as const) {
      assert.ok(
        canViewDepartmentReportRecord(role, "user-om", {
          created_by: "user-other",
          department: dept,
          scope,
          submitted_by: "user-other",
        }),
        `OM should see ${dept} ${scope} reports`,
      );
    }
  }
  assert.equal(listAccessibleDepartments(role).length, ALL_DEPARTMENTS.length);

  // Reading is not reviewing, and not filing anywhere they like: the OM still
  // files exactly one report — Operations, compiled.
  assert.equal(canReviewDepartmentReport(role), false);
  assert.ok(canFileDepartmentReport(role, "operations", "compiled"));
  assert.ok(canSubmitDepartmentReport(role));
  assert.equal(canFileDepartmentReport(role, "finance", "compiled"), false);
  assert.equal(canFileDepartmentReport(role, "engineering", "compiled"), false);
});

test("Only MD/GM/Developer hold blanket review rights", () => {
  for (const role of ["managing_director", "general_manager", "developer"] as OpsUserRole[]) {
    assert.ok(canReviewDepartmentReport(role), `${role} should be able to review`);
  }
  for (const role of [
    "operations_manager",
    "projects_manager",
    "procurement_manager",
    "finance_manager",
  ] as OpsUserRole[]) {
    assert.equal(canReviewDepartmentReport(role), false);
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

test("Leadership sees every department", () => {
  for (const role of ["managing_director", "general_manager", "owner", "developer"] as OpsUserRole[]) {
    for (const dept of ALL_DEPARTMENTS) {
      assert.ok(canViewDepartmentReport(role, dept), `${role} should see ${dept} reports`);
    }
  }
  assert.equal(
    listAccessibleDepartments("managing_director").length,
    ALL_DEPARTMENTS.length,
  );
});
