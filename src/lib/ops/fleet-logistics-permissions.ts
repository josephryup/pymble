import type {
  OpsAccommodationBookingStatus,
  OpsLabourAllocationStatus,
  OpsTransportRequestStatus,
  OpsUserRole,
} from "@/lib/ops/types";

export type OpsTransportRequestMutationTarget = {
  requested_by: string | null;
  status: OpsTransportRequestStatus;
};

export type OpsAccommodationBookingMutationTarget = {
  requested_by: string | null;
  status: OpsAccommodationBookingStatus;
};

export type OpsLabourAllocationMutationTarget = {
  requested_by: string | null;
  status: OpsLabourAllocationStatus;
};

const FLEET_LOGISTICS_VIEW_ROLES: OpsUserRole[] = [
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
  "human_resource",
  "admin_receptionist",
  "owner",
  "hr",
  "manager",
  "supervisor",
];

const FLEET_LOGISTICS_REQUEST_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "quantity_surveyor",
  "engineer",
  "hse_officer",
  "hse_assistant_officer",
  "human_resource",
  "admin_receptionist",
  "owner",
  "hr",
  "manager",
  "supervisor",
];

const FLEET_LOGISTICS_DECISION_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "human_resource",
  "owner",
  "hr",
  "manager",
];

const FLEET_LOGISTICS_COST_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "finance_manager",
  "accountant",
  "owner",
  "manager",
];

const FLEET_LOGISTICS_OPERATOR_DOCUMENT_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "human_resource",
  "hse_officer",
  "hse_assistant_officer",
  "owner",
  "hr",
  "manager",
];

export function canViewOpsFleetLogistics(role: OpsUserRole) {
  return FLEET_LOGISTICS_VIEW_ROLES.includes(role);
}

export function canCreateOpsTransportRequest(role: OpsUserRole) {
  return FLEET_LOGISTICS_REQUEST_ROLES.includes(role);
}

export function canEditOpsTransportRequest(
  actorId: string,
  role: OpsUserRole,
  request: OpsTransportRequestMutationTarget,
) {
  return (
    (request.status === "draft" || request.status === "rejected") &&
    (FLEET_LOGISTICS_DECISION_ROLES.includes(role) || request.requested_by === actorId)
  );
}

export function canSubmitOpsTransportRequest(
  actorId: string,
  role: OpsUserRole,
  request: OpsTransportRequestMutationTarget,
) {
  return canEditOpsTransportRequest(actorId, role, request);
}

export function canApproveOpsTransportRequest(
  role: OpsUserRole,
  request: OpsTransportRequestMutationTarget,
) {
  return FLEET_LOGISTICS_DECISION_ROLES.includes(role) && request.status === "submitted";
}

export function canRejectOpsTransportRequest(
  role: OpsUserRole,
  request: OpsTransportRequestMutationTarget,
) {
  return FLEET_LOGISTICS_DECISION_ROLES.includes(role) && request.status === "submitted";
}

export function canScheduleOpsTransportRequest(
  role: OpsUserRole,
  request: OpsTransportRequestMutationTarget,
) {
  return FLEET_LOGISTICS_DECISION_ROLES.includes(role) && request.status === "approved";
}

export function canCompleteOpsTransportRequest(
  role: OpsUserRole,
  request: OpsTransportRequestMutationTarget,
) {
  return FLEET_LOGISTICS_DECISION_ROLES.includes(role) && request.status === "scheduled";
}

export function canCancelOpsTransportRequest(
  actorId: string,
  role: OpsUserRole,
  request: OpsTransportRequestMutationTarget,
) {
  return (
    (request.status === "draft" ||
      request.status === "submitted" ||
      request.status === "approved" ||
      request.status === "scheduled") &&
    (FLEET_LOGISTICS_DECISION_ROLES.includes(role) || request.requested_by === actorId)
  );
}

export function canCreateOpsAccommodationBooking(role: OpsUserRole) {
  return FLEET_LOGISTICS_REQUEST_ROLES.includes(role);
}

export function canConfirmOpsAccommodationBooking(
  role: OpsUserRole,
  booking: OpsAccommodationBookingMutationTarget,
) {
  return FLEET_LOGISTICS_DECISION_ROLES.includes(role) && booking.status === "requested";
}

export function canCheckInOpsAccommodationBooking(
  role: OpsUserRole,
  booking: OpsAccommodationBookingMutationTarget,
) {
  return FLEET_LOGISTICS_DECISION_ROLES.includes(role) && booking.status === "confirmed";
}

export function canCompleteOpsAccommodationBooking(
  role: OpsUserRole,
  booking: OpsAccommodationBookingMutationTarget,
) {
  return FLEET_LOGISTICS_DECISION_ROLES.includes(role) && booking.status === "checked_in";
}

export function canCancelOpsAccommodationBooking(
  actorId: string,
  role: OpsUserRole,
  booking: OpsAccommodationBookingMutationTarget,
) {
  return (
    (booking.status === "requested" ||
      booking.status === "confirmed" ||
      booking.status === "checked_in") &&
    (FLEET_LOGISTICS_DECISION_ROLES.includes(role) || booking.requested_by === actorId)
  );
}

export function canCreateOpsLabourAllocation(role: OpsUserRole) {
  return FLEET_LOGISTICS_REQUEST_ROLES.includes(role);
}

export function canStartOpsLabourAllocation(
  role: OpsUserRole,
  allocation: OpsLabourAllocationMutationTarget,
) {
  return FLEET_LOGISTICS_DECISION_ROLES.includes(role) && allocation.status === "planned";
}

export function canCompleteOpsLabourAllocation(
  role: OpsUserRole,
  allocation: OpsLabourAllocationMutationTarget,
) {
  return FLEET_LOGISTICS_DECISION_ROLES.includes(role) && allocation.status === "active";
}

export function canCancelOpsLabourAllocation(
  actorId: string,
  role: OpsUserRole,
  allocation: OpsLabourAllocationMutationTarget,
) {
  return (
    (allocation.status === "planned" || allocation.status === "active") &&
    (FLEET_LOGISTICS_DECISION_ROLES.includes(role) || allocation.requested_by === actorId)
  );
}

export function canPostOpsFleetLogisticsCosts(role: OpsUserRole) {
  return FLEET_LOGISTICS_COST_ROLES.includes(role);
}

export function canManageOpsFleetOperatorDocuments(role: OpsUserRole) {
  return FLEET_LOGISTICS_OPERATOR_DOCUMENT_ROLES.includes(role);
}
