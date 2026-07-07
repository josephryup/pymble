/**
 * Canonical ops formatting helpers (UI consistency audit 2026-07-06 §4).
 * Replaces the per-page `formatDate` / `formatDateTime` / `todayInLusaka` /
 * `formatLabel` copies — several of which forgot the Africa/Lusaka pin and
 * silently rendered timestamps in the server's timezone (UTC on Vercel,
 * 2 hours off). All formatters here are module-level singletons; never
 * construct an Intl formatter inside a render.
 */

const LUSAKA_TIME_ZONE = "Africa/Lusaka";

const DATE_FORMAT = new Intl.DateTimeFormat("en-ZM", {
  dateStyle: "medium",
  timeZone: LUSAKA_TIME_ZONE,
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-ZM", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: LUSAKA_TIME_ZONE,
});

// en-CA yields YYYY-MM-DD, the shape date inputs and DB date columns expect.
const ISO_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: LUSAKA_TIME_ZONE,
  year: "numeric",
});

/** Today's date (YYYY-MM-DD) in Lusaka, for date-input defaults and filters. */
export function todayInLusaka() {
  return ISO_DATE_FORMAT.format(new Date());
}

/**
 * Medium date, Lusaka-pinned. Accepts a date-only column ("YYYY-MM-DD") or a
 * full timestamptz; for the latter the leading YYYY-MM-DD slice is displayed.
 */
export function formatOpsDate(value: string | null | undefined, fallback = "Not set") {
  if (!value) {
    return fallback;
  }
  const datePart = value.length >= 10 ? value.slice(0, 10) : value;
  const parsed = new Date(`${datePart}T00:00:00+02:00`);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return DATE_FORMAT.format(parsed);
}

/** Medium date + short time, Lusaka-pinned. */
export function formatOpsDateTime(value: string | null | undefined, fallback = "Not set") {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return DATE_TIME_FORMAT.format(parsed);
}

/** snake_case status/enum value → human words ("action_required" → "action required"). */
export function formatOpsLabel(value: string) {
  return value.replace(/_/g, " ");
}

/** Plain count with en-ZM grouping. */
export function formatCount(value: number) {
  return value.toLocaleString("en-ZM");
}

// Canonical money formatting lives in lib/ops/ui.ts (formatZmw) and the chart
// module (compactZmw); re-exported here so new code has one import point.
export { formatZmw } from "@/lib/ops/ui";
