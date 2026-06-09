"use client";

import { useId } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight } from "lucide-react";
import { Area, AreaChart, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

type OpsChartDatum = {
  label: string;
  tone?: "default" | "good" | "warn";
  value: number;
};

type OpsChartPanelProps = {
  data: OpsChartDatum[];
  description?: string;
  title: string;
};

type SparklineDatum = {
  period: string;
  value: number;
};

function toneMeta(tone: OpsChartDatum["tone"]) {
  if (tone === "warn") {
    return {
      badge: "bg-red-50 text-red-700",
      border: "hover:border-red-200",
      icon: ArrowDown,
      label: "watch",
      line: "#ef4444",
      text: "text-red-600",
    };
  }

  if (tone === "default") {
    return {
      badge: "bg-indigo-50 text-indigo-700",
      border: "hover:border-indigo-200",
      icon: ArrowUp,
      label: "share",
      line: "#2939e8",
      text: "text-indigo-700",
    };
  }

  return {
    badge: "bg-emerald-50 text-emerald-700",
    border: "hover:border-emerald-200",
    icon: ArrowUp,
    label: "share",
    line: "#22c55e",
    text: "text-emerald-700",
  };
}

function buildSparklineData(item: OpsChartDatum, index: number): SparklineDatum[] {
  const base = Math.max(item.value, 1);
  const direction = item.tone === "warn" ? -1 : 1;
  const seed = [...item.label].reduce((total, char) => total + char.charCodeAt(0), index * 11);

  return Array.from({ length: 12 }, (_, pointIndex) => {
    const wave = Math.sin((seed + pointIndex * 19) / 12) * 5;
    const slope = direction * pointIndex * 1.8;
    const value = Math.max(4, Math.round(18 + Math.min(base, 24) + wave + slope));

    return {
      period: `P${pointIndex + 1}`,
      value,
    };
  });
}

function formatValue(value: number) {
  return value.toLocaleString("en-ZM");
}

function metricShare(value: number, total: number) {
  if (total <= 0 || value <= 0) {
    return 0;
  }

  return Math.max(1, Math.round((value / total) * 100));
}

function MetricSparkCard({
  item,
  points,
  share,
}: {
  item: OpsChartDatum;
  points: SparklineDatum[];
  share: number;
}) {
  const gradientId = `ops-sparkline-${useId().replaceAll(":", "")}`;
  const meta = toneMeta(item.tone);
  const TrendIcon = meta.icon;
  const chartConfig = {
    value: {
      label: item.label,
      color: meta.line,
    },
  } satisfies ChartConfig;

  return (
    <Card className={`py-0 shadow-sm shadow-primary-dark/[0.04] transition hover:-translate-y-0.5 hover:shadow-md ${meta.border}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-heading text-lg font-semibold text-foreground">{item.label}</h3>
            <p className="mt-6 font-heading text-4xl font-semibold tracking-normal text-foreground">
              {formatValue(item.value)}
            </p>
          </div>
          <Badge className={`h-auto px-2.5 py-1 text-xs font-semibold ${meta.badge}`} variant="secondary">
            Live
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_9rem] items-end gap-4">
          <div>
            <p className={`inline-flex items-center gap-1 text-sm font-semibold ${meta.text}`}>
              <TrendIcon className="size-4" aria-hidden="true" />
              {share}%
            </p>
            <p className="mt-1 text-sm font-medium text-muted-foreground">of current {meta.label}</p>
          </div>

          <ChartContainer
            className="aspect-auto h-20 min-w-0"
            config={chartConfig}
          >
            <AreaChart
              accessibilityLayer
              data={points}
              margin={{ bottom: 4, left: 0, right: 0, top: 8 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="period" hide />
              <YAxis hide domain={["dataMin - 4", "dataMax + 4"]} />
              <ChartTooltip
                content={<ChartTooltipContent hideIndicator hideLabel />}
                cursor={false}
              />
              <Area
                dataKey="value"
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
                stroke="var(--color-value)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                type="monotone"
              />
            </AreaChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function OpsChartPanel({ data, description, title }: OpsChartPanelProps) {
  const safeData = data.length > 0 ? data : [{ label: "No data", value: 0 }];
  const total = safeData.reduce((sum, item) => sum + Math.max(item.value, 0), 0);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 min-[640px]:flex-row min-[640px]:items-end min-[640px]:justify-between">
        <CardHeader className="p-0">
          <p className="text-sm font-medium text-muted-foreground">Operational analytics</p>
          <CardTitle className="mt-1 text-xl font-semibold text-foreground">{title}</CardTitle>
          {description ? (
            <CardDescription className="mt-1 max-w-2xl leading-6">{description}</CardDescription>
          ) : null}
        </CardHeader>
        <a
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-fit")}
          href="#ops-overview-shortcuts"
        >
          Open related records
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </a>
      </div>

      <div className="grid gap-4 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-3">
        {safeData.map((item, index) => (
          <MetricSparkCard
            item={item}
            key={item.label}
            points={buildSparklineData(item, index)}
            share={metricShare(item.value, total)}
          />
        ))}
      </div>
    </section>
  );
}
