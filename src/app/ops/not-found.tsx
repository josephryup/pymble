import Link from "next/link";
import { OPS_PRIMARY_BUTTON_CLASS } from "@/lib/ops/ui";

export default function OpsNotFound() {
  return (
    <main className="ops-ui flex min-h-dvh items-center justify-center bg-[#f6f7fb] px-5 text-primary-dark">
      <section
        aria-labelledby="ops-not-found-title"
        className="w-full max-w-md rounded-lg border border-primary-dark/10 bg-white p-6 shadow-sm"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
          Pymble Construction Limited
        </p>
        <h1
          className="mt-2 font-heading text-3xl font-bold tracking-tight"
          id="ops-not-found-title"
        >
          Page not found
        </h1>
        <p className="mt-3 text-sm leading-6 text-primary-dark/65">
          This operations page is not available.
        </p>
        <Link
          className={`${OPS_PRIMARY_BUTTON_CLASS} mt-5 w-full`}
          href="/ops"
        >
          Back to operations
        </Link>
      </section>
    </main>
  );
}
