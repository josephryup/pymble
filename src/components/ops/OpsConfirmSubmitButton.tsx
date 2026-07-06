"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { hapticConfirm, hapticWarn } from "@/lib/ops/haptics";
import { cn } from "@/lib/utils";

type OpsConfirmSubmitButtonProps = {
  children: React.ReactNode;
  className: string;
  confirmText: string;
  /** Forwarded to the underlying button so multi-action forms can submit a
   * named value (e.g. name="action" value="approve"). */
  name?: string;
  pendingText?: string;
  value?: string;
};

/**
 * Two-phase submit button for destructive / irreversible ops actions.
 *
 * Phase 1 (arm): the first click does NOT submit. It swaps the label to
 * `confirmText`, lights up a warning ring + icon, and fires a haptic buzz so an
 * accidental tap is obvious and harmless. Auto-disarms after 4.5 s.
 *
 * Phase 2 (confirm): a second click within the window submits and fires a
 * distinct "committing" haptic. A synchronous `firedRef` lock guarantees the
 * action can only be dispatched once even on a fast double-tap — `pending` from
 * `useFormStatus` only flips a frame later, so we can't rely on it alone.
 */
export function OpsConfirmSubmitButton({
  children,
  className,
  confirmText,
  name,
  pendingText = "Working...",
  value,
}: OpsConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();
  const [isConfirming, setIsConfirming] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!isConfirming) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setIsConfirming(false), 4500);
    return () => window.clearTimeout(timeout);
  }, [isConfirming]);

  // If the action resolves without unmounting us, clear the one-shot lock so
  // the button can be used again.
  useEffect(() => {
    if (!pending) {
      firedRef.current = false;
    }
  }, [pending]);

  return (
    <Button
      aria-disabled={pending}
      aria-live="polite"
      className={cn(
        className,
        isConfirming &&
          !pending &&
          "relative ring-2 ring-destructive/60 ring-offset-1 ring-offset-background animate-pulse",
      )}
      data-armed={isConfirming ? "true" : undefined}
      disabled={pending}
      name={name}
      value={value}
      onClick={(event) => {
        // Already committing, or a rapid second dispatch slipped through — block.
        if (pending || firedRef.current) {
          event.preventDefault();
          return;
        }

        if (!isConfirming) {
          // Phase 1: arm, don't submit.
          event.preventDefault();
          setIsConfirming(true);
          hapticWarn();
          return;
        }

        // Phase 2: confirm. If native validation would block the submit, stay
        // armed and let the browser surface the error rather than locking up.
        const form = (event.currentTarget as HTMLButtonElement).form;
        if (form && !form.checkValidity()) {
          return;
        }

        // Take the one-shot lock and let the submit proceed.
        firedRef.current = true;
        hapticConfirm();
      }}
      type="submit"
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {pendingText}
        </>
      ) : isConfirming ? (
        <>
          <AlertTriangle className="size-4" aria-hidden="true" />
          {confirmText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
