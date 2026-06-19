import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOpsLocalRolePreviewProfile,
  canUseOpsLocalRolePreview,
  parseOpsLocalRolePreviewRole,
} from "@/lib/ops/local-role-preview";

describe("ops local role preview", () => {
  it("only enables on local development hosts", () => {
    assert.equal(canUseOpsLocalRolePreview("localhost:3000"), true);
    assert.equal(canUseOpsLocalRolePreview("127.0.0.1:3000"), true);
    assert.equal(canUseOpsLocalRolePreview("ops.pymbleconstruction.com"), false);
  });

  it("accepts approved production roles and rejects legacy aliases", () => {
    assert.equal(parseOpsLocalRolePreviewRole("developer"), "developer");
    assert.equal(parseOpsLocalRolePreviewRole("finance_manager"), "finance_manager");
    assert.equal(parseOpsLocalRolePreviewRole("owner"), null);
    assert.equal(parseOpsLocalRolePreviewRole("crew"), null);
    assert.equal(parseOpsLocalRolePreviewRole(""), null);
  });

  it("builds a deterministic read-only preview profile", () => {
    const profile = buildOpsLocalRolePreviewProfile("hse_officer");

    assert.equal(
      profile.full_name,
      "Local Preview - Health, Safety and Environment Officer",
    );
    assert.equal(profile.email, "local-role-preview@pymbleconstruction.test");
    assert.equal(profile.role, "hse_officer");
    assert.equal(profile.is_active, true);
  });
});

