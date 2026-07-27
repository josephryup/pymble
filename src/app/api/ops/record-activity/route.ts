import { NextResponse, type NextRequest } from "next/server";
import { getOptionalOpsUser } from "@/lib/ops/auth";
import { fetchOpsRecordComments } from "@/lib/ops/comments";
import { fetchOpsDocumentsForRecord } from "@/lib/ops/documents";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  isOpsRecordActivitySourceTable,
  type OpsRecordActivitySourceTable,
} from "@/lib/ops/record-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_ROUTE: Record<
  OpsRecordActivitySourceTable,
  | "/ops/sites"
  | "/ops/material-schedule"
  | "/ops/invoices"
  | "/ops/material-requests"
  | "/ops/suppliers"
  | "/ops/rfq-po"
  | "/ops/stores-inventory"
  | "/ops/daily-site-reports"
  | "/ops/engineering-controls"
  | "/ops/delivery-exceptions"
  | "/ops/project-budgets"
  | "/ops/payment-requests"
  | "/ops/commercial"
  | "/ops/equipment"
  | "/ops/fleet-logistics"
  | "/ops/hse"
  | "/ops/hse-compliance"
  | "/ops/employees"
> = {
  accommodation_bookings: "/ops/fleet-logistics",
  boq_documents: "/ops/material-schedule",
  commercial_claims: "/ops/commercial",
  commercial_contracts: "/ops/commercial",
  commercial_contract_milestones: "/ops/commercial",
  commercial_cashflow_forecasts: "/ops/commercial",
  commercial_ipcs: "/ops/commercial",
  commercial_retention_releases: "/ops/commercial",
  commercial_risks: "/ops/commercial",
  commercial_valuations: "/ops/commercial",
  commercial_variations: "/ops/commercial",
  corrective_actions: "/ops/hse",
  daily_site_reports: "/ops/daily-site-reports",
  delivery_exceptions: "/ops/delivery-exceptions",
  drawing_register: "/ops/engineering-controls",
  employee_contracts: "/ops/employees",
  employee_onboarding_items: "/ops/employees",
  employees: "/ops/employees",
  equipment_requests: "/ops/equipment",
  fleet_operator_documents: "/ops/fleet-logistics",
  fuel_logs: "/ops/equipment",
  goods_received_notes: "/ops/stores-inventory",
  hse_compliance_audits: "/ops/hse-compliance",
  hse_incidents: "/ops/hse",
  hse_inspection_findings: "/ops/hse-compliance",
  hse_inspections: "/ops/hse-compliance",
  hse_risk_assessments: "/ops/hse-compliance",
  invoices: "/ops/invoices",
  labour_allocations: "/ops/fleet-logistics",
  leave_requests: "/ops/employees",
  leave_balances: "/ops/employees",
  maintenance_jobs: "/ops/equipment",
  material_tests: "/ops/engineering-controls",
  material_requests: "/ops/material-requests",
  payment_requests: "/ops/payment-requests",
  programme_milestones: "/ops/engineering-controls",
  ppe_items: "/ops/hse-compliance",
  ppe_issues: "/ops/hse-compliance",
  project_budgets: "/ops/project-budgets",
  performance_appraisals: "/ops/employees",
  qa_inspections: "/ops/engineering-controls",
  recruitment_requisitions: "/ops/employees",
  rfqs: "/ops/rfq-po",
  sites: "/ops/sites",
  site_instructions: "/ops/engineering-controls",
  snag_items: "/ops/engineering-controls",
  suppliers: "/ops/suppliers",
  safety_training_records: "/ops/hse-compliance",
  toolbox_talks: "/ops/hse-compliance",
  transport_requests: "/ops/fleet-logistics",
};

const SOURCE_MODULE: Record<
  OpsRecordActivitySourceTable,
  | "boq"
  | "commercial"
  | "daily_site_reports"
  | "delivery_exceptions"
  | "employees"
  | "engineering_controls"
  | "equipment"
  | "fleet_logistics"
  | "hse"
  | "hse_compliance"
  | "invoices"
  | "material_requests"
  | "payment_requests"
  | "project_budgets"
  | "rfq_po"
  | "sites"
  | "stores_inventory"
  | "suppliers"
> = {
  accommodation_bookings: "fleet_logistics",
  boq_documents: "boq",
  commercial_claims: "commercial",
  commercial_contracts: "commercial",
  commercial_contract_milestones: "commercial",
  commercial_cashflow_forecasts: "commercial",
  commercial_ipcs: "commercial",
  commercial_retention_releases: "commercial",
  commercial_risks: "commercial",
  commercial_valuations: "commercial",
  commercial_variations: "commercial",
  corrective_actions: "hse",
  daily_site_reports: "daily_site_reports",
  delivery_exceptions: "delivery_exceptions",
  drawing_register: "engineering_controls",
  employee_contracts: "employees",
  employee_onboarding_items: "employees",
  employees: "employees",
  equipment_requests: "equipment",
  fleet_operator_documents: "fleet_logistics",
  fuel_logs: "equipment",
  goods_received_notes: "stores_inventory",
  hse_compliance_audits: "hse_compliance",
  hse_incidents: "hse",
  hse_inspection_findings: "hse_compliance",
  hse_inspections: "hse_compliance",
  hse_risk_assessments: "hse_compliance",
  invoices: "invoices",
  labour_allocations: "fleet_logistics",
  leave_requests: "employees",
  leave_balances: "employees",
  maintenance_jobs: "equipment",
  material_tests: "engineering_controls",
  material_requests: "material_requests",
  payment_requests: "payment_requests",
  programme_milestones: "engineering_controls",
  ppe_items: "hse_compliance",
  ppe_issues: "hse_compliance",
  project_budgets: "project_budgets",
  performance_appraisals: "employees",
  qa_inspections: "engineering_controls",
  recruitment_requisitions: "employees",
  rfqs: "rfq_po",
  sites: "sites",
  site_instructions: "engineering_controls",
  snag_items: "engineering_controls",
  suppliers: "suppliers",
  safety_training_records: "hse_compliance",
  toolbox_talks: "hse_compliance",
  transport_requests: "fleet_logistics",
};

function isUuid(value: string | null): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

export async function GET(request: NextRequest) {
  const user = await getOptionalOpsUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const sourceTable = request.nextUrl.searchParams.get("source_table");
  const sourceId = request.nextUrl.searchParams.get("source_id");

  if (!sourceTable || !isOpsRecordActivitySourceTable(sourceTable) || !isUuid(sourceId)) {
    return NextResponse.json({ error: "Invalid activity source." }, { status: 400 });
  }

  if (!canAccessOpsHref(user.profile.role, SOURCE_ROUTE[sourceTable])) {
    return NextResponse.json({ error: "You do not have access to this record." }, { status: 403 });
  }

  const [documents, comments] = await Promise.all([
    fetchOpsDocumentsForRecord({
      moduleKey: SOURCE_MODULE[sourceTable],
      sourceId,
      sourceTable,
    }),
    fetchOpsRecordComments({
      moduleKey: SOURCE_MODULE[sourceTable],
      sourceId,
      sourceTable,
    }),
  ]);

  return NextResponse.json({ comments, documents });
}
