import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bucketGlMonthlyTrend, type OpsGlTrendLine } from "../src/lib/ops/gl-trends";

const NOW = new Date("2026-07-04T10:00:00Z");

function line(partial: Partial<OpsGlTrendLine>): OpsGlTrendLine {
  return {
    entry_date: "2026-06-15",
    status: "posted",
    account_type: "income",
    account_subtype: "sales",
    debit: 0,
    credit: 0,
    ...partial,
  };
}

describe("bucketGlMonthlyTrend", () => {
  it("returns a continuous zero-filled window ending at the current month", () => {
    const points = bucketGlMonthlyTrend([], 3, NOW);
    assert.deepEqual(
      points.map((point) => point.month),
      ["2026-05", "2026-06", "2026-07"],
    );
    assert.ok(points.every((point) => point.income === 0 && point.cashBalance === 0));
    assert.equal(points[1].label, "Jun 26");
  });

  it("buckets income and expenses by normal balance side", () => {
    const points = bucketGlMonthlyTrend(
      [
        line({ entry_date: "2026-06-10", account_type: "income", credit: 5000 }),
        line({ entry_date: "2026-06-12", account_type: "income", debit: 500 }), // credit note
        line({ entry_date: "2026-06-20", account_type: "expense", debit: 1200 }),
        line({ entry_date: "2026-07-01", account_type: "expense", debit: 300 }),
      ],
      3,
      NOW,
    );
    const june = points.find((point) => point.month === "2026-06");
    const july = points.find((point) => point.month === "2026-07");
    assert.equal(june?.income, 4500);
    assert.equal(june?.expenses, 1200);
    assert.equal(june?.net, 3300);
    assert.equal(july?.expenses, 300);
  });

  it("ignores unposted entries", () => {
    const points = bucketGlMonthlyTrend(
      [line({ entry_date: "2026-06-10", credit: 9999, status: "draft" })],
      3,
      NOW,
    );
    assert.equal(points.find((point) => point.month === "2026-06")?.income, 0);
  });

  it("carries the opening cash balance into the window", () => {
    const points = bucketGlMonthlyTrend(
      [
        // Before the window: K10,000 landed in the bank.
        line({
          entry_date: "2026-01-15",
          account_type: "asset",
          account_subtype: "bank",
          debit: 10000,
        }),
        // Inside the window: K2,500 paid out of cash.
        line({
          entry_date: "2026-06-05",
          account_type: "asset",
          account_subtype: "cash",
          credit: 2500,
        }),
      ],
      3,
      NOW,
    );
    assert.equal(points[0].cashBalance, 10000); // May: opening balance carried
    assert.equal(points[1].cashMovement, -2500);
    assert.equal(points[1].cashBalance, 7500); // June
    assert.equal(points[2].cashBalance, 7500); // July unchanged
  });
});
