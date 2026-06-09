import type {
  OpsEquipmentAllocationStatus,
  OpsEquipmentRequestStatus,
  OpsMaintenanceJobStatus,
  OpsUserRole,
} from "@/lib/ops/types";

export type OpsEquipmentRequestMutationTarget = {
  requested_by: string | null;
  status: OpsEquipmentRequestStatus;
};

export type OpsEquipmentAllocationMutationTarget = {
  status: OpsEquipmentAllocationStatus;
};

export type OpsMaintenanceJobMutationTarget = {
  status: OpsMaintenanceJobStatus;
};

const EQUIPMENT_VIEW_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "quantity_surveyor",
  "procurement",
  "finance_manager",
  "accountant",
  "engineer",
  "hse_officer",
  "hse_assistant_officer",
  "owner",
  "manager",
  "supervisor",
];

const EQUIPMENT_MASTER_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "procurement_manager",
  "finance_manager",
  "owner",
  "manager",
];

const EQUIPMENT_REQUEST_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "quantity_surveyor",
  "engineer",
  "hse_officer",
  "hse_assistant_officer",
  "owner",
  "manager",
  "supervisor",
];

const EQUIPMENT_REVIEW_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "owner",
  "manager",
];

const EQUIPMENT_ALLOCATE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "owner",
  "manager",
];

const FUEL_LOG_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "engineer",
  "owner",
  "manager",
  "supervisor",
];

const MAINTENANCE_CREATE_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "finance_manager",
  "engineer",
  "owner",
  "manager",
  "supervisor",
];

const MAINTENANCE_DECISION_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "finance_manager",
  "owner",
  "manager",
];

export function canViewOpsEquipment(role: OpsUserRole) {
  return EQUIPMENT_VIEW_ROLES.includes(role);
}

export function canManageOpsEquipmentMasterData(role: OpsUserRole) {
  return EQUIPMENT_MASTER_ROLES.includes(role);
}

export function canCreateOpsEquipmentRequest(role: OpsUserRole) {
  return EQUIPMENT_REQUEST_ROLES.includes(role);
}

export function canEditOpsEquipmentRequest(
  actorId: string,
  role: OpsUserRole,
  request: OpsEquipmentRequestMutationTarget,
) {
  return (
    (request.status === "draft" || request.status === "rejected") &&
    (EQUIPMENT_REVIEW_ROLES.includes(role) || request.requested_by === actorId)
  );
}

export function canSubmitOpsEquipmentRequest(
  actorId: string,
  role: OpsUserRole,
  request: OpsEquipmentRequestMutationTarget,
) {
  return canEditOpsEquipmentRequest(actorId, role, request);
}

export function canApproveOpsEquipmentRequest(
  role: OpsUserRole,
  request: OpsEquipmentRequestMutationTarget,
) {
  return EQUIPMENT_REVIEW_ROLES.includes(role) && request.status === "submitted";
}

export function canRejectOpsEquipmentRequest(
  role: OpsUserRole,
  request: OpsEquipmentRequestMutationTarget,
) {
  return EQUIPMENT_REVIEW_ROLES.includes(role) && request.status === "submitted";
}

export function canCancelOpsEquipmentRequest(
  actorId: string,
  role: OpsUserRole,
  request: OpsEquipmentRequestMutationTarget,
) {
  return (
    (request.status === "draft" ||
      request.status === "submitted" ||
      request.status === "approved") &&
    (EQUIPMENT_REVIEW_ROLES.includes(role) || request.requested_by === actorId)
  );
}

export function canAllocateOpsEquipment(
  role: OpsUserRole,
  request: OpsEquipmentRequestMutationTarget,
) {
  return EQUIPMENT_ALLOCATE_ROLES.includes(role) && request.status === "approved";
}

export function canStartOpsEquipmentAllocation(
  role: OpsUserRole,
  allocation: OpsEquipmentAllocationMutationTarget,
) {
  return EQUIPMENT_ALLOCATE_ROLES.includes(role) && allocation.status === "scheduled";
}

export function canCompleteOpsEquipmentAllocation(
  role: OpsUserRole,
  allocation: OpsEquipmentAllocationMutationTarget,
) {
  return EQUIPMENT_ALLOCATE_ROLES.includes(role) && allocation.status === "active";
}

export function canCancelOpsEquipmentAllocation(
  role: OpsUserRole,
  allocation: OpsEquipmentAllocationMutationTarget,
) {
  return (
    EQUIPMENT_ALLOCATE_ROLES.includes(role) &&
    (allocation.status === "scheduled" || allocation.status === "active")
  );
}

export function canRecordOpsFuelLog(role: OpsUserRole) {
  return FUEL_LOG_ROLES.includes(role);
}

export function canCreateOpsMaintenanceJob(role: OpsUserRole) {
  return MAINTENANCE_CREATE_ROLES.includes(role);
}

export function canStartOpsMaintenanceJob(
  role: OpsUserRole,
  job: OpsMaintenanceJobMutationTarget,
) {
  return MAINTENANCE_DECISION_ROLES.includes(role) && job.status === "scheduled";
}

export function canCompleteOpsMaintenanceJob(
  role: OpsUserRole,
  job: OpsMaintenanceJobMutationTarget,
) {
  return MAINTENANCE_DECISION_ROLES.includes(role) && job.status === "in_progress";
}

export function canCancelOpsMaintenanceJob(
  role: OpsUserRole,
  job: OpsMaintenanceJobMutationTarget,
) {
  return (
    MAINTENANCE_DECISION_ROLES.includes(role) &&
    (job.status === "scheduled" || job.status === "in_progress")
  );
}
