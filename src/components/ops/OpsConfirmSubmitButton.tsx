"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";

type OpsConfirmSubmitButtonProps = {
  children: React.ReactNode;
  className: string;
  confirmText: string;
  pendingText?: string;
};

export function OpsConfirmSubmitButton({
  children,
  className,
  confirmText,
  pendingText = "Working...",
}: OpsConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (!isConfirming) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setIsConfirming(false), 4500);
    return () => window.clearTimeout(timeout);
  }, [isConfirming]);

  return (
    <Button
      aria-disabled={pending}
      aria-live="polite"
      className={className}
      disabled={pending}
      onClick={(event) => {
        if (pending) {
          return;
        }

        if (!isConfirming) {
          event.preventDefault();
          setIsConfirming(true);
        }
      }}
      type="submit"
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {pendingText}
        </>
      ) : isConfirming ? (
        confirmText
      ) : (
        children
      )}
    </Button>
  );
}
