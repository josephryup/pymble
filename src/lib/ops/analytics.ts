import { track } from "@vercel/analytics/server";

/**
 * Stable list of ops events we track. Keep it small and curated — every entry
 * here is a deliberate signal we want on the Vercel Analytics dashboard.
 *
 * Adding a new event is free. Renaming an existing one breaks historical
 * comparisons, so prefer adding a new name over editing.
 */
export type OpsEventName =
  | "ops.login_succeeded"
  | "ops.material_request.created"
  | "ops.material_request.submitted"
  | "ops.material_request.approved"
  | "ops.material_request.priced"
  | "ops.daily_site_report.created"
  | "ops.daily_site_report.submitted"
  | "ops.hse_incident.reported"
  | "ops.hse_incident.closed"
  | "ops.invoice.created"
  | "ops.invoice.sent"
  | "ops.invoice.paid"
  | "ops.invoice.pdf_downloaded"
  | "ops.purchase_order.issued"
  | "ops.purchase_order.pdf_downloaded"
  | "ops.rfq.converted_to_pos"
  | "ops.staff.invited"
  | "ops.staff.role_changed";

/**
 * Emit a Vercel Analytics custom event. Safe to await — silently no-ops if
 * the analytics SDK is unavailable (e.g. in unit tests).
 */
export function trackOpsEvent(
  name: OpsEventName,
  properties?: Record<string, string | number | boolean | null>,
) {
  try {
    track(name, properties ?? {});
  } catch {
    // Vercel Analytics not initialised — fail open.
  }
}
