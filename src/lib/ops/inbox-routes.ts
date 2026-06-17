// Map record_comments.source_table → the page where the user can act on the
// underlying record. Used by /ops/inbox so each mention has a working link.
const SOURCE_TABLE_ROUTE: Record<string, string> = {
  boq_documents: "/ops/boq",
  sites: "/ops/sites",
  material_requests: "/ops/material-requests",
  suppliers: "/ops/suppliers",
  purchase_orders: "/ops/rfq-po",
  rfqs: "/ops/rfq-po",
  goods_received_notes: "/ops/stores-inventory",
  daily_site_reports: "/ops/daily-site-reports",
  site_instructions: "/ops/engineering-controls",
  inspections: "/ops/engineering-controls",
  test_records: "/ops/engineering-controls",
  drawings: "/ops/engineering-controls",
  snags: "/ops/engineering-controls",
  rfis: "/ops/engineering-controls",
  delivery_exceptions: "/ops/delivery-exceptions",
  project_budgets: "/ops/project-budgets",
  payment_requests: "/ops/payment-requests",
  equipment: "/ops/equipment",
  equipment_requests: "/ops/equipment",
  fuel_logs: "/ops/equipment",
  transport_dispatches: "/ops/fleet-logistics",
  hse_incidents: "/ops/hse",
  hse_corrective_actions: "/ops/hse",
  hse_weekly_reports: "/ops/hse-weekly",
  ppe_issuances: "/ops/hse-compliance",
  toolbox_talks: "/ops/hse-compliance",
  hse_inspections: "/ops/hse-compliance",
  invoices: "/ops/invoices",
  workers: "/ops/workers",
  attendance_records: "/ops/attendance",
};

export function getOpsInboxRecordRoute(sourceTable: string, sourceId: string) {
  const base = SOURCE_TABLE_ROUTE[sourceTable] ?? "/ops/notifications";
  return `${base}#rc-${sourceId}`;
}

export function getOpsRecordLabel(sourceTable: string) {
  const map: Record<string, string> = {
    boq_documents: "Bill of Quantities",
    sites: "Project site",
    material_requests: "Material request",
    suppliers: "Supplier",
    purchase_orders: "Purchase order",
    rfqs: "Request for Quotation",
    goods_received_notes: "Goods Received Note",
    daily_site_reports: "Daily site report",
    site_instructions: "Site instruction",
    inspections: "Inspection",
    test_records: "Test record",
    drawings: "Drawing",
    snags: "Snag",
    rfis: "Request for Information",
    delivery_exceptions: "Delivery exception",
    project_budgets: "Project budget",
    payment_requests: "Payment request",
    equipment: "Equipment",
    equipment_requests: "Equipment request",
    fuel_logs: "Fuel log",
    transport_dispatches: "Transport dispatch",
    hse_incidents: "HSE incident",
    hse_corrective_actions: "HSE corrective action",
    hse_weekly_reports: "Weekly HSE report",
    ppe_issuances: "PPE issuance",
    toolbox_talks: "Toolbox talk",
    hse_inspections: "HSE inspection",
    invoices: "Invoice",
    workers: "Worker",
    attendance_records: "Attendance record",
  };
  return map[sourceTable] ?? "Record";
}
