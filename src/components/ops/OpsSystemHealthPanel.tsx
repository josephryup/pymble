import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import type { OpsSystemHealth } from "@/lib/ops/system-health";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Surfaces the swallowed failures recorded in `audit_events` (audit finding
 * R2). Read-only by design: the point is that somebody sees the count, not
 * that they can clear it from here — dismissing a failure you have not fixed
 * is worse than not seeing it.
 */
export function OpsSystemHealthPanel({ health }: { health: OpsSystemHealth }) {
  return (
    <section
      aria-labelledby="ops-system-health-title"
      className="rounded-lg border border-border bg-card shadow-sm"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border p-5">
        <div>
          <h2
            className="text-lg font-bold text-foreground"
            id="ops-system-health-title"
          >
            System health
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Background steps that failed quietly in the last {health.windowDays} days.
            These do not block the action that triggered them — a cost entry that
            cannot be written still lets the approval through — so they are only
            visible here.
          </p>
        </div>
        {health.total > 0 ? (
          <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-orange-700">
            {health.total} in {health.windowDays}d
          </span>
        ) : (
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden="true" />
        )}
      </div>

      {health.rows.length === 0 ? (
        <OpsEmptyState
          description={`No background step has failed in the last ${health.windowDays} days. This panel stays empty while sync, posting and notification work is completing cleanly.`}
          icon={CheckCircle2}
          title="Nothing has failed quietly"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                <th className="px-5 py-3" scope="col">
                  Module
                </th>
                <th className="px-5 py-3" scope="col">
                  Failure
                </th>
                <th className="px-5 py-3 text-right" scope="col">
                  Count
                </th>
                <th className="px-5 py-3" scope="col">
                  Most recent
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {health.rows.map((row) => (
                <tr key={row.action}>
                  <td className="px-5 py-3 font-semibold text-foreground">{row.module}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <AlertTriangle
                        className="size-4 shrink-0 text-orange-600"
                        aria-hidden="true"
                      />
                      <code className="font-mono text-xs">{row.action}</code>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-foreground">
                    {row.count}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {formatWhen(row.latest)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
