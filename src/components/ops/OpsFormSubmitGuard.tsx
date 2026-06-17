"use client";

import { useEffect } from "react";

/**
 * Global double-submit guard for the ops workspace.
 *
 * Once mounted (in the workspace layout), it installs a single document-level
 * `submit` listener. When any form submits:
 *  1. It marks the form with `data-ops-submitting="true"` so CSS dims it.
 *  2. It disables every submit-style button inside the form.
 *  3. It re-enables them after 8 s as a safety net, in case the action
 *     redirects through a slow proxy or fails silently.
 *
 * This complements `OpsSubmitButton` / `OpsConfirmSubmitButton` (which use
 * `useFormStatus`) — they're still preferred for explicit per-button UX, but
 * this guard catches every raw `<button type="submit">` across the workspace
 * so a fast double-click can't fire the same action twice.
 */
export function OpsFormSubmitGuard() {
  useEffect(() => {
    const handler = (event: Event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form || form.tagName !== "FORM") return;

      // If we already marked this form as submitting, the browser shouldn't
      // even fire submit again — but in case it does, swallow the event.
      if (form.dataset.opsSubmitting === "true") {
        event.preventDefault();
        return;
      }

      form.dataset.opsSubmitting = "true";

      const targets = form.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
        "button[type=submit], input[type=submit], button:not([type])",
      );
      const restored: Array<() => void> = [];
      for (const target of Array.from(targets)) {
        if (target.disabled) continue;
        target.disabled = true;
        target.setAttribute("aria-busy", "true");
        restored.push(() => {
          target.disabled = false;
          target.removeAttribute("aria-busy");
        });
      }

      // Safety net: if the submission doesn't navigate / replace the form
      // within 8 s, re-enable the buttons so the user isn't stuck.
      window.setTimeout(() => {
        form.dataset.opsSubmitting = "false";
        for (const restore of restored) restore();
      }, 8000);
    };

    document.addEventListener("submit", handler, true);
    return () => document.removeEventListener("submit", handler, true);
  }, []);

  return null;
}
