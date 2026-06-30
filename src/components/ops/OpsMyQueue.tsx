import { ArrowRight, CheckCircle2, ListChecks } from "lucide-react";
import Link from "next/link";
import type { OpsQueueItem } from "@/lib/ops/overview-queue";
import { OPS_EYEBROW_CLASS } from "@/lib/ops/ui";

export function OpsMyQueue({ items }: { items: OpsQueueItem[] }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue/10 text-primary-blue">
          <ListChecks className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className={OPS_EYEBROW_CLASS}>
            My queue
          </p>
          <h2 className="mt-0.5 font-heading text-xl font-bold text-foreground">
            What needs your attention
          </h2>
        </div>
      </div>

      {items.length > 0 ? (
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                className="flex items-center justify-between gap-3 rounded-md border border-border px-4 py-3 transition hover:border-primary/40 hover:bg-primary/[0.03]"
                href={item.href}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-md text-sm font-bold ${
                      item.tone === "warn"
                        ? "bg-orange-50 text-orange-700 ring-1 ring-orange-100"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {item.count}
                  </span>
                  <span className="min-w-0 text-sm font-semibold text-foreground">
                    {item.label}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
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
