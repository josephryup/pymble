import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { OPS_PRIMARY_BUTTON_CLASS, OPS_SECONDARY_BUTTON_CLASS } from "@/lib/ops/ui";

type OpsEmptyStateAction = {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
};

type OpsEmptyStateProps = {
  /** Lucide icon shown above the title. */
  icon: LucideIcon;
  /** Short headline. Says what's empty, not "No data". */
  title: string;
  /**
   * Body paragraph. Explain *why* the list is empty in a way that doesn't
   * imply the system is broken — e.g. "You're caught up." or "Material
   * requests appear here once a site engineer raises one."
   */
  description: string;
  /** Optional action(s) the user can take. First is rendered as primary CTA. */
  actions?: OpsEmptyStateAction[];
  /**
   * Optional smaller "tip" line below the actions, e.g. "If you expected to
   * see something here, check that you have the right department selected."
   */
  tip?: string;
};

/**
 * Reusable empty state. Designed so every listing page can show a
 * recognisable "no records" panel with consistent voice, a concrete reason,
 * and a clear next action — not just "No data available".
 */
export function OpsEmptyState({
  icon: Icon,
  title,
  description,
  actions = [],
  tip,
}: OpsEmptyStateProps) {
  return (
    <div className="grid min-h-56 place-items-center px-6 py-12 text-center">
      <div className="max-w-md space-y-4">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-6" aria-hidden="true" />
        </div>
        <div>
          <h3 className="font-heading text-xl font-bold text-foreground">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {actions.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-2">
            {actions.map((action, index) => (
              <Link
                className={
                  (action.variant ?? (index === 0 ? "primary" : "secondary")) === "primary"
                    ? OPS_PRIMARY_BUTTON_CLASS
                    : OPS_SECONDARY_BUTTON_CLASS
                }
                href={action.href}
                key={action.href}
              >
                {action.label}
              </Link>
            ))}
          </div>
        ) : null}
        {tip ? (
          <p className="text-xs text-muted-foreground">{tip}</p>
        ) : null}
      </div>
    </div>
  );
}
