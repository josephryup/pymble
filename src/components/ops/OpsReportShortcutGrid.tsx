import Link from "next/link";
import { ArrowUpRight, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OPS_FOCUS_CLASS } from "@/lib/ops/ui";

type OpsReportShortcut = {
  href: string;
  label: string;
};

type OpsReportShortcutGroup = {
  items: OpsReportShortcut[];
  title: string;
};

type OpsReportShortcutGridProps = {
  groups: OpsReportShortcutGroup[];
};

export function OpsReportShortcutGrid({ groups }: OpsReportShortcutGridProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {groups.map((group) => (
        <Card
          aria-label={group.title}
          className="py-0 shadow-sm shadow-foreground/[0.03]"
          key={group.title}
        >
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">{group.title}</CardTitle>
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                {group.items.length} linked record{group.items.length === 1 ? "" : "s"}
              </p>
            </div>
            <Badge className="size-8 rounded-lg p-0 text-muted-foreground" variant="secondary">
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-2 p-4">
            {group.items.map((item) => (
              <Link
                className={`group flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground/70 shadow-sm shadow-foreground/[0.02] transition hover:-translate-y-0.5 hover:border-primary/50 hover:text-primary hover:shadow-md ${OPS_FOCUS_CLASS}`}
                href={item.href}
                key={item.href}
              >
                {item.label}
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition group-hover:bg-primary group-hover:text-primary-foreground">
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
