import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
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
};

function toneClasses(tone: OpsKpiCardProps["tone"]) {
  if (tone === "good") {
    return {
      accent: "text-emerald-700",
      icon: "bg-emerald-50 text-emerald-700 ring-emerald-100",
      line: "#059669",
      surface: "bg-emerald-50 text-emerald-700",
    };
  }

  if (tone === "warn") {
    return {
      accent: "text-orange-700",
      icon: "bg-orange-50 text-orange-700 ring-orange-100",
      line: "#ea580c",
      surface: "bg-orange-50 text-orange-700",
    };
  }

  return {
    accent: "text-primary-blue",
    icon: "bg-primary-blue/10 text-primary-blue ring-primary-blue/10",
    line: "#2939e8",
    surface: "bg-primary-blue/10 text-primary-blue",
  };
}

function sparklinePoints(label: string, value: string) {
  const seed = [...`${label}${value}`].reduce((total, char) => total + char.charCodeAt(0), 0);
  const values = Array.from({ length: 10 }, (_, index) => {
    const wave = Math.sin((seed + index * 23) / 17) * 16;
    const drift = index * 3;
    return Math.max(18, Math.min(86, 46 + wave + drift));
  });
  const width = 116;
  const height = 44;

  return values.map((item, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - (item / 100) * height;

    return [x, y] as const;
  });
}

function linePath(points: Array<readonly [number, number]>) {
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
}

function areaPath(points: Array<readonly [number, number]>) {
  const last = points[points.length - 1];
  const first = points[0];

  if (!first || !last) {
    return "";
  }

  return `${linePath(points)} L${last[0].toFixed(1)} 44 L${first[0].toFixed(1)} 44 Z`;
}

export function OpsKpiCard({
  href,
  icon: Icon,
  label,
  tone = "default",
  trend,
  value,
}: OpsKpiCardProps) {
  const classes = toneClasses(tone);
  const points = sparklinePoints(label, value);
  const TrendIcon = tone === "warn" ? TrendingDown : TrendingUp;

  return (
    <Link
      className={`group block rounded-xl ${OPS_FOCUS_CLASS}`}
      href={href}
    >
      <Card className="h-full py-0 shadow-sm shadow-primary-dark/[0.03] transition group-hover:-translate-y-0.5 group-hover:border-primary/50 group-hover:shadow-md">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <p className="mt-2 truncate font-heading text-3xl font-semibold text-foreground">
                {value}
              </p>
            </div>
            <span
              className={`flex size-11 shrink-0 items-center justify-center rounded-lg ring-1 ${classes.icon}`}
            >
              <Icon className="size-5" aria-hidden="true" />
            </span>
          </div>

          <div className="mt-5 grid grid-cols-[1fr_auto] items-end gap-4">
            <Badge
              className={`h-auto w-fit px-2.5 py-1 text-xs font-semibold ${classes.surface}`}
              variant="secondary"
            >
              <TrendIcon className="size-3.5" aria-hidden="true" />
              {trend ?? "Live signal"}
            </Badge>
            <svg
              aria-hidden="true"
              className="h-12 w-28 overflow-visible"
              preserveAspectRatio="none"
              viewBox="0 0 116 44"
            >
              <path d={areaPath(points)} fill={classes.line} opacity="0.08" />
              <path
                d={linePath(points)}
                fill="none"
                stroke={classes.line}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
              />
              {points.map(([x, y], index) => (
                <circle
                  cx={x}
                  cy={y}
                  fill={index === points.length - 1 ? classes.line : "white"}
                  key={`${label}-${index}`}
                  r={index === points.length - 1 ? 3.5 : 2}
                  stroke={classes.line}
                  strokeWidth="1.5"
                />
              ))}
            </svg>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <span className="text-xs font-medium text-muted-foreground">Live workspace metric</span>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${classes.accent}`}>
              Open
              <ArrowUpRight className="size-3.5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
