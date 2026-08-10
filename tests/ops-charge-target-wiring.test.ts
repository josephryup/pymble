import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Guard: an action that resolves a charge target must actually read the whole
 * charge target off the form.
 *
 * `resolveOpsChargeTarget` is well tested as a function, and the database
 * CHECK constraint backs it up — but neither notices when the *action* forgets
 * to pass the fields along. `createPaymentRequestAction` built its zod input
 * by hand and listed only `site_id`, so `charge_target` fell through to its
 * schema default of "site" and every payable raised against a completed
 * project was refused with "Select the site this payment belongs to." while a
 * completed project sat plainly selected on screen. The form was right, the
 * resolver was right, and the whole feature was unreachable.
 *
 * Source-level because the failure is an omission. There is nothing to assert
 * against at runtime short of driving the form through Next and Supabase: the
 * missing read produces a valid parse, a valid resolver call, and a
 * well-phrased error message. Only the absent line tells you anything.
 */

const ROOT = join(import.meta.dirname, "..", "src");

/** Every field the resolver arbitrates between. Omitting any one is the bug. */
const REQUIRED_FIELDS = [
  "charge_target",
  "cost_centre_id",
  "cost_treatment",
  "legacy_project_id",
  "site_id",
];

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Body of every `function name(...)` in the file, by brace matching. */
function functionBodies(source: string) {
  const bodies = new Map<string, string>();
  const re = /function\s+([A-Za-z0-9_]+)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(source))) {
    const open = source.indexOf("{", re.lastIndex);
    if (open < 0) continue;

    let depth = 0;
    let cursor = open;
    for (; cursor < source.length; cursor++) {
      const char = source[cursor];
      if (char === "{") depth++;
      else if (char === "}") {
        depth--;
        if (depth === 0) {
          cursor++;
          break;
        }
      }
    }

    bodies.set(match[1], source.slice(open, cursor));
  }

  return bodies;
}

/**
 * Function-level, not file-level. Both payment-request actions live in
 * `finance-actions.ts` and the edit action always read all five, so a
 * file-wide scan would have called the broken create action clean.
 */
function resolversInSource(file: string) {
  const source = readFileSync(file, "utf8");
  if (!source.includes("resolveOpsChargeTarget(")) return [];

  return [...functionBodies(source)]
    .filter(([, body]) => body.includes("resolveOpsChargeTarget("))
    .map(([name, body]) => ({ body, file, name }));
}

const callers = walk(ROOT).flatMap(resolversInSource);

describe("charge target wiring", () => {
  it("finds the actions that resolve a charge target", () => {
    // A rename that silences this guard should fail loudly, not quietly pass.
    assert.ok(callers.length > 0, "no callers of resolveOpsChargeTarget found");
  });

  for (const caller of callers) {
    it(`${caller.name} reads every charge target field from the form`, () => {
      const missing = REQUIRED_FIELDS.filter(
        (name) => !caller.body.includes(`"${name}"`),
      );

      assert.deepEqual(
        missing,
        [],
        `${caller.name} calls resolveOpsChargeTarget but never reads ${missing.join(
          ", ",
        )} from the form — the schema default silently wins.`,
      );
    });
  }
});
