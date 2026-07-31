import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { opsAvatarInitials, opsAvatarTone } from "../src/components/ops/OpsAvatar";

/**
 * Avatar fallback behaviour (audit §3).
 *
 * Most people will never upload a photo, so the initials path is the common
 * case, not the edge case — it has to look deliberate rather than broken.
 */

describe("opsAvatarInitials", () => {
  it("takes the first and last name, ignoring middle names", () => {
    assert.equal(opsAvatarInitials("Joseph Mwansa Phiri"), "JP");
    assert.equal(opsAvatarInitials("Grace Banda"), "GB");
  });

  it("uses the first two letters of a single name", () => {
    assert.equal(opsAvatarInitials("Chanda"), "CH");
  });

  it("copes with messy spacing and casing", () => {
    assert.equal(opsAvatarInitials("  joseph   phiri  "), "JP");
  });

  it("never renders empty", () => {
    // A blank circle reads as a loading failure; "?" reads as unknown.
    assert.equal(opsAvatarInitials(""), "?");
    assert.equal(opsAvatarInitials(null), "?");
    assert.equal(opsAvatarInitials(undefined), "?");
    assert.equal(opsAvatarInitials("   "), "?");
  });
});

describe("opsAvatarTone", () => {
  it("gives the same person the same colour every render", () => {
    // Colour is an identity cue down a long list, so it must not shuffle
    // between renders or between pages.
    assert.equal(opsAvatarTone("Joseph Phiri"), opsAvatarTone("Joseph Phiri"));
  });

  it("distinguishes different people", () => {
    const tones = new Set(
      ["Joseph Phiri", "Grace Banda", "Mutale Mubanga", "Happy Mulenga"].map(
        opsAvatarTone,
      ),
    );
    assert.ok(tones.size > 1, "different names should not all collapse to one colour");
  });

  it("always returns a usable class, even with no name", () => {
    for (const value of ["", null, undefined]) {
      assert.match(opsAvatarTone(value), /bg-/);
    }
  });
});
