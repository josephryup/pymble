import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Guard: tabbed pages keep their deep links working.
 *
 * Splitting a mega-page into tabs (2026-08-10 UI/UX audit §1c) has one failure
 * mode that no type check and no runtime test catches: a section moves onto a
 * tab, and every link and server-action redirect pointing at its anchor now
 * lands on the default tab where that anchor does not exist. The user clicks
 * "Open inspections", the page does nothing, and nothing errors.
 *
 * So: any link to an /ops/hse-compliance panel anchor must name its tab.
 */

const SRC = join(import.meta.dirname, "..", "src");

/** Panel anchors that live on a specific tab. Create panels are on every tab. */
const TAB_SCOPED_ANCHORS = [
  "ppe-stock",
  "ppe-register",
  "toolbox-panel",
  "inspection-panel",
  "training-panel",
  "risk-assessment-panel",
  "audit-panel",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

describe("ops tabbed pages", () => {
  it("names the tab on every link into a tab-scoped panel", () => {
    const anchors = TAB_SCOPED_ANCHORS.join("|");
    const pattern = new RegExp(
      `(?:/ops/hse-compliance|\\$\\{HSE_COMPLIANCE_ROUTE\\})([^\\s"'\`#]*)#(${anchors})\\b`,
      "g",
    );

    const offenders: string[] = [];
    for (const path of sourceFiles(SRC)) {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(pattern)) {
        if (!match[1].includes("tab=")) {
          offenders.push(`${path} -> #${match[2]}`);
        }
      }
    }

    assert.deepEqual(
      offenders,
      [],
      "these links land on the default tab, where the anchor does not render",
    );
  });

  it("resolves an unknown ?tab= to the first tab rather than a blank page", () => {
    const source = readFileSync(join(SRC, "components", "ops", "OpsTabs.tsx"), "utf8");
    assert.match(source, /tabs\[0\]\.id/);
    // Switching tabs must drop `page` — page 3 of one list means nothing on
    // another — while carrying the rest of the URL state.
    assert.match(source, /OWNED_PARAMS = \["tab", "page"\]/);
  });
});
