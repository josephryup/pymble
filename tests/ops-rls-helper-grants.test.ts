import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Guard: a `private.*` helper used inside an RLS policy must keep EXECUTE for
 * `authenticated`.
 *
 * This exists because of a live incident. The migration that narrowed the
 * over-wide write policies also did:
 *
 *   revoke all on function private.can_manage_sites() from public, anon, authenticated;
 *
 * reasoning by analogy with finding S5 (ops_next_invoice_number). The analogy
 * was wrong. S5 is a `public` function and the public schema IS served over
 * /rest/v1/rpc/, so revoking there closes a real door. `private` is not served
 * by PostgREST and `anon` has no USAGE on it, so there was no door to close —
 * and an RLS policy is evaluated as the CALLING role, not the function owner.
 *
 * The result was `permission denied for function can_manage_sites` for every
 * signed-in user whose session client touched sites, workers, invoices, BOQ,
 * payroll or cash advances. It reached production.
 *
 * The tell was available before the incident and is what this test encodes: all
 * 29 pre-existing `private.*` helpers grant EXECUTE to authenticated, and the
 * five new ones were the only exceptions. A helper that does not follow the
 * established pattern is the thing to look at.
 */

const MIGRATIONS = join(import.meta.dirname, "..", "supabase", "migrations");

/** `revoke ... from ... authenticated` on a private.* function. */
const REVOKE_FROM_AUTHENTICATED =
  /revoke\s+[\s\S]*?\bon\s+function\s+private\.([A-Za-z0-9_]+)\s*\([^)]*\)\s+from\s+([^;]*);/gi;

describe("private RLS helpers keep EXECUTE for authenticated", () => {
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql"));

  it("finds migrations to scan", () => {
    assert.ok(files.length > 50, `only found ${files.length} migrations — scan is broken`);
  });

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    if (!/private\.[A-Za-z0-9_]+\s*\(/.test(sql)) continue;

    it(`${file} does not strip EXECUTE from authenticated`, () => {
      const offenders: string[] = [];

      for (const match of sql.matchAll(REVOKE_FROM_AUTHENTICATED)) {
        const [, fn, grantees] = match;
        if (!/\bauthenticated\b/.test(grantees)) continue;

        // A later explicit grant in the same migration puts it back.
        const regranted = new RegExp(
          `grant\\s+execute\\s+on\\s+function\\s+private\\.${fn}\\s*\\([^)]*\\)\\s+to\\s+[^;]*\\bauthenticated\\b`,
          "i",
        ).test(sql);

        if (!regranted) offenders.push(fn);
      }

      assert.deepEqual(
        offenders,
        [],
        `these private helpers lose EXECUTE for authenticated, which breaks any RLS ` +
          `policy that calls them (policies evaluate as the calling role):\n  ` +
          offenders.join("\n  ") +
          `\n\nRevoke from public and anon if you want — but authenticated must keep it.`,
      );
    });
  }
});
