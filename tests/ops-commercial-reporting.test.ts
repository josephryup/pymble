import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOpsCommercialForecastReport,
  buildOpsCommercialMarginReport,
} from "../src/lib/ops/commercial-reporting";

describe("commercial margin reporting", () => {
  it("builds site margin totals from commercial revenue and project costs", () => {
    const report = buildOpsCommercialMarginReport({
      claims: [
        {
          agreed_amount: 50_000,
          claimed_amount: 60_000,
          site_id: "site-1",
          status: "agreed",
        },
      ],
      contracts: [
        {
          contract_sum: 1_000_000,
          site: { code: "PYM-001", id: "site-1", name: "Main works" },
          site_id: "site-1",
          status: "active",
        },
      ],
      costs: [
        { amount: 250_000, site_id: "site-1", status: "posted" },
        { amount: 100_000, site_id: "site-1", status: "committed" },
      ],
      valuationLines: [
        {
          certified_amount: 300_000,
          valuation: { site_id: "site-1", status: "certified" },
        },
      ],
      variations: [
        {
          approved_amount: 100_000,
          site_id: "site-1",
          status: "approved",
          submitted_amount: 120_000,
        },
      ],
    });

    assert.equal(report.totals.siteCount, 1);
    assert.equal(report.totals.forecastRevenue, 1_150_000);
    assert.equal(report.totals.totalCostExposure, 350_000);
    assert.equal(report.totals.forecastMargin, 800_000);
    assert.equal(report.totals.certifiedRevenue, 300_000);
    assert.equal(report.totals.realizedMargin, 50_000);
    assert.equal(report.snapshots[0]?.tone, "good");
  });

  it("sorts margin risk ahead of healthy sites", () => {
    const report = buildOpsCommercialMarginReport({
      claims: [],
      contracts: [
        { contract_sum: 100_000, site_id: "site-risk", status: "active" },
        { contract_sum: 500_000, site_id: "site-good", status: "active" },
      ],
      costs: [
        { amount: 120_000, site_id: "site-risk", status: "posted" },
        { amount: 100_000, site_id: "site-good", status: "posted" },
      ],
      valuationLines: [],
      variations: [],
    });

    assert.equal(report.snapshots[0]?.siteId, "site-risk");
    assert.equal(report.snapshots[0]?.tone, "danger");
    assert.equal(report.snapshots[1]?.tone, "good");
    assert.equal(report.totals.watchCount, 1);
    assert.equal(report.totals.dangerCount, 1);
  });

  it("builds retention, cashflow, and milestone forecast totals", () => {
    const report = buildOpsCommercialForecastReport({
      cashflowForecasts: [
        {
          actual_net_cash: 0,
          forecast_cost: 80_000,
          forecast_net_cash: 45_000,
          forecast_retention_release: 20_000,
          forecast_revenue: 105_000,
          period_start: "2026-06-01",
          status: "approved",
        },
        {
          actual_net_cash: 0,
          forecast_cost: 70_000,
          forecast_net_cash: -10_000,
          forecast_retention_release: 0,
          forecast_revenue: 60_000,
          period_start: "2026-07-01",
          status: "draft",
        },
      ],
      milestones: [
        {
          achieved_amount: 0,
          due_date: "2026-05-15",
          forecast_date: null,
          planned_date: "2026-05-01",
          status: "due",
          target_amount: 100_000,
        },
        {
          achieved_amount: 120_000,
          due_date: "2026-06-15",
          forecast_date: "2026-06-10",
          planned_date: "2026-06-01",
          status: "achieved",
          target_amount: 120_000,
        },
      ],
      retentionReleases: [
        {
          approved_amount: 10_000,
          claimed_amount: 12_000,
          due_date: "2026-05-31",
          released_amount: 0,
          status: "approved",
        },
        {
          approved_amount: 0,
          claimed_amount: 8_000,
          due_date: "2026-06-20",
          released_amount: 8_000,
          status: "released",
        },
      ],
      today: "2026-06-07",
    });

    assert.equal(report.totals.forecastRevenue, 165_000);
    assert.equal(report.totals.forecastRetentionRelease, 20_000);
    assert.equal(report.totals.forecastCost, 150_000);
    assert.equal(report.totals.approvedCashflowNet, 35_000);
    assert.equal(report.totals.cashflowDangerCount, 1);
    assert.equal(report.totals.pendingRetentionAmount, 10_000);
    assert.equal(report.totals.releasedRetentionAmount, 8_000);
    assert.equal(report.totals.retentionDueCount, 1);
    assert.equal(report.totals.milestoneForecastAmount, 220_000);
    assert.equal(report.totals.milestoneAchievedAmount, 120_000);
    assert.equal(report.totals.milestoneOverdueCount, 1);
  });
});
