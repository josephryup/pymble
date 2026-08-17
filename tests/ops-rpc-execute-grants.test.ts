import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Guard: a `public.*` RPC that `authenticated` may not execute must never be
 * called through the cookie session client.
 *
 * The sibling of ops-rls-helper-grants.test.ts, from the other side of the same
 * mistake. That one is about revoking too much; this one is about revoking
 * correctly and forgetting the caller.
 *
 * The live incident: migration 20260716090000 locked down the SECURITY DEFINER
 * RPCs and deliberately KEPT `authenticated` on ops_next_invoice_number,
 * saying so in its header — "called by invoice creation through the cookie
 * session client". Migration 20260805091000 then revoked it anyway, on the
 * reasoning that "the server calls this as the service role, which is
 * unaffected". The server did not. Every attempt to raise an invoice failed
 * with 42501 from that day, and the register still held zero invoices twelve
 * days later — the module was simply unusable, and the failure looked like a
 * generic page error rather than a permission problem.
 *
 * A revoke and a caller are in two different languages in two different
 * directories, so nothing but a test connects them.
 */

const ROOT = join(import.meta.dirname, "..");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const SRC = join(ROOT, "src");

/** `revoke ... on function public.fn(...) from <grantees>;` */
const REVOKE =
  /revoke\s+[\s\S]*?\bon\s+function\s+public\.([A-Za-z0-9_]+)\s*\([^)]*\)\s+from\s+([^;]*);/gi;

/** `grant execute on function public.fn(...) to <grantees>;` */
const GRANT =
  /grant\s+execute\s+on\s+function\s+public\.([A-Za-z0-9_]+)\s*\([^)]*\)\s+to\s+([^;]*);/gi;

/**
 * Which public functions `authenticated` ends up without, replaying every
 * migration in the order they run. Both directions matter: a revoke can be
 * undone by a later grant, and a grant by a later revoke.
 */
function functionsRevokedFromAuthenticated() {
  const revoked = new Set<string>();

  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    // Statement order within a file matters as much as file order.
    const statements: Array<{ at: number; fn: string; revoke: boolean }> = [];

    for (const match of sql.matchAll(REVOKE)) {
      if (/\bauthenticated\b/.test(match[2])) {
        statements.push({ at: match.index ?? 0, fn: match[1], revoke: true });
      }
    }
    for (const match of sql.matchAll(GRANT)) {
      if (/\bauthenticated\b/.test(match[2])) {
        statements.push({ at: match.index ?? 0, fn: match[1], revoke: false });
      }
    }

    for (const statement of statements.sort((a, b) => a.at - b.at)) {
      if (statement.revoke) revoked.add(statement.fn);
      else revoked.delete(statement.fn);
    }
  }

  return revoked;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

/**
 * The enclosing function of a call site, approximated by the nearest function
 * declaration above it. Good enough to see which client was reached for, which
 * is the only question being asked.
 */
function enclosingFunction(source: string, callIndex: number) {
  const before = source.slice(0, callIndex);
  const start = Math.max(
    before.lastIndexOf("\nfunction "),
    before.lastIndexOf("\nasync function "),
    before.lastIndexOf("\nexport async function "),
    before.lastIndexOf("\nexport function "),
  );
  return source.slice(start === -1 ? 0 : start, callIndex);
}

describe("RPCs revoked from authenticated are called as the service role", () => {
  const revoked = functionsRevokedFromAuthenticated();

  it("finds the functions that were locked down", () => {
    // If this drops to nothing the scan has broken, and every assertion below
    // would pass by having nothing to check.
    assert.ok(
      revoked.size > 0,
      "no public functions found with EXECUTE revoked from authenticated — the migration scan is broken",
    );
    assert.ok(
      revoked.has("ops_next_invoice_number"),
      "ops_next_invoice_number should still be locked down; if that changed deliberately, update this test",
    );
  });

  it("has no call site left on the session client", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const source = readFileSync(file, "utf8");

      for (const fn of revoked) {
        const marker = `.rpc("${fn}"`;
        let at = source.indexOf(marker);

        while (at !== -1) {
          const scope = enclosingFunction(source, at);
          if (
            scope.includes("createOpsServerSessionClient") ||
            !scope.includes("getOpsSupabaseServiceClient")
          ) {
            offenders.push(`${fn} in ${file.slice(ROOT.length + 1)}`);
          }
          at = source.indexOf(marker, at + 1);
        }
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `these RPCs are called with a client whose role has no EXECUTE, so every call ` +
        `fails with 42501 at runtime:\n  ${offenders.join("\n  ")}\n\n` +
        `Either call them with getOpsSupabaseServiceClient(), or grant EXECUTE back ` +
        `to authenticated in a migration.`,
    );
  });
});
