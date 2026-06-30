import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { OPS_FOCUS_CLASS } from "@/lib/ops/ui";

type OpsKpiCardProps = {
  href: string;
  icon: LucideIcon;
  label: string;
  tone?: "default" | "good" | "warn";
  trend?: string;
  value: string;
  trendDirection?: "up" | "down" | "flat";
  sparklineData?: number[];
};

function toneClasses(tone: OpsKpiCardProps["tone"]) {
  if (tone === "good") {
    return {
      accent: "text-emerald-700",
      icon: "bg-emerald-50 text-emerald-700 ring-emerald-100",
      surface: "bg-emerald-50 text-emerald-700",
    };
  }

  if (tone === "warn") {
    return {
      accent: "text-orange-700",
      icon: "bg-orange-50 text-orange-700 ring-orange-100",
      surface: "bg-orange-50 text-orange-700",
    };
  }

  return {
    accent: "text-primary",
    icon: "bg-primary/10 text-primary ring-primary/10",
    surface: "bg-primary/10 text-primary",
  };
}

function Sparkline({ data, tone }: { data: number[]; tone: OpsKpiCardProps["tone"] }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min === 0 ? 1 : max - min;
  const width = 64;
  const height = 20;
  const padding = 2;

  const points = data
    .map((val, index) => {
      const x = (index / (data.length - 1)) * (width - padding * 2) + padding;
      const y = height - padding - ((val - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  const color =
    tone === "good"
      ? "var(--color-chart-2, #10b981)"
      : tone === "warn"
        ? "var(--color-chart-4, #ef4444)"
        : "var(--color-primary, #2235dd)";

  return (
    <svg className="overflow-visible" height={height} width={width}>
      <polyline
        fill="none"
        points={points}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </svg>
  );
}

export function OpsKpiCard({
  href,
  icon: Icon,
  label,
  tone = "default",
  trend,
  value,
  trendDirection,
  sparklineData,
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
            : tone === "warn"
              ? TrendingDown
              : Minus;

  return (
    <Link
      className={`group block rounded-xl ${OPS_FOCUS_CLASS}`}
      href={href}
    >
      <Card className="h-full py-0 shadow-sm shadow-foreground/[0.03] transition group-hover:-translate-y-0.5 group-hover:border-primary/50 group-hover:shadow-md">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <div className="mt-2 flex items-center gap-3">
                <p className="truncate font-heading text-3xl font-semibold text-foreground">
                  {value}
                </p>
                {sparklineData && sparklineData.length >= 2 ? (
                  <div className="shrink-0" aria-hidden="true">
                    <Sparkline data={sparklineData} tone={tone} />
                  </div>
                ) : null}
              </div>
            </div>
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ${classes.icon}`}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
          </div>

          {trend ? (
            <div className="mt-3 flex items-center justify-between gap-3">
              <Badge
                className={`h-auto w-fit px-2.5 py-1 text-xs font-semibold ${classes.surface}`}
                variant="secondary"
              >
                <TrendIcon className="size-3.5" aria-hidden="true" />
                {trend}
              </Badge>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold ${classes.accent}`}>
                Open
                <ArrowUpRight className="size-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
              </span>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-end">
              <span className={`inline-flex items-center gap-1 text-xs font-semibold ${classes.accent}`}>
                Open
                <ArrowUpRight className="size-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
