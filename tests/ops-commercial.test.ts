import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAchieveOpsCommercialMilestone,
  canAgreeOpsCommercialClaim,
  canActivateOpsCommercialContract,
  canApproveOpsCommercialCashflowForecast,
  canApproveOpsCommercialRetentionRelease,
  canArchiveOpsCommercialCashflowForecast,
  canApproveOpsCommercialVariation,
  canCancelOpsCommercialClaim,
  canCancelOpsCommercialCashflowForecast,
  canCancelOpsCommercialContract,
  canCancelOpsCommercialIpc,
  canCancelOpsCommercialMilestone,
  canCancelOpsCommercialRetentionRelease,
  canCancelOpsCommercialRisk,
  canCancelOpsCommercialValuation,
  canCancelOpsCommercialVariation,
  canCertifyOpsCommercialIpc,
  canCertifyOpsCommercialMilestone,
  canCertifyOpsCommercialValuation,
  canCloseOpsCommercialClaim,
  canCloseOpsCommercialRisk,
  canCloseOpsCommercialVariation,
  canCompleteOpsCommercialContract,
  canCreateOpsCommercialInvoiceFromIpc,
  canCreateOpsCommercialRecord,
  canDelayOpsCommercialMilestone,
  canEditOpsCommercialValuationLines,
  canLockOpsCommercialCashflowForecast,
  canMoveOpsCommercialRiskToMitigation,
  canMarkOpsCommercialIpcInvoiced,
  canMarkOpsCommercialIpcPaid,
  canMarkOpsCommercialMilestoneDue,
  canPriceOpsCommercialVariation,
  canRejectOpsCommercialClaim,
  canRejectOpsCommercialIpc,
  canRejectOpsCommercialRetentionRelease,
  canRejectOpsCommercialValuation,
  canRejectOpsCommercialVariation,
  canReleaseOpsCommercialRetentionRelease,
  canReviewOpsCommercialClaim,
  canSubmitOpsCommercialClaim,
  canSubmitOpsCommercialIpc,
  canSubmitOpsCommercialRetentionRelease,
  canSubmitOpsCommercialValuation,
  canSubmitOpsCommercialVariation,
  canViewOpsCommercialControls,
} from "../src/lib/ops/commercial-permissions";

describe("commercial controls guards", () => {
  it("scopes visibility to commercial, finance, delivery, and leadership roles", () => {
    assert.equal(canViewOpsCommercialControls("developer"), true);
    assert.equal(canViewOpsCommercialControls("managing_director"), true);
    assert.equal(canViewOpsCommercialControls("general_manager"), true);
    assert.equal(canViewOpsCommercialControls("quantity_surveyor"), true);
    assert.equal(canViewOpsCommercialControls("projects_manager"), true);
    assert.equal(canViewOpsCommercialControls("finance_manager"), true);
    assert.equal(canViewOpsCommercialControls("accountant"), true);
    assert.equal(canViewOpsCommercialControls("engineer"), true);
    assert.equal(canViewOpsCommercialControls("hse_officer"), false);
    assert.equal(canViewOpsCommercialControls("human_resource"), false);
    assert.equal(canViewOpsCommercialControls("procurement_assistant"), false);
  });

  it("allows commercial record creation for delivery/commercial/finance roles", () => {
    assert.equal(canCreateOpsCommercialRecord("quantity_surveyor"), true);
    assert.equal(canCreateOpsCommercialRecord("projects_manager"), true);
    assert.equal(canCreateOpsCommercialRecord("finance_manager"), true);
    assert.equal(canCreateOpsCommercialRecord("engineer"), true);
    assert.equal(canCreateOpsCommercialRecord("hse_officer"), false);
    assert.equal(canCreateOpsCommercialRecord("human_resource"), false);
  });

  it("guards IPC lifecycle transitions", () => {
    const draft = { created_by: "user-1", status: "draft" as const, submitted_by: null };
    const submitted = {
      created_by: "user-1",
      status: "submitted" as const,
      submitted_by: "user-1",
    };
    const certified = {
      created_by: "user-1",
      status: "certified" as const,
      submitted_by: "user-1",
    };
    const invoiced = {
      created_by: "user-1",
      status: "invoiced" as const,
      submitted_by: "user-1",
    };

    assert.equal(canSubmitOpsCommercialIpc("user-1", "engineer", draft), true);
    assert.equal(canSubmitOpsCommercialIpc("someone-else", "engineer", draft), false);
    assert.equal(canCertifyOpsCommercialIpc("quantity_surveyor", submitted), true);
    assert.equal(canCertifyOpsCommercialIpc("engineer", submitted), false);
    assert.equal(canRejectOpsCommercialIpc("projects_manager", submitted), true);
    assert.equal(canMarkOpsCommercialIpcInvoiced("finance_manager", certified), true);
    assert.equal(canMarkOpsCommercialIpcPaid("accountant", invoiced), true);
    assert.equal(canCancelOpsCommercialIpc("user-1", "engineer", certified), true);
  });

  it("guards variation lifecycle transitions", () => {
    const draft = { created_by: "user-1", status: "draft" as const, submitted_by: null };
    const submitted = {
      created_by: "user-1",
      status: "submitted" as const,
      submitted_by: "user-1",
    };
    const priced = {
      created_by: "user-1",
      status: "priced" as const,
      submitted_by: "user-1",
    };
    const approved = {
      created_by: "user-1",
      status: "approved" as const,
      submitted_by: "user-1",
    };

    assert.equal(canSubmitOpsCommercialVariation("user-1", "engineer", draft), true);
    assert.equal(canPriceOpsCommercialVariation("quantity_surveyor", submitted), true);
    assert.equal(canPriceOpsCommercialVariation("engineer", submitted), false);
    assert.equal(canApproveOpsCommercialVariation("projects_manager", priced), true);
    assert.equal(canRejectOpsCommercialVariation("finance_manager", priced), true);
    assert.equal(canCloseOpsCommercialVariation("general_manager", approved), true);
    assert.equal(canCancelOpsCommercialVariation("someone-else", "engineer", approved), false);
  });

  it("guards claim lifecycle transitions", () => {
    const draft = { created_by: "user-1", status: "draft" as const, submitted_by: null };
    const submitted = {
      created_by: "user-1",
      status: "submitted" as const,
      submitted_by: "user-1",
    };
    const underReview = {
      created_by: "user-1",
      status: "under_review" as const,
      submitted_by: "user-1",
    };
    const agreed = {
      created_by: "user-1",
      status: "agreed" as const,
      submitted_by: "user-1",
    };

    assert.equal(canSubmitOpsCommercialClaim("user-1", "engineer", draft), true);
    assert.equal(canReviewOpsCommercialClaim("quantity_surveyor", submitted), true);
    assert.equal(canReviewOpsCommercialClaim("engineer", submitted), false);
    assert.equal(canAgreeOpsCommercialClaim("finance_manager", underReview), true);
    assert.equal(canRejectOpsCommercialClaim("general_manager", underReview), true);
    assert.equal(canCloseOpsCommercialClaim("projects_manager", agreed), true);
    assert.equal(canCancelOpsCommercialClaim("someone-else", "engineer", agreed), false);
  });

  it("guards commercial maturity controls", () => {
    const draftContract = { created_by: "user-1", status: "draft" as const };
    const activeContract = { created_by: "user-1", status: "active" as const };
    const draftValuation = { created_by: "user-1", status: "draft" as const, submitted_by: null };
    const submittedValuation = {
      created_by: "user-1",
      status: "submitted" as const,
      submitted_by: "user-1",
    };
    const openRisk = { created_by: "user-1", status: "open" as const };
    const mitigatingRisk = { created_by: "user-1", status: "mitigating" as const };
    const certifiedIpc = { invoice_id: null, status: "certified" as const };
    const linkedIpc = { invoice_id: "invoice-1", status: "certified" as const };

    assert.equal(canActivateOpsCommercialContract("quantity_surveyor", draftContract), true);
    assert.equal(canActivateOpsCommercialContract("engineer", draftContract), false);
    assert.equal(canCompleteOpsCommercialContract("finance_manager", activeContract), true);
    assert.equal(canCancelOpsCommercialContract("user-1", "engineer", draftContract), true);
    assert.equal(canCancelOpsCommercialContract("someone-else", "engineer", activeContract), false);

    assert.equal(canSubmitOpsCommercialValuation("user-1", "engineer", draftValuation), true);
    assert.equal(canEditOpsCommercialValuationLines("user-1", "engineer", draftValuation), true);
    assert.equal(canEditOpsCommercialValuationLines("someone-else", "quantity_surveyor", draftValuation), true);
    assert.equal(canEditOpsCommercialValuationLines("user-1", "engineer", submittedValuation), false);
    assert.equal(canCertifyOpsCommercialValuation("quantity_surveyor", submittedValuation), true);
    assert.equal(canRejectOpsCommercialValuation("projects_manager", submittedValuation), true);
    assert.equal(canCancelOpsCommercialValuation("someone-else", "engineer", submittedValuation), false);

    assert.equal(canMoveOpsCommercialRiskToMitigation("quantity_surveyor", openRisk), true);
    assert.equal(canCloseOpsCommercialRisk("finance_manager", mitigatingRisk), true);
    assert.equal(canCancelOpsCommercialRisk("user-1", "engineer", openRisk), true);
    assert.equal(canCancelOpsCommercialRisk("someone-else", "engineer", mitigatingRisk), false);

    assert.equal(canCreateOpsCommercialInvoiceFromIpc("finance_manager", certifiedIpc), true);
    assert.equal(canCreateOpsCommercialInvoiceFromIpc("engineer", certifiedIpc), false);
    assert.equal(canCreateOpsCommercialInvoiceFromIpc("finance_manager", linkedIpc), false);
  });

  it("guards retention, cashflow, and milestone forecasting transitions", () => {
    const draftRelease = { created_by: "user-1", status: "draft" as const, submitted_by: null };
    const submittedRelease = {
      created_by: "user-1",
      status: "submitted" as const,
      submitted_by: "user-1",
    };
    const approvedRelease = {
      created_by: "user-1",
      status: "approved" as const,
      submitted_by: "user-1",
    };
    const draftForecast = { created_by: "user-1", status: "draft" as const };
    const approvedForecast = { created_by: "user-1", status: "approved" as const };
    const lockedForecast = { created_by: "user-1", status: "locked" as const };
    const plannedMilestone = {
      created_by: "user-1",
      owner_id: "owner-1",
      status: "planned" as const,
    };
    const dueMilestone = {
      created_by: "user-1",
      owner_id: "owner-1",
      status: "due" as const,
    };
    const achievedMilestone = {
      created_by: "user-1",
      owner_id: "owner-1",
      status: "achieved" as const,
    };

    assert.equal(canSubmitOpsCommercialRetentionRelease("user-1", "engineer", draftRelease), true);
    assert.equal(canApproveOpsCommercialRetentionRelease("quantity_surveyor", submittedRelease), true);
    assert.equal(canRejectOpsCommercialRetentionRelease("engineer", submittedRelease), false);
    assert.equal(canReleaseOpsCommercialRetentionRelease("accountant", approvedRelease), true);
    assert.equal(canCancelOpsCommercialRetentionRelease("someone-else", "engineer", approvedRelease), false);

    assert.equal(canApproveOpsCommercialCashflowForecast("finance_manager", draftForecast), true);
    assert.equal(canLockOpsCommercialCashflowForecast("quantity_surveyor", approvedForecast), true);
    assert.equal(canArchiveOpsCommercialCashflowForecast("general_manager", lockedForecast), true);
    assert.equal(canCancelOpsCommercialCashflowForecast("user-1", "engineer", draftForecast), true);
    assert.equal(canCancelOpsCommercialCashflowForecast("someone-else", "engineer", approvedForecast), false);

    assert.equal(canMarkOpsCommercialMilestoneDue("owner-1", "engineer", plannedMilestone), true);
    assert.equal(canAchieveOpsCommercialMilestone("owner-1", "engineer", dueMilestone), true);
    assert.equal(canDelayOpsCommercialMilestone("owner-1", "engineer", dueMilestone), true);
    assert.equal(canCertifyOpsCommercialMilestone("quantity_surveyor", achievedMilestone), true);
    assert.equal(canCancelOpsCommercialMilestone("someone-else", "engineer", achievedMilestone), false);
  });
});
