import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { OPS_PUBLIC_FORM_RATE_LIMIT } from "../src/lib/ops/rate-limit";
import { opsLooksLikeDocument } from "../src/lib/ops/upload-validation";

/**
 * Guards for audit finding S4 — the unauthenticated endpoints.
 *
 * Two halves. The magic-byte check is ordinary unit-testable logic. The
 * "is the limiter actually wired in" half is a source-level assertion, in the
 * style of ops-notification-keys.test.ts, because the failure mode is a route
 * that simply forgets to call it — which no runtime test of the helper would
 * ever catch.
 */

const ROOT = join(import.meta.dirname, "..");

const PUBLIC_POST_ROUTES = [
  "src/app/api/contact/route.ts",
  "src/app/api/newsletter/route.ts",
  "src/app/api/quote/route.ts",
  "src/app/api/careers/apply/route.ts",
  "src/app/api/ops/auth/reset-password/route.ts",
];

describe("public endpoints are rate limited", () => {
  for (const route of PUBLIC_POST_ROUTES) {
    it(`${route} calls checkOpsPublicFormRateLimit`, () => {
      const source = readFileSync(join(ROOT, route), "utf8");

      assert.match(
        source,
        /checkOpsPublicFormRateLimit\(\s*"[a-z]+"\s*,/,
        `${route} accepts unauthenticated POSTs and must throttle by IP before doing work`,
      );
      assert.match(source, /status:\s*429/, `${route} must answer 429 when throttled`);
      assert.match(
        source,
        /"Retry-After"/,
        `${route} must tell the caller when to retry`,
      );
    });
  }

  it("every configured form bucket has a sane window", () => {
    for (const [form, limit] of Object.entries(OPS_PUBLIC_FORM_RATE_LIMIT)) {
      assert.ok(limit.maxHits > 0, `${form} must allow at least one request`);
      assert.ok(
        limit.maxHits <= 20,
        `${form} allows ${limit.maxHits} per window — too loose to be a limit`,
      );
      assert.ok(
        limit.windowSeconds >= 15 * 60,
        `${form} window is under 15 minutes, so the cap resets faster than abuse`,
      );
    }
  });
});

describe("opsLooksLikeDocument", () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
  const doc = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

  it("accepts a PDF", () => {
    assert.equal(opsLooksLikeDocument(pdf), true);
  });

  it("accepts a .docx (zip container)", () => {
    assert.equal(opsLooksLikeDocument(docx), true);
  });

  it("accepts a legacy .doc (OLE2 compound file)", () => {
    assert.equal(opsLooksLikeDocument(doc), true);
  });

  it("rejects a script that merely claims to be a PDF", () => {
    // This is the whole point: File.type is client-supplied, so a caller can
    // label anything application/pdf. The bytes cannot be faked as cheaply.
    const shellScript = new TextEncoder().encode("#!/bin/sh\nrm -rf /\n");
    assert.equal(opsLooksLikeDocument(shellScript), false);
  });

  it("rejects HTML", () => {
    const html = new TextEncoder().encode("<!doctype html><script>");
    assert.equal(opsLooksLikeDocument(html), false);
  });

  it("rejects an empty file", () => {
    assert.equal(opsLooksLikeDocument(new Uint8Array([])), false);
  });

  it("rejects a truncated signature", () => {
    // "%PD" — shorter than the shortest signature, must not read out of bounds.
    assert.equal(opsLooksLikeDocument(new Uint8Array([0x25, 0x50, 0x44])), false);
  });
});
