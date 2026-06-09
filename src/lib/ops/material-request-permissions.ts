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
  return (
    (request.status === "draft" || request.status === "rejected") &&
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

  return [
    {
      approverRole: "projects_manager",
      label: "Projects Manager review",
      sequence: 1,
      stepNumber: 1,
    },
    {
      approverRole: "procurement_manager",
      label: "Procurement Manager review",
      sequence: 1,
      stepNumber: 2,
    },
  ];
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
