"use client";

import { useEffect, useState } from "react";

export function OpsLocalRolePreviewGuard() {
  const [blockedAt, setBlockedAt] = useState<number | null>(null);

  useEffect(() => {
    const handleSubmit = (event: SubmitEvent) => {
      const form = event.target;

      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      const method = (form.method || "get").toLowerCase();
      const action = form.getAttribute("action") ?? "";

      if (
        method === "get" ||
        action.includes("/api/ops/dev-preview") ||
        action.includes("/api/ops/auth/logout")
      ) {
        return;
      }

      event.preventDefault();
      setBlockedAt(Date.now());
    };

    document.addEventListener("submit", handleSubmit, true);

    return () => {
      document.removeEventListener("submit", handleSubmit, true);
    };
  }, []);

  return blockedAt ? (
    <div
      className="fixed bottom-4 left-4 right-4 z-[70] rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 shadow-lg md:left-auto md:w-[28rem]"
      role="status"
    >
      Local role preview is read-only. Stop preview or sign in with a real account to make changes.
    </div>
  ) : null;
}

