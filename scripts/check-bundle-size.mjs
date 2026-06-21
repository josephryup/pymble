#!/usr/bin/env node
/**
 * Pre-deploy bundle-size budget.
 *
 * Walks .next/static/chunks after `next build` and fails the build if any
 * single JS chunk exceeds the budget. Used to catch accidental imports that
 * pull a huge dependency into the client bundle (PDF generators, charts,
 * large fonts, etc.).
 *
 * Usage:
 *   npm run check-bundle-size
 *   # or with overrides
 *   MAX_CHUNK_KB=600 npm run check-bundle-size
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CHUNK_DIR = ".next/static/chunks";
const MAX_CHUNK_BYTES = Number(process.env.MAX_CHUNK_KB ?? 500) * 1024;
const WARN_CHUNK_BYTES = Number(process.env.WARN_CHUNK_KB ?? 350) * 1024;
const MAX_TOTAL_BYTES = Number(process.env.MAX_TOTAL_MB ?? 6) * 1024 * 1024;

// Chunks that legitimately blow past the per-chunk budget. Whitelist with
// care — every new entry here is a deliberate exemption.
const PER_CHUNK_EXEMPTIONS: string[] = [
  // React-PDF brings in PDFKit + font handling; lives behind the
  // `/api/ops/pdf/*` routes only, never on the user-facing client bundle.
  "react-pdf",
];

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      out.push(...walk(path));
    } else if (name.endsWith(".js")) {
      out.push({ path, name, bytes: stat.size });
    }
  }
  return out;
}

function isExempt(name) {
  return PER_CHUNK_EXEMPTIONS.some((token) => name.includes(token));
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const chunks = walk(CHUNK_DIR);
if (chunks.length === 0) {
  console.error(
    `[check-bundle-size] No chunks under ${CHUNK_DIR}. Run \`next build\` first.`,
  );
  process.exit(2);
}

chunks.sort((a, b) => b.bytes - a.bytes);

const overBudget = chunks.filter(
  (c) => c.bytes > MAX_CHUNK_BYTES && !isExempt(c.name),
);
const warnings = chunks.filter(
  (c) =>
    c.bytes > WARN_CHUNK_BYTES &&
    c.bytes <= MAX_CHUNK_BYTES &&
    !isExempt(c.name),
);
const totalBytes = chunks.reduce((sum, c) => sum + c.bytes, 0);

console.log(
  `[check-bundle-size] ${chunks.length} chunks, total ${fmt(totalBytes)}.`,
);
console.log("[check-bundle-size] Top 10 chunks:");
chunks.slice(0, 10).forEach((c) => {
  const tag = isExempt(c.name)
    ? "(exempt)"
    : c.bytes > MAX_CHUNK_BYTES
      ? "(OVER)"
      : c.bytes > WARN_CHUNK_BYTES
        ? "(warn)"
        : "";
  console.log(`  ${fmt(c.bytes).padStart(10)}  ${c.name} ${tag}`);
});

if (warnings.length > 0) {
  console.warn(
    `[check-bundle-size] ${warnings.length} chunk(s) above warn threshold of ${fmt(WARN_CHUNK_BYTES)}.`,
  );
}

let failed = false;
if (overBudget.length > 0) {
  console.error(
    `[check-bundle-size] FAILED — ${overBudget.length} chunk(s) above the ${fmt(MAX_CHUNK_BYTES)} budget:`,
  );
  for (const c of overBudget) {
    console.error(`  • ${c.name} — ${fmt(c.bytes)}`);
  }
  failed = true;
}

if (totalBytes > MAX_TOTAL_BYTES) {
  console.error(
    `[check-bundle-size] FAILED — total ${fmt(totalBytes)} exceeds ${fmt(MAX_TOTAL_BYTES)}.`,
  );
  failed = true;
}

if (failed) {
  console.error(
    "\nSomething big landed in the client bundle. Likely fixes:\n" +
      "  - Lazy-load the offender via dynamic import\n" +
      "  - Move it behind an API route so it stays server-only\n" +
      "  - Add an explicit exemption above if it's intentional\n",
  );
  process.exit(1);
}

console.log("[check-bundle-size] OK");
process.exit(0);
