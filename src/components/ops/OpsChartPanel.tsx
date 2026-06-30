import { ArrowUpRight, BarChart3 } from "lucide-react";
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

function toneColor(tone: OpsChartDatum["tone"]) {
  if (tone === "warn") {
    return "bg-orange-500";
  }
  if (tone === "good") {
    return "bg-emerald-500";
  }
  return "bg-primary";
}

function formatValue(value: number) {
  return value.toLocaleString("en-ZM");
}

export function OpsChartPanel({ data, description, title }: OpsChartPanelProps) {
  const safeData = data.length > 0 ? data : [];
  const total = safeData.reduce((sum, item) => sum + Math.max(item.value, 0), 0);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3">
        <CardHeader className="p-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Operational analytics
          </p>
          <CardTitle className="mt-1 text-pretty text-xl font-semibold text-foreground">
            {title}
          </CardTitle>
          {description ? (
            <CardDescription className="mt-1 max-w-2xl leading-6 text-muted-foreground">
              {description}
            </CardDescription>
          ) : null}
        </CardHeader>
      </div>

      <Card className="py-0 shadow-sm shadow-foreground/[0.03]">
        <CardContent className="grid gap-6 p-5 sm:p-6">
          {safeData.length > 0 ? (
            <div className="space-y-4">
              {safeData.map((item) => {
                const share = total > 0 ? Math.round((Math.max(item.value, 0) / total) * 100) : 0;
                const barColor = toneColor(item.tone);

                return (
                  <div key={item.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-foreground">{item.label}</span>
                      <span className="font-bold text-foreground">
                        {formatValue(item.value)}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({share}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", barColor)}
                        style={{ width: `${Math.max(1, share)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-36 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <BarChart3 className="size-8 opacity-40" />
              <p className="text-sm font-semibold">No operational data captured</p>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-xs font-medium text-muted-foreground">
              Total aggregated volume: <span className="font-bold text-foreground">{formatValue(total)}</span>
            </span>
            <a
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs font-bold text-primary hover:text-primary/80")}
              href="#ops-overview-shortcuts"
            >
              Open related records
              <ArrowUpRight className="ml-1 size-3.5" aria-hidden="true" />
            </a>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
