import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback for a Suspense-streamed dashboard panel.
 *
 * The workspace already has route-level `loading.tsx` files, but those only
 * cover navigating *to* a page. Once a heavy dashboard starts rendering, it
 * awaited every query before painting anything — the commercial page ran 21 in
 * a single Promise.all, so the whole screen waited on the slowest aggregate
 * (audit finding U1: zero Suspense boundaries in /ops).
 *
 * Wrapping the analytics panels in Suspense lets the register and the forms —
 * the parts people actually act on — paint immediately, while the slower
 * roll-ups arrive behind this. It reserves roughly the right height so nothing
 * jumps when the real panel lands.
 */
export function OpsPanelSkeleton({
  lines = 4,
  title,
}: {
  /** Roughly how many rows of content the real panel shows. */
  lines?: number;
  /** Announced to screen readers so the wait is not silent. */
  title: string;
}) {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="rounded-lg border border-border bg-card shadow-sm"
      role="status"
    >
      <span className="sr-only">Loading {title}…</span>
      <div className="border-b border-border p-5">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-2 h-3 w-72 max-w-full" />
      </div>
      <div className="space-y-3 p-5">
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton
            className="h-4"
            key={index}
            // Staggered widths read as content rather than as a loading bar.
            style={{ width: `${100 - index * 7}%` }}
          />
        ))}
      </div>
    </section>
  );
}
