import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OPS_HSE_ESCALATION_NOTIFICATION_ROLES,
  OPS_HSE_REVIEW_NOTIFICATION_ROLES,
  OPS_HSE_TRAINING_RENEWAL_NOTIFICATION_ROLES,
  selectOpsHseNotificationRecipients,
} from "../src/lib/ops/hse-notifications";

describe("HSE notification routing", () => {
  it("keeps review alerts with Developer and HSE Officer roles", () => {
    assert.deepEqual([...OPS_HSE_REVIEW_NOTIFICATION_ROLES], ["developer", "hse_officer"]);
  });

  it("routes escalation alerts to leadership, delivery management, and HSE ownership", () => {
    assert.equal(OPS_HSE_ESCALATION_NOTIFICATION_ROLES.includes("developer"), true);
    assert.equal(OPS_HSE_ESCALATION_NOTIFICATION_ROLES.includes("managing_director"), true);
    assert.equal(OPS_HSE_ESCALATION_NOTIFICATION_ROLES.includes("general_manager"), true);
    assert.equal(OPS_HSE_ESCALATION_NOTIFICATION_ROLES.includes("operations_manager"), true);
    assert.equal(OPS_HSE_ESCALATION_NOTIFICATION_ROLES.includes("projects_manager"), true);
    assert.equal(OPS_HSE_ESCALATION_NOTIFICATION_ROLES.includes("hse_officer"), true);
  });

  it("routes training renewal alerts to HSE and HR ownership", () => {
    assert.equal(OPS_HSE_TRAINING_RENEWAL_NOTIFICATION_ROLES.includes("developer"), true);
    assert.equal(OPS_HSE_TRAINING_RENEWAL_NOTIFICATION_ROLES.includes("hse_officer"), true);
    assert.equal(OPS_HSE_TRAINING_RENEWAL_NOTIFICATION_ROLES.includes("human_resource"), true);
    assert.equal(
      ([...OPS_HSE_TRAINING_RENEWAL_NOTIFICATION_ROLES] as string[]).includes("finance_manager"),
      false,
    );
  });

  it("deduplicates recipients and excludes the acting user", () => {
    const recipients = selectOpsHseNotificationRecipients(
      [
        { id: "actor", role: "hse_officer" },
        { id: "leader", role: "managing_director" },
        { id: "leader", role: "managing_director" },
        { id: "developer", role: "developer" },
      ],
      "actor",
    );

    assert.deepEqual(
      recipients.map((recipient) => recipient.id),
      ["leader", "developer"],
    );
  });
});
