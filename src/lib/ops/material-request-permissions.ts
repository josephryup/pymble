import type {
  OpsMaterialRequestScope,
  OpsMaterialRequestStatus,
  OpsPriority,
  OpsUserRole,
} from "@/lib/ops/types";

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
  // IT raises confidential IT-scoped requests (see canCreateOpsMaterialRequestScope).
  "it_manager",
];

/**
 * Who may see IT-scoped (confidential) material requests at all. The requester
 * always sees their own; beyond that it is leadership (MD/GM/Operations/
 * Projects) plus the Procurement and Finance roles the flow passes through.
 */
const IT_MATERIAL_REQUEST_VIEWER_ROLES: OpsUserRole[] = [
  "developer",
  "owner",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "it_manager",
  "procurement_manager",
  "procurement",
  "procurement_assistant",
  "finance_manager",
  "accountant",
];

export function canViewOpsItMaterialRequests(role: OpsUserRole) {
  return IT_MATERIAL_REQUEST_VIEWER_ROLES.includes(role);
}

/**
 * Scope-aware creation gate. The IT manager only raises IT-scoped requests;
 * IT scope is only available to IT and top leadership.
 */
export function canCreateOpsMaterialRequestScope(
  role: OpsUserRole,
  scope: OpsMaterialRequestScope,
) {
  if (scope === "it") {
    return ["developer", "owner", "managing_director", "it_manager"].includes(role);
  }
  if (role === "it_manager") {
    return false;
  }
  return canCreateOpsMaterialRequest(role);
}

/** Final MD gate on IT-scoped requests (priced -> finance -> md_review -> approved). */
export function canApproveMaterialRequestMdReview(role: OpsUserRole) {
  return ["developer", "owner", "managing_director"].includes(role);
}

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

/**
 * Finance does not manage the full material-request register, but both finance
 * seats must be able to open every request that is waiting for the shared cost
 * decision. Keeping this separate from the manager gate prevents the priced
 * approval queue from accidentally granting access to drafts and procurement
 * work in progress.
 */
export function canViewOpsMaterialRequestFinanceQueue(role: OpsUserRole) {
  return MATERIAL_REQUEST_FINANCE_APPROVAL_ROLES.includes(role);
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
  scope: OpsMaterialRequestScope = "site",
): OpsMaterialApprovalStepTemplate[] {
  void _priority;
  void _estimatedTotal;

  // When the chain completes, the material request moves to `pricing_pending`
  // for Procurement to attach supplier prices, then to `priced` for Finance to
  // approve the cost — those transitions are explicit actions, not steps.
  //
  // Site-scoped requests get a Projects Manager accuracy/quality check BEFORE
  // Operations (system-wide audit §6a): the PM confirms the request and its
  // listed materials are correct for the project. IT and general/office
  // requests keep the single Operations step — the PM check is a project-site
  // concern only. If no active PM exists, the submit action swaps the step's
  // approver to the Managing Director at chain-construction time (deliberately
  // NOT the generic OM/GM fallback chain).
  if (scope === "site") {
    return [
      {
        approverRole: "projects_manager",
        label: "Projects Manager review",
        sequence: 1,
        stepNumber: 1,
      },
      {
        approverRole: "operations_manager",
        label: "Operations review",
        sequence: 1,
        stepNumber: 2,
      },
    ];
  }

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

/**
 * Who may record the procurement department's internal transport/sourcing cost.
 * Same gate as pricing — it is a procurement-owned figure.
 */
export function canSetMaterialRequestTransportCost(role: OpsUserRole) {
  return MATERIAL_REQUEST_PRICING_ROLES.includes(role);
}

export function canApproveMaterialRequestCost(role: OpsUserRole) {
  return MATERIAL_REQUEST_FINANCE_APPROVAL_ROLES.includes(role);
}

/**
 * Who may confirm that ordered materials were delivered (Option A — the site
 * requester is the primary confirmer, with operations/procurement managers as a
 * backstop). Only meaningful once the request has been ordered.
 */
export function canConfirmMaterialRequestDelivery(
  actorId: string,
  actorRole: OpsUserRole,
  request: OpsMaterialRequestMutationTarget,
) {
  // Partially ordered counts: goods that WERE procured can arrive on site
  // before the outstanding items are sourced, and making the site wait for a
  // second procurement round before confirming the first delivery would put
  // the request out of step with reality.
  if (request.status !== "ordered" && request.status !== "partially_ordered") {
    return false;
  }
  if (request.requested_by === actorId && canCreateOpsMaterialRequest(actorRole)) {
    return true;
  }
  return canManageOpsMaterialRequest(actorRole);
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
  // Already closed / cancelled / ordered / delivered → no cancellation
  // possible. `partially_ordered` is included: once any purchase order exists,
  // cancelling the request would strand a live commitment to a supplier.
  if (
    request.status === "closed" ||
    request.status === "cancelled" ||
    request.status === "partially_ordered" ||
    request.status === "ordered" ||
    request.status === "delivered"
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
  // Only the FIRST step's approver(s) are notified at submission time — later
  // steps are notified by decideOpsApprovalAction when the chain actually
  // reaches them. Flattening every step here would prematurely summon the
  // Operations Manager before the Projects Manager has reviewed (audit §6a.1).
  const firstStepNumber = Math.min(...steps.map((step) => step.stepNumber));
  return Array.from(
    new Set<OpsUserRole>([
      ...steps
        .filter((step) => step.stepNumber === firstStepNumber)
        .map((step) => step.approverRole),
      "developer",
    ]),
  );
}

export function shouldSyncMaterialRequestFromApproval(sourceTable: string) {
  return sourceTable === "material_requests";
}
