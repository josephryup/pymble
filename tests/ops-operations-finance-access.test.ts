import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canCreateOpsCustomer,
  canEditOpsCustomer,
  canViewOpsCustomers,
} from "../src/lib/ops/customer-permissions";
import {
  canCreateOpsPaymentRequest,
  canApproveOpsPaymentRequest,
  canEditOpsPaymentRequest,
  canPayOpsPaymentRequest,
  canReviewOpsPaymentRequest,
  canViewOpsFinanceBridge,
} from "../src/lib/ops/finance-permissions";
import {
  canCreateInvoice,
  canEditInvoice,
  canMarkInvoicePaid,
  canSendInvoice,
  canVoidInvoice,
} from "../src/lib/ops/invoice-permissions";
import {
  canManageOpsLoans,
  canRecordOpsLoanRepayment,
  canViewOpsLoans,
} from "../src/lib/ops/loan-permissions";
import { canAccessOpsHref } from "../src/lib/ops/permissions";

/**
 * Operations was given the finance registers on 2026-08-18: payables,
 * receivables, invoices, customers and loans, with the ability to create and
 * edit in each.
 *
 * The line that was NOT crossed is settlement. Raising a claim and settling it
 * are different acts, and a single role doing both is the control that stops a
 * payment being invented and paid by the same person. These tests pin both
 * halves — the access that was granted, and the authority that was withheld —
 * because the withheld half is the one a later "just add operations here"
 * edit would quietly undo.
 */

const OPS = "operations_manager" as const;

const draftPayable = { requested_by: null, status: "draft" as const };
const financeReviewPayable = { requested_by: null, status: "finance_review" as const };
const submittedPayable = { requested_by: null, status: "submitted" as const };
const approvedPayable = { requested_by: null, status: "approved" as const };

const draftInvoice = { status: "draft" as const };
const sentInvoice = { status: "sent" as const };

describe("operations can reach the finance registers", () => {
  it("opens every module it was granted", () => {
    for (const href of [
      "/ops/payment-requests",
      "/ops/receivables",
      "/ops/invoices",
      "/ops/customers",
      "/ops/loans",
    ]) {
      assert.equal(canAccessOpsHref(OPS, href), true, href);
    }
  });
});

describe("operations can create and edit", () => {
  it("raises and edits a payable", () => {
    assert.equal(canViewOpsFinanceBridge(OPS), true);
    assert.equal(canCreateOpsPaymentRequest(OPS), true);
    assert.equal(canEditOpsPaymentRequest("someone-else", OPS, draftPayable), true);
  });

  it("raises and edits an invoice while it is a draft", () => {
    assert.equal(canCreateInvoice(OPS), true);
    assert.equal(canEditInvoice(OPS, draftInvoice), true);
  });

  it("manages the customer master", () => {
    // Without this an invoice could only be raised against a customer somebody
    // else had already created.
    assert.equal(canViewOpsCustomers(OPS), true);
    assert.equal(canCreateOpsCustomer(OPS), true);
    assert.equal(canEditOpsCustomer(OPS, { status: "active" }), true);
  });

  it("sees and manages loan facilities", () => {
    assert.equal(canViewOpsLoans(OPS), true);
    assert.equal(canManageOpsLoans(OPS), true);
  });
});

describe("operations cannot settle what it raised", () => {
  it("cannot review, approve or pay a payable", () => {
    assert.equal(canReviewOpsPaymentRequest(OPS, submittedPayable), false);
    assert.equal(canApproveOpsPaymentRequest(OPS, financeReviewPayable), false);
    assert.equal(canPayOpsPaymentRequest(OPS, approvedPayable), false);
  });

  it("cannot send, mark paid, or void an invoice", () => {
    assert.equal(canSendInvoice(OPS, draftInvoice), false);
    assert.equal(canMarkInvoicePaid(OPS, sentInvoice), false);
    assert.equal(canVoidInvoice(OPS, draftInvoice), false);
  });

  it("cannot record a loan repayment", () => {
    // Repayment posts a general-ledger journal. It used to be derived from the
    // loan-manage list, so granting Operations "create and edit loans" would
    // have handed it GL-posting as an invisible side effect. It is now an
    // explicit list.
    assert.equal(canRecordOpsLoanRepayment(OPS), false);
  });

  it("leaves the settlement roles untouched by this change", () => {
    assert.equal(canApproveOpsPaymentRequest("finance_manager", financeReviewPayable), true);
    assert.equal(canSendInvoice("finance_manager", draftInvoice), true);
    assert.equal(canRecordOpsLoanRepayment("accountant"), true);
    assert.equal(canRecordOpsLoanRepayment("finance_manager"), true);
  });
});

describe("the grant is scoped to Operations alone", () => {
  it("does not leak loan access to the other finance-bridge roles", () => {
    // OPS_FINANCE_BRIDGE_ROLES also carries Projects, Procurement and the QS.
    // Loans are the company's debt position and security arrangements; the
    // grant was to Operations, not to everyone who can see a payable.
    for (const role of ["projects_manager", "procurement_manager", "quantity_surveyor", "procurement"] as const) {
      assert.equal(canViewOpsLoans(role), false, role);
      assert.equal(canManageOpsLoans(role), false, role);
    }
  });

  it("does not grant customers to procurement or projects", () => {
    for (const role of ["projects_manager", "procurement_manager", "procurement"] as const) {
      assert.equal(canCreateOpsCustomer(role), false, role);
    }
  });
});
