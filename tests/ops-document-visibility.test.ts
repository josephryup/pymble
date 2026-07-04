import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignableOpsDocumentVisibilities,
  canMutateOpsDocument,
  canViewOpsDocumentVisibility,
  isOpsDocumentSuperAdmin,
} from "../src/lib/ops/document-permissions";
import type { OpsDocumentVisibility, OpsUserRole } from "../src/lib/ops/types";

// Not the uploader unless a test says so.
function canSee(role: OpsUserRole, visibility: OpsDocumentVisibility, isUploader = false) {
  return canViewOpsDocumentVisibility(role, visibility, isUploader);
}

describe("document visibility tiers", () => {
  it("public is visible to any staff role", () => {
    for (const role of ["engineer", "accountant", "hse_officer", "procurement"] as OpsUserRole[]) {
      assert.ok(canSee(role, "public"), `${role} should see public`);
    }
  });

  it("management tier = MD, GM, Ops Manager, Projects Manager", () => {
    for (const role of [
      "managing_director",
      "general_manager",
      "operations_manager",
      "projects_manager",
    ] as OpsUserRole[]) {
      assert.ok(canSee(role, "management"), `${role} should see management`);
    }
    for (const role of ["engineer", "accountant", "hse_officer"] as OpsUserRole[]) {
      assert.equal(canSee(role, "management"), false, `${role} should NOT see management`);
    }
  });

  it("finance tier = MD + finance team only", () => {
    assert.ok(canSee("managing_director", "finance"));
    assert.ok(canSee("finance_manager", "finance"));
    assert.ok(canSee("accountant", "finance"));
    // GM and Ops Manager are management, not finance.
    assert.equal(canSee("general_manager", "finance"), false);
    assert.equal(canSee("operations_manager", "finance"), false);
    assert.equal(canSee("engineer", "finance"), false);
  });

  it("md_restricted is the MD (and owner) only", () => {
    assert.ok(canSee("managing_director", "md_restricted"));
    assert.ok(canSee("owner", "md_restricted"));
    assert.equal(canSee("general_manager", "md_restricted"), false);
    assert.equal(canSee("finance_manager", "md_restricted"), false);
  });

  it("private is invisible to everyone but the uploader", () => {
    assert.equal(canSee("managing_director", "private"), false);
    assert.equal(canSee("general_manager", "private"), false);
    assert.ok(canSee("engineer", "private", true), "uploader sees their own private doc");
  });

  it("Owner and Developer bypass every tier", () => {
    for (const role of ["owner", "developer"] as OpsUserRole[]) {
      assert.ok(isOpsDocumentSuperAdmin(role));
      for (const tier of [
        "public",
        "management",
        "finance",
        "md_restricted",
        "private",
      ] as OpsDocumentVisibility[]) {
        assert.ok(canSee(role, tier), `${role} should see ${tier}`);
      }
    }
  });

  it("the uploader always retains access to their own upload", () => {
    // Even an md_restricted doc an engineer created stays visible to them.
    assert.ok(canSee("engineer", "md_restricted", true));
    assert.ok(canSee("procurement", "finance", true));
  });
});

describe("assignableOpsDocumentVisibilities", () => {
  it("everyone can post public and private", () => {
    for (const role of ["engineer", "accountant", "hse_officer"] as OpsUserRole[]) {
      const tiers = assignableOpsDocumentVisibilities(role);
      assert.ok(tiers.includes("public"));
      assert.ok(tiers.includes("private"));
    }
  });

  it("a junior cannot assign tiers they cannot see", () => {
    const tiers = assignableOpsDocumentVisibilities("engineer");
    assert.ok(!tiers.includes("management"));
    assert.ok(!tiers.includes("finance"));
    assert.ok(!tiers.includes("md_restricted"));
  });

  it("finance can assign the finance tier; ops manager the management tier", () => {
    assert.ok(assignableOpsDocumentVisibilities("finance_manager").includes("finance"));
    assert.ok(assignableOpsDocumentVisibilities("operations_manager").includes("management"));
    assert.ok(assignableOpsDocumentVisibilities("managing_director").includes("md_restricted"));
  });
});

describe("canMutateOpsDocument", () => {
  it("uploader and super-admins can mutate; others cannot", () => {
    const doc = { uploaded_by: "user-a" };
    assert.ok(canMutateOpsDocument("user-a", "engineer", doc));
    assert.ok(canMutateOpsDocument("user-x", "developer", doc));
    assert.ok(canMutateOpsDocument("user-x", "owner", doc));
    assert.equal(canMutateOpsDocument("user-x", "managing_director", doc), false);
    assert.equal(canMutateOpsDocument("user-x", "engineer", doc), false);
  });
});
