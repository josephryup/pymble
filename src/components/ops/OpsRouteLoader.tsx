import { OpsBrandMark } from "@/components/ops/OpsBrandMark";
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
        className="ops-ui min-h-[50vh] bg-[#f6f7fb] p-4 text-primary-dark md:p-6"
        role="status"
      >
        <span className="sr-only">{label}</span>
        <div className="w-full max-w-none space-y-5">
          <Card className="py-0">
            <CardContent className="p-5 md:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-md border border-primary-dark/10 bg-white">
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
      className="ops-ui flex min-h-screen items-center justify-center bg-[#f6f7fb] p-6 text-primary-dark"
      role="status"
    >
      <Card className="w-full max-w-xs py-0 text-center shadow-sm shadow-primary-dark/5">
        <CardContent className="flex flex-col items-center gap-4 px-8 py-7">
        <span className="flex size-20 items-center justify-center rounded-lg border border-primary-dark/10 bg-white">
          <OpsBrandMark decorative className="h-16 w-16" sizes="64px" />
        </span>
        <span className="block">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
            Pymble Operations
          </span>
          <span className="mt-2 block text-sm font-semibold leading-6 text-primary-dark/65">
            {label}
          </span>
        </span>
        </CardContent>
      </Card>
    </div>
  );
}
