"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatZmw } from "@/lib/ops/ui";

export type OpsCommercialFunnelStageView = {
  key: string;
  label: string;
  amount: number;
  pct: number;
};

export type OpsCommercialScurveView = {
  label: string;
  certified: number;
  cumulative: number;
};

const STAGE_COLORS: Record<string, string> = {
  claimed: "bg-primary-blue/25",
  certified: "bg-primary-blue/55",
  invoiced: "bg-emerald-500/70",
  paid: "bg-emerald-600",
};

/**
 * Revenue funnel — how much of what was claimed became certified, invoiced,
 * then paid. Rendered as proportional bars (not recharts) so the drop-off at
 * each stage reads instantly.
 */
export function OpsCommercialFunnel({ stages }: { stages: OpsCommercialFunnelStageView[] }) {
  return (
    <div className="space-y-3">
      {stages.map((stage, index) => {
        const previous = index > 0 ? stages[index - 1] : null;
        const dropoff =
          previous && previous.amount > 0
            ? Math.round(((previous.amount - stage.amount) / previous.amount) * 100)
            : 0;
        return (
          <div key={stage.key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-primary-dark">{stage.label}</span>
              <span className="font-bold tabular-nums text-primary-dark">
                {formatZmw(stage.amount)}{" "}
                <span className="text-xs font-normal text-primary-dark/50">({stage.pct}%)</span>
              </span>
            </div>
            <div className="h-3.5 w-full overflow-hidden rounded-full bg-primary-dark/8">
              <div
                className={`h-full rounded-full transition-all duration-500 ${STAGE_COLORS[stage.key] ?? "bg-primary-blue"}`}
                style={{ width: `${Math.max(stage.pct > 0 ? 2 : 0, stage.pct)}%` }}
              />
            </div>
            {previous && dropoff > 0 ? (
              <p className="text-[11px] font-semibold text-orange-600">
                −{dropoff}% vs {previous.label.toLowerCase()}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const SCURVE_CONFIG = {
  cumulative: { label: "Certified to date", color: "#2563eb" },
} satisfies ChartConfig;

function compactZmw(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

export function OpsCertifiedScurveChart({ points }: { points: OpsCommercialScurveView[] }) {
  return (
    <ChartContainer className="h-60 w-full" config={SCURVE_CONFIG}>
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="opsScurveFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickFormatter={compactZmw} tickLine={false} axisLine={false} width={52} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) =>
                `K ${Number(value ?? 0).toLocaleString("en-ZM", { maximumFractionDigits: 0 })}`
              }
            />
          }
        />
        <Area
          dataKey="cumulative"
          fill="url(#opsScurveFill)"
          stroke="var(--color-cumulative)"
          strokeWidth={2.5}
          type="monotone"
        />
      </AreaChart>
    </ChartContainer>
  );
}
