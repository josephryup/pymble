import type { OpsPurchaseOrderStatus, OpsUserRole } from "@/lib/ops/types";

export type OpsPurchaseOrderReceiptTarget = {
  status: OpsPurchaseOrderStatus;
};

const STORES_VIEW_ROLES: OpsUserRole[] = [
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
  "engineer",
  "owner",
  "manager",
  "supervisor",
];

const STORES_MASTER_DATA_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "procurement_manager",
  "procurement",
  "owner",
  "manager",
];

const STORES_RECEIPT_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "procurement",
  "procurement_assistant",
  "engineer",
  "owner",
  "manager",
  "supervisor",
];

const STORES_STOCK_MOVEMENT_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "procurement",
  "procurement_assistant",
  "engineer",
  "owner",
  "manager",
  "supervisor",
];

const STORES_ADJUSTMENT_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "operations_manager",
  "procurement_manager",
  "owner",
  "manager",
];

export function canViewOpsStoresInventory(role: OpsUserRole) {
  return STORES_VIEW_ROLES.includes(role);
}

export function canManageOpsInventoryMasterData(role: OpsUserRole) {
  return STORES_MASTER_DATA_ROLES.includes(role);
}

export function canRecordOpsGoodsReceived(role: OpsUserRole, purchaseOrder: OpsPurchaseOrderReceiptTarget) {
  return (
    STORES_RECEIPT_ROLES.includes(role) &&
    (purchaseOrder.status === "issued" || purchaseOrder.status === "partially_received")
  );
}

export function canIssueOpsStock(role: OpsUserRole) {
  return STORES_STOCK_MOVEMENT_ROLES.includes(role);
}

export function canTransferOpsStock(role: OpsUserRole) {
  return STORES_STOCK_MOVEMENT_ROLES.includes(role);
}

export function canAdjustOpsStock(role: OpsUserRole) {
  return STORES_ADJUSTMENT_ROLES.includes(role);
}
