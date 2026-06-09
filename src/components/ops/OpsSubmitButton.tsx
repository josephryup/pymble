"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";

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

  return (
    <Button
      aria-disabled={pending}
      aria-live="polite"
      className={className}
      disabled={pending}
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
