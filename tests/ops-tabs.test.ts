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
 * So: any link to a panel anchor on a tabbed page must name its tab.
 */

const SRC = join(import.meta.dirname, "..", "src");

/**
 * Panel anchors that live on a specific tab, per tabbed page. Create panels are
 * rendered on every tab, so they are deliberately absent — as is any anchor on
 * the default tab, which needs no `?tab=` to reach.
 */
const TAB_SCOPED_ANCHORS: Record<string, { route: string; anchors: string[] }> = {
  "hse-compliance": {
    route: "/ops/hse-compliance|\\$\\{HSE_COMPLIANCE_ROUTE\\}",
    anchors: [
      "ppe-stock",
      "ppe-register",
      "toolbox-panel",
      "inspection-panel",
      "training-panel",
      "risk-assessment-panel",
      "audit-panel",
    ],
  },
  employees: {
    route: "/ops/employees|\\$\\{HR_ROUTE\\}",
    anchors: [
      "employee-register",
      "employee-create-panel",
      "training-renewals",
      "leave-create-panel",
      "leave-balance-panel",
      "recruitment-create-panel",
      "contract-create-panel",
      "appraisal-create-panel",
      "onboarding-create-panel",
      "hr-document-category-panel",
      "employee-document-panel",
    ],
  },
  equipment: {
    route: "/ops/equipment|\\$\\{EQUIPMENT_ROUTE\\}",
    anchors: [
      "equipment-register-panel",
      "equipment-request-register",
      "equipment-request-create-panel",
      "equipment-allocation-panel",
      "fuel-log-panel",
      "fuel-log-create-panel",
      "maintenance-job-panel",
      "maintenance-job-create-panel",
    ],
  },
  "fleet-logistics": {
    route: "/ops/fleet-logistics|\\$\\{FLEET_LOGISTICS_ROUTE\\}",
    anchors: [
      "transport-register",
      "transport-create-panel",
      "accommodation-panel",
      "accommodation-create-panel",
      "labour-panel",
      "labour-create-panel",
      "operator-compliance-panel",
      "operator-document-create-panel",
    ],
  },
  commercial: {
    route: "/ops/commercial|\\$\\{COMMERCIAL_ROUTE\\}",
    anchors: [
      "ipc-register",
      "variation-panel",
      "claim-panel",
      "contract-panel",
      "valuation-panel",
      "risk-panel",
      "retention-panel",
      "cashflow-panel",
      "milestone-panel",
    ],
  },
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

const SOURCES = sourceFiles(SRC).map((path) => ({ path, source: readFileSync(path, "utf8") }));

describe("ops tabbed pages", () => {
  it("scanned the workspace", () => {
    assert.ok(SOURCES.length > 100, `only found ${SOURCES.length} source files`);
  });

  for (const [page, { route, anchors }] of Object.entries(TAB_SCOPED_ANCHORS)) {
    it(`names the tab on every link into a ${page} panel`, () => {
      const pattern = new RegExp(
        `(?:${route})([^\\s"'\`#]*)#(${anchors.join("|")})\\b`,
        "g",
      );

      const offenders: string[] = [];
      for (const { path, source } of SOURCES) {
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
  }

  const ANCHORLESS_REDIRECTS: Array<[string, string, RegExp]> = [
    ["commercial", "commercial-actions.ts", /\$\{COMMERCIAL_ROUTE\}\?((?:created|updated)=[^`]*)`/g],
    ["employees", "hr-actions.ts", /\$\{HR_ROUTE\}\?((?:created|updated)=[^`]*)`/g],
    [
      "equipment",
      "equipment-actions.ts",
      /\$\{EQUIPMENT_ROUTE\}\?((?:created|updated)=[^`]*)`/g,
    ],
    [
      "fleet-logistics",
      "fleet-logistics-actions.ts",
      /\$\{FLEET_LOGISTICS_ROUTE\}\?((?:created|updated)=[^`]*)`/g,
    ],
  ];

  for (const [page, file, pattern] of ANCHORLESS_REDIRECTS) {
    it(`sends anchorless ${page} redirects back to the register acted on`, () => {
      // Many actions redirect without an anchor. Left alone they would all dump
      // the user on the default tab after every single edit — nothing breaks,
      // the workflow just quietly gets worse.
      const source = readFileSync(join(SRC, "lib", "ops", file), "utf8");
      const offenders = [...source.matchAll(pattern)]
        .filter((match) => !match[1].includes("tab="))
        .map((match) => match[1]);

      assert.deepEqual(offenders, []);
    });
  }

  it("routes engineering-controls notices to the tab that holds the record", () => {
    // This page redirects through one helper rather than 24 literals, so the
    // guard is that the helper exists and covers every record family.
    const source = readFileSync(
      join(SRC, "lib", "ops", "engineering-controls-actions.ts"),
      "utf8",
    );
    assert.match(source, /function engineeringTabFor/);
    for (const family of ["instruction", "follow_up", "inspection", "snag", "material_test", "drawing", "milestone"]) {
      assert.ok(source.includes(`"${family}`), `engineeringTabFor must map ${family}`);
    }
    assert.match(source, /tab=\$\{engineeringTabFor\(value\)\}/);
  });

  it("resolves an unknown ?tab= to the first tab rather than a blank page", () => {
    const source = readFileSync(join(SRC, "components", "ops", "OpsTabs.tsx"), "utf8");
    assert.match(source, /tabs\[0\]\.id/);
    // Switching tabs must drop `page` — page 3 of one list means nothing on
    // another — while carrying the rest of the URL state.
    assert.match(source, /OWNED_PARAMS = \["tab", "page"\]/);
  });
});
