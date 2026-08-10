import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Guard: disclosure controls converge on OpsCollapsible.
 *
 * The 2026-08-10 UI/UX audit (§3) found 186 hand-rolled `<details>` across 46
 * ops files with a dozen different summary treatments, most of the inline ones
 * missing both the marker reset and a focus ring. The primitive fixes the
 * affordance in one place; this test stops the population growing again while
 * the remaining ones are migrated page by page.
 *
 * The budget only ever goes DOWN. If you migrated some, lower it.
 */

const RAW_DETAILS_BUDGET = 150;

const ROOTS = [
  join(import.meta.dirname, "..", "src", "app", "ops"),
  join(import.meta.dirname, "..", "src", "components", "ops"),
];

const PRIMITIVE = join(
  import.meta.dirname,
  "..",
  "src",
  "components",
  "ops",
  "OpsCollapsible.tsx",
);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

function rawDetailsCount() {
  return ROOTS.flatMap(tsxFiles)
    .filter((path) => path !== PRIMITIVE)
    .reduce(
      (total, path) => total + (readFileSync(path, "utf8").match(/<details\b/g)?.length ?? 0),
      0,
    );
}

describe("ops disclosure controls", () => {
  it("keeps the primitive accessible", () => {
    const source = readFileSync(PRIMITIVE, "utf8");

    // Safari paints its own triangle without this, which is half the reason the
    // hand-rolled summaries looked different from each other.
    assert.match(source, /\[&::-webkit-details-marker\]:hidden/);
    // Every summary is a keyboard target; it must show focus.
    assert.match(source, /OPS_FOCUS_CLASS/);
    // The chevron is the affordance — it has to track the open state.
    assert.match(source, /group-open:rotate-180/);
  });

  it("does not grow the hand-rolled <details> population", () => {
    const count = rawDetailsCount();

    assert.ok(count > 0, "scan found nothing — this guard is broken");
    assert.ok(
      count <= RAW_DETAILS_BUDGET,
      `${count} hand-rolled <details> in ops, budget is ${RAW_DETAILS_BUDGET}. ` +
        "Use <OpsCollapsible> instead of a bare <details>.",
    );
  });
});
