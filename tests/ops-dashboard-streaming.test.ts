import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Guard: the heavy dashboards keep streaming their slow panels.
 *
 * Audit finding U1 — there were zero Suspense boundaries in /ops. Each of these
 * pages awaited every query in one `Promise.all` before painting anything, so
 * the whole screen waited on the slowest aggregate. Commercial ran 21 queries
 * that way.
 *
 * The regression this guards against is quiet: someone adds a new aggregate to
 * the blocking Promise.all because that is where all the other fetches live,
 * and the page goes back to waiting on it. Nothing fails, the page just gets
 * slower — which is exactly the kind of decay nobody notices until it is bad.
 */

const ROOT = join(import.meta.dirname, "..", "src", "app", "ops", "(workspace)");

/** Aggregates that must stay behind their own boundary, per page. */
const STREAMED = {
  "commercial/page.tsx": [
    "fetchOpsCommercialKpis",
    "fetchOpsCommercialChartData",
    "fetchOpsCommercialMarginReport",
  ],
  "hse-compliance/page.tsx": ["fetchOpsHseAgeingAlerts"],
  "employees/page.tsx": ["fetchRecentHrTrainingRenewals"],
} as const;

/** The single blocking `await Promise.all([...])` at the top of the page. */
function blockingFetchBlock(source: string) {
  const start = source.indexOf("] = await Promise.all([");
  if (start === -1) return "";
  const end = source.indexOf("]);", start);
  return source.slice(start, end);
}

describe("heavy dashboards stream their slow panels", () => {
  for (const [page, aggregates] of Object.entries(STREAMED)) {
    const source = readFileSync(join(ROOT, page), "utf8");

    it(`${page} has at least one Suspense boundary`, () => {
      assert.match(
        source,
        /<Suspense\b/,
        `${page} is one of the heaviest dashboards and must not block on every query before painting`,
      );
    });

    for (const aggregate of aggregates) {
      it(`${page} keeps ${aggregate} out of the blocking Promise.all`, () => {
        assert.doesNotMatch(
          blockingFetchBlock(source),
          new RegExp(`\\b${aggregate}\\s*\\(`),
          `${aggregate} was moved back into the page's blocking fetch — it should be awaited inside its own Suspense-wrapped section instead`,
        );
      });

      it(`${page} still calls ${aggregate} somewhere`, () => {
        // Catches the opposite mistake: dropping the panel entirely while
        // "fixing" the blocking fetch.
        assert.match(source, new RegExp(`\\b${aggregate}\\s*\\(`));
      });
    }
  }
});
