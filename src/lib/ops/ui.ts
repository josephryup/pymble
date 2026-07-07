export type OpsSearchParams = Record<string, string | string[] | undefined>;

export const OPS_FOCUS_CLASS =
  "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export const OPS_INPUT_CLASS =
  `mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-medium text-foreground shadow-sm shadow-foreground/[0.02] transition-colors placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 ${OPS_FOCUS_CLASS}`;

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
  `inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm shadow-foreground/[0.02] transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 ${OPS_FOCUS_CLASS}`;

export const OPS_DANGER_BUTTON_CLASS =
  `inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-destructive/25 bg-background px-3 py-2 text-sm font-semibold text-destructive shadow-sm shadow-foreground/[0.02] transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 ${OPS_FOCUS_CLASS}`;

export const OPS_TABLE_SCROLL_CLASS =
  `overflow-x-auto ${OPS_FOCUS_CLASS}`;

/**
 * Shared data-table styling. Standardises the ~17 hand-rolled ops tables onto
 * semantic tokens (was a mix of ad-hoc brand-dark text and divider classes),
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

/**
 * Page-level notice banners (success/error/warning/info). Single source of
 * truth for the ~50 previously hand-rolled banners (UI consistency audit,
 * 2026-07-06 findings §2), with dark-mode variants the copies lacked.
 * Error banners must also carry role="alert".
 */
export const OPS_NOTICE_SUCCESS_CLASS =
  "rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-400";

export const OPS_NOTICE_ERROR_CLASS =
  "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400";

export const OPS_NOTICE_WARNING_CLASS =
  "rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-400";

export const OPS_NOTICE_INFO_CLASS =
  "rounded-md border border-primary-blue/20 bg-primary-blue/5 px-4 py-3 text-sm font-semibold text-primary-blue";

/**
 * Central status→tone registry (UI consistency audit 2026-07-06 §3). One
 * status word always renders one color, workspace-wide. Pages previously kept
 * 62 local `statusClass` functions that mostly — but not always — agreed.
 * Domain-specific words can be added here; anything unknown renders neutral.
 */
export type OpsStatusTone = "positive" | "info" | "attention" | "negative" | "neutral";

export const OPS_STATUS_TONE_CLASSES: Record<OpsStatusTone, string> = {
  positive:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-400",
  info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-400",
  attention:
    "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-400",
  negative:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400",
  neutral:
    "border-border bg-muted text-muted-foreground",
};

export const OPS_STATUS_TONES: Record<string, OpsStatusTone> = {
  // Terminal good
  approved: "positive",
  closed: "positive",
  completed: "positive",
  paid: "positive",
  posted: "positive",
  verified: "positive",
  available: "positive",
  active: "positive",
  present: "positive",
  awarded: "positive",
  accepted: "positive",
  accredited: "positive",
  achieved: "positive",
  agreed: "positive",
  certified: "positive",
  checked_in: "positive",
  confirmed: "positive",
  corrected: "positive",
  current: "positive",
  delivered: "positive",
  good: "positive",
  filled: "positive",
  hired: "positive",
  pass: "positive",
  passed: "positive",
  priced: "positive",
  reactivated: "positive",
  ready: "positive",
  released: "positive",
  resolved: "positive",
  valid: "positive",
  // In motion
  submitted: "info",
  in_progress: "info",
  scheduled: "info",
  planned: "info",
  reported: "info",
  allocated: "info",
  issued: "info",
  sent: "info",
  open: "info",
  disbursing: "info",
  interviewing: "info",
  invoiced: "info",
  medium: "info",
  mitigating: "info",
  mobilizing: "info",
  new: "info",
  normal: "info",
  offered: "info",
  ordered: "info",
  quoted: "info",
  testing: "info",
  transfer: "info",
  // Needs attention
  pending: "attention",
  on_hold: "attention",
  action_required: "attention",
  investigating: "attention",
  maintenance: "attention",
  late: "attention",
  due_soon: "attention",
  partially_received: "attention",
  approval_pending: "attention",
  completed_with_ncs: "attention",
  delay: "attention",
  delayed: "attention",
  due: "attention",
  due_today: "attention",
  finance_review: "attention",
  high: "attention",
  in_review: "attention",
  kyc_pending: "attention",
  on_leave: "attention",
  pricing_pending: "attention",
  probation: "attention",
  returned: "attention",
  revision_requested: "attention",
  stale_no_due: "attention",
  observation: "attention",
  suspended: "attention",
  under_review: "attention",
  warn: "attention",
  watch: "attention",
  // Bad
  rejected: "negative",
  cancelled: "negative",
  blocked: "negative",
  danger: "negative",
  overdue: "negative",
  expired: "negative",
  failed: "negative",
  absent: "negative",
  blacklisted: "negative",
  critical: "negative",
  damaged: "negative",
  exited: "negative",
  fail: "negative",
  locked: "negative",
  lost: "negative",
  terminated: "negative",
  urgent: "negative",
  // Dormant
  draft: "neutral",
  archived: "neutral",
  inactive: "neutral",
  low: "neutral",
  superseded: "neutral",
  waived: "neutral",
  withdrawn: "neutral",
};

export const OPS_STATUS_BADGE_BASE_CLASS =
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em]";

export function opsStatusBadgeClass(status: string, toneOverride?: OpsStatusTone) {
  const tone = toneOverride ?? OPS_STATUS_TONES[status] ?? "neutral";
  return `${OPS_STATUS_BADGE_BASE_CLASS} ${OPS_STATUS_TONE_CLASSES[tone]}`;
}

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
