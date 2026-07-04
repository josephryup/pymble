import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCertifiedScurve,
  buildCommercialFunnel,
  type OpsIpcChartRow,
} from "../src/lib/ops/commercial-charts";

const NOW = new Date("2026-07-04T10:00:00Z");

function ipc(partial: Partial<OpsIpcChartRow>): OpsIpcChartRow {
  return {
    status: "certified",
    claimed_amount: 0,
    certified_amount: 0,
    total_certified_amount: 0,
    certified_at: null,
    invoiced_at: null,
    paid_at: null,
    ...partial,
  };
}

describe("buildCommercialFunnel", () => {
  it("steps down claimed → certified → invoiced → paid", () => {
    const funnel = buildCommercialFunnel([
      ipc({ status: "paid", claimed_amount: 100, total_certified_amount: 90, invoiced_at: "2026-06-10", paid_at: "2026-06-20" }),
      ipc({ status: "invoiced", claimed_amount: 100, total_certified_amount: 80, invoiced_at: "2026-06-15" }),
      ipc({ status: "certified", claimed_amount: 100, total_certified_amount: 70 }),
      ipc({ status: "submitted", claimed_amount: 100 }),
      ipc({ status: "cancelled", claimed_amount: 999 }), // excluded from claimed
    ]);

    const byKey = Object.fromEntries(funnel.map((stage) => [stage.key, stage.amount]));
    assert.equal(byKey.claimed, 400);
    assert.equal(byKey.certified, 240); // 90 + 80 + 70
    assert.equal(byKey.invoiced, 170); // 90 + 80
    assert.equal(byKey.paid, 90);
    // Percentages are relative to claimed.
    assert.equal(funnel.find((s) => s.key === "paid")?.pct, 23); // 90/400
  });

  it("never divides by zero when nothing is claimed", () => {
    const funnel = buildCommercialFunnel([]);
    assert.equal(funnel[0].amount, 0);
    assert.equal(funnel[0].pct, 0);
  });
});

describe("buildCertifiedScurve", () => {
  it("accumulates certified value month over month within the window", () => {
    const points = buildCertifiedScurve(
      [
        ipc({ status: "certified", total_certified_amount: 1000, certified_at: "2026-05-10" }),
        ipc({ status: "invoiced", total_certified_amount: 500, certified_at: "2026-06-04" }),
        ipc({ status: "paid", total_certified_amount: 250, certified_at: "2026-06-20" }),
        // Draft IPC without certified_at is ignored.
        ipc({ status: "submitted", claimed_amount: 9999 }),
      ],
      3,
      NOW,
    );

    assert.deepEqual(
      points.map((point) => point.month),
      ["2026-05", "2026-06", "2026-07"],
    );
    assert.equal(points[0].cumulative, 1000);
    assert.equal(points[1].certified, 750);
    assert.equal(points[1].cumulative, 1750);
    assert.equal(points[2].cumulative, 1750);
  });

  it("carries pre-window certified value into the opening cumulative", () => {
    const points = buildCertifiedScurve(
      [ipc({ status: "certified", total_certified_amount: 5000, certified_at: "2026-01-15" })],
      3,
      NOW,
    );
    assert.equal(points[0].cumulative, 5000);
  });
});
