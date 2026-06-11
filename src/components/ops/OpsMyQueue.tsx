import { ArrowRight, CheckCircle2, ListChecks } from "lucide-react";
import Link from "next/link";
import type { OpsQueueItem } from "@/lib/ops/overview-queue";

export function OpsMyQueue({ items }: { items: OpsQueueItem[] }) {
  return (
    <section className="rounded-lg border border-primary-dark/10 bg-white p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue/10 text-primary-blue">
          <ListChecks className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
            My queue
          </p>
          <h2 className="mt-0.5 font-heading text-xl font-bold text-primary-dark">
            What needs your attention
          </h2>
        </div>
      </div>

      {items.length > 0 ? (
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                className="flex items-center justify-between gap-3 rounded-md border border-primary-dark/10 px-4 py-3 transition hover:border-primary-blue/40 hover:bg-primary-blue/[0.03]"
                href={item.href}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-md text-sm font-bold ${
                      item.tone === "warn"
                        ? "bg-orange-50 text-orange-700"
                        : "bg-primary-dark/[0.05] text-primary-dark/70"
                    }`}
                  >
                    {item.count}
                  </span>
                  <span className="min-w-0 text-sm font-semibold text-primary-dark">
                    {item.label}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-primary-dark/40" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          You are all caught up — nothing is waiting on you right now.
        </div>
      )}
    </section>
  );
}
