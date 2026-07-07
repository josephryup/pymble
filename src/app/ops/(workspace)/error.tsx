"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { OPS_PRIMARY_BUTTON_CLASS, OPS_SECONDARY_BUTTON_CLASS } from "@/lib/ops/ui";

export default function OpsWorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { scope: "ops.workspace.error_boundary" },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center px-4">
      <section
        aria-labelledby="ops-error-title"
        className="w-full rounded-lg border border-red-200 bg-card p-6 shadow-sm"
        role="alert"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
          Operations error
        </p>
        <h1
          className="mt-2 font-heading text-3xl font-bold tracking-tight text-foreground"
          id="ops-error-title"
        >
          Something went wrong loading this page
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The error has been logged and your team has been notified. Try again — if the problem
          continues, contact the Pymble admin team and share the reference below.
        </p>
        {error.digest ? (
          <p className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className={OPS_PRIMARY_BUTTON_CLASS}
            onClick={reset}
            type="button"
          >
            Try again
          </button>
          <a className={OPS_SECONDARY_BUTTON_CLASS} href="/ops">
            Back to overview
          </a>
        </div>
      </section>
    </div>
  );
}
