export type OpsGlossaryCategory =
  | "commercial"
  | "procurement"
  | "finance"
  | "hse"
  | "engineering"
  | "general";

export type OpsGlossaryEntry = {
  term: string;
  fullForm: string;
  category: OpsGlossaryCategory;
  plain: string;
  example?: string;
};

export const OPS_GLOSSARY_CATEGORY_LABELS: Record<OpsGlossaryCategory, string> = {
  commercial: "Commercial",
  procurement: "Procurement",
  finance: "Finance and Accounts",
  hse: "Health, Safety and Environment",
  engineering: "Engineering and Site Delivery",
  general: "General",
};

export const OPS_GLOSSARY: OpsGlossaryEntry[] = [
  {
    term: "BOQ",
    fullForm: "Bill of Quantities",
    category: "commercial",
    plain:
      "A line-by-line list of every material and activity a project needs, with quantities and prices. The team uses it to estimate, order, and compare what was used versus what was budgeted.",
    example: "We loaded the BOQ for the Solwezi school and split it by section.",
  },
  {
    term: "IPC",
    fullForm: "Interim Payment Certificate",
    category: "commercial",
    plain:
      "A staged claim for work completed on a project, issued to the client between project start and final handover so the contractor gets paid as work progresses.",
    example: "Send IPC #3 to the client once the QS signs off on this month's work done.",
  },
  {
    term: "QS",
    fullForm: "Quantity Surveyor",
    category: "commercial",
    plain:
      "The team member who measures site work, prices Bills of Quantities, controls cost, and prepares payment claims.",
  },
  {
    term: "RFQ",
    fullForm: "Request for Quotation",
    category: "procurement",
    plain:
      "A document we send to suppliers asking them to quote prices for materials or services. We then compare quotes and pick the best.",
    example: "Issue an RFQ to three suppliers for the Lusaka site cement order.",
  },
  {
    term: "PO",
    fullForm: "Purchase Order",
    category: "procurement",
    plain:
      "An approved instruction sent to a supplier to deliver materials or services at the agreed price. This is what the supplier invoices against.",
  },
  {
    term: "GRN",
    fullForm: "Goods Received Note",
    category: "procurement",
    plain:
      "A record of what physically arrived on site against a Purchase Order. It confirms quantity, condition, and date so we can match it to the supplier's invoice before payment.",
  },
  {
    term: "VAT",
    fullForm: "Value Added Tax",
    category: "finance",
    plain:
      "A government tax added on top of the price of goods and services. Zambian VAT is currently 16%.",
  },
  {
    term: "P&L",
    fullForm: "Profit and Loss",
    category: "finance",
    plain:
      "A summary of how much a project earned (revenue) minus how much it cost (expenses). A positive number means profit, a negative number means loss.",
    example: "The project P&L panel on the site page shows margin to date.",
  },
  {
    term: "HSE",
    fullForm: "Health, Safety and Environment",
    category: "hse",
    plain:
      "The function that keeps people safe on site and protects the environment. Covers incidents, near misses, training, Personal Protective Equipment, inspections, and corrective actions.",
  },
  {
    term: "PPE",
    fullForm: "Personal Protective Equipment",
    category: "hse",
    plain:
      "Gear that workers wear to protect themselves on site — hard hats, boots, gloves, high-visibility vests, eye and ear protection, and so on.",
    example: "PPE compliance is the % of workers found wearing the right gear during inspections.",
  },
  {
    term: "LTIFR",
    fullForm: "Lost Time Injury Frequency Rate",
    category: "hse",
    plain:
      "A safety measure: the number of injuries serious enough to keep a worker off the job, per one million hours worked. Lower is better.",
  },
  {
    term: "DSR",
    fullForm: "Daily Site Report",
    category: "engineering",
    plain:
      "The summary an engineer or supervisor files each day capturing site progress, labour on site, equipment used, materials delivered, and any delays or notes.",
  },
  {
    term: "QA/QC",
    fullForm: "Quality Assurance / Quality Control",
    category: "engineering",
    plain:
      "QA is the process of making sure work is done right (procedures, checklists, sign-offs). QC is the actual checking of the finished work (inspections, tests, snag lists).",
  },
  {
    term: "MD",
    fullForm: "Managing Director",
    category: "general",
    plain:
      "The most senior executive at Pymble Construction Limited, responsible for the company's day-to-day direction and major approvals.",
  },
  {
    term: "GM",
    fullForm: "General Manager",
    category: "general",
    plain: "Senior leader who oversees operations across the company on behalf of the Managing Director.",
  },
  {
    term: "HR",
    fullForm: "Human Resources",
    category: "general",
    plain:
      "The function that manages employee records, recruitment, contracts, leave, appraisals, and staff role assignments.",
  },
];

export function getOpsGlossaryByCategory() {
  const grouped = new Map<OpsGlossaryCategory, OpsGlossaryEntry[]>();
  for (const entry of OPS_GLOSSARY) {
    const existing = grouped.get(entry.category) ?? [];
    existing.push(entry);
    grouped.set(entry.category, existing);
  }
  return grouped;
}

export function findGlossaryEntry(term: string) {
  const normalized = term.trim().toUpperCase();
  return OPS_GLOSSARY.find((entry) => entry.term.toUpperCase() === normalized);
}
