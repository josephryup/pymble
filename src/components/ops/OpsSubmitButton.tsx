"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { hapticTap } from "@/lib/ops/haptics";

type OpsSubmitButtonProps = {
  children: React.ReactNode;
  className: string;
  pendingLabel?: string;
};

export function OpsSubmitButton({
  children,
  className,
  pendingLabel = "Working...",
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
      aria-disabled={pending}
      aria-live="polite"
      className={className}
      disabled={pending}
      onClick={(event) => {
        if (pending || firedRef.current) {
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
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
