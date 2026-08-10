import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCreateBoq,
  canEditBoq,
  canIssueBoq,
  canReviseBoq,
} from "../src/lib/ops/boq-permissions";
import { canAccessOpsHref, visibleOpsModules } from "../src/lib/ops/permissions";

const draft = { status: "draft" } as const;
const priced = { status: "priced" } as const;
const issued = { status: "issued" } as const;

describe("material schedule authoring", () => {
  it("is open to engineering as well as the QS and Projects Manager", () => {
    for (const role of [
      "engineer",
      "engineering_manager",
      "quantity_surveyor",
      "projects_manager",
      "managing_director",
    ] as const) {
      assert.equal(canCreateBoq(role), true, role);
      assert.equal(canEditBoq(role, draft), true, role);
      assert.equal(canReviseBoq(role, issued), true, role);
    }
  });

  it("still excludes procurement, site supervision, and interns", () => {
    for (const role of [
      "procurement_manager",
      "procurement",
      "operations_manager",
      "supervisor",
      "engineering_intern",
      "crew",
    ] as const) {
      assert.equal(canCreateBoq(role), false, role);
      assert.equal(canEditBoq(role, draft), false, role);
    }
  });

  it("keeps issuing with the commercial owners because issue creates the budget", () => {
    assert.equal(canIssueBoq("engineer", priced), false);
    assert.equal(canIssueBoq("engineering_manager", priced), false);
    assert.equal(canIssueBoq("quantity_surveyor", priced), true);
    assert.equal(canIssueBoq("projects_manager", priced), true);
  });

  it("shows the module to everyone who can author one", () => {
    for (const role of ["engineer", "engineering_manager"] as const) {
      assert.equal(canAccessOpsHref(role, "/ops/material-schedule"), true, role);
      assert.ok(
        visibleOpsModules(role).some((module) => module.href === "/ops/material-schedule"),
        role,
      );
    }
  });
});
