"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/**
 * Shared recharts primitives for ops dashboards. Server pages fetch and
 * aggregate; these client leaves only render. Three rules baked in:
 *
 * 1. Real data only — an empty series renders an explicit empty panel, never
 *    an axis-only chart.
 * 2. Zero means zero — no `Math.max(1, pct)` slivers like the old div-bars.
 * 3. One palette — colors come from OPS_CHART_COLORS so every dashboard
 *    agrees with the KPI-tile tones.
 */

export const OPS_CHART_COLORS = {
  blue: "#2563eb",
  emerald: "#059669",
  red: "#dc2626",
  amber: "#d97706",
  orange: "#ea580c",
  violet: "#7c3aed",
  slate: "#64748b",
} as const;

export type OpsChartValueKind = "count" | "zmw" | "percent";

function compactValue(value: number, kind: OpsChartValueKind) {
  if (kind === "percent") return `${Math.round(value)}%`;
  const abs = Math.abs(value);
  const prefix = kind === "zmw" ? "K " : "";
  if (abs >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${prefix}${Math.round(value / 1_000)}k`;
  return `${prefix}${Math.round(value)}`;
}

function tooltipValue(value: unknown, kind: OpsChartValueKind) {
  const numeric = Number(value ?? 0);
  if (kind === "percent") return `${numeric.toLocaleString("en-ZM", { maximumFractionDigits: 1 })}%`;
  const formatted = numeric.toLocaleString("en-ZM", { maximumFractionDigits: 0 });
  return kind === "zmw" ? `K ${formatted}` : formatted;
}

function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <BarChart3 className="size-8 opacity-40" aria-hidden="true" />
      <p className="text-sm font-semibold">{message}</p>
    </div>
  );
}

export type OpsTrendSeries = {
  /** Data key on each point. */
  key: string;
  label: string;
  /** One of OPS_CHART_COLORS (or any CSS color). */
  color: string;
  /** How this series renders. Defaults to "line". */
  kind?: "line" | "area" | "bar";
};

export type OpsTrendPoint = { label: string } & Record<string, string | number>;

/**
 * Time-series chart (bars, lines and areas can be mixed). `label` on each
 * point is the x-axis tick — pass pre-formatted short labels ("Mar", "W12").
 */
export function OpsTrendChart({
  points,
  series,
  valueKind = "count",
  className = "h-56 w-full sm:h-64",
  ariaLabel,
  emptyMessage = "No data captured yet",
}: {
  points: OpsTrendPoint[];
  series: OpsTrendSeries[];
  valueKind?: OpsChartValueKind;
  className?: string;
  ariaLabel: string;
  emptyMessage?: string;
}) {
  if (points.length === 0) {
    return <ChartEmptyState message={emptyMessage} />;
  }

  const config = Object.fromEntries(
    series.map((entry) => [entry.key, { label: entry.label, color: entry.color }]),
  ) satisfies ChartConfig;

  return (
    <div aria-label={ariaLabel} role="img">
      <ChartContainer className={className} config={config}>
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis
            tickFormatter={(value: number) => compactValue(value, valueKind)}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <ChartTooltip
            content={<ChartTooltipContent formatter={(value) => tooltipValue(value, valueKind)} />}
          />
          {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
          {series.map((entry) => {
            if (entry.kind === "bar") {
              return (
                <Bar
                  dataKey={entry.key}
                  fill={`var(--color-${entry.key})`}
                  key={entry.key}
                  maxBarSize={36}
                  radius={[4, 4, 0, 0]}
                />
              );
            }
            if (entry.kind === "area") {
              return (
                <Area
                  dataKey={entry.key}
                  fill={`var(--color-${entry.key})`}
                  fillOpacity={0.15}
                  key={entry.key}
                  stroke={`var(--color-${entry.key})`}
                  strokeWidth={2.5}
                  type="monotone"
                />
              );
            }
            return (
              <Line
                dataKey={entry.key}
                dot={{ r: 3 }}
                key={entry.key}
                stroke={`var(--color-${entry.key})`}
                strokeWidth={2.5}
                type="monotone"
              />
            );
          })}
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}

export type OpsBreakdownItem = {
  label: string;
  value: number;
  /** One of OPS_CHART_COLORS (or any CSS color). Defaults to blue. */
  color?: string;
};

/**
 * Horizontal category bars — replaces the hand-rolled
 * `style={{ width: pct }}` div-bar pattern. Zero values render as zero.
 */
export function OpsBreakdownBar({
  items,
  valueKind = "count",
  className,
  ariaLabel,
  emptyMessage = "No data captured yet",
}: {
  items: OpsBreakdownItem[];
  valueKind?: OpsChartValueKind;
  className?: string;
  ariaLabel: string;
  emptyMessage?: string;
}) {
  if (items.length === 0 || items.every((item) => item.value === 0)) {
    return <ChartEmptyState message={emptyMessage} />;
  }

  // ~2.25rem per row keeps bars readable however many categories arrive.
  const height = Math.max(items.length * 36 + 16, 112);
  const labelWidth = Math.min(
    Math.max(...items.map((item) => item.label.length)) * 7 + 16,
    160,
  );

  return (
    <div aria-label={ariaLabel} role="img">
      <ChartContainer
        className={className ?? "w-full"}
        config={{ value: { label: "Value" } } satisfies ChartConfig}
        style={{ height }}
      >
        <BarChart
          data={items}
          layout="vertical"
          margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis
            axisLine={false}
            tickFormatter={(value: number) => compactValue(value, valueKind)}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            dataKey="label"
            tickLine={false}
            type="category"
            width={labelWidth}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => tooltipValue(value, valueKind)}
                hideLabel={false}
                nameKey="label"
              />
            }
          />
          <Bar dataKey="value" maxBarSize={22} radius={[0, 4, 4, 0]}>
            {items.map((item) => (
              <Cell fill={item.color ?? OPS_CHART_COLORS.blue} key={item.label} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/**
 * Status/priority distribution donut with an HTML legend (screen-reader
 * friendly and avoids recharts legend/config gymnastics for per-slice colors).
 */
export function OpsStatusDonut({
  items,
  valueKind = "count",
  ariaLabel,
  emptyMessage = "No data captured yet",
}: {
  items: OpsBreakdownItem[];
  valueKind?: OpsChartValueKind;
  ariaLabel: string;
  emptyMessage?: string;
}) {
  const populated = items.filter((item) => item.value > 0);
  if (populated.length === 0) {
    return <ChartEmptyState message={emptyMessage} />;
  }

  const total = populated.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div aria-label={ariaLabel} className="relative" role="img">
        <ChartContainer
          className="aspect-square h-44"
          config={{ value: { label: "Value" } } satisfies ChartConfig}
        >
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => tooltipValue(value, valueKind)}
                  nameKey="label"
                />
              }
            />
            <Pie
              data={populated}
              dataKey="value"
              innerRadius={52}
              nameKey="label"
              outerRadius={80}
              paddingAngle={2}
              strokeWidth={0}
            >
              {populated.map((item) => (
                <Cell fill={item.color ?? OPS_CHART_COLORS.blue} key={item.label} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <p className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-heading text-2xl font-bold tabular-nums text-foreground">
            {compactValue(total, valueKind)}
          </span>
          <span className="text-xs font-medium text-muted-foreground">Total</span>
        </p>
      </div>
      <ul className="min-w-40 flex-1 space-y-1.5">
        {items.map((item) => (
          <li className="flex items-center justify-between gap-3 text-sm" key={item.label}>
            <span className="flex items-center gap-2 text-muted-foreground">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color ?? OPS_CHART_COLORS.blue }}
              />
              {item.label}
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {tooltipValue(item.value, valueKind)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
