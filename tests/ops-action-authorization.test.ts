import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Guard: every exported server action authenticates, and every one that writes
 * also authorises.
 *
 * Why source-level. Nearly all server-side data access in this app runs as the
 * Supabase *service role*, which bypasses RLS entirely. That is a legitimate
 * architecture, but it means authorisation rests on TypeScript predicates being
 * called correctly at every action entry point — there is no second line of
 * defence, because the query never passes through a policy. A single missing
 * `requireOpsUser()` is a full data exposure, and nothing at runtime would
 * notice (independent audit 2026-08-04, finding S3).
 *
 * The audit verified by hand that all 437 actions were clean. This test exists
 * so that stays true: it converts "hope nobody forgets" into "CI fails".
 *
 * Resolution follows local delegation. Plenty of actions are one-liners like
 *   export async function activateCommercialContractAction(fd: FormData) {
 *     await updateCommercialContractStatus(fd, "active");
 *   }
 * where the guard lives in the helper. A naive scan reports ~50 false
 * positives against these; expanding callees within the file removes all of
 * them.
 */

const ROOT = join(import.meta.dirname, "..", "src");

const AUTH = /requireOpsUser|getOptionalOpsUser|requireOpsApiUser|resolveOpsActor/;

/**
 * Authorisation takes two shapes in this codebase, both legitimate:
 *   - a named predicate:      if (!canManagePayrollRun(profile.role))
 *   - an inline role compare: if (profile.role !== "developer")
 * The second is used where the rule is a one-off (e.g. only the Developer may
 * hard-delete a payroll run) and inventing a predicate would add indirection
 * without adding clarity.
 */
const PERM =
  /\bcan[A-Z][A-Za-z0-9_]*\s*\(|\bassert[A-Z][A-Za-z0-9_]*\s*\(|\brequire[A-Z][A-Za-z0-9_]*\s*\(|\bensure[A-Z][A-Za-z0-9_]*\s*\(|\bis[A-Z][A-Za-z0-9_]*Role\s*\(|profile\.role\s*(?:!==|===)|role\s*(?:!==|===)\s*"/;

const WRITE = /\.(insert|update|upsert|delete)\s*\(/;

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
  const exported: { name: string; async: boolean }[] = [];
  const re = /(export\s+)?(async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
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

    bodies.set(match[3], source.slice(open, cursor));
    if (match[1]) exported.push({ name: match[3], async: Boolean(match[2]) });
  }

  return { bodies, exported };
}

const bodyCache = new Map<string, ReturnType<typeof functionBodies>>();

function bodiesFor(file: string) {
  let cached = bodyCache.get(file);
  if (!cached) {
    cached = functionBodies(readFileSync(file, "utf8"));
    bodyCache.set(file, cached);
  }
  return cached;
}

/**
 * Map `import { a, b } from "@/lib/ops/x"` to the file it resolves to.
 *
 * Needed because delegation crosses module boundaries as well as staying
 * local: the notification actions are thin wrappers over `notifications.ts`,
 * where both the `requireOpsUser()` call and the `recipient_id` ownership
 * scope actually live. Without following the import, those five look
 * unauthenticated when they are not — and a guard test that cries wolf gets
 * exemptions bolted onto it until it stops meaning anything.
 */
function importedFrom(source: string) {
  const imports = new Map<string, string>();
  const re = /import\s*\{([^}]+)\}\s*from\s*"@\/(lib\/ops\/[A-Za-z0-9_/-]+)"/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(source))) {
    const target = join(ROOT, `${match[2]}.ts`);
    for (const raw of match[1].split(",")) {
      const name = raw.replace(/\bas\b[\s\S]*/, "").trim();
      if (name && !name.startsWith("type ")) imports.set(name, target);
    }
  }

  return imports;
}

/**
 * The action's body plus every function it transitively calls — following
 * local helpers and one hop into imported `@/lib/ops/*` modules (and that
 * module's own local helpers).
 */
function reachableSource(entry: string, file: string) {
  const seen = new Set<string>();
  const stack: { name: string; file: string }[] = [{ name: entry, file }];
  let text = "";

  while (stack.length) {
    const current = stack.pop()!;
    const key = `${current.file}#${current.name}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let scope: ReturnType<typeof functionBodies>;
    try {
      scope = bodiesFor(current.file);
    } catch {
      continue; // module resolved to a path we cannot read; ignore it
    }

    const body = scope.bodies.get(current.name);
    if (!body) continue;
    text += body;

    for (const candidate of scope.bodies.keys()) {
      if (candidate === current.name) continue;
      if (new RegExp(`\\b${candidate}\\s*\\(`).test(body)) {
        stack.push({ name: candidate, file: current.file });
      }
    }

    for (const [name, target] of importedFrom(readFileSync(current.file, "utf8"))) {
      if (new RegExp(`\\b${name}\\s*\\(`).test(body)) stack.push({ name, file: target });
    }
  }

  return text;
}

const actionFiles = walk(ROOT).filter((file) =>
  /^\s*["']use server["']/m.test(readFileSync(file, "utf8")),
);

describe("every server action authenticates and authorises", () => {
  it("finds the server action files at all (guards against a broken scan)", () => {
    assert.ok(
      actionFiles.length >= 40,
      `only found ${actionFiles.length} "use server" files — the scan is probably broken, which would make every assertion below vacuously pass`,
    );
  });

  const unauthenticated: string[] = [];
  const unauthorised: string[] = [];
  let scanned = 0;

  for (const file of actionFiles) {
    const { exported } = bodiesFor(file);

    for (const fn of exported) {
      if (!fn.async || !/Action$/.test(fn.name)) continue;
      scanned++;

      const reachable = reachableSource(fn.name, file);
      const where = `${file.replace(/\\/g, "/").split("/src/")[1]} :: ${fn.name}`;

      if (!AUTH.test(reachable)) unauthenticated.push(where);
      else if (WRITE.test(reachable) && !PERM.test(reachable)) unauthorised.push(where);
    }
  }

  it("scanned a plausible number of actions", () => {
    assert.ok(scanned >= 400, `only scanned ${scanned} actions; expected 400+`);
  });

  it("no exported *Action reaches a write without authenticating", () => {
    assert.deepEqual(
      unauthenticated,
      [],
      `these server actions never call requireOpsUser()/getOptionalOpsUser().\n` +
        `Server actions are POST endpoints — an unauthenticated one is reachable by anyone ` +
        `who can craft a request.\n  ${unauthenticated.join("\n  ")}`,
    );
  });

  it("no exported *Action writes without an authorisation check", () => {
    assert.deepEqual(
      unauthorised,
      [],
      `these server actions write to the database without checking the actor's role.\n` +
        `All writes run as the service role, so RLS will not catch this.\n  ${unauthorised.join("\n  ")}`,
    );
  });
});
