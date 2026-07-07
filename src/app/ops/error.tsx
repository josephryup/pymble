"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Top-level boundary for /ops/* routes that live outside the workspace
 * layout (e.g. /ops/login, callback handlers). Kept intentionally minimal
 * so it can render even if the design system fails to load.
 */
export default function OpsRootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { scope: "ops.root.error_boundary" },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <main
      aria-labelledby="ops-root-error-title"
      className="grid min-h-[60vh] place-items-center px-4 py-12 text-center"
      role="alert"
    >
      <div className="max-w-md space-y-4">
        <h1
          id="ops-root-error-title"
          className="font-heading text-2xl font-bold text-foreground"
        >
          We could not load this page
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          The error has been logged. Try again — if it keeps happening, contact the Pymble admin
          team and share the reference below.
        </p>
        {error.digest ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-center gap-2">
          <button
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            onClick={reset}
            type="button"
          >
            Try again
          </button>
          <a
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground"
            href="/ops/login"
          >
            Go to login
          </a>
        </div>
      </div>
    </main>
  );
}
