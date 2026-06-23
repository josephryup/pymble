import type {
  OpsPurchaseOrderStatus,
  OpsRfqStatus,
  OpsUserRole,
} from "@/lib/ops/types";
import { formatOpsRole } from "@/lib/ops/roles";

export type OpsRfqMutationTarget = {
  status: OpsRfqStatus;
};

export type OpsPurchaseOrderMutationTarget = {
  status: OpsPurchaseOrderStatus;
};

export type OpsPurchaseOrderApprovalSettings = {
  currency_code: string;
  first_step_role: OpsUserRole;
  is_active: boolean;
  second_step_role: OpsUserRole | null;
  threshold_amount: number;
  threshold_enabled: boolean;
  threshold_step_role: OpsUserRole | null;
};

export type OpsPurchaseOrderApprovalStepTemplate = {
  approverRole: OpsUserRole;
  label: string;
  sequence: number;
  stepNumber: number;
};

const RFQ_PO_VIEW_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "quantity_surveyor",
  "procurement",
  "procurement_assistant",
  "finance_manager",
  "accountant",
  "owner",
  "manager",
];

const RFQ_PO_CREATE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "procurement_manager",
  "procurement",
  "procurement_assistant",
  "owner",
  "manager",
];

const RFQ_PO_MANAGER_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "procurement_manager",
  "procurement",
  "owner",
  "manager",
];

export function canViewOpsRfqPo(role: OpsUserRole) {
  return RFQ_PO_VIEW_ROLES.includes(role);
}

export function canCreateOpsRfq(role: OpsUserRole) {
  return RFQ_PO_CREATE_ROLES.includes(role);
}

export function canManageOpsRfq(role: OpsUserRole) {
  return RFQ_PO_MANAGER_ROLES.includes(role);
}

export function canAddOpsRfqItem(role: OpsUserRole, rfq: OpsRfqMutationTarget) {
  return canCreateOpsRfq(role) && (rfq.status === "draft" || rfq.status === "issued");
}

/**
 * Editing an RFQ header or its line items is allowed for creators while the
 * RFQ has not yet been awarded/closed (draft or issued). Mirrors the add-item
 * gate so edit and add stay consistent.
 */
export function canEditOpsRfq(role: OpsUserRole, rfq: OpsRfqMutationTarget) {
  return canCreateOpsRfq(role) && (rfq.status === "draft" || rfq.status === "issued");
}

export function canCancelOpsRfq(role: OpsUserRole, rfq: OpsRfqMutationTarget) {
  return canManageOpsRfq(role) && rfq.status !== "closed" && rfq.status !== "cancelled";
}

/** Archiving a requisition is a reversible tidy-up available to manager roles. */
export function canArchiveOpsRfq(role: OpsUserRole) {
  return canManageOpsRfq(role);
}

export function canEditOpsPurchaseOrder(
  role: OpsUserRole,
  purchaseOrder: OpsPurchaseOrderMutationTarget,
) {
  return (
    canManageOpsRfq(role) &&
    (purchaseOrder.status === "draft" || purchaseOrder.status === "rejected")
  );
}

export function canSubmitOpsPurchaseOrderForApproval(
  role: OpsUserRole,
  purchaseOrder: OpsPurchaseOrderMutationTarget,
) {
  return (
    canManageOpsRfq(role) &&
    (purchaseOrder.status === "draft" || purchaseOrder.status === "rejected")
  );
}

export function canIssueOpsPurchaseOrder(
  role: OpsUserRole,
  purchaseOrder: OpsPurchaseOrderMutationTarget,
) {
  return canManageOpsRfq(role) && purchaseOrder.status === "approved";
}

export function purchaseOrderApprovalSteps(
  settings: OpsPurchaseOrderApprovalSettings,
  totalAmount: number,
): OpsPurchaseOrderApprovalStepTemplate[] {
  if (!settings.is_active) {
    return [];
  }

  const roles: OpsUserRole[] = [settings.first_step_role];

  if (settings.second_step_role) {
    roles.push(settings.second_step_role);
  }

  if (
    settings.threshold_enabled &&
    settings.threshold_step_role &&
    totalAmount >= settings.threshold_amount
  ) {
    roles.push(settings.threshold_step_role);
  }

  return roles
    .filter((role, index, allRoles) => allRoles.indexOf(role) === index)
    .map((role, index) => ({
      approverRole: role,
      label: `${formatOpsRole(role)} review`,
      sequence: 1,
      stepNumber: index + 1,
    }));
}

export function purchaseOrderApprovalRecipientRoles(
  steps: OpsPurchaseOrderApprovalStepTemplate[],
) {
  return Array.from(
    new Set<OpsUserRole>([
      ...steps.map((step) => step.approverRole),
      "developer",
    ]),
  );
}
