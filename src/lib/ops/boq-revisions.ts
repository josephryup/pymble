/**
 * Material schedule revision diffing (audit B1 / A7).
 *
 * A revision is a new schedule document that supersedes an earlier one. Before
 * it is issued, whoever signs it off needs to see exactly what changed — and
 * once issued, the budget delta needs to be explainable after the fact. Both
 * come from the same pure diff below.
 *
 * Lines are matched by description + unit, case- and whitespace-insensitive.
 * Schedule lines have no stable identity across versions (a revision clones
 * them, so ids differ), and description+unit is what a QS actually treats as
 * "the same line". Re-describing a line therefore reads as a removal plus an
 * addition, which is the honest reading — the money moved.
 */

export type BoqDiffLine = {
  description: string;
  unit: string;
  quantity: number;
  unitRate: number;
  category: string;
  /** quantity × unitRate. */
  total: number;
  transportCost: number;
};

export type BoqDiffChange = {
  key: string;
  description: string;
  unit: string;
  before: BoqDiffLine;
  after: BoqDiffLine;
  quantityDelta: number;
  rateDelta: number;
  totalDelta: number;
  categoryChanged: boolean;
};

export type BoqRevisionDiff = {
  added: BoqDiffLine[];
  removed: BoqDiffLine[];
  changed: BoqDiffChange[];
  unchanged: number;
  /** Signed money movement: positive = the revision costs more. */
  totalDelta: number;
  previousTotal: number;
  revisedTotal: number;
  /** Per-category movement, for explaining the budget re-sync. */
  categoryDeltas: Array<{ category: string; before: number; after: number; delta: number }>;
  hasChanges: boolean;
};

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Identity used to pair a line across versions. */
export function boqDiffKey(line: Pick<BoqDiffLine, "description" | "unit">) {
  return `${line.description.trim().toLowerCase()}::${line.unit.trim().toLowerCase()}`;
}

function sumTotals(lines: BoqDiffLine[]) {
  return round(lines.reduce((sum, line) => sum + line.total, 0));
}

function categoryTotals(lines: BoqDiffLine[]) {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const category = line.category || "general";
    totals.set(category, round((totals.get(category) ?? 0) + line.total));
  }
  return totals;
}

export function diffBoqRevision(
  previous: BoqDiffLine[],
  revised: BoqDiffLine[],
): BoqRevisionDiff {
  const previousByKey = new Map(previous.map((line) => [boqDiffKey(line), line]));
  const revisedByKey = new Map(revised.map((line) => [boqDiffKey(line), line]));

  const added: BoqDiffLine[] = [];
  const removed: BoqDiffLine[] = [];
  const changed: BoqDiffChange[] = [];
  let unchanged = 0;

  for (const [key, after] of revisedByKey) {
    const before = previousByKey.get(key);
    if (!before) {
      added.push(after);
      continue;
    }

    const quantityDelta = round(after.quantity - before.quantity);
    const rateDelta = round(after.unitRate - before.unitRate);
    const totalDelta = round(after.total - before.total);
    const categoryChanged = (before.category || "general") !== (after.category || "general");

    if (quantityDelta === 0 && rateDelta === 0 && totalDelta === 0 && !categoryChanged) {
      unchanged += 1;
      continue;
    }

    changed.push({
      key,
      description: after.description,
      unit: after.unit,
      before,
      after,
      quantityDelta,
      rateDelta,
      totalDelta,
      categoryChanged,
    });
  }

  for (const [key, before] of previousByKey) {
    if (!revisedByKey.has(key)) {
      removed.push(before);
    }
  }

  const previousTotal = sumTotals(previous);
  const revisedTotal = sumTotals(revised);

  const beforeByCategory = categoryTotals(previous);
  const afterByCategory = categoryTotals(revised);
  const categoryDeltas = [...new Set([...beforeByCategory.keys(), ...afterByCategory.keys()])]
    .map((category) => {
      const before = beforeByCategory.get(category) ?? 0;
      const after = afterByCategory.get(category) ?? 0;
      return { category, before, after, delta: round(after - before) };
    })
    .filter((entry) => entry.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    added,
    removed,
    changed,
    unchanged,
    totalDelta: round(revisedTotal - previousTotal),
    previousTotal,
    revisedTotal,
    categoryDeltas,
    hasChanges: added.length > 0 || removed.length > 0 || changed.length > 0,
  };
}

/** Compact one-line summary for audit metadata and notifications. */
export function summarizeBoqRevisionDiff(diff: BoqRevisionDiff) {
  const parts: string[] = [];
  if (diff.added.length) parts.push(`${diff.added.length} added`);
  if (diff.removed.length) parts.push(`${diff.removed.length} removed`);
  if (diff.changed.length) parts.push(`${diff.changed.length} changed`);
  if (!parts.length) parts.push("no line changes");
  const direction = diff.totalDelta === 0 ? "no change" : diff.totalDelta > 0 ? "increase" : "decrease";
  return `${parts.join(", ")} — ${direction} of ${Math.abs(diff.totalDelta).toFixed(2)}`;
}
