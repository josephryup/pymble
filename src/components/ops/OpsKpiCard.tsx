import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { OPS_FOCUS_CLASS } from "@/lib/ops/ui";

type OpsKpiTone = "default" | "good" | "warn" | "critical";

type OpsKpiCardProps = {
  href: string;
  icon: LucideIcon;
  label: string;
  tone?: OpsKpiTone;
  trend?: string;
  value: string;
  trendDirection?: "up" | "down" | "flat";
  /**
   * Short, factual context line under the value — e.g. "3 over SLA",
   * "ZMW 1.2M overdue". Replaces the previous decorative (synthetic) sparkline
   * so the card only ever shows real signal.
   */
  hint?: string;
  /** Call-to-action label (defaults to "View"). */
  cta?: string;
};

function toneClasses(tone: OpsKpiTone) {
  if (tone === "good") {
    return {
      accent: "text-emerald-700",
      bar: "bg-emerald-500",
      icon: "bg-emerald-50 text-emerald-700 ring-emerald-100",
      surface: "bg-emerald-50 text-emerald-700",
    };
  }

  if (tone === "warn") {
    return {
      accent: "text-orange-700",
      bar: "bg-orange-400",
      icon: "bg-orange-50 text-orange-700 ring-orange-100",
      surface: "bg-orange-50 text-orange-700",
    };
  }

  if (tone === "critical") {
    return {
      accent: "text-red-700",
      bar: "bg-red-500",
      icon: "bg-red-50 text-red-700 ring-red-100",
      surface: "bg-red-50 text-red-700",
    };
  }

  return {
    accent: "text-primary",
    bar: "bg-primary",
    icon: "bg-primary/10 text-primary ring-primary/10",
    surface: "bg-primary/10 text-primary",
  };
}

export function OpsKpiCard({
  href,
  icon: Icon,
  label,
  tone = "default",
  trend,
  value,
  trendDirection,
  hint,
  cta = "View",
}: OpsKpiCardProps) {
  const classes = toneClasses(tone);

  const TrendIcon =
    trendDirection === "up"
      ? TrendingUp
      : trendDirection === "down"
        ? TrendingDown
        : trendDirection === "flat"
          ? Minus
          : tone === "good"
            ? TrendingUp
            : tone === "warn" || tone === "critical"
              ? TrendingDown
              : Minus;

  return (
    <Link
      className={`group block rounded-xl ${OPS_FOCUS_CLASS}`}
      href={href}
    >
      <Card className="relative h-full overflow-hidden py-0 shadow-sm shadow-foreground/[0.03] transition group-hover:-translate-y-0.5 group-hover:border-primary/50 group-hover:shadow-md">
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 w-1 ${classes.bar}`}
        />
        <CardContent className="p-4 pl-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <p className="mt-2 truncate font-heading text-3xl font-semibold tabular-nums text-foreground">
                {value}
              </p>
              {hint ? (
                <p className={`mt-1 truncate text-xs font-semibold ${classes.accent}`}>{hint}</p>
              ) : null}
            </div>
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ${classes.icon}`}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            {trend ? (
              <Badge
                className={`h-auto w-fit px-2.5 py-1 text-xs font-semibold ${classes.surface}`}
                variant="secondary"
              >
                <TrendIcon className="size-3.5" aria-hidden="true" />
                {trend}
              </Badge>
            ) : (
              <span aria-hidden="true" />
            )}
            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${classes.accent}`}>
              {cta}
              <ArrowUpRight className="size-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
