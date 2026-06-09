import type {
  OpsCommercialClaimStatus,
  OpsCommercialCashflowStatus,
  OpsCommercialContractStatus,
  OpsCommercialIpcStatus,
  OpsCommercialMilestoneStatus,
  OpsCommercialRetentionReleaseStatus,
  OpsCommercialRiskStatus,
  OpsCommercialValuationStatus,
  OpsCommercialVariationStatus,
  OpsUserRole,
} from "@/lib/ops/types";

export type OpsCommercialIpcMutationTarget = {
  created_by: string | null;
  status: OpsCommercialIpcStatus;
  submitted_by: string | null;
};

export type OpsCommercialVariationMutationTarget = {
  created_by: string | null;
  status: OpsCommercialVariationStatus;
  submitted_by: string | null;
};

export type OpsCommercialClaimMutationTarget = {
  created_by: string | null;
  status: OpsCommercialClaimStatus;
  submitted_by: string | null;
};

export type OpsCommercialContractMutationTarget = {
  created_by: string | null;
  status: OpsCommercialContractStatus;
};

export type OpsCommercialValuationMutationTarget = {
  created_by: string | null;
  status: OpsCommercialValuationStatus;
  submitted_by: string | null;
};

export type OpsCommercialRiskMutationTarget = {
  created_by: string | null;
  status: OpsCommercialRiskStatus;
};

export type OpsCommercialRetentionReleaseMutationTarget = {
  created_by: string | null;
  status: OpsCommercialRetentionReleaseStatus;
  submitted_by: string | null;
};

export type OpsCommercialCashflowMutationTarget = {
  created_by: string | null;
  status: OpsCommercialCashflowStatus;
};

export type OpsCommercialMilestoneMutationTarget = {
  created_by: string | null;
  owner_id: string | null;
  status: OpsCommercialMilestoneStatus;
};

export type OpsCommercialInvoiceFromIpcTarget = {
  invoice_id: string | null;
  status: OpsCommercialIpcStatus;
};

const COMMERCIAL_VIEW_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "quantity_surveyor",
  "finance_manager",
  "accountant",
  "engineer",
  "owner",
  "manager",
];

const COMMERCIAL_CREATE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "quantity_surveyor",
  "finance_manager",
  "accountant",
  "engineer",
  "owner",
  "manager",
];

const COMMERCIAL_DECISION_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "projects_manager",
  "quantity_surveyor",
  "finance_manager",
  "owner",
  "manager",
];

export function canViewOpsCommercialControls(role: OpsUserRole) {
  return COMMERCIAL_VIEW_ROLES.includes(role);
}

export function canCreateOpsCommercialRecord(role: OpsUserRole) {
  return COMMERCIAL_CREATE_ROLES.includes(role);
}

function canEditDraftCommercialRecord(
  actorId: string,
  role: OpsUserRole,
  record: { created_by: string | null; status: string },
) {
  return (
    (record.status === "draft" || record.status === "rejected") &&
    (record.created_by === actorId || COMMERCIAL_DECISION_ROLES.includes(role))
  );
}

export function canSubmitOpsCommercialIpc(
  actorId: string,
  role: OpsUserRole,
  ipc: OpsCommercialIpcMutationTarget,
) {
  return canEditDraftCommercialRecord(actorId, role, {
    created_by: ipc.created_by,
    status: ipc.status,
  });
}

export function canCertifyOpsCommercialIpc(
  role: OpsUserRole,
  ipc: OpsCommercialIpcMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && ipc.status === "submitted";
}

export function canRejectOpsCommercialIpc(
  role: OpsUserRole,
  ipc: OpsCommercialIpcMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && ipc.status === "submitted";
}

export function canMarkOpsCommercialIpcInvoiced(
  role: OpsUserRole,
  ipc: OpsCommercialIpcMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && ipc.status === "certified";
}

export function canMarkOpsCommercialIpcPaid(
  role: OpsUserRole,
  ipc: OpsCommercialIpcMutationTarget,
) {
  return (
    (role === "developer" ||
      role === "managing_director" ||
      role === "general_manager" ||
      role === "finance_manager" ||
      role === "accountant" ||
      role === "owner" ||
      role === "manager") &&
    ipc.status === "invoiced"
  );
}

export function canCancelOpsCommercialIpc(
  actorId: string,
  role: OpsUserRole,
  ipc: OpsCommercialIpcMutationTarget,
) {
  return (
    (ipc.status === "draft" || ipc.status === "submitted" || ipc.status === "certified") &&
    (COMMERCIAL_DECISION_ROLES.includes(role) || ipc.created_by === actorId || ipc.submitted_by === actorId)
  );
}

export function canSubmitOpsCommercialVariation(
  actorId: string,
  role: OpsUserRole,
  variation: OpsCommercialVariationMutationTarget,
) {
  return canEditDraftCommercialRecord(actorId, role, {
    created_by: variation.created_by,
    status: variation.status,
  });
}

export function canPriceOpsCommercialVariation(
  role: OpsUserRole,
  variation: OpsCommercialVariationMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && variation.status === "submitted";
}

export function canApproveOpsCommercialVariation(
  role: OpsUserRole,
  variation: OpsCommercialVariationMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && variation.status === "priced";
}

export function canRejectOpsCommercialVariation(
  role: OpsUserRole,
  variation: OpsCommercialVariationMutationTarget,
) {
  return (
    COMMERCIAL_DECISION_ROLES.includes(role) &&
    (variation.status === "submitted" || variation.status === "priced")
  );
}

export function canCloseOpsCommercialVariation(
  role: OpsUserRole,
  variation: OpsCommercialVariationMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && variation.status === "approved";
}

export function canCancelOpsCommercialVariation(
  actorId: string,
  role: OpsUserRole,
  variation: OpsCommercialVariationMutationTarget,
) {
  return (
    (variation.status === "draft" ||
      variation.status === "submitted" ||
      variation.status === "priced" ||
      variation.status === "approved") &&
    (COMMERCIAL_DECISION_ROLES.includes(role) ||
      variation.created_by === actorId ||
      variation.submitted_by === actorId)
  );
}

export function canSubmitOpsCommercialClaim(
  actorId: string,
  role: OpsUserRole,
  claim: OpsCommercialClaimMutationTarget,
) {
  return canEditDraftCommercialRecord(actorId, role, {
    created_by: claim.created_by,
    status: claim.status,
  });
}

export function canReviewOpsCommercialClaim(
  role: OpsUserRole,
  claim: OpsCommercialClaimMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && claim.status === "submitted";
}

export function canAgreeOpsCommercialClaim(
  role: OpsUserRole,
  claim: OpsCommercialClaimMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && claim.status === "under_review";
}

export function canRejectOpsCommercialClaim(
  role: OpsUserRole,
  claim: OpsCommercialClaimMutationTarget,
) {
  return (
    COMMERCIAL_DECISION_ROLES.includes(role) &&
    (claim.status === "submitted" || claim.status === "under_review")
  );
}

export function canCloseOpsCommercialClaim(
  role: OpsUserRole,
  claim: OpsCommercialClaimMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && claim.status === "agreed";
}

export function canCancelOpsCommercialClaim(
  actorId: string,
  role: OpsUserRole,
  claim: OpsCommercialClaimMutationTarget,
) {
  return (
    (claim.status === "draft" ||
      claim.status === "submitted" ||
      claim.status === "under_review" ||
      claim.status === "agreed") &&
    (COMMERCIAL_DECISION_ROLES.includes(role) || claim.created_by === actorId || claim.submitted_by === actorId)
  );
}

export function canActivateOpsCommercialContract(
  role: OpsUserRole,
  contract: OpsCommercialContractMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && contract.status === "draft";
}

export function canCompleteOpsCommercialContract(
  role: OpsUserRole,
  contract: OpsCommercialContractMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && contract.status === "active";
}

export function canCancelOpsCommercialContract(
  actorId: string,
  role: OpsUserRole,
  contract: OpsCommercialContractMutationTarget,
) {
  return (
    (contract.status === "draft" || contract.status === "active" || contract.status === "on_hold") &&
    (COMMERCIAL_DECISION_ROLES.includes(role) || contract.created_by === actorId)
  );
}

export function canSubmitOpsCommercialValuation(
  actorId: string,
  role: OpsUserRole,
  valuation: OpsCommercialValuationMutationTarget,
) {
  return canEditDraftCommercialRecord(actorId, role, {
    created_by: valuation.created_by,
    status: valuation.status,
  });
}

export function canEditOpsCommercialValuationLines(
  actorId: string,
  role: OpsUserRole,
  valuation: OpsCommercialValuationMutationTarget,
) {
  return canEditDraftCommercialRecord(actorId, role, {
    created_by: valuation.created_by,
    status: valuation.status,
  });
}

export function canCertifyOpsCommercialValuation(
  role: OpsUserRole,
  valuation: OpsCommercialValuationMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && valuation.status === "submitted";
}

export function canRejectOpsCommercialValuation(
  role: OpsUserRole,
  valuation: OpsCommercialValuationMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && valuation.status === "submitted";
}

export function canCancelOpsCommercialValuation(
  actorId: string,
  role: OpsUserRole,
  valuation: OpsCommercialValuationMutationTarget,
) {
  return (
    (valuation.status === "draft" || valuation.status === "submitted") &&
    (COMMERCIAL_DECISION_ROLES.includes(role) ||
      valuation.created_by === actorId ||
      valuation.submitted_by === actorId)
  );
}

export function canMoveOpsCommercialRiskToMitigation(
  role: OpsUserRole,
  risk: OpsCommercialRiskMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && risk.status === "open";
}

export function canCloseOpsCommercialRisk(
  role: OpsUserRole,
  risk: OpsCommercialRiskMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && (risk.status === "open" || risk.status === "mitigating");
}

export function canCancelOpsCommercialRisk(
  actorId: string,
  role: OpsUserRole,
  risk: OpsCommercialRiskMutationTarget,
) {
  return (
    (risk.status === "open" || risk.status === "mitigating") &&
      (COMMERCIAL_DECISION_ROLES.includes(role) || risk.created_by === actorId)
  );
}

export function canSubmitOpsCommercialRetentionRelease(
  actorId: string,
  role: OpsUserRole,
  release: OpsCommercialRetentionReleaseMutationTarget,
) {
  return canEditDraftCommercialRecord(actorId, role, {
    created_by: release.created_by,
    status: release.status,
  });
}

export function canApproveOpsCommercialRetentionRelease(
  role: OpsUserRole,
  release: OpsCommercialRetentionReleaseMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && release.status === "submitted";
}

export function canRejectOpsCommercialRetentionRelease(
  role: OpsUserRole,
  release: OpsCommercialRetentionReleaseMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && release.status === "submitted";
}

export function canReleaseOpsCommercialRetentionRelease(
  role: OpsUserRole,
  release: OpsCommercialRetentionReleaseMutationTarget,
) {
  return (
    (role === "developer" ||
      role === "managing_director" ||
      role === "general_manager" ||
      role === "finance_manager" ||
      role === "accountant" ||
      role === "owner" ||
      role === "manager") &&
    release.status === "approved"
  );
}

export function canCancelOpsCommercialRetentionRelease(
  actorId: string,
  role: OpsUserRole,
  release: OpsCommercialRetentionReleaseMutationTarget,
) {
  return (
    (release.status === "draft" || release.status === "submitted" || release.status === "approved") &&
    (COMMERCIAL_DECISION_ROLES.includes(role) ||
      release.created_by === actorId ||
      release.submitted_by === actorId)
  );
}

export function canApproveOpsCommercialCashflowForecast(
  role: OpsUserRole,
  forecast: OpsCommercialCashflowMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && forecast.status === "draft";
}

export function canLockOpsCommercialCashflowForecast(
  role: OpsUserRole,
  forecast: OpsCommercialCashflowMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && forecast.status === "approved";
}

export function canArchiveOpsCommercialCashflowForecast(
  role: OpsUserRole,
  forecast: OpsCommercialCashflowMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && (forecast.status === "approved" || forecast.status === "locked");
}

export function canCancelOpsCommercialCashflowForecast(
  actorId: string,
  role: OpsUserRole,
  forecast: OpsCommercialCashflowMutationTarget,
) {
  return (
    (forecast.status === "draft" || forecast.status === "approved") &&
    (COMMERCIAL_DECISION_ROLES.includes(role) || forecast.created_by === actorId)
  );
}

function canOwnOrDecideCommercialMilestone(
  actorId: string,
  role: OpsUserRole,
  milestone: OpsCommercialMilestoneMutationTarget,
) {
  return (
    COMMERCIAL_DECISION_ROLES.includes(role) ||
    milestone.created_by === actorId ||
    milestone.owner_id === actorId
  );
}

export function canMarkOpsCommercialMilestoneDue(
  actorId: string,
  role: OpsUserRole,
  milestone: OpsCommercialMilestoneMutationTarget,
) {
  return (
    (milestone.status === "planned" || milestone.status === "delayed") &&
    canOwnOrDecideCommercialMilestone(actorId, role, milestone)
  );
}

export function canAchieveOpsCommercialMilestone(
  actorId: string,
  role: OpsUserRole,
  milestone: OpsCommercialMilestoneMutationTarget,
) {
  return (
    (milestone.status === "planned" || milestone.status === "due" || milestone.status === "delayed") &&
    canOwnOrDecideCommercialMilestone(actorId, role, milestone)
  );
}

export function canCertifyOpsCommercialMilestone(
  role: OpsUserRole,
  milestone: OpsCommercialMilestoneMutationTarget,
) {
  return COMMERCIAL_DECISION_ROLES.includes(role) && milestone.status === "achieved";
}

export function canDelayOpsCommercialMilestone(
  actorId: string,
  role: OpsUserRole,
  milestone: OpsCommercialMilestoneMutationTarget,
) {
  return (
    (milestone.status === "planned" || milestone.status === "due") &&
    canOwnOrDecideCommercialMilestone(actorId, role, milestone)
  );
}

export function canCancelOpsCommercialMilestone(
  actorId: string,
  role: OpsUserRole,
  milestone: OpsCommercialMilestoneMutationTarget,
) {
  return (
    milestone.status !== "certified" &&
    milestone.status !== "cancelled" &&
    (COMMERCIAL_DECISION_ROLES.includes(role) || milestone.created_by === actorId)
  );
}

export function canCreateOpsCommercialInvoiceFromIpc(
  role: OpsUserRole,
  ipc: OpsCommercialInvoiceFromIpcTarget,
) {
  return (
    (role === "developer" ||
      role === "managing_director" ||
      role === "general_manager" ||
      role === "quantity_surveyor" ||
      role === "finance_manager" ||
      role === "accountant" ||
      role === "owner" ||
      role === "manager") &&
    ipc.status === "certified" &&
    !ipc.invoice_id
  );
}
