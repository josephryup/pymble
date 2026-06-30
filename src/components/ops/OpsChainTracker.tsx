import { Check, X } from "lucide-react";
import Link from "next/link";

export type OpsChainStepState = "done" | "current" | "pending" | "rejected";

export type OpsChainStep = {
  key: string;
  label: string;
  state: OpsChainStepState;
  caption?: string | null;
  href?: string | null;
};

function dotClass(state: OpsChainStepState) {
  switch (state) {
    case "done":
      return "bg-emerald-500 text-white";
    case "current":
      return "bg-primary-blue text-white ring-4 ring-primary-blue/15";
    case "rejected":
      return "bg-red-500 text-white";
    default:
      return "border border-border bg-card text-muted-foreground";
  }
}

function labelClass(state: OpsChainStepState) {
  if (state === "pending") {
    return "text-muted-foreground";
  }
  if (state === "rejected") {
    return "text-red-700";
  }
  return "text-foreground";
}

/**
 * Generic horizontal (desktop) / vertical (mobile) stage tracker used to show a
 * record's position in a cross-module workflow chain.
 */
export function OpsChainTracker({
  steps,
  title = "Workflow progress",
}: {
  steps: OpsChainStep[];
  title?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </p>
      <ol className="mt-3 grid gap-3 sm:grid-flow-col sm:auto-cols-fr">
        {steps.map((step) => {
          const content = (
            <>
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full ${dotClass(step.state)}`}
                aria-hidden="true"
              >
                {step.state === "done" ? (
                  <Check className="size-3.5" />
                ) : step.state === "rejected" ? (
                  <X className="size-3.5" />
                ) : (
                  <span className="size-2 rounded-full bg-current" />
                )}
              </span>
              <span className="min-w-0 sm:mt-2">
                <span className={`block text-sm font-bold ${labelClass(step.state)}`}>
                  {step.label}
                </span>
                {step.caption ? (
                  <span className="mt-0.5 block text-xs font-medium text-muted-foreground">
                    {step.caption}
                  </span>
                ) : null}
              </span>
            </>
          );

          return (
            <li
              className="flex items-start gap-2.5 sm:flex-col sm:items-center sm:gap-0 sm:text-center"
              key={step.key}
            >
              {step.href ? (
                <Link
                  className="flex items-start gap-2.5 rounded-md transition hover:opacity-80 sm:flex-col sm:items-center sm:gap-0"
                  href={step.href}
                >
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
