"use client";

import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/**
 * First real time-series charts in the workspace (recharts via the shadcn
 * wrapper). Server pages fetch the GL monthly points and hand them to these
 * client components.
 */

export type OpsGlTrendChartPoint = {
  label: string;
  income: number;
  expenses: number;
  net: number;
  cashBalance: number;
};

const REVENUE_COST_CONFIG = {
  income: { label: "Revenue", color: "#059669" },
  expenses: { label: "Expenses", color: "#dc2626" },
  net: { label: "Net", color: "#2563eb" },
} satisfies ChartConfig;

const CASH_CONFIG = {
  cashBalance: { label: "Cash balance", color: "#2563eb" },
} satisfies ChartConfig;

function compactZmw(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

function tooltipZmw(value: unknown) {
  const numeric = Number(value ?? 0);
  return `K ${numeric.toLocaleString("en-ZM", { maximumFractionDigits: 0 })}`;
}

export function OpsRevenueCostTrendChart({ points }: { points: OpsGlTrendChartPoint[] }) {
  return (
    <ChartContainer className="h-64 w-full" config={REVENUE_COST_CONFIG}>
      <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          tickFormatter={compactZmw}
          tickLine={false}
          axisLine={false}
          width={52}
        />
        <ChartTooltip content={<ChartTooltipContent formatter={(value) => tooltipZmw(value)} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        <Line
          dataKey="net"
          stroke="var(--color-net)"
          strokeWidth={2.5}
          dot={{ r: 3 }}
          type="monotone"
        />
      </ComposedChart>
    </ChartContainer>
  );
}

export function OpsCashBalanceTrendChart({ points }: { points: OpsGlTrendChartPoint[] }) {
  return (
    <ChartContainer className="h-56 w-full" config={CASH_CONFIG}>
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="opsCashFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickFormatter={compactZmw} tickLine={false} axisLine={false} width={52} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value) => tooltipZmw(value)} />} />
        <Area
          dataKey="cashBalance"
          fill="url(#opsCashFill)"
          stroke="var(--color-cashBalance)"
          strokeWidth={2.5}
          type="monotone"
        />
      </AreaChart>
    </ChartContainer>
  );
}
