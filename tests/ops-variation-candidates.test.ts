import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildVariationCandidates,
  isClaimableReason,
  type OffScheduleItemRow,
} from "../src/lib/ops/variation-candidates";

const SITES = [
  { id: "site-1", code: "0004", name: "Test Site", contractValue: 2_000_000 },
  { id: "site-2", code: "0003", name: "Other Site", contractValue: 0 },
];

function item(overrides: Partial<OffScheduleItemRow> = {}): OffScheduleItemRow {
  return { siteId: "site-1", reason: "client_instruction", value: 10_000, ...overrides };
}

describe("isClaimableReason", () => {
  it("treats client scope as billable and our own cost as absorbed", () => {
    assert.equal(isClaimableReason("client_instruction"), true);
    assert.equal(isClaimableReason("design_change"), true);
    assert.equal(isClaimableReason("site_condition"), true);

    assert.equal(isClaimableReason("schedule_omission"), false);
    assert.equal(isClaimableReason("wastage_rework"), false);
    assert.equal(isClaimableReason("other"), false);
    assert.equal(isClaimableReason(null), false);
  });
});

describe("buildVariationCandidates", () => {
  it("splits claimable, absorbed and untagged without mixing them", () => {
    const [candidate] = buildVariationCandidates({
      items: [
        item({ reason: "client_instruction", value: 40_000 }),
        item({ reason: "design_change", value: 20_000 }),
        item({ reason: "schedule_omission", value: 15_000 }),
        item({ reason: null, value: 5_000 }),
      ],
      sites: SITES,
    });

    assert.equal(candidate.claimableValue, 60_000);
    assert.equal(candidate.absorbedValue, 15_000);
    // Untagged is reported on its own — assuming either way would make the
    // claimable figure untrustworthy.
    assert.equal(candidate.untaggedValue, 5_000);
    assert.equal(candidate.totalOffScheduleValue, 80_000);
  });

  it("flags a candidate on the absolute threshold", () => {
    const [candidate] = buildVariationCandidates({
      items: [item({ value: 50_000 })],
      sites: SITES,
    });

    assert.equal(candidate.isCandidate, true);
  });

  it("flags a candidate on the contract-percentage threshold even when small", () => {
    // K30,000 is under the absolute threshold, but it is 6% of a K500,000
    // contract — material to that job.
    const [candidate] = buildVariationCandidates({
      items: [item({ value: 30_000 })],
      sites: [{ id: "site-1", code: "0004", name: "Small job", contractValue: 500_000 }],
    });

    assert.equal(candidate.claimablePercentOfContract, 6);
    assert.equal(candidate.isCandidate, true);
  });

  it("does not flag modest claimable spend on a large contract", () => {
    const [candidate] = buildVariationCandidates({
      items: [item({ value: 10_000 })],
      sites: SITES,
    });

    assert.equal(candidate.isCandidate, false);
  });

  it("never counts absorbed or untagged spend toward the claim", () => {
    const [candidate] = buildVariationCandidates({
      items: [
        item({ reason: "schedule_omission", value: 400_000 }),
        item({ reason: null, value: 400_000 }),
      ],
      sites: SITES,
    });

    assert.equal(candidate.claimableValue, 0);
    assert.equal(candidate.isCandidate, false);
  });

  it("handles a site with no contract value recorded", () => {
    const [candidate] = buildVariationCandidates({
      items: [item({ siteId: "site-2", value: 80_000 })],
      sites: SITES,
    });

    assert.equal(candidate.claimablePercentOfContract, null);
    // Still a candidate on the absolute threshold.
    assert.equal(candidate.isCandidate, true);
  });

  it("omits sites with no off-schedule spend at all", () => {
    const results = buildVariationCandidates({
      items: [item({ siteId: "site-1" })],
      sites: SITES,
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].siteId, "site-1");
  });

  it("ranks by claimable value so the biggest claim leads", () => {
    const results = buildVariationCandidates({
      items: [
        item({ siteId: "site-1", value: 20_000 }),
        item({ siteId: "site-2", value: 90_000 }),
      ],
      sites: SITES,
    });

    assert.deepEqual(
      results.map((row) => row.siteCode),
      ["0003", "0004"],
    );
  });
});
