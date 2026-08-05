import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { servesOwnCacheableOpsAsset } from "../src/proxy";

/**
 * Which ops responses are allowed to keep their own Cache-Control.
 *
 * The proxy stamps `no-store` across /api/ops so that payroll figures, TPINs
 * and finance rows cannot survive in the browser disk or back-button cache.
 * That default must stay wide: this list is the exception, and every entry on
 * it is a route that serves non-confidential bytes under its own `private`
 * policy. Getting this wrong in the permissive direction leaks; getting it
 * wrong in the restrictive direction just costs money. Hence a test that
 * pins both directions rather than only the happy path.
 */

describe("servesOwnCacheableOpsAsset", () => {
  it("exempts the avatar route so its own private cache header survives", () => {
    // Without this the route's `private, max-age=86400, immutable` was being
    // overwritten, so every face on every render re-invoked a Node function
    // doing an auth check, a users lookup and an R2 GetObject.
    assert.equal(
      servesOwnCacheableOpsAsset(
        "/api/ops/avatar/3f7c1e02-9a4b-4c11-8f2d-7b5e9a0c4d61",
      ),
      true,
    );
  });

  it("does not exempt anything carrying confidential data", () => {
    // The whole point of the blanket no-store. If any of these ever return
    // true, sensitive JSON becomes cacheable on shared and personal devices.
    for (const pathname of [
      "/api/ops/profile",
      "/api/ops/health",
      "/api/ops/attendance/export",
      "/api/ops/staff-payroll/abc/export",
      "/api/ops/pdf/payslip/abc",
      "/api/ops/documents/abc/download",
      "/api/ops/record-activity",
      "/ops/staff-payroll",
    ]) {
      assert.equal(
        servesOwnCacheableOpsAsset(pathname),
        false,
        `${pathname} must keep no-store`,
      );
    }
  });

  it("is not fooled by a path that merely mentions the avatar route", () => {
    // Prefix match is anchored, so a lookalike segment elsewhere in the path
    // cannot opt itself out of no-store.
    assert.equal(servesOwnCacheableOpsAsset("/api/ops/pdf/api/ops/avatar/x"), false);
    assert.equal(servesOwnCacheableOpsAsset("/api/ops/avatars-export"), false);
    // The collection path itself serves no image and has no own policy.
    assert.equal(servesOwnCacheableOpsAsset("/api/ops/avatar"), false);
  });
});
