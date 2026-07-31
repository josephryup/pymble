/**
 * When a realtime event is allowed to re-render the page (audit §8).
 *
 * `router.refresh()` re-runs the entire server render of a force-dynamic
 * page — 37 queries on the commercial dashboard, 44 of 81 ops pages are
 * force-dynamic, and 37 pages subscribe to realtime. A 500ms debounce collapses
 * a burst but does not bound the sustained rate: a steadily busy site produces
 * an event every 500ms indefinitely, so every open tab re-renders twice a
 * second. That is the shape of the Vercel CPU bill.
 *
 * Three reasons to hold a refresh back, all of which DEFER rather than drop —
 * the update still lands, just when it is cheap and safe:
 *
 *   1. the tab is not visible — nobody is looking at the stale data
 *   2. the user is typing — refreshing mid-edit can discard their input, so
 *      this is a correctness fix as much as a cost one
 *   3. we refreshed very recently — the floor on sustained rate
 *
 * Pure so the policy is testable without a browser or a database.
 */

/** Minimum gap between two refreshes of the same page. */
export const MIN_REFRESH_INTERVAL_MS = 10_000;

export type RefreshDecision =
  | { refresh: true }
  | { refresh: false; defer: true; reason: "hidden" | "editing" | "too_soon" };

export function decideRefresh(input: {
  now: number;
  lastRefreshAt: number;
  isVisible: boolean;
  isEditing: boolean;
  minIntervalMs?: number;
}): RefreshDecision {
  if (!input.isVisible) {
    return { refresh: false, defer: true, reason: "hidden" };
  }
  if (input.isEditing) {
    return { refresh: false, defer: true, reason: "editing" };
  }

  const floor = input.minIntervalMs ?? MIN_REFRESH_INTERVAL_MS;
  if (input.now - input.lastRefreshAt < floor) {
    return { refresh: false, defer: true, reason: "too_soon" };
  }

  return { refresh: true };
}

/**
 * Whether an element being focused means the user is part-way through
 * entering something. Exported for the same reason as the rest: so the rule is
 * inspectable rather than buried in a DOM check.
 */
export function isEditableTag(tagName: string | null | undefined, isContentEditable = false) {
  if (isContentEditable) return true;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}
