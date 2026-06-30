/**
 * Short, synthesised notification chime for the ops workspace.
 *
 * Uses the Web Audio API so there is no audio asset to ship and it works
 * offline. Browsers block audio until the user has interacted with the page, so
 * `primeOpsNotificationSound` resumes the context on the first user gesture;
 * if a notification somehow arrives before any interaction the play call simply
 * no-ops (no error, no sound) rather than throwing.
 */

type AudioContextCtor = typeof AudioContext;

const STORAGE_KEY = "ops-notification-sound";

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;

  if (!Ctor) {
    return null;
  }

  if (!audioContext) {
    try {
      audioContext = new Ctor();
    } catch {
      return null;
    }
  }

  return audioContext;
}

/** Sound is on unless the user explicitly stored "off". */
export function isOpsNotificationSoundEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setOpsNotificationSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Ignore storage failures (private mode, quota) — sound just stays default.
  }
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  peakGain: number,
) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startTime);

  // Quick attack, gentle bell-like exponential decay.
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
}

/**
 * Play a soft two-note chime ("ti-doo"). Safe to call from anywhere; no-ops if
 * Web Audio is unavailable, the context is still locked, or the user muted it.
 */
export function playOpsNotificationChime() {
  if (!isOpsNotificationSoundEnabled()) {
    return;
  }

  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }

  const resume = ctx.state === "suspended" ? ctx.resume() : Promise.resolve();

  resume
    .then(() => {
      const now = ctx.currentTime;
      playTone(ctx, 784, now, 0.18, 0.09); // G5
      playTone(ctx, 1046.5, now + 0.11, 0.22, 0.08); // C6
    })
    .catch(() => {
      // Autoplay still blocked — stay silent.
    });
}

/**
 * Unlock audio on the first user gesture so later notification chimes can play.
 * Returns a cleanup function that removes the listeners.
 */
export function primeOpsNotificationSound() {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = () => {
    const ctx = getAudioContext();
    ctx?.resume().catch(() => {});
  };

  window.addEventListener("pointerdown", handler, { once: true });
  window.addEventListener("keydown", handler, { once: true });

  return () => {
    window.removeEventListener("pointerdown", handler);
    window.removeEventListener("keydown", handler);
  };
}
