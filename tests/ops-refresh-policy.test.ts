import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideRefresh,
  isEditableTag,
  MIN_REFRESH_INTERVAL_MS,
} from "../src/lib/ops/refresh-policy";

/**
 * Realtime refresh throttling (audit §8).
 *
 * Each allowed refresh re-runs a whole server render — up to 37 queries on the
 * commercial dashboard. These tests pin the three reasons to hold one back, and
 * the property that matters most: a held refresh is DEFERRED, never dropped.
 */

const NOW = 1_000_000;

describe("decideRefresh", () => {
  it("refreshes when visible, idle, and past the interval", () => {
    const decision = decideRefresh({
      now: NOW,
      lastRefreshAt: NOW - MIN_REFRESH_INTERVAL_MS - 1,
      isVisible: true,
      isEditing: false,
    });

    assert.deepEqual(decision, { refresh: true });
  });

  it("defers while the tab is hidden — nobody is looking at the stale data", () => {
    const decision = decideRefresh({
      now: NOW,
      lastRefreshAt: 0,
      isVisible: false,
      isEditing: false,
    });

    assert.equal(decision.refresh, false);
    assert.equal(decision.refresh === false && decision.reason, "hidden");
  });

  it("defers while the user is typing — a refresh can discard their input", () => {
    // This is a correctness fix as much as a cost one: router.refresh()
    // mid-edit re-renders the tree under a live form.
    const decision = decideRefresh({
      now: NOW,
      lastRefreshAt: 0,
      isVisible: true,
      isEditing: true,
    });

    assert.equal(decision.refresh, false);
    assert.equal(decision.refresh === false && decision.reason, "editing");
  });

  it("caps the sustained rate, not just bursts", () => {
    // A busy site emits an event every 500ms forever; the debounce collapses a
    // burst but would happily refresh twice a second indefinitely.
    const decision = decideRefresh({
      now: NOW,
      lastRefreshAt: NOW - 1_000,
      isVisible: true,
      isEditing: false,
    });

    assert.equal(decision.refresh, false);
    assert.equal(decision.refresh === false && decision.reason, "too_soon");
  });

  it("allows the very first refresh on a freshly opened page", () => {
    const decision = decideRefresh({
      now: NOW,
      lastRefreshAt: 0,
      isVisible: true,
      isEditing: false,
    });

    assert.equal(decision.refresh, true);
  });

  it("checks visibility before anything else", () => {
    // A hidden tab should not report "too_soon" — the reason a caller sees
    // decides which event re-triggers it later.
    const decision = decideRefresh({
      now: NOW,
      lastRefreshAt: NOW,
      isVisible: false,
      isEditing: true,
    });

    assert.equal(decision.refresh === false && decision.reason, "hidden");
  });

  it("honours a caller-supplied interval", () => {
    const decision = decideRefresh({
      now: NOW,
      lastRefreshAt: NOW - 2_000,
      isVisible: true,
      isEditing: false,
      minIntervalMs: 1_000,
    });

    assert.equal(decision.refresh, true);
  });
});

describe("isEditableTag", () => {
  it("treats form controls as editing", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      assert.equal(isEditableTag(tag), true, `${tag} should count as editing`);
    }
  });

  it("treats contenteditable as editing whatever the tag", () => {
    assert.equal(isEditableTag("DIV", true), true);
  });

  it("does not treat ordinary elements or nothing focused as editing", () => {
    assert.equal(isEditableTag("DIV"), false);
    assert.equal(isEditableTag("BUTTON"), false);
    assert.equal(isEditableTag(null), false);
    assert.equal(isEditableTag(undefined), false);
  });
});
