export type OpsUserRole =
  | "developer"
  | "managing_director"
  | "general_manager"
  | "human_resource"
  | "operations_manager"
  | "projects_manager"
  | "procurement_manager"
  | "quantity_surveyor"
  | "procurement"
  | "procurement_assistant"
  | "finance_manager"
  | "accountant"
  | "engineer"
  | "hse_officer"
  | "hse_assistant_officer"
  | "admin_receptionist"
  | "owner"
  | "hr"
  | "manager"
  | "supervisor"
  | "crew";
export type OpsWorkerType = "casual" | "permanent";
export type OpsMomoProvider = "mtn" | "airtel";
export type OpsSiteStatus = "active" | "mobilizing" | "closing";
export type OpsAttendanceSource = "app" | "manual" | "ussd";
export type OpsAttendancePresence = "present" | "late" | "absent";
export type OpsPayrollStatus = "draft" | "approved" | "disbursing" | "completed";
export type OpsPayoutStatus = "pending" | "sent" | "failed";
export type OpsBoqStatus = "draft" | "issued";
export type OpsInvoiceStatus = "draft" | "sent" | "paid";
export type OpsPhotoTag = "progress" | "delivery" | "safety";

export type OpsModuleStatus = "ready";

export type OpsModule = {
  title: string;
  description: string;
  href: string;
  roles: OpsUserRole[];
  status: OpsModuleStatus;
};
