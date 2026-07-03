import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOpsContentSecurityPolicy,
  generateOpsCspNonce,
} from "../src/lib/ops/csp";

function directive(policy: string, name: string) {
  const found = policy
    .split("; ")
    .find((entry) => entry.startsWith(`${name} `) || entry === name);
  assert.ok(found, `policy is missing the ${name} directive`);
  return found;
}

describe("generateOpsCspNonce", () => {
  it("returns base64 text long enough to be unguessable", () => {
    const nonce = generateOpsCspNonce();
    assert.match(nonce, /^[A-Za-z0-9+/]{22,}={0,2}$/);
  });

  it("never repeats", () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateOpsCspNonce()));
    assert.equal(seen.size, 100);
  });
});

describe("buildOpsContentSecurityPolicy", () => {
  it("production script-src uses the nonce, not 'unsafe-inline'", () => {
    const nonce = generateOpsCspNonce();
    const policy = buildOpsContentSecurityPolicy({ isDev: false, nonce });
    const scriptSrc = directive(policy, "script-src");

    assert.ok(scriptSrc.includes(`'nonce-${nonce}'`));
    assert.ok(scriptSrc.includes("'strict-dynamic'"));
    assert.ok(!scriptSrc.includes("'unsafe-inline'"));
    assert.ok(!scriptSrc.includes("'unsafe-eval'"));
  });

  it("development keeps the permissive script-src for hot reload", () => {
    const policy = buildOpsContentSecurityPolicy({ isDev: true });
    const scriptSrc = directive(policy, "script-src");

    assert.ok(scriptSrc.includes("'unsafe-inline'"));
    assert.ok(scriptSrc.includes("'unsafe-eval'"));
    assert.ok(!scriptSrc.includes("'nonce-"));
  });

  it("production keeps the Supabase realtime websocket origins", () => {
    const policy = buildOpsContentSecurityPolicy({
      isDev: false,
      nonce: generateOpsCspNonce(),
    });
    const connectSrc = directive(policy, "connect-src");

    assert.ok(connectSrc.includes("wss://*.supabase.co"));
    assert.ok(connectSrc.includes("https://*.supabase.co"));
  });

  it("keeps the hardening directives intact in both modes", () => {
    for (const isDev of [true, false]) {
      const policy = buildOpsContentSecurityPolicy({
        isDev,
        nonce: isDev ? undefined : generateOpsCspNonce(),
      });

      assert.equal(directive(policy, "object-src"), "object-src 'none'");
      assert.equal(directive(policy, "frame-ancestors"), "frame-ancestors 'none'");
      assert.equal(directive(policy, "base-uri"), "base-uri 'self'");
      assert.equal(directive(policy, "form-action"), "form-action 'self'");
      // Inline styles stay allowed on purpose: Next.js and component
      // libraries inject <style> tags without nonces.
      assert.equal(directive(policy, "style-src"), "style-src 'self' 'unsafe-inline'");
    }
  });
});
