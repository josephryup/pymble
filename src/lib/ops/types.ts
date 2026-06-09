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
export type OpsPriority = "low" | "normal" | "high" | "urgent";
export type OpsApprovalStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | "cancelled"
  | "closed";
export type OpsApprovalStepStatus = "pending" | "approved" | "rejected" | "skipped" | "cancelled";
export type OpsDocumentStatus = "active" | "superseded" | "archived";
export type OpsDocumentVisibility = "company" | "restricted" | "private";
export type OpsMaterialRequestStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | "cancelled"
  | "ordered"
  | "closed";
export type OpsNotificationStatus = "unread" | "read" | "archived";
export type OpsEmailDeliveryStatus = "sent" | "failed" | "skipped";
export type OpsSupplierStatus = "active" | "on_hold" | "archived";
export type OpsSupplierPerformanceEventType =
  | "delivery"
  | "quality"
  | "commercial"
  | "safety"
  | "communication"
  | "compliance"
  | "general";
export type OpsRfqStatus = "draft" | "issued" | "quoted" | "awarded" | "closed" | "cancelled";
export type OpsSupplierQuoteStatus = "invited" | "received" | "declined" | "awarded" | "rejected";
export type OpsPurchaseOrderStatus =
  | "draft"
  | "approval_pending"
  | "rejected"
  | "approved"
  | "issued"
  | "partially_received"
  | "closed"
  | "cancelled";
export type OpsGrnStatus = "posted" | "cancelled";
export type OpsInventoryLocationType = "central_store" | "site_store" | "yard" | "vehicle";
export type OpsStockMovementType = "receipt" | "issue" | "adjustment" | "transfer";
export type OpsDailySiteReportStatus = "draft" | "submitted" | "reviewed" | "closed";
export type OpsDailySiteReportEntryType =
  | "progress"
  | "labour"
  | "equipment"
  | "material"
  | "delay"
  | "hse"
  | "commercial";
export type OpsSiteInstructionStatus =
  | "draft"
  | "issued"
  | "acknowledged"
  | "closed"
  | "cancelled";
export type OpsQaInspectionStatus =
  | "planned"
  | "completed"
  | "action_required"
  | "closed"
  | "cancelled";
export type OpsQaInspectionItemResult =
  | "pending"
  | "pass"
  | "fail"
  | "observation"
  | "not_applicable";
export type OpsQaFindingCategory =
  | "workmanship"
  | "material"
  | "design"
  | "safety"
  | "environmental"
  | "documentation"
  | "dimensional"
  | "testing"
  | "coordination"
  | "other";
export type OpsMaterialTestStatus =
  | "scheduled"
  | "submitted"
  | "passed"
  | "failed"
  | "cancelled";
export type OpsSnagItemStatus =
  | "open"
  | "in_progress"
  | "resolved"
  | "verified"
  | "cancelled";
export type OpsDrawingRegisterStatus = "current" | "superseded" | "archived";
export type OpsProgrammeMilestoneStatus =
  | "planned"
  | "on_track"
  | "delayed"
  | "completed"
  | "cancelled";
export type OpsSiteInstructionFollowUpStatus =
  | "open"
  | "in_progress"
  | "closed"
  | "cancelled";
export type OpsSiteInstructionFollowUpType =
  | "qa_inspection"
  | "snag"
  | "material_test"
  | "drawing_update"
  | "programme_update"
  | "other";
export type OpsDeliveryExceptionStatus =
  | "open"
  | "investigating"
  | "resolved"
  | "closed"
  | "cancelled";
export type OpsDeliveryExceptionType =
  | "late_delivery"
  | "short_delivery"
  | "over_delivery"
  | "damaged_goods"
  | "wrong_item"
  | "quality_rejection"
  | "missing_document"
  | "other";
export type OpsDeliveryExceptionSeverity = "low" | "medium" | "high" | "critical";
export type OpsProjectBudgetStatus = "draft" | "active" | "locked" | "archived";
export type OpsPaymentRequestStatus =
  | "draft"
  | "submitted"
  | "finance_review"
  | "approved"
  | "rejected"
  | "paid"
  | "cancelled";
export type OpsPaymentRequestType =
  | "supplier_invoice"
  | "expense"
  | "subcontractor"
  | "payroll"
  | "tax"
  | "other";
export type OpsProjectCostEntryStatus = "committed" | "posted" | "cancelled";
export type OpsEquipmentStatus = "available" | "allocated" | "maintenance" | "inactive";
export type OpsEquipmentOwnership = "company_owned" | "hired" | "leased";
export type OpsEquipmentRequestStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "allocated"
  | "cancelled"
  | "closed";
export type OpsEquipmentAllocationStatus =
  | "scheduled"
  | "active"
  | "completed"
  | "cancelled";
export type OpsFuelLogStatus = "posted" | "cancelled";
export type OpsMaintenanceJobStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";
export type OpsMaintenanceJobType =
  | "preventive"
  | "repair"
  | "inspection"
  | "service"
  | "breakdown"
  | "other";
export type OpsTransportRequestStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "scheduled"
  | "completed"
  | "rejected"
  | "cancelled";
export type OpsTransportRequestType =
  | "staff_transport"
  | "material_delivery"
  | "equipment_move"
  | "site_visit"
  | "client_visit"
  | "other";
export type OpsAccommodationBookingStatus =
  | "requested"
  | "confirmed"
  | "checked_in"
  | "completed"
  | "cancelled";
export type OpsLabourAllocationStatus =
  | "planned"
  | "active"
  | "completed"
  | "cancelled";
export type OpsFleetOperatorDocumentStatus = "active" | "archived";
export type OpsCommercialIpcStatus =
  | "draft"
  | "submitted"
  | "certified"
  | "invoiced"
  | "paid"
  | "rejected"
  | "cancelled";
export type OpsCommercialVariationStatus =
  | "draft"
  | "submitted"
  | "priced"
  | "approved"
  | "rejected"
  | "closed"
  | "cancelled";
export type OpsCommercialClaimStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "agreed"
  | "rejected"
  | "closed"
  | "cancelled";
export type OpsCommercialClaimType =
  | "extension_of_time"
  | "loss_expense"
  | "acceleration"
  | "disruption"
  | "prolongation"
  | "variation_dispute"
  | "other";
export type OpsCommercialContractStatus =
  | "draft"
  | "active"
  | "on_hold"
  | "completed"
  | "terminated"
  | "cancelled";
export type OpsCommercialContractType =
  | "main_contract"
  | "subcontract"
  | "professional_service"
  | "supply"
  | "other";
export type OpsCommercialValuationStatus =
  | "draft"
  | "submitted"
  | "certified"
  | "rejected"
  | "cancelled";
export type OpsCommercialRiskStatus =
  | "open"
  | "mitigating"
  | "closed"
  | "cancelled";
export type OpsCommercialRiskCategory =
  | "client"
  | "contract"
  | "scope"
  | "cost"
  | "programme"
  | "payment"
  | "dispute"
  | "other";
export type OpsCommercialRiskSeverity =
  | "low"
  | "medium"
  | "high"
  | "critical";
export type OpsCommercialRetentionReleaseStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "released"
  | "rejected"
  | "cancelled";
export type OpsCommercialRetentionReleaseType =
  | "interim"
  | "practical_completion"
  | "defects_liability"
  | "final_account"
  | "other";
export type OpsCommercialCashflowStatus =
  | "draft"
  | "approved"
  | "locked"
  | "archived"
  | "cancelled";
export type OpsCommercialForecastConfidence = "low" | "medium" | "high";
export type OpsCommercialMilestoneStatus =
  | "planned"
  | "due"
  | "achieved"
  | "certified"
  | "delayed"
  | "cancelled";
export type OpsHseIncidentStatus =
  | "reported"
  | "investigating"
  | "action_required"
  | "closed"
  | "cancelled";
export type OpsHseIncidentType =
  | "near_miss"
  | "first_aid"
  | "medical_treatment"
  | "lost_time"
  | "property_damage"
  | "environmental"
  | "unsafe_condition"
  | "other";
export type OpsHseIncidentSeverity = "low" | "medium" | "high" | "critical";
export type OpsCorrectiveActionStatus =
  | "open"
  | "in_progress"
  | "completed"
  | "verified"
  | "cancelled";
export type OpsPpeIssueStatus =
  | "issued"
  | "returned"
  | "damaged"
  | "lost"
  | "cancelled";
export type OpsPpeItemType =
  | "helmet"
  | "vest"
  | "boots"
  | "gloves"
  | "goggles"
  | "harness"
  | "respirator"
  | "ear_protection"
  | "other";
export type OpsToolboxTalkStatus = "planned" | "completed" | "cancelled";
export type OpsHseInspectionStatus =
  | "planned"
  | "completed"
  | "action_required"
  | "closed"
  | "cancelled";
export type OpsHseInspectionFindingStatus =
  | "open"
  | "in_progress"
  | "corrected"
  | "verified"
  | "cancelled";
export type OpsHseInspectionType =
  | "site_walk"
  | "scaffolding"
  | "lifting"
  | "electrical"
  | "excavation"
  | "fire"
  | "environmental"
  | "plant_equipment"
  | "housekeeping"
  | "other";
export type OpsSafetyTrainingStatus =
  | "planned"
  | "completed"
  | "expired"
  | "cancelled";
export type OpsHseRiskAssessmentStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "archived"
  | "cancelled";
export type OpsHseComplianceAuditStatus =
  | "planned"
  | "completed"
  | "action_required"
  | "closed"
  | "cancelled";
export type OpsEmployeeStatus =
  | "active"
  | "probation"
  | "on_leave"
  | "suspended"
  | "exited";
export type OpsEmploymentType =
  | "full_time"
  | "fixed_term"
  | "casual"
  | "contractor"
  | "intern";
export type OpsLeaveRequestStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "cancelled"
  | "completed";
export type OpsLeaveType =
  | "annual"
  | "sick"
  | "compassionate"
  | "unpaid"
  | "maternity"
  | "paternity"
  | "study"
  | "other";
export type OpsRecruitmentRequisitionStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "open"
  | "interviewing"
  | "offered"
  | "filled"
  | "cancelled";
export type OpsEmployeeContractStatus =
  | "draft"
  | "active"
  | "expired"
  | "terminated"
  | "superseded"
  | "cancelled";
export type OpsPerformanceAppraisalStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "cancelled";
export type OpsEmployeeOnboardingStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "waived"
  | "cancelled";
export type OpsEmployeeDocumentStatus =
  | "submitted"
  | "accepted"
  | "rejected"
  | "expired"
  | "archived";
export type OpsPayFrequency =
  | "monthly"
  | "weekly"
  | "daily"
  | "hourly"
  | "contract_sum";

export type OpsModuleGroupId =
  | "operations"
  | "commercial"
  | "records"
  | "engineering"
  | "procurement"
  | "finance"
  | "fleet"
  | "hse"
  | "hr"
  | "executive";

export type OpsModuleStatus = "ready" | "planned";

export type OpsModuleGroup = {
  description: string;
  id: OpsModuleGroupId;
  title: string;
};

type OpsModuleBase = {
  title: string;
  description: string;
  group: OpsModuleGroupId;
  id: string;
  phase: string;
  roles: OpsUserRole[];
};

export type OpsReadyModule = OpsModuleBase & {
  href: string;
  navigationRoles?: OpsUserRole[];
  showInNavigation?: boolean;
  status: "ready";
};

export type OpsPlannedModule = OpsModuleBase & {
  href: null;
  status: "planned";
};

export type OpsModule = OpsReadyModule | OpsPlannedModule;
