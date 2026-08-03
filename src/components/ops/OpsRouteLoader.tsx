import { OpsBrandMark } from "@/components/ops/OpsBrandMark";
import { OpsLoadingMark } from "@/components/ops/OpsLoadingMark";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type OpsRouteLoaderProps = {
  label?: string;
  variant?: "page" | "workspace";
};

export function OpsRouteLoader({
  label = "Loading Pymble operations...",
  variant = "page",
}: OpsRouteLoaderProps) {
  const isWorkspace = variant === "workspace";

  if (isWorkspace) {
    return (
      <div
        aria-live="polite"
        className="ops-ui relative min-h-[70vh] bg-muted p-4 text-foreground md:p-6"
        role="status"
      >
        <span className="sr-only">{label}</span>

        {/* The mark is the focus: large, centred, floating over a dimmed
            skeleton. The skeleton still shows the shape of what is coming, so
            the page does not appear to jump when content lands — but it is
            pushed back behind a scrim so the eye rests on the logo rather than
            on grey bars pretending to be data. */}
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex flex-col items-center gap-5 rounded-2xl bg-background/70 px-10 py-9 backdrop-blur-md">
            <OpsLoadingMark label={label} size="xl" />
            <div className="space-y-1.5 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-blue">
                Pymble Operations
              </p>
              <p className="text-sm font-semibold text-foreground/70">{label}</p>
            </div>
          </div>
        </div>

        {/* Scrim: keeps the skeleton legible as structure without competing
            with the mark for attention. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 bg-muted/50"
        />

        <div className="w-full max-w-none space-y-5 opacity-70">
          <Card className="py-0">
            <CardContent className="p-5 md:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-md border border-border bg-card">
                  <OpsBrandMark decorative className="h-9 w-9" sizes="36px" />
                </span>
                <div className="min-w-0 flex-1 space-y-3">
                  <Skeleton className="h-3 w-32 bg-primary/15" />
                  <Skeleton className="h-8 w-full max-w-sm" />
                  <Skeleton className="h-4 w-full max-w-xl" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-20 rounded-lg" />
                <Skeleton className="h-20 rounded-lg" />
              </div>
            </div>
            </CardContent>
          </Card>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {["one", "two", "three", "four"].map((key) => (
              <Skeleton className="h-32 rounded-xl bg-card ring-1 ring-border" key={key} />
            ))}
          </section>

          <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <Skeleton className="h-80 rounded-xl bg-card ring-1 ring-border" />
            <Skeleton className="h-80 rounded-xl bg-card ring-1 ring-border" />
          </section>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-live="polite"
      className="ops-ui flex min-h-dvh items-center justify-center bg-muted p-6 text-foreground"
      role="status"
    >
      {/* No card: at full-screen the mark IS the interface. A bordered box
          around it just draws a rectangle nobody needs to look at. */}
      <div className="flex flex-col items-center gap-6">
        <OpsLoadingMark label={label} size="xl" />
        <div className="space-y-1.5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-blue">
            Pymble Operations
          </p>
          <p className="text-sm font-semibold leading-6 text-foreground/70">{label}</p>
        </div>
      </div>
    </div>
  );
}
