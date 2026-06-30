export type OpsSearchParams = Record<string, string | string[] | undefined>;

export const OPS_FOCUS_CLASS =
  "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export const OPS_INPUT_CLASS =
  `mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground shadow-sm shadow-primary-dark/[0.02] transition-colors placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 ${OPS_FOCUS_CLASS}`;

export const OPS_LABEL_CLASS =
  "text-sm font-medium text-muted-foreground";

/**
 * Single source of truth for the uppercase "eyebrow" label that sits above
 * page and panel titles. Replaces the six divergent patterns previously found
 * across the workspace (UI/UX audit §3b).
 */
export const OPS_EYEBROW_CLASS =
  "text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue";

export const OPS_PRIMARY_BUTTON_CLASS =
  `inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/10 transition hover:bg-primary/88 disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 ${OPS_FOCUS_CLASS}`;

export const OPS_SECONDARY_BUTTON_CLASS =
  `inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm shadow-primary-dark/[0.02] transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 ${OPS_FOCUS_CLASS}`;

export const OPS_DANGER_BUTTON_CLASS =
  `inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-destructive/25 bg-background px-3 py-2 text-sm font-semibold text-destructive shadow-sm shadow-primary-dark/[0.02] transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 ${OPS_FOCUS_CLASS}`;

export const OPS_TABLE_SCROLL_CLASS =
  `overflow-x-auto ${OPS_FOCUS_CLASS}`;

/**
 * Shared data-table styling. Standardises the ~17 hand-rolled ops tables onto
 * semantic tokens (was a mix of `text-primary-dark/52`, `divide-primary-dark/10`),
 * with a sticky header, consistent column padding, hover rows, and right-aligned
 * numeric columns. Pair the table with <OpsTableShell> for the scroll container.
 */
export const OPS_TABLE_CLASS = "w-full border-collapse text-left text-sm";

export const OPS_THEAD_CLASS =
  "sticky top-0 z-10 bg-muted/70 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground backdrop-blur";

export const OPS_TH_CLASS = "whitespace-nowrap px-3 py-2.5 font-semibold";

export const OPS_TH_NUM_CLASS = `${OPS_TH_CLASS} text-right`;

export const OPS_TR_CLASS =
  "border-b border-border transition-colors last:border-0 hover:bg-muted/40";

export const OPS_TD_CLASS = "px-3 py-2.5 align-middle";

export const OPS_TD_NUM_CLASS = "px-3 py-2.5 align-middle text-right tabular-nums";

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function noticeFromParams(
  params: OpsSearchParams,
  createdValue: string,
  successMessage: string,
) {
  const error = firstParam(params.error);

  if (error) {
    return {
      tone: "error" as const,
      message: error,
    };
  }

  if (firstParam(params.created) === createdValue) {
    return {
      tone: "success" as const,
      message: successMessage,
    };
  }

  return null;
}

export function formatZmw(value: number) {
  return new Intl.NumberFormat("en-ZM", {
    currency: "ZMW",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}
