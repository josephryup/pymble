import type { OpsMaterialRequestStatus, OpsPriority, OpsUserRole } from "@/lib/ops/types";

export type OpsMaterialRequestMutationTarget = {
  requested_by: string | null;
  status: OpsMaterialRequestStatus;
};

export type OpsMaterialApprovalStepTemplate = {
  approverRole: OpsUserRole;
  label: string;
  sequence: number;
  stepNumber: number;
};

const MATERIAL_REQUEST_CREATOR_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "quantity_surveyor",
  "procurement",
  "procurement_assistant",
  "engineer",
  "manager",
  "supervisor",
  "owner",
  // HSE may need PPE / safety equipment supplied via the same flow.
  "hse_officer",
  "hse_assistant_officer",
];

const MATERIAL_REQUEST_PRICING_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "procurement_manager",
  "procurement",
  "procurement_assistant",
];

const MATERIAL_REQUEST_FINANCE_APPROVAL_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "finance_manager",
  "accountant",
];

const MATERIAL_REQUEST_MANAGER_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "procurement",
  "owner",
  "manager",
];

export function canCreateOpsMaterialRequest(role: OpsUserRole) {
  return MATERIAL_REQUEST_CREATOR_ROLES.includes(role);
}

export function canViewAllOpsMaterialRequests(role: OpsUserRole) {
  return MATERIAL_REQUEST_MANAGER_ROLES.includes(role);
}

export function canManageOpsMaterialRequest(role: OpsUserRole) {
  return MATERIAL_REQUEST_MANAGER_ROLES.includes(role);
}

export function canMutateOpsMaterialRequest(
  actorId: string,
  actorRole: OpsUserRole,
  request: OpsMaterialRequestMutationTarget,
) {
  return (
    canManageOpsMaterialRequest(actorRole) ||
    (canCreateOpsMaterialRequest(actorRole) && request.requested_by === actorId)
  );
}

export function canEditOpsMaterialRequest(
  actorId: string,
  actorRole: OpsUserRole,
  request: OpsMaterialRequestMutationTarget,
) {
  // Editable while the request hasn't been ordered/closed. Pricing roles can
  // still adjust line items during pricing_pending / priced.
  const editableStatuses: OpsMaterialRequestStatus[] = [
    "draft",
    "rejected",
    "pricing_pending",
    "priced",
  ];
  return (
    editableStatuses.includes(request.status) &&
    canMutateOpsMaterialRequest(actorId, actorRole, request)
  );
}

export function canSubmitOpsMaterialRequest(
  actorId: string,
  actorRole: OpsUserRole,
  request: OpsMaterialRequestMutationTarget,
) {
  return canEditOpsMaterialRequest(actorId, actorRole, request);
}

export function materialRequestApprovalSteps(
  _priority: OpsPriority,
  _estimatedTotal: number,
): OpsMaterialApprovalStepTemplate[] {
  void _priority;
  void _estimatedTotal;

  // Single operations approval step. When approved, the material request moves
  // to `pricing_pending` for Procurement to attach supplier prices, then to
  // `priced` for Finance to approve the cost — those two transitions are
  // handled as explicit actions, not as approval steps.
  return [
    {
      approverRole: "operations_manager",
      label: "Operations review",
      sequence: 1,
      stepNumber: 1,
    },
  ];
}

export function canAttachMaterialRequestPricing(role: OpsUserRole) {
  return MATERIAL_REQUEST_PRICING_ROLES.includes(role);
}

export function canApproveMaterialRequestCost(role: OpsUserRole) {
  return MATERIAL_REQUEST_FINANCE_APPROVAL_ROLES.includes(role);
}

const MATERIAL_REQUEST_ARCHIVE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "general_manager",
  "manager",
  "operations_manager",
  "projects_manager",
];

export function canCancelOpsMaterialRequest(
  actorId: string,
  actorRole: OpsUserRole,
  request: OpsMaterialRequestMutationTarget,
) {
  // Already closed / cancelled / ordered → no cancellation possible.
  if (
    request.status === "closed" ||
    request.status === "cancelled" ||
    request.status === "ordered"
  ) {
    return false;
  }
  // Requester can cancel their own.
  if (request.requested_by === actorId && canCreateOpsMaterialRequest(actorRole)) {
    return true;
  }
  return MATERIAL_REQUEST_ARCHIVE_ROLES.includes(actorRole);
}

export function canArchiveOpsMaterialRequest(
  actorRole: OpsUserRole,
  request: OpsMaterialRequestMutationTarget,
) {
  // Only archive once the request has reached a terminal state.
  const terminal: OpsMaterialRequestStatus[] = ["rejected", "cancelled", "closed"];
  return terminal.includes(request.status) && MATERIAL_REQUEST_ARCHIVE_ROLES.includes(actorRole);
}

export function canDeleteOpsMaterialRequest(actorRole: OpsUserRole) {
  return actorRole === "developer";
}

export function materialRequestApprovalRecipientRoles(
  steps: OpsMaterialApprovalStepTemplate[],
) {
  return Array.from(
    new Set<OpsUserRole>([
      ...steps.map((step) => step.approverRole),
      "developer",
    ]),
  );
}

export function shouldSyncMaterialRequestFromApproval(sourceTable: string) {
  return sourceTable === "material_requests";
}
