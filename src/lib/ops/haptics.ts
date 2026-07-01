/**
 * Tiny haptic-feedback helper for the ops workspace.
 *
 * Uses the Vibration API (`navigator.vibrate`), which is supported on Android
 * Chrome/Firefox and most mobile PWAs — exactly where field crews use this
 * workspace. It's a graceful no-op on iOS Safari and desktop, so callers never
 * need to feature-detect.
 *
 * The three patterns are deliberately distinct so a user can *feel* the
 * difference between "I armed a destructive action" and "it actually fired":
 *  - tap:     a single light pulse — a neutral acknowledgement of a press.
 *  - warn:    one firmer pulse — "careful, this is destructive; press again".
 *  - confirm: a short rhythm — the destructive action is now committing.
 */

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    vibrate?: (pattern: number | number[]) => boolean;
  };
  if (typeof nav.vibrate !== "function") return;
  try {
    nav.vibrate(pattern);
  } catch {
    // Some browsers throw if called without a user gesture — ignore.
  }
}

/** Light acknowledgement of a normal button press. */
export function hapticTap(): void {
  vibrate(12);
}

/** "Are you sure?" — a firmer single buzz when a destructive action is armed. */
export function hapticWarn(): void {
  vibrate(28);
}

/** The destructive action is committing — a short, unmistakable rhythm. */
export function hapticConfirm(): void {
  vibrate([12, 40, 24]);
}
