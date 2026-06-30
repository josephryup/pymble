"use client";

import { Download, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_STORAGE_KEY = "pymble-ops-install-dismissed-at";
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function isStandalone() {
  if (typeof window === "undefined") return false;
  const mql = window.matchMedia?.("(display-mode: standalone)");
  // iOS Safari only exposes navigator.standalone
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return Boolean((mql && mql.matches) || iosStandalone);
}

function isIos() {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent) && !("MSStream" in window);
}

function recentlyDismissed() {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function OpsInstallPrompt() {
  // Both start false to match SSR; browser detection happens in useEffect.
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  // Derived: iOS mode = visible but no beforeinstallprompt event fired.
  const showIos = visible && installEvent === null;

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    if (isIos()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time browser detection; no store to subscribe to
      setVisible(true);
      return;
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    } catch {
      // ignore quota / private-mode errors
    }
  }

  async function install() {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted" || choice.outcome === "dismissed") {
        setVisible(false);
        setInstallEvent(null);
      }
    } catch {
      setVisible(false);
    }
  }

  if (!visible) return null;

  return (
    <div
      className="rounded-lg border border-primary-blue/30 bg-primary-blue/5 p-4 shadow-sm"
      role="region"
      aria-label="Install Pymble Operations"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
          <Smartphone className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-base font-bold text-foreground">
            Install Pymble Operations on this device
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {showIos
              ? "Tap the Share button in Safari, then 'Add to Home Screen' to use Pymble Operations like an app — useful for site engineers and supervisors logging attendance and reports from the field."
              : "Add Pymble Operations to your home screen for one-tap access — useful for site engineers and supervisors logging attendance, daily reports, and photos from the field."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {installEvent ? (
              <button
                className="inline-flex items-center gap-1.5 rounded-md bg-primary-blue px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-primary-blue/88"
                onClick={install}
                type="button"
              >
                <Download className="size-4" aria-hidden="true" />
                Install
              </button>
            ) : null}
            <button
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted"
              onClick={dismiss}
              type="button"
            >
              <X className="size-4" aria-hidden="true" />
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
