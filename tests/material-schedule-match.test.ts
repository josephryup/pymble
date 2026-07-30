import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScheduleLineMatcher,
  normalizeScheduleText,
  type ScheduleLineForMatch,
} from "../src/lib/ops/material-schedule-match";

const LINES: ScheduleLineForMatch[] = [
  { id: "line-cement", description: "Portland cement 42.5N (50kg bags)", unit: "bag" },
  { id: "line-rebar", description: "Rebar Y12", unit: "t" },
  { id: "line-tiles", description: "Wall tiles 300x300", unit: "m2" },
];

describe("normalizeScheduleText", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    assert.equal(
      normalizeScheduleText("  Portland CEMENT 42.5N (50kg bags) "),
      "portland cement 42 5n 50kg bags",
    );
  });
});

describe("buildScheduleLineMatcher", () => {
  const match = buildScheduleLineMatcher(LINES);

  it("links an explicit schedule reference (tier 1)", () => {
    const result = match({
      itemName: "Cement",
      unit: "bag",
      scheduleRef: "Portland cement 42.5N (50kg bags)",
    });
    assert.deepEqual(result, { lineId: "line-cement", matchType: "reference" });
  });

  it("never guesses when an explicit reference fails to resolve", () => {
    // A typo'd reference must not fall through to name matching — the user
    // said which line they meant; a silent different link is worse than none.
    const result = match({
      itemName: "Rebar Y12",
      unit: "t",
      scheduleRef: "Rebar Y16",
    });
    assert.equal(result, null);
  });

  it("links an exact description match (tier 2)", () => {
    const result = match({ itemName: "rebar y12", unit: "" });
    assert.deepEqual(result, { lineId: "line-rebar", matchType: "exact" });
  });

  it("links a one-sided containment when exactly one line qualifies (tier 3)", () => {
    const result = match({ itemName: "Cement 50kg bags", unit: "bag" });
    assert.equal(result, null); // "cement 50kg bags" is not a substring — stays safe

    const contained = match({ itemName: "Portland cement 42.5N", unit: "bag" });
    assert.deepEqual(contained, { lineId: "line-cement", matchType: "contains" });
  });

  it("refuses a containment match when units disagree", () => {
    const result = match({ itemName: "Portland cement 42.5N", unit: "t" });
    assert.equal(result, null);
  });

  it("refuses short names for containment", () => {
    const result = match({ itemName: "tiles", unit: "m2" });
    assert.equal(result, null);
  });

  it("refuses when several lines share the matched description, unless the unit disambiguates", () => {
    const ambiguous = buildScheduleLineMatcher([
      { id: "phase1-cement", description: "Cement 42.5N", unit: "bag" },
      { id: "phase2-cement", description: "Cement 42.5N", unit: "t" },
    ]);

    assert.equal(ambiguous({ itemName: "Cement 42.5N", unit: "" }), null);
    assert.deepEqual(ambiguous({ itemName: "Cement 42.5N", unit: "t" }), {
      lineId: "phase2-cement",
      matchType: "exact",
    });
  });

  it("returns null for everything when the site has no schedule lines", () => {
    const empty = buildScheduleLineMatcher([]);
    assert.equal(empty({ itemName: "Portland cement 42.5N", unit: "bag" }), null);
  });
});
