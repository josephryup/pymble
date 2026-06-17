import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveOpsRecipients,
  type OpsActiveUser,
} from "../src/lib/ops/notification-fanout";
import type { OpsUserRole } from "../src/lib/ops/types";

function user(id: string, full_name: string, role: OpsUserRole): OpsActiveUser {
  return { id, full_name, role };
}

const DEVELOPER = user("u-dev", "Developer", "developer");
const MD = user("u-md", "Matimba Hatimbula", "managing_director");
const GM = user("u-gm", "General Manager", "general_manager");
const OPS_MGR = user("u-ops", "John Mulilo", "operations_manager");
const PROJ_MGR = user("u-proj", "Projects Manager", "projects_manager");
const FINANCE_MGR = user("u-fin", "Finance Manager", "finance_manager");
const ACCOUNTANT = user("u-acc", "Accountant", "accountant");
const QS = user("u-qs", "Quantity Surveyor", "quantity_surveyor");
const PROC_MGR = user("u-procm", "Mukuka Procurement", "procurement_manager");
const ENGINEER = user("u-eng", "Thandiwe Mulenga", "engineer");
const HSE_OFFICER = user("u-hse", "Cassim Musolo", "hse_officer");

describe("ops notification fanout", () => {
  it("returns users matching the primary role when they exist", () => {
    const users = [DEVELOPER, MD, PROC_MGR, ENGINEER];
    const recipients = resolveOpsRecipients(users, ["procurement_manager"]);
    assert.deepStrictEqual(
      recipients.map((r) => r.id).sort(),
      ["u-procm"],
    );
  });

  it("returns multiple users when several roles are primary", () => {
    const users = [DEVELOPER, MD, PROC_MGR, ENGINEER, OPS_MGR];
    const recipients = resolveOpsRecipients(users, [
      "procurement_manager",
      "operations_manager",
    ]);
    assert.deepStrictEqual(
      recipients.map((r) => r.id).sort(),
      ["u-ops", "u-procm"],
    );
  });

  it("falls through to fallback when primary role is empty (Projects Manager → Ops Manager)", () => {
    // No Projects Manager — should fall to Ops Manager.
    const users = [DEVELOPER, MD, OPS_MGR, ENGINEER];
    const recipients = resolveOpsRecipients(users, ["projects_manager"]);
    assert.deepStrictEqual(
      recipients.map((r) => r.id).sort(),
      ["u-ops"],
    );
  });

  it("falls through to fallback when primary role is empty (Finance Manager → Accountant)", () => {
    const users = [DEVELOPER, MD, ACCOUNTANT];
    const recipients = resolveOpsRecipients(users, ["finance_manager"]);
    assert.deepStrictEqual(
      recipients.map((r) => r.id).sort(),
      ["u-acc"],
    );
  });

  it("walks multiple tiers of fallback when intermediate tiers are empty", () => {
    // No Projects Manager, no Operations Manager — should reach GM.
    const users = [DEVELOPER, MD, GM, ENGINEER];
    const recipients = resolveOpsRecipients(users, ["projects_manager"]);
    assert.deepStrictEqual(
      recipients.map((r) => r.id).sort(),
      ["u-gm"],
    );
  });

  it("ultimate fallback is Developer + MD when everything else is empty", () => {
    // No Finance Manager, no Accountant — should reach MD (since chain goes
    // accountant → managing_director per OPS_ROLE_FALLBACK_CHAIN).
    const users = [DEVELOPER, MD, ENGINEER];
    const recipients = resolveOpsRecipients(users, ["finance_manager"]);
    // First match wins; the chain is: finance_manager → accountant → MD → developer.
    // Accountant is empty, so MD is picked.
    assert.deepStrictEqual(
      recipients.map((r) => r.id).sort(),
      ["u-md"],
    );
  });

  it("ultimate-fallback safety net catches scenarios with no chain at all", () => {
    // crew is a role with no fallback chain defined.
    const users = [DEVELOPER, MD];
    const recipients = resolveOpsRecipients(users, ["crew"]);
    // Should still get the developer + MD via ultimate fallback so the
    // notification never silently drops.
    assert.deepStrictEqual(
      recipients.map((r) => r.id).sort(),
      ["u-dev", "u-md"],
    );
  });

  it("excludes the actor's own user id when asked", () => {
    const users = [DEVELOPER, MD, PROC_MGR];
    const recipients = resolveOpsRecipients(users, ["procurement_manager"], {
      excludeUserIds: [PROC_MGR.id],
    });
    // PROC_MGR is the only primary match but excluded → fallback to MD.
    assert.deepStrictEqual(
      recipients.map((r) => r.id).sort(),
      ["u-md"],
    );
  });

  it("deduplicates if two primary roles both match the same user (single role though)", () => {
    const users = [DEVELOPER, MD, PROC_MGR];
    const recipients = resolveOpsRecipients(users, [
      "procurement_manager",
      "procurement_manager",
    ]);
    assert.deepStrictEqual(
      recipients.map((r) => r.id).sort(),
      ["u-procm"],
    );
  });

  it("handles QS → Projects Manager → Ops Manager fallback (4-tier chain)", () => {
    // No QS, no Projects Manager, no Ops Manager — should reach MD.
    const users = [DEVELOPER, MD, ENGINEER, HSE_OFFICER];
    const recipients = resolveOpsRecipients(users, ["quantity_surveyor"]);
    assert.deepStrictEqual(
      recipients.map((r) => r.id).sort(),
      ["u-md"],
    );
  });

  it("primary match takes priority over fallback even when fallback would also match", () => {
    // QS exists. Even though Projects Manager also exists, primary wins.
    const users = [QS, PROJ_MGR, OPS_MGR, MD, DEVELOPER];
    const recipients = resolveOpsRecipients(users, ["quantity_surveyor"]);
    assert.deepStrictEqual(
      recipients.map((r) => r.id).sort(),
      ["u-qs"],
    );
  });

  it("primary fanout including Finance Manager + Accountant both match when both exist", () => {
    const users = [DEVELOPER, MD, FINANCE_MGR, ACCOUNTANT];
    const recipients = resolveOpsRecipients(users, [
      "finance_manager",
      "accountant",
    ]);
    assert.deepStrictEqual(
      recipients.map((r) => r.id).sort(),
      ["u-acc", "u-fin"],
    );
  });
});
