import type {
  OpsDepartmentKey,
  OpsDepartmentReportScope,
} from "@/lib/ops/department-report-permissions";
import type { OpsDepartmentReportPeriod } from "@/lib/ops/department-reports";

/**
 * Structured report templates per department.
 *
 * Each department reports against a defined set of metrics instead of a
 * free-form JSON blob: the form renders one input per field, and fields
 * marked `auto` are pre-filled from live system records for the chosen
 * period (see department-report-metrics.ts). Values land in the same
 * `metrics` JSONB column, so historic reports remain readable.
 */

export type OpsDeptMetricField = {
  key: string;
  label: string;
  /** Shown under the input — what to count / where the number comes from. */
  hint?: string;
  /** True when the system can suggest this value from live records. */
  auto?: boolean;
  /** True when a DROP in this figure is the good outcome (incidents, downtime). */
  downIsGood?: boolean;
};

export type OpsDepartmentReportTemplate = {
  /** Placeholder that guides the narrative into consistent sections. */
  narrativePrompt: string;
  metrics: OpsDeptMetricField[];
};

const NARRATIVE_SKELETON =
  "Highlights:\n\nProgress against plan:\n\nProblems and risks:\n\nDecisions or support needed from leadership:";

export const OPS_DEPARTMENT_REPORT_TEMPLATES: Record<
  OpsDepartmentKey,
  OpsDepartmentReportTemplate
> = {
  operations: {
    narrativePrompt: NARRATIVE_SKELETON,
    metrics: [
      { key: "sites_active", label: "Active sites", auto: true },
      { key: "site_reports_filed", label: "Daily site reports filed", auto: true },
      { key: "attendance_entries", label: "Attendance entries logged", auto: true },
      { key: "delivery_exceptions_reported", label: "Delivery exceptions reported", auto: true, downIsGood: true },
      { key: "average_workforce_on_site", label: "Average workforce on site", hint: "Rough daily average across sites." },
    ],
  },
  engineering: {
    narrativePrompt: NARRATIVE_SKELETON,
    metrics: [
      { key: "sites_active", label: "Active sites", auto: true },
      { key: "site_reports_filed", label: "Daily site reports filed", auto: true },
      { key: "material_requests_raised", label: "Material requests raised", auto: true },
      { key: "inspections_carried_out", label: "Site inspections carried out" },
      { key: "drawings_issued", label: "Drawings / designs issued" },
    ],
  },
  procurement: {
    narrativePrompt: NARRATIVE_SKELETON,
    metrics: [
      { key: "material_requests_received", label: "Material requests received", auto: true },
      { key: "rfqs_created", label: "RFQs created", auto: true },
      { key: "purchase_orders_issued", label: "Purchase orders issued", auto: true },
      { key: "purchase_order_value_zmw", label: "Purchase order value (ZMW)", auto: true },
      { key: "supplier_deliveries_late", label: "Late supplier deliveries", downIsGood: true },
    ],
  },
  finance: {
    narrativePrompt: NARRATIVE_SKELETON,
    metrics: [
      { key: "payment_requests_received", label: "Payment requests received", auto: true },
      { key: "payment_request_value_zmw", label: "Payment request value (ZMW)", auto: true },
      { key: "invoices_issued", label: "Invoices issued", auto: true },
      { key: "invoice_value_zmw", label: "Invoice value (ZMW)", auto: true },
      // Cash. Approved and released are two different cohorts, not two stages
      // of one, so there is no ratio between them — the pair plus the two
      // waiting positions is the honest reading.
      {
        key: "payments_approved_zmw",
        label: "Payments approved (ZMW)",
        auto: true,
        hint: "Authorised by Finance in this period. Not the same as paid.",
      },
      {
        key: "payments_released_zmw",
        label: "Payments released (ZMW)",
        auto: true,
        hint: "Cash that actually left the bank in this period.",
      },
      {
        key: "payments_awaiting_release_zmw",
        label: "Approved, awaiting payment (ZMW)",
        auto: true,
        downIsGood: true,
        hint: "Position at period end — approved and still unpaid. What suppliers are owed.",
      },
      {
        key: "payments_awaiting_release_days_max",
        label: "Longest wait for payment (days)",
        auto: true,
        downIsGood: true,
      },
      {
        key: "payments_awaiting_approval_zmw",
        label: "Submitted, awaiting Finance (ZMW)",
        auto: true,
        downIsGood: true,
        hint: "Position at period end — payables with no Finance decision yet.",
      },
      {
        key: "payments_awaiting_approval_days_max",
        label: "Longest wait for a decision (days)",
        auto: true,
        downIsGood: true,
      },
      {
        key: "payment_release_days_avg",
        label: "Days approved to paid",
        auto: true,
        downIsGood: true,
      },
      // The procurement funnel. Read the first three together: what Finance
      // authorised, what was actually bought, and what is authorised but
      // unspent. The gap is the finding, and the coverage percent stops a zero
      // being misread as "no activity".
      {
        key: "mr_approved_value_zmw",
        label: "Material spend approved (ZMW)",
        auto: true,
        hint: "Cost approved by Finance or the MD in this period.",
      },
      {
        key: "mr_procured_value_zmw",
        label: "Material spend procured (ZMW)",
        auto: true,
        hint: "Reached a purchase order or a recorded direct purchase in this period.",
      },
      {
        key: "mr_procured_coverage_pct",
        label: "Approved value procured (%)",
        auto: true,
        hint: "Procured as a share of approved. Low means authorised money is not being spent.",
      },
      {
        key: "mr_approved_not_procured_zmw",
        label: "Approved but not yet bought (ZMW)",
        auto: true,
        downIsGood: true,
        hint: "Position at period end, not a flow — includes requests approved earlier.",
      },
      {
        key: "mr_delivered_value_zmw",
        label: "Material delivered (ZMW)",
        auto: true,
        hint: "Goods confirmed received on site in this period.",
      },
      {
        key: "mr_procurement_days_avg",
        label: "Days approved to bought",
        auto: true,
        downIsGood: true,
      },
      {
        key: "mr_awaiting_finance_zmw",
        label: "Priced, awaiting Finance (ZMW)",
        auto: true,
        downIsGood: true,
        hint: "Position at period end — priced requests with no cost decision yet.",
      },
      {
        key: "mr_awaiting_finance_days_max",
        label: "Longest wait for Finance (days)",
        auto: true,
        downIsGood: true,
      },
      // Budgets. "Used this period" is a flow and "remaining" is a position at
      // period end — different time bases, so they do not reconcile and the
      // labels say which is which.
      {
        key: "active_budget_total_zmw",
        label: "Active project budgets (ZMW)",
        auto: true,
        hint: "Total budgeted across budgets in the active state.",
      },
      {
        key: "budget_consumed_period_zmw",
        label: "Budget used this period (ZMW)",
        auto: true,
        hint: "Spend dated inside the period. A flow — does not reconcile to remaining.",
      },
      {
        key: "budget_remaining_zmw",
        label: "Budget remaining (ZMW)",
        auto: true,
        hint: "Position at period end: budgeted less everything consumed to date.",
      },
      { key: "budget_used_pct", label: "Budget used (%)", auto: true, downIsGood: true },
      {
        key: "budgets_over_threshold",
        label: "Budgets past the warning band",
        auto: true,
        downIsGood: true,
      },
      {
        key: "unfunded_budget_spend_zmw",
        label: "Spend on unfunded budgets (ZMW)",
        auto: true,
        downIsGood: true,
        hint: "Charged to a budget with nothing budgeted, so no percentage can express it.",
      },
      // Unplanned spend. Four separate failures, never summed — see
      // OpsUnplannedSpend. They overlap: one entry can be both uncoded and
      // unbudgeted, so a total would double-count and mean nothing.
      {
        key: "unbudgeted_spend_zmw",
        label: "Spend with no budget line (ZMW)",
        auto: true,
        downIsGood: true,
        hint: "No budget answers for this money at all.",
      },
      {
        key: "uncoded_spend_zmw",
        label: "Spend with no cost code (ZMW)",
        auto: true,
        downIsGood: true,
        hint: "Cannot be attributed to the work it was for.",
      },
      {
        key: "contingency_spend_zmw",
        label: "Contingency spend (ZMW)",
        auto: true,
        hint: "Off-schedule but anticipated — charged to a contingency leaf.",
      },
      {
        key: "general_request_value_zmw",
        label: "Office / general purchases (ZMW)",
        auto: true,
        hint: "Material requests scoped general — overhead, not project work.",
      },
      {
        key: "it_request_value_zmw",
        label: "IT purchases (ZMW)",
        auto: true,
        hint: "Aggregate only. Line detail stays inside the IT visibility circle.",
      },
      {
        key: "overhead_spend_zmw",
        label: "Overhead payables (ZMW)",
        auto: true,
        hint: "Payables charged to a cost centre rather than a project.",
      },
      {
        key: "escalated_approvals_zmw",
        label: "Approvals escalated to the MD (ZMW)",
        auto: true,
        downIsGood: true,
        hint: "Crossed the escalate band — unfunded or well over budget.",
      },
      // Payroll. Employer cost leads, not net pay: net understates labour by
      // the whole statutory employer burden.
      {
        key: "payroll_employer_cost_zmw",
        label: "Total labour cost to company (ZMW)",
        auto: true,
        hint: "Gross plus employer NAPSA and WCF. The real cost, not the net paid.",
      },
      { key: "payroll_staff_paid_zmw", label: "Staff net pay (ZMW)", auto: true },
      { key: "payroll_casual_paid_zmw", label: "Casual worker net pay (ZMW)", auto: true },
      {
        key: "payroll_statutory_due_zmw",
        label: "Statutory due (ZMW)",
        auto: true,
        hint: "PAYE, NAPSA both sides, NHIMA and WCF — remittable with a deadline.",
      },
      { key: "headcount_paid", label: "People paid", auto: true },
      {
        key: "advances_outstanding_zmw",
        label: "Advances not yet recovered (ZMW)",
        auto: true,
        downIsGood: true,
      },
      // Borrowing. Interest leads because it is the only part that is a cost;
      // principal repaid sits beside it precisely so the cash figure is not
      // mistaken for expense.
      {
        key: "interest_paid_zmw",
        label: "Interest paid (ZMW)",
        auto: true,
        hint: "The cost of borrowing. The only part of a repayment that reaches the P&L.",
      },
      {
        key: "loan_principal_repaid_zmw",
        label: "Loan principal repaid (ZMW)",
        auto: true,
        hint: "Not a cost — it reduces the liability. Shown so debt service is not read as expense.",
      },
      {
        key: "debt_service_zmw",
        label: "Total debt service (ZMW)",
        auto: true,
        hint: "Cash out on loans in the period: principal, interest and fees together.",
      },
      {
        key: "total_borrowing_zmw",
        label: "Borrowing outstanding (ZMW)",
        auto: true,
        downIsGood: true,
        hint: "Position at period end — principal still owed across live facilities.",
      },
      {
        key: "loan_arrears_zmw",
        label: "Loan instalments overdue (ZMW)",
        auto: true,
        downIsGood: true,
        hint: "Missed repayments usually carry penalty interest.",
      },
      { key: "cash_position_zmw", label: "Cash position (ZMW)", hint: "Bank balances at period end." },
    ],
  },
  commercial: {
    narrativePrompt: NARRATIVE_SKELETON,
    metrics: [
      { key: "claims_submitted", label: "Claims submitted", auto: true },
      { key: "claim_value_zmw", label: "Claim value (ZMW)", auto: true },
      { key: "invoices_issued", label: "Invoices issued", auto: true },
      { key: "variations_priced", label: "Variations priced" },
      { key: "boq_packages_completed", label: "BOQ packages completed" },
    ],
  },
  hse: {
    narrativePrompt: NARRATIVE_SKELETON,
    metrics: [
      { key: "incidents_reported", label: "Incidents reported", auto: true, downIsGood: true },
      { key: "inspections_completed", label: "Inspections completed", auto: true },
      { key: "risk_assessments_done", label: "Risk assessments done", auto: true },
      { key: "toolbox_talks_held", label: "Toolbox talks held" },
      { key: "lost_time_injuries", label: "Lost-time injuries", downIsGood: true },
    ],
  },
  hr: {
    narrativePrompt: NARRATIVE_SKELETON,
    metrics: [
      { key: "employees_on_record", label: "Employees on record", auto: true },
      { key: "workers_active", label: "Active site workers", auto: true },
      { key: "leave_requests_received", label: "Leave requests received", auto: true },
      { key: "applications_received", label: "Job applications received", auto: true },
      { key: "disciplinary_cases", label: "Disciplinary cases", downIsGood: true },
    ],
  },
  it: {
    narrativePrompt: NARRATIVE_SKELETON,
    metrics: [
      { key: "tickets_raised", label: "Help-desk tickets raised", auto: true },
      { key: "tickets_resolved", label: "Tickets resolved", auto: true },
      { key: "tickets_open", label: "Tickets still open", auto: true, downIsGood: true },
      { key: "assets_under_repair", label: "Assets under repair", auto: true, downIsGood: true },
      { key: "systems_downtime_hours", label: "Systems downtime (hours)", downIsGood: true },
    ],
  },
  executive: {
    narrativePrompt: NARRATIVE_SKELETON,
    metrics: [
      { key: "revenue_zmw", label: "Revenue (ZMW)" },
      { key: "headline_projects", label: "Headline projects in delivery" },
      { key: "key_risks", label: "Key risks tracked", downIsGood: true },
    ],
  },
};

// ---------------------------------------------------------------------------
// Report sections — the structured body of a report, replacing the single
// narrative blob. Compiled (department-level) reports follow the standard
// PCL report skeleton: Executive Summary → dashboards → status sections →
// risks → decisions needed → action plan. Individual (tier-1) reports use a
// short contributor skeleton.
// ---------------------------------------------------------------------------

export type OpsDeptReportSection = {
  key: string;
  label: string;
  placeholder?: string;
};

const SECTION_POOL = {
  executive_summary: {
    key: "executive_summary",
    label: "Executive Summary",
    placeholder: "Three to five sentences a director can read in one minute.",
  },
  project_dashboard: {
    key: "project_dashboard",
    label: "Project Dashboard (traffic-light status)",
    placeholder: "One line per project: Project — Green / Amber / Red — reason.",
  },
  overall_progress: {
    key: "overall_progress",
    label: "Overall Progress (% complete)",
    placeholder: "Progress per project against the programme.",
  },
  programme_status: {
    key: "programme_status",
    label: "Programme Status (planned vs actual)",
    placeholder: "Milestones planned vs achieved; slippage and recovery plan.",
  },
  financial_status: {
    key: "financial_status",
    label: "Financial Status",
    placeholder: "Spend vs budget, cash position, commitments, receivables.",
  },
  procurement_status: {
    key: "procurement_status",
    label: "Procurement Status",
    placeholder: "Orders placed, lead-time risks, deliveries expected.",
  },
  labour_equipment: {
    key: "labour_equipment",
    label: "Labour & Equipment Status",
    placeholder: "Workforce numbers, plant/equipment availability and downtime.",
  },
  staffing: {
    key: "staffing",
    label: "Staffing & People Update",
    placeholder: "Hires, exits, leave coverage, disciplinary or welfare matters.",
  },
  systems_status: {
    key: "systems_status",
    label: "Systems & Infrastructure Status",
    placeholder: "Uptime, incidents, security posture, licences and renewals.",
  },
  quality: {
    key: "quality",
    label: "Quality Report",
    placeholder: "Inspections, non-conformances, rework and closures.",
  },
  hse: {
    key: "hse",
    label: "Health, Safety & Environment",
    placeholder: "Incidents, near-misses, inspections, toolbox talks, actions.",
  },
  risks_mitigation: {
    key: "risks_mitigation",
    label: "Risks and Mitigation",
    placeholder: "Top risks this period and what is being done about each.",
  },
  decisions_needed: {
    key: "decisions_needed",
    label: "Issues Requiring Management Decision",
    placeholder: "Decisions you need from leadership, with options and a recommendation.",
  },
  action_plan: {
    key: "action_plan",
    label: "Action Plan for the Next Reporting Period",
    placeholder: "Committed actions, owners and dates for next period.",
  },
  photos: {
    key: "photos",
    label: "Photographic Progress",
    placeholder: "Reference the before/after photos uploaded to Site Photos for this period.",
  },
  appendix: {
    key: "appendix",
    label: "Appendix",
    placeholder: "Updated programme, procurement schedule, cash-flow summary references.",
  },
} as const satisfies Record<string, OpsDeptReportSection>;

/** Short skeleton every tier-1 contributor fills for their line manager. */
const INDIVIDUAL_SECTIONS: OpsDeptReportSection[] = [
  { key: "work_completed", label: "Work Completed This Period", placeholder: "What you delivered, per site/task." },
  { key: "progress_status", label: "Progress Against Plan", placeholder: "On track / behind, and why." },
  { key: "problems_risks", label: "Problems & Risks", placeholder: "Blockers, risks, anything unusual." },
  { key: "support_needed", label: "Support Needed / Decisions Required", placeholder: "What you need from your manager." },
  { key: "plan_next_period", label: "Plan for Next Period", placeholder: "Your priorities for the coming week." },
];

const COMPILED_SECTIONS: Record<OpsDepartmentKey, OpsDeptReportSection[]> = {
  operations: [
    SECTION_POOL.executive_summary,
    SECTION_POOL.project_dashboard,
    SECTION_POOL.overall_progress,
    SECTION_POOL.programme_status,
    SECTION_POOL.financial_status,
    SECTION_POOL.procurement_status,
    SECTION_POOL.labour_equipment,
    SECTION_POOL.quality,
    SECTION_POOL.hse,
    SECTION_POOL.risks_mitigation,
    SECTION_POOL.decisions_needed,
    SECTION_POOL.action_plan,
    SECTION_POOL.photos,
    SECTION_POOL.appendix,
  ],
  engineering: [
    SECTION_POOL.executive_summary,
    SECTION_POOL.project_dashboard,
    SECTION_POOL.overall_progress,
    SECTION_POOL.programme_status,
    SECTION_POOL.labour_equipment,
    SECTION_POOL.quality,
    SECTION_POOL.hse,
    SECTION_POOL.risks_mitigation,
    SECTION_POOL.decisions_needed,
    SECTION_POOL.action_plan,
    SECTION_POOL.photos,
  ],
  hse: [
    SECTION_POOL.executive_summary,
    SECTION_POOL.hse,
    SECTION_POOL.quality,
    SECTION_POOL.risks_mitigation,
    SECTION_POOL.decisions_needed,
    SECTION_POOL.action_plan,
  ],
  procurement: [
    SECTION_POOL.executive_summary,
    SECTION_POOL.procurement_status,
    SECTION_POOL.financial_status,
    SECTION_POOL.risks_mitigation,
    SECTION_POOL.decisions_needed,
    SECTION_POOL.action_plan,
    SECTION_POOL.appendix,
  ],
  finance: [
    SECTION_POOL.executive_summary,
    SECTION_POOL.financial_status,
    SECTION_POOL.risks_mitigation,
    SECTION_POOL.decisions_needed,
    SECTION_POOL.action_plan,
    SECTION_POOL.appendix,
  ],
  commercial: [
    SECTION_POOL.executive_summary,
    SECTION_POOL.financial_status,
    SECTION_POOL.programme_status,
    SECTION_POOL.risks_mitigation,
    SECTION_POOL.decisions_needed,
    SECTION_POOL.action_plan,
  ],
  hr: [
    SECTION_POOL.executive_summary,
    SECTION_POOL.staffing,
    SECTION_POOL.risks_mitigation,
    SECTION_POOL.decisions_needed,
    SECTION_POOL.action_plan,
  ],
  it: [
    SECTION_POOL.executive_summary,
    SECTION_POOL.systems_status,
    SECTION_POOL.risks_mitigation,
    SECTION_POOL.decisions_needed,
    SECTION_POOL.action_plan,
  ],
  executive: [
    SECTION_POOL.executive_summary,
    SECTION_POOL.project_dashboard,
    SECTION_POOL.financial_status,
    SECTION_POOL.risks_mitigation,
    SECTION_POOL.action_plan,
  ],
};

export function reportSectionsFor(
  department: OpsDepartmentKey,
  scope: OpsDepartmentReportScope,
): OpsDeptReportSection[] {
  return scope === "individual" ? INDIVIDUAL_SECTIONS : COMPILED_SECTIONS[department];
}

const SECTION_MAX_LENGTH = 8000;

/** Reads `section_<key>` form inputs; blank sections are simply omitted. */
export function collectTemplateSections(
  department: OpsDepartmentKey,
  scope: OpsDepartmentReportScope,
  readField: (name: string) => string,
): Record<string, string> {
  const sections: Record<string, string> = {};
  for (const section of reportSectionsFor(department, scope)) {
    const raw = readField(`section_${section.key}`).trim();
    if (raw === "") continue;
    sections[section.key] = raw.slice(0, SECTION_MAX_LENGTH);
  }
  return sections;
}

/** Label lookup across every known section, for rendering stored reports. */
export function reportSectionLabel(key: string): string {
  const pooled = (SECTION_POOL as Record<string, OpsDeptReportSection>)[key];
  if (pooled) return pooled.label;
  const individual = INDIVIDUAL_SECTIONS.find((section) => section.key === key);
  if (individual) return individual.label;
  return key.replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase());
}

/**
 * Merges the template's `metric_<key>` form inputs over any advanced-JSON
 * metrics. Blank inputs are skipped so untouched fields don't pollute the
 * stored object; numeric strings are stored as numbers.
 */
export function collectTemplateMetrics(
  department: OpsDepartmentKey,
  readField: (name: string) => string,
  baseMetrics: Record<string, unknown> = {},
): Record<string, unknown> {
  const metrics: Record<string, unknown> = { ...baseMetrics };

  for (const fieldDef of OPS_DEPARTMENT_REPORT_TEMPLATES[department].metrics) {
    const raw = readField(`metric_${fieldDef.key}`).trim();
    if (raw === "") continue;
    const numeric = Number(raw);
    metrics[fieldDef.key] = Number.isFinite(numeric) ? numeric : raw;
  }

  return metrics;
}

/** Template keys for a department — used to split "extra" metrics out. */
export function templateMetricKeys(department: OpsDepartmentKey): Set<string> {
  return new Set(
    OPS_DEPARTMENT_REPORT_TEMPLATES[department].metrics.map((field) => field.key),
  );
}

export type OpsReportMetricDelta = {
  delta: number;
  previous: number;
  /** Null when the previous value is 0 — a percentage would be meaningless. */
  percent: number | null;
};

/**
 * Numeric metric deltas between this report and the previous one of the same
 * cadence. Only keys that are numbers on BOTH sides compare; everything else
 * (text values, newly added metrics) is skipped rather than guessed at.
 */
export function compareReportMetrics(
  current: Record<string, unknown>,
  previous: Record<string, unknown>,
): Record<string, OpsReportMetricDelta> {
  const deltas: Record<string, OpsReportMetricDelta> = {};

  for (const [key, value] of Object.entries(current)) {
    const previousValue = previous[key];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      typeof previousValue !== "number" ||
      !Number.isFinite(previousValue)
    ) {
      continue;
    }

    const delta = Math.round((value - previousValue) * 100) / 100;
    deltas[key] = {
      delta,
      previous: previousValue,
      percent:
        previousValue === 0 ? null : Math.round((delta / previousValue) * 1000) / 10,
    };
  }

  return deltas;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

/**
 * Default reporting window for a period type: the most recent COMPLETED
 * period, since you report on what has finished (weekly = last full
 * Mon–Sun week, monthly = last full month, quarterly = last full quarter).
 */
export function defaultReportPeriodRange(
  period: OpsDepartmentReportPeriod,
  today = new Date(),
): { start: string; end: string } {
  const utcToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  if (period === "weekly") {
    // Monday of the current week, then step back one full week.
    const dayOfWeek = utcToday.getUTCDay() === 0 ? 7 : utcToday.getUTCDay();
    const thisMonday = new Date(utcToday);
    thisMonday.setUTCDate(utcToday.getUTCDate() - (dayOfWeek - 1));
    const lastMonday = new Date(thisMonday);
    lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
    const lastSunday = new Date(thisMonday);
    lastSunday.setUTCDate(thisMonday.getUTCDate() - 1);
    return { start: isoDate(lastMonday), end: isoDate(lastSunday) };
  }

  if (period === "quarterly") {
    const quarter = Math.floor(utcToday.getUTCMonth() / 3);
    const startOfThisQuarter = new Date(Date.UTC(utcToday.getUTCFullYear(), quarter * 3, 1));
    const startOfLastQuarter = new Date(
      Date.UTC(startOfThisQuarter.getUTCFullYear(), startOfThisQuarter.getUTCMonth() - 3, 1),
    );
    const endOfLastQuarter = new Date(startOfThisQuarter);
    endOfLastQuarter.setUTCDate(0);
    return { start: isoDate(startOfLastQuarter), end: isoDate(endOfLastQuarter) };
  }

  if (period === "ad_hoc") {
    const weekAgo = new Date(utcToday);
    weekAgo.setUTCDate(utcToday.getUTCDate() - 7);
    return { start: isoDate(weekAgo), end: isoDate(utcToday) };
  }

  // monthly (default)
  const startOfThisMonth = new Date(Date.UTC(utcToday.getUTCFullYear(), utcToday.getUTCMonth(), 1));
  const startOfLastMonth = new Date(
    Date.UTC(startOfThisMonth.getUTCFullYear(), startOfThisMonth.getUTCMonth() - 1, 1),
  );
  const endOfLastMonth = new Date(startOfThisMonth);
  endOfLastMonth.setUTCDate(0);
  return { start: isoDate(startOfLastMonth), end: isoDate(endOfLastMonth) };
}

/** "June 2026 Operations report" for monthly; falls back to the date range. */
export function suggestedReportTitle(
  departmentLabel: string,
  period: OpsDepartmentReportPeriod,
  range: { start: string; end: string },
) {
  if (period === "monthly") {
    const monthName = new Date(`${range.start}T00:00:00Z`).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    return `${monthName} ${departmentLabel} report`;
  }
  if (period === "weekly") {
    return `${departmentLabel} weekly report ${range.start} to ${range.end}`;
  }
  if (period === "quarterly") {
    return `${departmentLabel} quarterly report ${range.start} to ${range.end}`;
  }
  return `${departmentLabel} report ${range.start} to ${range.end}`;
}
