import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { OPS_FOCUS_CLASS } from "@/lib/ops/ui";

type OpsDashboardPanelProps = {
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  description?: string;
  eyebrow?: string;
  href?: string;
  title: string;
};

export function OpsDashboardPanel({
  actions,
  children,
  className = "",
  description,
  eyebrow,
  href,
  title,
}: OpsDashboardPanelProps) {
  const heading = (
    <>
      {eyebrow ? (
        <p className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          <span>{eyebrow}</span>
        </p>
      ) : null}
      <CardTitle className="mt-1 text-xl font-semibold text-foreground">{title}</CardTitle>
      {description ? (
        <CardDescription className="mt-1 max-w-2xl leading-6">{description}</CardDescription>
      ) : null}
    </>
  );

  return (
    <Card className={cn("py-0 shadow-sm shadow-foreground/[0.03]", className)}>
      <CardHeader className="flex flex-col gap-3 p-5 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
        <div className="min-w-0">
          {href ? (
            <a className={`block rounded-md ${OPS_FOCUS_CLASS}`} href={href}>
              {heading}
            </a>
          ) : (
            heading
          )}
        </div>
        {actions ? <CardAction className="relative col-auto row-auto flex flex-wrap items-center gap-2 self-auto justify-self-auto">{actions}</CardAction> : null}
      </CardHeader>
      <CardContent className="px-5 pb-5">{children}</CardContent>
    </Card>
  );
}
