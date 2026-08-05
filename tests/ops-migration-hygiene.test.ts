import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Guard: no two migrations share a version prefix.
 *
 * Supabase keys a migration by the timestamp before the first underscore. Two
 * files sharing one version is ambiguous: which one has been applied is
 * unanswerable, and a CLI-driven `db push` or a rebuild from the repository
 * will skip or double-apply depending on ordering.
 *
 * Five collisions existed when this was written — four of them years-old and
 * harmless only because this project applies migrations through the MCP tool,
 * which assigns its own versions and never consults the filename. That is a
 * reason the bug stayed invisible, not a reason it was safe.
 */

const MIGRATIONS = join(import.meta.dirname, "..", "supabase", "migrations");

describe("migration filenames", () => {
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql"));

  it("finds migrations to check", () => {
    assert.ok(files.length > 50, `only found ${files.length} migrations — scan is broken`);
  });

  it("uses a unique version prefix per file", () => {
    const byVersion = new Map<string, string[]>();

    for (const file of files) {
      const version = file.split("_")[0];
      byVersion.set(version, [...(byVersion.get(version) ?? []), file]);
    }

    const collisions = [...byVersion.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([version, group]) => `${version}\n    ${group.join("\n    ")}`);

    assert.deepEqual(
      collisions,
      [],
      `these migrations share a version prefix:\n  ${collisions.join("\n  ")}`,
    );
  });

  it("names every migration <timestamp>_<description>.sql", () => {
    const malformed = files.filter((file) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(file));
    assert.deepEqual(malformed, [], `malformed migration filenames:\n  ${malformed.join("\n  ")}`);
  });
});
