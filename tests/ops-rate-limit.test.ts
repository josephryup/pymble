import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  opsClientIp,
  opsLoginEmailRateLimitKey,
  opsLoginIpRateLimitKey,
} from "../src/lib/ops/rate-limit";

describe("opsClientIp", () => {
  it("takes the first x-forwarded-for entry", () => {
    const headers = new Headers({
      "x-forwarded-for": "196.223.10.5, 10.0.0.1",
    });
    assert.equal(opsClientIp(headers), "196.223.10.5");
  });

  it("falls back to x-real-ip", () => {
    const headers = new Headers({ "x-real-ip": "196.223.10.9" });
    assert.equal(opsClientIp(headers), "196.223.10.9");
  });

  it("returns null when no forwarding headers exist", () => {
    assert.equal(opsClientIp(new Headers()), null);
  });

  it("rejects absurdly long header values", () => {
    const headers = new Headers({ "x-forwarded-for": "a".repeat(65) });
    assert.equal(opsClientIp(headers), null);
  });
});

describe("login rate-limit keys", () => {
  it("normalises the email so casing and whitespace share one bucket", () => {
    assert.equal(
      opsLoginEmailRateLimitKey("  Site.Agent@Pymble.COM "),
      "login:email:site.agent@pymble.com",
    );
  });

  it("keys IPs separately from emails", () => {
    assert.equal(opsLoginIpRateLimitKey("196.223.10.5"), "login:ip:196.223.10.5");
  });
});
