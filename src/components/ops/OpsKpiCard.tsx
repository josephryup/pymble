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
    accent: "text-primary-blue",
    icon: "bg-primary-blue/10 text-primary-blue ring-primary-blue/10",
    surface: "bg-primary-blue/10 text-primary-blue",
  };
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

  return (
    <Link
      className={`group block rounded-xl ${OPS_FOCUS_CLASS}`}
      href={href}
    >
      <Card className="h-full py-0 shadow-sm shadow-primary-dark/[0.03] transition group-hover:-translate-y-0.5 group-hover:border-primary/50 group-hover:shadow-md">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <p className="mt-2 truncate font-heading text-3xl font-semibold text-foreground">
                {value}
              </p>
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
                {tone === "good" ? (
                  <TrendingUp className="size-3.5" aria-hidden="true" />
                ) : tone === "warn" ? (
                  <TrendingDown className="size-3.5" aria-hidden="true" />
                ) : (
                  <Minus className="size-3.5" aria-hidden="true" />
                )}
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
