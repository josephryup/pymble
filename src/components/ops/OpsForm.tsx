import type { ReactNode } from "react";
import { OPS_FORM_GRID_CLASS, OPS_LABEL_CLASS } from "@/lib/ops/ui";

/**
 * Form layout primitives.
 *
 * Before these, every form in the workspace retyped its own grid — 93 dense
 * grids across 43 files, each picking its own column count and breakpoints, and
 * none of them setting `min-w-0` on the field wrapper (2026-08-10 UI/UX audit
 * §2). The result was fields overflowing their section on some widths and a
 * different density on every page.
 *
 * These are deliberately thin: a grid that decides its own column count from
 * the space available, and a field that is a <label> with a caption and an
 * optional hint. Anything more opinionated would not survive contact with the
 * forms that need a span, a nested fieldset, or a custom control.
 */

type OpsFormGridProps = {
  children: ReactNode;
  className?: string;
};

/** The standard field grid. Fits as many ~14rem columns as the width allows. */
export function OpsFormGrid({ children, className }: OpsFormGridProps) {
  return (
    <div className={className ? `${OPS_FORM_GRID_CLASS} ${className}` : OPS_FORM_GRID_CLASS}>
      {children}
    </div>
  );
}

type OpsFieldProps = {
  children: ReactNode;
  className?: string;
  /** Help text under the control. Prefer this to a placeholder. */
  hint?: ReactNode;
  label: ReactNode;
  /** Tracks to span, for the fields that genuinely need the room. */
  span?: 2 | 3;
};

const SPAN_CLASS: Record<2 | 3, string> = {
  2: "sm:col-span-2",
  3: "sm:col-span-2 xl:col-span-3",
};

/**
 * One labelled control. Wrapping the control in the <label> is what associates
 * them, so no htmlFor/id pair has to be invented per field.
 */
export function OpsField({ children, className, hint, label, span }: OpsFieldProps) {
  const classes = [OPS_LABEL_CLASS, span ? SPAN_CLASS[span] : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={classes}>
      {label}
      {children}
      {hint ? (
        <span className="mt-1 block text-xs font-normal text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}
