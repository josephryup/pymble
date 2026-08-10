import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Guard: the modules that hold the fastest-growing tables stay paged.
 *
 * The 2026-08-10 UI/UX audit (§1d) found these reading the whole table, or a
 * hard `limit(n)` with nothing past it — attendance capped at the most recent
 * 100 rows, photos at 60, cash advances at 50, checklists at 30. A hard limit
 * is worse than a slow page: the rows past it are simply unreachable, and
 * nothing in the UI says so.
 */

const WORKSPACE = join(import.meta.dirname, "..", "src", "app", "ops", "(workspace)");

const PAGED_MODULES = [
  "workers",
  "site-checklists",
  "attendance",
  "photos",
  "staff",
  "payroll",
];

function page(module: string) {
  return readFileSync(join(WORKSPACE, module, "page.tsx"), "utf8");
}

describe("ops list pagination coverage", () => {
  for (const module of PAGED_MODULES) {
    it(`pages /ops/${module}`, () => {
      const source = page(module);

      assert.match(
        source,
        /parseOpsListState\(/,
        `/ops/${module} must derive its page window from parseOpsListState`,
      );
      assert.match(
        source,
        /<OpsPaginationControls/,
        `/ops/${module} must render pagination controls`,
      );
      // Without params the controls rebuild the URL from scratch and drop every
      // filter the page owns — the "next page loses my filters" bug (§1a).
      assert.match(
        source,
        /params=\{params\}/,
        `/ops/${module} must pass params to the pagination controls`,
      );
    });
  }

  it("keeps the checklist read model off whole-table scans", () => {
    const source = readFileSync(
      join(import.meta.dirname, "..", "src", "lib", "ops", "qa-checklists.ts"),
      "utf8",
    );
    // Comments describe what this used to do, so match against code only.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    // fetchOpsQaChecklistRun used to pull 200 runs to find one, and the stats
    // did the same to produce four integers.
    assert.doesNotMatch(code, /limit:\s*200/);
    assert.match(code, /runId/, "single-run fetch should filter by id in the query");
  });
});
