import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOpsContentSecurityPolicy } from "../src/lib/ops/csp";

function directive(policy: string, name: string) {
  const found = policy
    .split("; ")
    .find((entry) => entry.startsWith(`${name} `) || entry === name);
  assert.ok(found, `policy is missing the ${name} directive`);
  return found;
}

describe("buildOpsContentSecurityPolicy", () => {
  it("production script-src is cache-stable ('self' 'unsafe-inline', no nonce)", () => {
    const scriptSrc = directive(buildOpsContentSecurityPolicy({ isDev: false }), "script-src");

    assert.equal(scriptSrc, "script-src 'self' 'unsafe-inline'");
    // A per-request nonce or strict-dynamic would break the offline-first
    // service worker's cached navigation — must stay out of production.
    assert.ok(!scriptSrc.includes("nonce-"));
    assert.ok(!scriptSrc.includes("strict-dynamic"));
    assert.ok(!scriptSrc.includes("'unsafe-eval'"));
  });

  it("development adds unsafe-eval for hot reload", () => {
    const scriptSrc = directive(buildOpsContentSecurityPolicy({ isDev: true }), "script-src");

    assert.ok(scriptSrc.includes("'unsafe-inline'"));
    assert.ok(scriptSrc.includes("'unsafe-eval'"));
  });

  it("production keeps the Supabase realtime websocket origins", () => {
    const connectSrc = directive(buildOpsContentSecurityPolicy({ isDev: false }), "connect-src");

    assert.ok(connectSrc.includes("wss://*.supabase.co"));
    assert.ok(connectSrc.includes("https://*.supabase.co"));
  });

  it("allows the browser to PUT attachments straight to R2", () => {
    // Without this the presigned upload is blocked in the browser, and every
    // attachment over ~1 MB is unpostable: a Server Action body cannot exceed
    // 4.5 MB on Vercel, so there is no server-side fallback to fall back to.
    for (const isDev of [true, false]) {
      const connectSrc = directive(buildOpsContentSecurityPolicy({ isDev }), "connect-src");
      assert.ok(connectSrc.includes("https://*.r2.cloudflarestorage.com"));
    }
  });

  it("keeps the hardening directives intact in both modes", () => {
    for (const isDev of [true, false]) {
      const policy = buildOpsContentSecurityPolicy({ isDev });

      assert.equal(directive(policy, "object-src"), "object-src 'none'");
      assert.equal(directive(policy, "frame-ancestors"), "frame-ancestors 'none'");
      assert.equal(directive(policy, "base-uri"), "base-uri 'self'");
      assert.equal(directive(policy, "form-action"), "form-action 'self'");
      assert.equal(directive(policy, "worker-src"), "worker-src 'self' blob:");
      // Inline styles stay allowed on purpose: Next.js and component libraries
      // inject <style> tags without nonces.
      assert.equal(directive(policy, "style-src"), "style-src 'self' 'unsafe-inline'");
    }
  });
});
