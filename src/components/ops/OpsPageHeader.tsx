import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { OPS_EYEBROW_CLASS } from "@/lib/ops/ui";

type OpsPageHeaderProps = {
  /**
   * Short uppercase label above the title (e.g. "Engineering to Procurement").
   * Optional — omit for cleaner header where the H1 alone is enough.
   */
  eyebrow?: string;
  /** Page title. */
  title: string;
  /**
   * Longer description shown in a hover tooltip (and on tap on touch screens).
   * Hidden by default — keeps the header compact while still explaining the
   * page on demand. Pass undefined to skip.
   */
  description?: string;
  /**
   * Optional action row on the right (buttons, links). Two patterns:
   * - Pass ReactNode for full layout control
   * - Or compose from buttons in the parent.
   */
  actions?: ReactNode;
};

/**
 * Compact, daily-driver-friendly page header. Replaces the
 * 200-300px tall "hero" pattern that previously sat at the top of every ops
 * page (UI/UX audit §1c).
 *
 * Layout:
 *  ┌─────────────────────────────────────────────────────────────────┐
 *  │  EYEBROW                                          [actions row] │
 *  │  Title text — info icon (tooltip with description)              │
 *  └─────────────────────────────────────────────────────────────────┘
 */
export function OpsPageHeader({ eyebrow, title, description, actions }: OpsPageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 border-b border-primary-dark/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className={OPS_EYEBROW_CLASS}>{eyebrow}</p> : null}
        <div className="mt-1 flex items-center gap-2">
          <h1 className="font-heading text-2xl font-bold text-primary-dark md:text-3xl">{title}</h1>
          {description ? (
            <span
              aria-label={description}
              className="group relative inline-flex"
              tabIndex={0}
            >
              <Info
                aria-hidden="true"
                className="size-4 text-primary-dark/40 transition hover:text-primary-blue"
              />
              <span
                className="invisible absolute left-1/2 top-full z-10 mt-2 w-72 -translate-x-1/2 rounded-md border border-primary-dark/10 bg-white px-3 py-2 text-xs leading-5 text-primary-dark/80 opacity-0 shadow-md shadow-primary-dark/10 transition group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100"
                role="tooltip"
              >
                {description}
              </span>
            </span>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
