import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canDeleteOpsPaymentRequest,
  canEditOpsPaymentRequest,
} from "../src/lib/ops/finance-permissions";
import type { OpsPaymentRequestStatus, OpsUserRole } from "../src/lib/ops/types";

/**
 * Deleting a payable must stop where the financial record begins.
 *
 * A payable writes its cost entry and its journal entry on APPROVAL. Deleting
 * one after that orphans a general ledger entry and silently unbalances the
 * accounts — the kind of fault that surfaces months later as a trial balance
 * that will not tie.
 *
 * The rule this replaced was `role === "developer"` with no status check at
 * all: it permitted deleting a paid payable and forbade the only case anyone
 * needs, which is removing a bill they just keyed wrong.
 */

const ALL_STATUSES: OpsPaymentRequestStatus[] = [
  "draft",
  "submitted",
  "finance_review",
  "approved",
  "rejected",
  "paid",
  "cancelled",
];

/** Statuses where nothing has been posted to the ledger yet. */
const UNPOSTED: OpsPaymentRequestStatus[] = ["draft", "rejected"];

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";

const payable = (status: OpsPaymentRequestStatus, requestedBy = OWNER) => ({
  requested_by: requestedBy,
  status,
});

describe("payables can only be deleted before anything is posted", () => {
  for (const status of ALL_STATUSES) {
    const shouldAllow = UNPOSTED.includes(status);

    it(`${shouldAllow ? "allows" : "refuses"} delete in ${status}`, () => {
      assert.equal(
        canDeleteOpsPaymentRequest("any", "finance_manager", payable(status)),
        shouldAllow,
      );
    });
  }

  it("refuses delete once approved, whoever asks", () => {
    // Approval is the moment the cost entry and journal are written. After it,
    // the correct operation is cancel, which reverses properly.
    for (const role of [
      "developer",
      "managing_director",
      "finance_manager",
      "accountant",
    ] as OpsUserRole[]) {
      for (const status of ["approved", "paid"] as OpsPaymentRequestStatus[]) {
        assert.equal(
          canDeleteOpsPaymentRequest(OWNER, role, payable(status)),
          false,
          `${role} could delete a ${status} payable`,
        );
      }
    }
  });

  it("refuses delete of an already-cancelled payable", () => {
    // Cancelled ones are history: they may have been reversed in the ledger and
    // the reversal needs something to point at.
    assert.equal(canDeleteOpsPaymentRequest(OWNER, "finance_manager", payable("cancelled")), false);
  });
});

describe("who may delete", () => {
  it("lets the person who raised it remove their own draft", () => {
    assert.equal(canDeleteOpsPaymentRequest(OWNER, "engineer", payable("draft", OWNER)), true);
  });

  it("does not let an unrelated junior role delete someone else's draft", () => {
    assert.equal(canDeleteOpsPaymentRequest(STRANGER, "engineer", payable("draft", OWNER)), false);
  });

  it("lets a finance approver clean up anyone's draft", () => {
    assert.equal(
      canDeleteOpsPaymentRequest(STRANGER, "finance_manager", payable("draft", OWNER)),
      true,
    );
  });
});

describe("edit and delete agree on when a payable is still soft", () => {
  it("every status that can be edited can also be deleted", () => {
    // If a payable is mutable, it has not posted; if it has posted, it is
    // neither editable nor deletable. The two rules must not drift apart,
    // because that is how you end up able to edit something you cannot remove
    // or vice versa.
    for (const status of ALL_STATUSES) {
      const editable = canEditOpsPaymentRequest(OWNER, "finance_manager", payable(status));
      const deletable = canDeleteOpsPaymentRequest(OWNER, "finance_manager", payable(status));
      assert.equal(editable, deletable, `${status}: editable=${editable} deletable=${deletable}`);
    }
  });
});
