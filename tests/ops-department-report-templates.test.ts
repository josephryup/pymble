import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  departmentsExpectedToReport,
  OPS_DEPARTMENT_LABELS,
  type OpsDepartmentKey,
} from "../src/lib/ops/department-report-permissions";
import {
  collectTemplateMetrics,
  collectTemplateSections,
  compareReportMetrics,
  defaultReportPeriodRange,
  OPS_DEPARTMENT_REPORT_TEMPLATES,
  reportSectionsFor,
  suggestedReportTitle,
  templateMetricKeys,
} from "../src/lib/ops/department-report-templates";
import {
  departmentsMissingCadenceReport,
  isoWeekday,
  previousMonthWindow,
  previousWeekWindow,
} from "../src/lib/ops/escalations";

const DEPARTMENTS = Object.keys(OPS_DEPARTMENT_LABELS) as OpsDepartmentKey[];

describe("department report templates", () => {
  it("defines a template with metrics and a narrative prompt for every department", () => {
    for (const department of DEPARTMENTS) {
      const template = OPS_DEPARTMENT_REPORT_TEMPLATES[department];
      assert.ok(template, `missing template for ${department}`);
      assert.ok(template.metrics.length >= 2, `${department} needs at least 2 metrics`);
      assert.ok(template.narrativePrompt.includes("Highlights"));
    }
  });

  it("uses unique snake_case metric keys within each department", () => {
    for (const department of DEPARTMENTS) {
      const keys = OPS_DEPARTMENT_REPORT_TEMPLATES[department].metrics.map((m) => m.key);
      assert.equal(new Set(keys).size, keys.length, `${department} has duplicate keys`);
      for (const key of keys) {
        assert.match(key, /^[a-z0-9_]+$/, `${department}.${key} is not snake_case`);
      }
    }
  });

  it("collects numeric form inputs and keeps advanced-JSON extras", () => {
    const fields = new Map([
      ["metric_sites_active", "4"],
      ["metric_site_reports_filed", ""],
      ["metric_average_workforce_on_site", "62.5"],
    ]);
    const metrics = collectTemplateMetrics(
      "operations",
      (name) => fields.get(name) ?? "",
      { custom_measure: 12 },
    );

    assert.deepEqual(metrics, {
      custom_measure: 12,
      sites_active: 4,
      average_workforce_on_site: 62.5,
    });
  });

  it("splits template keys from extras", () => {
    const keys = templateMetricKeys("it");
    assert.ok(keys.has("tickets_raised"));
    assert.ok(!keys.has("sites_active"));
  });
});

describe("report sections", () => {
  it("gives every department a compiled skeleton led by an executive summary", () => {
    for (const department of DEPARTMENTS) {
      const sections = reportSectionsFor(department, "compiled");
      assert.ok(sections.length >= 4, `${department} compiled template too thin`);
      assert.equal(sections[0].key, "executive_summary");
      const keys = sections.map((section) => section.key);
      assert.equal(new Set(keys).size, keys.length, `${department} duplicate section keys`);
    }
  });

  it("operations compiled template follows the standard PCL report skeleton", () => {
    const keys = reportSectionsFor("operations", "compiled").map((section) => section.key);
    for (const expected of [
      "executive_summary",
      "project_dashboard",
      "overall_progress",
      "programme_status",
      "financial_status",
      "procurement_status",
      "labour_equipment",
      "quality",
      "hse",
      "risks_mitigation",
      "decisions_needed",
      "action_plan",
      "photos",
      "appendix",
    ]) {
      assert.ok(keys.includes(expected), `operations template missing ${expected}`);
    }
  });

  it("individual reports use the short contributor skeleton", () => {
    const keys = reportSectionsFor("engineering", "individual").map((section) => section.key);
    assert.deepEqual(keys, [
      "work_completed",
      "progress_status",
      "problems_risks",
      "support_needed",
      "plan_next_period",
    ]);
  });

  it("collects only filled sections from the form", () => {
    const fields = new Map([
      ["section_work_completed", "Poured slab at ZC-01."],
      ["section_problems_risks", "  "],
    ]);
    const sections = collectTemplateSections(
      "engineering",
      "individual",
      (name) => fields.get(name) ?? "",
    );
    assert.deepEqual(sections, { work_completed: "Poured slab at ZC-01." });
  });
});

describe("compareReportMetrics", () => {
  it("computes deltas and percentages for numeric pairs only", () => {
    const deltas = compareReportMetrics(
      { tickets_raised: 8, tickets_open: 2, note: "text", brand_new: 5 },
      { tickets_raised: 5, tickets_open: 2, note: "old text" },
    );

    assert.deepEqual(deltas.tickets_raised, { delta: 3, previous: 5, percent: 60 });
    assert.deepEqual(deltas.tickets_open, { delta: 0, previous: 2, percent: 0 });
    assert.equal(deltas.note, undefined);
    assert.equal(deltas.brand_new, undefined);
  });

  it("returns a null percentage when the previous value was zero", () => {
    const deltas = compareReportMetrics({ incidents: 2 }, { incidents: 0 });
    assert.deepEqual(deltas.incidents, { delta: 2, previous: 0, percent: null });
  });
});

describe("default reporting windows", () => {
  it("monthly defaults to the last completed month", () => {
    const range = defaultReportPeriodRange("monthly", new Date("2026-07-03T08:00:00Z"));
    assert.deepEqual(range, { start: "2026-06-01", end: "2026-06-30" });
  });

  it("weekly defaults to the last full Monday-to-Sunday week", () => {
    // 2026-07-03 is a Friday; last full week is Mon 22 Jun – Sun 28 Jun.
    const range = defaultReportPeriodRange("weekly", new Date("2026-07-03T08:00:00Z"));
    assert.deepEqual(range, { start: "2026-06-22", end: "2026-06-28" });
  });

  it("quarterly defaults to the last completed quarter", () => {
    const range = defaultReportPeriodRange("quarterly", new Date("2026-07-03T08:00:00Z"));
    assert.deepEqual(range, { start: "2026-04-01", end: "2026-06-30" });
  });

  it("suggests a human month title for monthly reports", () => {
    assert.equal(
      suggestedReportTitle("Operations", "monthly", { start: "2026-06-01", end: "2026-06-30" }),
      "June 2026 Operations report",
    );
  });
});

describe("report cadence reminders", () => {
  it("computes the previous month window from a Lusaka date key", () => {
    assert.deepEqual(previousMonthWindow("2026-07-03"), {
      start: "2026-06-01",
      end: "2026-06-30",
      monthKey: "2026-06",
    });
    // Year boundary.
    assert.deepEqual(previousMonthWindow("2026-01-02"), {
      start: "2025-12-01",
      end: "2025-12-31",
      monthKey: "2025-12",
    });
  });

  it("computes the previous Monday-to-Sunday week and weekday numbers", () => {
    // 2026-07-03 is a Friday.
    assert.deepEqual(previousWeekWindow("2026-07-03"), {
      start: "2026-06-22",
      end: "2026-06-28",
      weekKey: "2026-06-22",
    });
    // From a Monday, the previous full week ends yesterday.
    assert.deepEqual(previousWeekWindow("2026-07-06"), {
      start: "2026-06-29",
      end: "2026-07-05",
      weekKey: "2026-06-29",
    });
    assert.equal(isoWeekday("2026-07-06"), 1);
    assert.equal(isoWeekday("2026-07-05"), 7);
  });

  it("flags departments without a compiled weekly report in the window", () => {
    const window = { start: "2026-06-22", end: "2026-06-28" };
    const missing = departmentsMissingCadenceReport(
      [
        { department: "operations", period: "weekly", period_end_date: "2026-06-28", scope: "compiled" },
        // An individual report does not satisfy the department cadence.
        { department: "engineering", period: "weekly", period_end_date: "2026-06-28", scope: "individual" },
        // Prior-week report does not count for this window.
        { department: "hse", period: "weekly", period_end_date: "2026-06-21", scope: "compiled" },
      ],
      window,
      "weekly",
    );

    assert.ok(!missing.includes("operations"));
    assert.ok(missing.includes("engineering"));
    assert.ok(missing.includes("hse"));
    assert.ok(missing.includes("finance"));
    // Executive never reports to itself.
    assert.ok(!missing.includes("executive"));
    assert.ok(!departmentsExpectedToReport().includes("executive"));
  });
});
