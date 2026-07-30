/**
 * Matches imported material-request rows to the site's issued material
 * schedule lines (project↔finance spine audit, D1).
 *
 * The bulk importer is how items realistically arrive, and it used to drop
 * the schedule link entirely — every imported item became an orphan, which
 * killed budget-line resolution and planned-vs-actual variance downstream.
 * This module links what can be linked *safely*: matches are conservative by
 * design, because a wrong link quietly charges the wrong budget line, while
 * a missed link merely falls back to today's behaviour (unlinked, resolved
 * to the unplanned/contingency line and visible in the leak detector).
 *
 * Pure and dependency-free so the matching rules are testable without a
 * database — same pattern as boq-actuals.ts and finance-leaks.ts.
 */

export type ScheduleLineForMatch = {
  id: string;
  description: string;
  unit: string;
};

export type ScheduleLineMatch = {
  lineId: string;
  /** How the link was made — recorded in the audit trail. */
  matchType: "reference" | "exact" | "contains";
};

/** Lowercase, strip punctuation, collapse runs of whitespace. */
export function normalizeScheduleText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Minimum normalized length before a containment match is even considered. */
const CONTAINS_MIN_LENGTH = 6;

function unitsCompatible(rowUnit: string, lineUnit: string): boolean {
  const a = normalizeScheduleText(rowUnit);
  const b = normalizeScheduleText(lineUnit);
  // A missing unit on either side is "no objection", not a mismatch.
  return a.length === 0 || b.length === 0 || a === b;
}

export function buildScheduleLineMatcher(lines: ScheduleLineForMatch[]) {
  const normalized = lines
    .map((line) => ({
      id: line.id,
      unit: line.unit,
      text: normalizeScheduleText(line.description),
    }))
    .filter((line) => line.text.length > 0);

  const byText = new Map<string, typeof normalized>();
  for (const line of normalized) {
    const list = byText.get(line.text) ?? [];
    list.push(line);
    byText.set(line.text, list);
  }

  function resolveAmbiguity(
    candidates: typeof normalized,
    rowUnit: string,
  ): string | null {
    if (candidates.length === 1) {
      return candidates[0].id;
    }
    // Same description on several lines (e.g. two phases both carry
    // "cement"): the unit may disambiguate; anything else stays unlinked.
    const unitMatches = candidates.filter(
      (candidate) =>
        normalizeScheduleText(candidate.unit) === normalizeScheduleText(rowUnit) &&
        normalizeScheduleText(rowUnit).length > 0,
    );
    return unitMatches.length === 1 ? unitMatches[0].id : null;
  }

  return function match(input: {
    itemName: string;
    unit: string;
    /** The explicit "schedule line" column value, when the file has one. */
    scheduleRef?: string;
  }): ScheduleLineMatch | null {
    // Tier 1 — the file names the schedule line outright.
    const ref = normalizeScheduleText(input.scheduleRef);
    if (ref.length > 0) {
      const refCandidates = byText.get(ref);
      if (refCandidates) {
        const lineId = resolveAmbiguity(refCandidates, input.unit);
        if (lineId) {
          return { lineId, matchType: "reference" };
        }
      }
      // An explicit reference that doesn't resolve is a deliberate signal —
      // don't fall through to guessing from the item name, or a typo'd
      // reference could silently link somewhere else.
      return null;
    }

    const name = normalizeScheduleText(input.itemName);
    if (name.length === 0) {
      return null;
    }

    // Tier 2 — the item name IS a schedule line description.
    const exactCandidates = byText.get(name);
    if (exactCandidates) {
      const lineId = resolveAmbiguity(exactCandidates, input.unit);
      if (lineId) {
        return { lineId, matchType: "exact" };
      }
      return null;
    }

    // Tier 3 — one-directional containment, only when exactly one schedule
    // line qualifies and the units don't disagree. "Cement 42.5N" ⊆
    // "Portland cement 42.5N (50kg bags)" links; a name that appears inside
    // three different lines stays unlinked.
    if (name.length < CONTAINS_MIN_LENGTH) {
      return null;
    }
    const containsCandidates = normalized.filter(
      (line) =>
        line.text.length >= CONTAINS_MIN_LENGTH &&
        (line.text.includes(name) || name.includes(line.text)) &&
        unitsCompatible(input.unit, line.unit),
    );
    if (containsCandidates.length === 1) {
      return { lineId: containsCandidates[0].id, matchType: "contains" };
    }

    return null;
  };
}
