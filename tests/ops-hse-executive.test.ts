import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOpsHseExecutiveSafetyRollup,
  type OpsHseExecutiveSafetySignals,
} from "../src/lib/ops/hse-executive";

const zeroSignals: OpsHseExecutiveSafetySignals = {
  actionRequiredAudits: 0,
  actionRequiredIncidents: 0,
  agedOpenIncidents: 0,
  auditsDueSoon: 0,
  auditsOverdue: 0,
  completedActionsAwaitingVerification: 0,
  dueSoonCorrectiveActions: 0,
  expiredTraining: 0,
  highCriticalOpenIncidents: 0,
  highPriorityOpenActions: 0,
  highResidualRiskAssessments: 0,
  inspectionsActionRequired: 0,
  inspectionsOverdue: 0,
  openCorrectiveActions: 0,
  openIncidents: 0,
  openInspectionFindings: 0,
  overdueCorrectiveActions: 0,
  reviewDueRiskAssessments: 0,
  submittedRiskAssessments: 0,
  trainingDueSoon: 0,
  zeroStockPpeItems: 0,
};

describe("HSE executive safety rollup", () => {
  it("marks a clean HSE workspace as steady", () => {
    const rollup = buildOpsHseExecutiveSafetyRollup(
      zeroSignals,
      "2026-06-05",
      "2026-06-05T06:00:00.000Z",
    );

    assert.equal(rollup.pressureLevel, "steady");
    assert.equal(rollup.pressureScore, 0);
    assert.equal(rollup.headline, "No urgent HSE escalation signals.");
    assert.equal(rollup.trendSnapshots.length, 5);
    assert.equal(rollup.trendSnapshots[0].label, "Incident backlog");
  });

  it("marks high critical incidents and overdue actions as urgent", () => {
    const rollup = buildOpsHseExecutiveSafetyRollup(
      {
        ...zeroSignals,
        actionRequiredAudits: 1,
        highCriticalOpenIncidents: 2,
        overdueCorrectiveActions: 1,
      },
      "2026-06-05",
      "2026-06-05T06:00:00.000Z",
    );

    assert.equal(rollup.pressureLevel, "urgent");
    assert.equal(rollup.escalationSignals[0].tone, "urgent");
    assert.equal(rollup.escalationSignals[1].value, 1);
    assert.equal(rollup.trendSnapshots[0].tone, "urgent");
    assert.equal(rollup.pressureScore > 0, true);
  });

  it("marks due-soon controls as watch without forcing urgent pressure", () => {
    const rollup = buildOpsHseExecutiveSafetyRollup(
      {
        ...zeroSignals,
        dueSoonCorrectiveActions: 2,
        reviewDueRiskAssessments: 3,
        trainingDueSoon: 4,
      },
      "2026-06-05",
      "2026-06-05T06:00:00.000Z",
    );

    assert.equal(rollup.pressureLevel, "watch");
    assert.equal(rollup.escalationSignals[3].tone, "watch");
    assert.equal(rollup.trendSnapshots[1].value, "2");
    assert.equal(rollup.trendSnapshots[3].value, "4");
  });
});
