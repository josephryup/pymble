import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeQuotationTotals } from "../src/lib/ops/quotations";
import {
  canArchiveOpsQuotation,
  canEditOpsQuotation,
  canManageOpsQuotations,
  canViewOpsQuotations,
} from "../src/lib/ops/quotation-permissions";
import type { OpsUserRole } from "../src/lib/ops/types";

const line = (total: number) => ({ line_total: total });

describe("computeQuotationTotals", () => {
  it("sums lines and applies VAT", () => {
    const totals = computeQuotationTotals([line(10_000), line(5_000)], 16);

    assert.equal(totals.subtotal, 15_000);
    assert.equal(totals.vat_amount, 2_400);
    assert.equal(totals.total_amount, 17_400);
  });

  it("handles a zero VAT rate", () => {
    const totals = computeQuotationTotals([line(7_500)], 0);

    assert.equal(totals.vat_amount, 0);
    assert.equal(totals.total_amount, 7_500);
  });

  it("returns zeros for a quotation with no lines", () => {
    const totals = computeQuotationTotals([], 16);

    assert.equal(totals.subtotal, 0);
    assert.equal(totals.vat_amount, 0);
    assert.equal(totals.total_amount, 0);
  });

  it("rounds VAT to cents", () => {
    // 1,234.56 × 16% = 197.5296 → 197.53
    const totals = computeQuotationTotals([line(1_234.56)], 16);

    assert.equal(totals.subtotal, 1_234.56);
    assert.equal(totals.vat_amount, 197.53);
    assert.equal(totals.total_amount, 1_432.09);
  });

  it("supports a non-standard VAT rate", () => {
    const totals = computeQuotationTotals([line(20_000)], 5);

    assert.equal(totals.vat_amount, 1_000);
    assert.equal(totals.total_amount, 21_000);
  });
});

describe("quotation access", () => {
  const allowed: OpsUserRole[] = [
    // Leadership
    "developer",
    "managing_director",
    "general_manager",
    "owner",
    "manager",
    // Accounts
    "finance_manager",
    "accountant",
    // HR
    "human_resource",
    "hr",
    // Procurement
    "procurement_manager",
    "procurement",
    "procurement_assistant",
  ];

  it("covers exactly the agreed four groups", () => {
    for (const role of allowed) {
      assert.equal(canViewOpsQuotations(role), true, `${role} should view quotations`);
      assert.equal(canManageOpsQuotations(role), true, `${role} should manage quotations`);
    }
  });

  it("keeps site and engineering roles out", () => {
    for (const role of [
      "engineer",
      "supervisor",
      "crew",
      "quantity_surveyor",
      "hse_officer",
      "it_manager",
    ] as OpsUserRole[]) {
      assert.equal(canViewOpsQuotations(role), false, `${role} should not see quotations`);
    }
  });

  it("excludes admin_receptionist and accountant_intern deliberately", () => {
    // A quotation is a priced commitment to a client, so it sits above these.
    assert.equal(canViewOpsQuotations("admin_receptionist"), false);
    assert.equal(canViewOpsQuotations("accountant_intern"), false);
  });

  it("restricts archiving to leadership", () => {
    assert.equal(canArchiveOpsQuotation("managing_director"), true);
    assert.equal(canArchiveOpsQuotation("owner"), true);
    assert.equal(canArchiveOpsQuotation("general_manager"), true);
    assert.equal(canArchiveOpsQuotation("manager"), true);

    // Can author quotations, but must not destroy them.
    assert.equal(canArchiveOpsQuotation("accountant"), false);
    assert.equal(canArchiveOpsQuotation("procurement"), false);
    assert.equal(canArchiveOpsQuotation("hr"), false);
  });
});

describe("canEditOpsQuotation", () => {
  it("allows edits while the quotation is a draft", () => {
    assert.equal(canEditOpsQuotation("accountant", { status: "draft" }), true);
  });

  it("locks the quotation once it has gone to the client", () => {
    for (const status of ["sent", "accepted", "declined", "expired"]) {
      assert.equal(
        canEditOpsQuotation("accountant", { status }),
        false,
        `${status} should not be editable`,
      );
    }
  });

  it("locks an archived draft", () => {
    assert.equal(
      canEditOpsQuotation("managing_director", {
        status: "draft",
        archived_at: "2026-07-26T10:00:00Z",
      }),
      false,
    );
  });

  it("still refuses roles that cannot manage quotations at all", () => {
    assert.equal(canEditOpsQuotation("engineer", { status: "draft" }), false);
  });
});
