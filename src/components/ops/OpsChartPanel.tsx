import { ArrowDown, ArrowUp, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

function toneMeta(tone: OpsChartDatum["tone"]) {
  if (tone === "warn") {
    return {
      badge: "bg-red-50 text-red-700",
      border: "hover:border-red-200",
      icon: ArrowDown,
      label: "watch",
      text: "text-red-600",
    };
  }

  if (tone === "default") {
    return {
      badge: "bg-indigo-50 text-indigo-700",
      border: "hover:border-indigo-200",
      icon: ArrowUp,
      label: "share",
      text: "text-indigo-700",
    };
  }

  return {
    badge: "bg-emerald-50 text-emerald-700",
    border: "hover:border-emerald-200",
    icon: ArrowUp,
    label: "share",
    text: "text-emerald-700",
  };
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

function MetricSummaryCard({
  item,
  share,
}: {
  item: OpsChartDatum;
  share: number;
}) {
  const meta = toneMeta(item.tone);
  const TrendIcon = meta.icon;

  return (
    <Card className={`py-0 shadow-sm shadow-primary-dark/[0.04] transition hover:-translate-y-0.5 hover:shadow-md ${meta.border}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-heading text-base font-semibold text-foreground">{item.label}</h3>
            <p className="mt-2 font-heading text-3xl font-semibold tracking-normal text-foreground">
              {formatValue(item.value)}
            </p>
          </div>
          <Badge className={`h-auto px-2.5 py-1 text-xs font-semibold ${meta.badge}`} variant="secondary">
            <TrendIcon className="size-3.5" aria-hidden="true" />
            {share}%
          </Badge>
        </div>
        <p className="mt-2 text-xs font-medium text-muted-foreground">
          {share}% of current {meta.label}
        </p>
      </CardContent>
    </Card>
  );
}

export function OpsChartPanel({ data, description, title }: OpsChartPanelProps) {
  const safeData = data.length > 0 ? data : [{ label: "No data", value: 0 }];
  const total = safeData.reduce((sum, item) => sum + Math.max(item.value, 0), 0);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3">
        <CardHeader className="p-0">
          <p className="text-sm font-medium text-muted-foreground">Operational analytics</p>
          <CardTitle className="mt-1 text-pretty text-xl font-semibold text-foreground">
            {title}
          </CardTitle>
          {description ? (
            <CardDescription className="mt-1 max-w-2xl leading-6">{description}</CardDescription>
          ) : null}
        </CardHeader>
        <a
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-fit shrink-0")}
          href="#ops-overview-shortcuts"
        >
          Open related records
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </a>
      </div>

      <div className="grid gap-4 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-3">
        {safeData.map((item) => (
          <MetricSummaryCard
            item={item}
            key={item.label}
            share={metricShare(item.value, total)}
          />
        ))}
      </div>
    </section>
  );
}
