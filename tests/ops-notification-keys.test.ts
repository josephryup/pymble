import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Guard: a notification idempotency key must never contain a date or a
 * timestamp.
 *
 * `queueOpsNotification` upserts on `idempotency_key`, so the key IS the
 * notification's identity. Putting a date in it means the identity changes
 * every day — and with six daily cron sweeps, one unresolved item produced one
 * notification per recipient per day. That is how 6,935 notifications came to
 * contain only 852 distinct ones, with 6,509 of them carrying a date in the
 * key (audit §9 of docs/pymble-ops-platform-audit-2026-08.md).
 *
 * This is a source-level test rather than a runtime one because the bug is in
 * how the key is *written*, not in how it behaves — by the time a duplicate
 * exists, the damage is done. Anyone re-introducing `${today}` or `${nowIso}`
 * into a key fails CI here.
 *
 * If a notification genuinely must repeat on a schedule, that is a product
 * decision: express it by changing the notification's meaning (a new `reason`,
 * a new recipient) or with a digest, not by defeating the dedupe.
 */

const OPS_LIB = join(process.cwd(), "src", "lib", "ops");

/** Date-ish fragments that must not appear inside an idempotency key. */
const FORBIDDEN_IN_KEY = [
  /\$\{[^}]*\btoday\b[^}]*\}/i,
  /\$\{[^}]*\bnowIso\b[^}]*\}/i,
  /\$\{[^}]*\bdateKey\b[^}]*\}/i,
  /\$\{[^}]*\btimestamp\b[^}]*\}/i,
  /\$\{[^}]*Date\.now\(\)[^}]*\}/,
  /\$\{[^}]*new Date\(\)[^}]*\}/,
  /\d{4}-\d{2}-\d{2}/,
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Every key expression, with its file and line.
 *
 * Covers `idempotencyBase:` as well as `idempotencyKey:` — the escalation
 * engine builds a base and appends the recipient, so a dated key can hide
 * behind the variable and never be inspected. That is exactly how
 * `ops-report-reminder` stayed invisible to the first version of this test.
 */
function collectKeyExpressions() {
  const found: Array<{ file: string; line: number; expression: string }> = [];

  for (const file of walk(OPS_LIB)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      const match = line.match(/idempotency(?:Key|Base):\s*(.+?),?\s*$/);
      if (!match) return;
      const expression = match[1].trim();
      // Skip type declarations and pass-throughs of a caller-supplied value.
      if (
        expression === "string;" ||
        expression === "idempotencyKey," ||
        expression === "idempotencyBase," ||
        expression === "input.idempotencyKey"
      ) {
        return;
      }
      found.push({
        file: file.replace(process.cwd(), "").replace(/\\/g, "/"),
        line: index + 1,
        expression,
      });
    });
  }

  return found;
}

describe("notification idempotency keys", () => {
  const expressions = collectKeyExpressions();

  it("finds the key expressions to check", () => {
    // A canary: if a refactor moves these, the test must not silently pass by
    // checking nothing.
    assert.ok(
      expressions.length >= 20,
      `expected to find many idempotencyKey expressions, found ${expressions.length}`,
    );
  });

  it("allows a date that identifies the SUBJECT rather than the sweep", () => {
    // The distinction the forbidden list encodes: `${today}` is when the sweep
    // ran, `${window.weekKey}` is which week's report is missing. The first
    // changes every morning for the same problem; the second changes only when
    // the problem does. Weekly report reminders legitimately carry a date, and
    // this test exists so that stays a deliberate, visible exception.
    const reminder = expressions.find((entry) =>
      entry.expression.includes("ops-report-reminder"),
    );

    assert.ok(reminder, "the weekly report reminder key should be inspected");
    assert.match(reminder.expression, /weekKey/);
    assert.ok(
      !FORBIDDEN_IN_KEY.some((pattern) => pattern.test(reminder.expression)),
      "a period identifier must not trip the sweep-date rule",
    );
  });

  it("never embeds a date or timestamp in a key", () => {
    const offenders = expressions.filter((entry) =>
      FORBIDDEN_IN_KEY.some((pattern) => pattern.test(entry.expression)),
    );

    assert.deepEqual(
      offenders.map((entry) => `${entry.file}:${entry.line} → ${entry.expression}`),
      [],
      "a dated idempotency key re-notifies the same person about the same thing every sweep",
    );
  });

  it("always includes an interpolated identifier, so keys stay per-record", () => {
    // A constant key would collapse unrelated notifications into one row —
    // the opposite failure, and just as wrong.
    const constants = expressions.filter(
      (entry) => entry.expression.startsWith("`") && !entry.expression.includes("${"),
    );

    assert.deepEqual(
      constants.map((entry) => `${entry.file}:${entry.line} → ${entry.expression}`),
      [],
      "a key with no record identifier merges unrelated notifications",
    );
  });
});
