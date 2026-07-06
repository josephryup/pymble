import type { LucideIcon } from "lucide-react";

export type OpsStatTileTone = "default" | "good" | "warn" | "critical" | "muted";

function valueClass(tone: OpsStatTileTone) {
  if (tone === "good") return "text-emerald-700";
  if (tone === "warn") return "text-amber-700";
  if (tone === "critical") return "text-red-700";
  if (tone === "muted") return "text-muted-foreground";
  return "text-foreground";
}

/**
 * Non-link metric tile used inside dashboard panels (HSE safety KPIs, finance
 * cashflow totals). For a linked headline card use OpsKpiCard instead — this
 * exists so panels stop hand-rolling their own <article> tiles with divergent
 * typography and threshold colors.
 */
export function OpsStatTile({
  label,
  value,
  tone = "default",
  icon: Icon,
  iconClassName = "text-primary-blue",
  sub,
  size = "md",
}: {
  label: string;
  value: string;
  /** Colors the value; thresholds are the caller's job. */
  tone?: OpsStatTileTone;
  /** Optional icon rendered to the right of the label. */
  icon?: LucideIcon;
  iconClassName?: string;
  /** Optional context line under the value — real detail only, no filler. */
  sub?: string;
  /** "md" for panel KPIs (large value), "sm" for compact total strips. */
  size?: "sm" | "md";
}) {
  if (size === "sm") {
    return (
      <div className="rounded-md border border-border px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </p>
        <p className={`mt-0.5 text-sm font-bold ${valueClass(tone)}`}>{value}</p>
      </div>
    );
  }

  return (
    <article className="rounded-md border border-border p-4">
      <p className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
        {Icon ? <Icon className={`size-3.5 ${iconClassName}`} aria-hidden="true" /> : null}
      </p>
      <p className={`mt-1 font-heading text-2xl font-bold ${valueClass(tone)}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </article>
  );
}
