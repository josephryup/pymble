import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SELF_SERVICE_RUN_STATUSES } from "../src/lib/ops/staff-payroll";
import { canViewOpsStaffPayroll } from "../src/lib/ops/staff-payroll";
import type { OpsUserRole } from "../src/lib/ops/types";

/**
 * Payslip self-service is a privacy boundary, so the two rules that enforce it
 * are pinned here: release status, and who counts as back office.
 *
 * The ownership check itself (employees.user_id = auth.uid()) lives in the PDF
 * route against the database and is not reachable from a unit test; the shape
 * of the rule it applies is what these cover.
 */

describe("payslip release gate", () => {
  it("releases only non-draft runs to the employee", () => {
    // ops_payroll_status = draft | approved | disbursing | completed
    assert.equal(SELF_SERVICE_RUN_STATUSES.has("draft"), false);
    assert.equal(SELF_SERVICE_RUN_STATUSES.has("approved"), true);
    assert.equal(SELF_SERVICE_RUN_STATUSES.has("disbursing"), true);
    assert.equal(SELF_SERVICE_RUN_STATUSES.has("completed"), true);
  });

  it("covers every enum value exactly once, so a new status cannot slip through unconsidered", () => {
    const allStatuses = ["draft", "approved", "disbursing", "completed"];
    const released = allStatuses.filter((status) => SELF_SERVICE_RUN_STATUSES.has(status));
    const withheld = allStatuses.filter((status) => !SELF_SERVICE_RUN_STATUSES.has(status));

    assert.equal(SELF_SERVICE_RUN_STATUSES.size, released.length);
    assert.deepEqual(withheld, ["draft"]);
  });

  it("does not contain invented statuses", () => {
    // An earlier draft of this gate listed "paid", which is not in the enum —
    // a value that never matches is a silent hole, not a harmless extra.
    for (const status of SELF_SERVICE_RUN_STATUSES) {
      assert.ok(
        ["approved", "disbursing", "completed"].includes(status),
        `${status} is not an ops_payroll_status value`,
      );
    }
  });
});

describe("payslip back-office access", () => {
  it("admits HR, finance and leadership", () => {
    for (const role of [
      "developer",
      "managing_director",
      "general_manager",
      "owner",
      "human_resource",
      "hr",
      "finance_manager",
      "accountant",
    ] as OpsUserRole[]) {
      assert.equal(canViewOpsStaffPayroll(role), true, `${role} is back office`);
    }
  });

  it("excludes site and engineering roles, who reach their own payslip by ownership only", () => {
    for (const role of [
      "engineer",
      "supervisor",
      "crew",
      "quantity_surveyor",
      "procurement",
      "hse_officer",
    ] as OpsUserRole[]) {
      assert.equal(
        canViewOpsStaffPayroll(role),
        false,
        `${role} must not read the payroll register`,
      );
    }
  });
});
