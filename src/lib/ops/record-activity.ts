import type { OpsDocumentVisibility } from "@/lib/ops/types";

export const OPS_RECORD_ACTIVITY_SOURCE_TABLES = [
  "sites",
  "boq_documents",
  "invoices",
  "material_requests",
  "suppliers",
  "rfqs",
  "goods_received_notes",
  "daily_site_reports",
  "site_instructions",
  "qa_inspections",
  "material_tests",
  "snag_items",
  "drawing_register",
  "programme_milestones",
  "delivery_exceptions",
  "project_budgets",
  "payment_requests",
  "equipment_requests",
  "fuel_logs",
  "maintenance_jobs",
  "transport_requests",
  "accommodation_bookings",
  "labour_allocations",
  "fleet_operator_documents",
  "commercial_ipcs",
  "commercial_variations",
  "commercial_claims",
  "commercial_contracts",
  "commercial_contract_milestones",
  "commercial_retention_releases",
  "commercial_cashflow_forecasts",
  "commercial_valuations",
  "commercial_risks",
  "hse_incidents",
  "corrective_actions",
  "ppe_items",
  "ppe_issues",
  "toolbox_talks",
  "hse_inspections",
  "hse_inspection_findings",
  "safety_training_records",
  "hse_risk_assessments",
  "hse_compliance_audits",
  "employees",
  "leave_requests",
  "recruitment_requisitions",
  "employee_contracts",
  "performance_appraisals",
  "leave_balances",
  "employee_onboarding_items",
  "department_reports",
] as const;

export type OpsRecordActivitySourceTable = (typeof OPS_RECORD_ACTIVITY_SOURCE_TABLES)[number];

export const OPS_RECORD_ACTIVITY_SOURCE_LABELS: Record<OpsRecordActivitySourceTable, string> = {
  accommodation_bookings: "accommodation booking",
  boq_documents: "BOQ",
  commercial_cashflow_forecasts: "cashflow forecast",
  commercial_claims: "claim",
  commercial_contract_milestones: "contract milestone",
  commercial_contracts: "commercial contract",
  commercial_ipcs: "IPC",
  commercial_retention_releases: "retention release",
  commercial_risks: "commercial risk",
  commercial_valuations: "valuation",
  commercial_variations: "variation",
  corrective_actions: "corrective action",
  daily_site_reports: "daily site report",
  department_reports: "department report",
  delivery_exceptions: "delivery exception",
  drawing_register: "drawing record",
  employee_contracts: "employee contract",
  employee_onboarding_items: "onboarding item",
  employees: "employee",
  equipment_requests: "equipment request",
  fleet_operator_documents: "operator document",
  fuel_logs: "fuel log",
  goods_received_notes: "goods received note",
  hse_compliance_audits: "compliance audit",
  hse_incidents: "HSE incident",
  hse_inspection_findings: "inspection finding",
  hse_inspections: "HSE inspection",
  hse_risk_assessments: "risk assessment",
  invoices: "invoice",
  labour_allocations: "labour allocation",
  leave_balances: "leave balance",
  leave_requests: "leave request",
  maintenance_jobs: "maintenance job",
  material_requests: "material request",
  material_tests: "material test",
  payment_requests: "payment request",
  performance_appraisals: "performance appraisal",
  ppe_issues: "PPE issue",
  ppe_items: "PPE stock item",
  programme_milestones: "programme milestone",
  project_budgets: "project budget",
  qa_inspections: "QA inspection",
  recruitment_requisitions: "recruitment requisition",
  rfqs: "RFQ",
  safety_training_records: "safety training record",
  site_instructions: "site instruction",
  sites: "site",
  snag_items: "snag item",
  suppliers: "supplier",
  toolbox_talks: "toolbox talk",
  transport_requests: "transport request",
};

/**
 * Which visibility tier an attachment starts on, per kind of record.
 *
 * The panel used to offer "Restricted / Company / Private" — a vocabulary that
 * matched nothing in `ops_document_visibility`, so every upload through it was
 * rejected by Postgres. Replacing it raised the real question: one default
 * cannot serve a registry that spans both daily site reports and employee
 * contracts.
 *
 * The rule (MD's call): anything personal or commercially sensitive starts at
 * `management`; operational site evidence starts at `public` so the people
 * working the record can actually see the photo or test certificate attached
 * to it. The uploader can always widen or narrow it at upload time — this is
 * only what is pre-selected.
 *
 * Exhaustive by type on purpose: a new source table must state its tier rather
 * than silently inherit someone else's.
 */
export const OPS_RECORD_ATTACHMENT_DEFAULT_VISIBILITY: Record<
  OpsRecordActivitySourceTable,
  OpsDocumentVisibility
> = {
  // Personal, HR, commercial and money records — management by default.
  commercial_cashflow_forecasts: "management",
  commercial_claims: "management",
  commercial_contract_milestones: "management",
  commercial_contracts: "management",
  commercial_ipcs: "management",
  commercial_retention_releases: "management",
  commercial_risks: "management",
  commercial_valuations: "management",
  commercial_variations: "management",
  department_reports: "management",
  employee_contracts: "management",
  employee_onboarding_items: "management",
  employees: "management",
  fleet_operator_documents: "management",
  invoices: "management",
  leave_balances: "management",
  leave_requests: "management",
  payment_requests: "management",
  performance_appraisals: "management",
  project_budgets: "management",
  recruitment_requisitions: "management",
  safety_training_records: "management",
  // Operational site evidence — visible to staff working the record.
  accommodation_bookings: "public",
  boq_documents: "public",
  corrective_actions: "public",
  daily_site_reports: "public",
  delivery_exceptions: "public",
  drawing_register: "public",
  equipment_requests: "public",
  fuel_logs: "public",
  goods_received_notes: "public",
  hse_compliance_audits: "public",
  hse_incidents: "public",
  hse_inspection_findings: "public",
  hse_inspections: "public",
  hse_risk_assessments: "public",
  labour_allocations: "public",
  maintenance_jobs: "public",
  material_requests: "public",
  material_tests: "public",
  ppe_issues: "public",
  ppe_items: "public",
  programme_milestones: "public",
  qa_inspections: "public",
  rfqs: "public",
  site_instructions: "public",
  sites: "public",
  snag_items: "public",
  suppliers: "public",
  toolbox_talks: "public",
  transport_requests: "public",
};

export function isOpsRecordActivitySourceTable(
  value: string,
): value is OpsRecordActivitySourceTable {
  return OPS_RECORD_ACTIVITY_SOURCE_TABLES.includes(value as OpsRecordActivitySourceTable);
}

export function normalizeOpsRecordCommentBody(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function validateOpsRecordCommentBody(value: string) {
  const body = normalizeOpsRecordCommentBody(value);

  if (body.length < 2) {
    return {
      message: "Comment is required.",
      ok: false as const,
    };
  }

  if (body.length > 800) {
    return {
      message: "Comment must be 800 characters or fewer.",
      ok: false as const,
    };
  }

  return {
    body,
    ok: true as const,
  };
}
