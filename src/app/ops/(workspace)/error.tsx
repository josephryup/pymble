"use client";

import { OPS_PRIMARY_BUTTON_CLASS } from "@/lib/ops/ui";

export default function OpsWorkspaceError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center">
      <section
        aria-labelledby="ops-error-title"
        className="w-full rounded-lg border border-red-200 bg-white p-6 shadow-sm"
        role="alert"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
          Operations Error
        </p>
        <h1
          className="mt-2 font-heading text-3xl font-bold tracking-tight text-primary-dark"
          id="ops-error-title"
        >
          This panel could not load
        </h1>
        <p className="mt-3 text-sm leading-6 text-primary-dark/65">
          Something went wrong loading this page. Try again, and if the problem continues, contact
          the Pymble admin team.
        </p>
        <button
          className={`${OPS_PRIMARY_BUTTON_CLASS} mt-5`}
          onClick={reset}
          type="button"
        >
          Try again
        </button>
      </section>
    </div>
  );
}
