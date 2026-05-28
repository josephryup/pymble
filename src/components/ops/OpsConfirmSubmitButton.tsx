"use client";

import { useEffect, useState } from "react";

type OpsConfirmSubmitButtonProps = {
  children: React.ReactNode;
  className: string;
  confirmText: string;
};

export function OpsConfirmSubmitButton({
  children,
  className,
  confirmText,
}: OpsConfirmSubmitButtonProps) {
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    if (!isConfirming) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setIsConfirming(false), 4500);
    return () => window.clearTimeout(timeout);
  }, [isConfirming]);

  return (
    <button
      aria-live="polite"
      className={className}
      onClick={(event) => {
        if (!isConfirming) {
          event.preventDefault();
          setIsConfirming(true);
        }
      }}
      type="submit"
    >
      {isConfirming ? confirmText : children}
    </button>
  );
}
