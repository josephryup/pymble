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
  /**
   * Marks a primary panel: adds a thin brand accent bar along the top so it
   * outranks neighbouring secondary panels in the visual hierarchy.
   */
  accent?: boolean;
  children: React.ReactNode;
  className?: string;
  /** "compact" trims header/content padding for dense, data-heavy panels. */
  density?: "default" | "compact";
  description?: string;
  eyebrow?: string;
  href?: string;
  title: string;
};

export function OpsDashboardPanel({
  actions,
  accent = false,
  children,
  className = "",
  density = "default",
  description,
  eyebrow,
  href,
  title,
}: OpsDashboardPanelProps) {
  const compact = density === "compact";
  const headerPad = compact ? "p-4" : "p-5";
  const contentPad = compact ? "px-4 pb-4" : "px-5 pb-5";

  const heading = (
    <>
      {eyebrow ? (
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
          <span>{eyebrow}</span>
        </p>
      ) : null}
      <CardTitle className="mt-1.5 text-xl font-bold tracking-tight text-foreground">
        {title}
      </CardTitle>
      {description ? (
        <CardDescription className="mt-1 max-w-2xl leading-6">{description}</CardDescription>
      ) : null}
    </>
  );

  return (
    <Card
      className={cn(
        "relative overflow-hidden py-0 shadow-sm shadow-foreground/[0.03]",
        className,
      )}
    >
      {accent ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/70 to-accent-orange/70"
        />
      ) : null}
      <CardHeader
        className={cn(
          "flex flex-col gap-3 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between",
          headerPad,
        )}
      >
        <div className="min-w-0">
          {href ? (
            <a className={`block rounded-md ${OPS_FOCUS_CLASS}`} href={href}>
              {heading}
            </a>
          ) : (
            heading
          )}
        </div>
        {actions ? (
          <CardAction className="relative col-auto row-auto flex flex-wrap items-center gap-2 self-auto justify-self-auto">
            {actions}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className={contentPad}>{children}</CardContent>
    </Card>
  );
}
