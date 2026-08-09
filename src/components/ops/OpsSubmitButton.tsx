"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { hapticTap } from "@/lib/ops/haptics";

type OpsSubmitButtonProps = {
  /**
   * Accessible name. Required in practice for icon-only submits — the module
   * access matrix is a grid of them, where the visible content is a tick or a
   * dash and carries no meaning on its own.
   */
  "aria-label"?: string;
  children: React.ReactNode;
  className: string;
  /**
   * Blocks the submit for a reason the form knows about but the DOM does not —
   * e.g. a direct-to-R2 upload that has not finished, where there is no form
   * control for native constraint validation to complain about.
   */
  disabled?: boolean;
  pendingLabel?: string;
  /** Native tooltip. Supplements aria-label for sighted mouse users. */
  title?: string;
};

export function OpsSubmitButton({
  "aria-label": ariaLabel,
  children,
  className,
  disabled = false,
  pendingLabel = "Working...",
  title,
}: OpsSubmitButtonProps) {
  const { pending } = useFormStatus();
  const firedRef = useRef(false);

  // `pending` only flips a frame after the click, so a fast double-tap can
  // dispatch twice. A synchronous one-shot lock closes that gap; it clears
  // once the action settles.
  useEffect(() => {
    if (!pending) {
      firedRef.current = false;
    }
  }, [pending]);

  return (
    <Button
      aria-disabled={pending || disabled}
      aria-label={ariaLabel}
      aria-live="polite"
      className={className}
      title={title}
      disabled={pending || disabled}
      onClick={(event) => {
        if (pending || disabled || firedRef.current) {
          event.preventDefault();
          return;
        }
        // If native constraint validation will block the submit, don't take
        // the lock — otherwise the button would stay stuck since `pending`
        // never flips. The browser still shows its own validation UI.
        const form = (event.currentTarget as HTMLButtonElement).form;
        if (form && !form.checkValidity()) {
          return;
        }
        firedRef.current = true;
        hapticTap();
      }}
      type="submit"
    >
      {pending ? (
        <>
          {/* Honour a reduced-motion preference: the label change already
              communicates the pending state without the spin (audit §12). */}
          <Loader2
            className="size-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
