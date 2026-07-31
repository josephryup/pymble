import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Off-schedule spend → client variations.
 *
 * Phase 5 of docs/pymble-ops-project-finance-spine-audit.md (§4.7 / §7.6).
 *
 * When a site requests material that was never in the schedule, there are only
 * two possible explanations:
 *
 *   1. We mis-estimated — the QS missed it. A genuine overrun that eats margin.
 *   2. The client changed or added scope — money we are entitled to bill for.
 *
 * The system cannot currently tell them apart and nobody is asked, so case two
 * gets silently absorbed as if it were case one. On site 0004 there is
 * K971,031 of requested material against a K904,672 budget with nothing
 * traceable to a schedule line; some fraction of that may be unbilled client
 * work Pymble has already paid for out of pocket.
 *
 * The fix is a single question at the point of raising the item, and this
 * module is what turns the answers into money: claimable off-schedule spend,
 * totalled per site, surfaced as variation candidates.
 *
 * Per §7.6 the prompt is a SUGGESTION, not an automatic variation. The
 * reason-tagging discipline has to be proven before it drives a client-facing
 * document.
 */

export type OffScheduleReason =
  | "client_instruction"
  | "design_change"
  | "site_condition"
  | "schedule_omission"
  | "wastage_rework"
  | "other";

/** Client scope — billable. */
export const CLAIMABLE_REASONS: OffScheduleReason[] = [
  "client_instruction",
  "design_change",
  "site_condition",
];

/** Our own cost — absorbed against margin. */
export const ABSORBED_REASONS: OffScheduleReason[] = [
  "schedule_omission",
  "wastage_rework",
  "other",
];

export const OFF_SCHEDULE_REASON_LABELS: Record<OffScheduleReason, string> = {
  client_instruction: "Client instruction",
  design_change: "Design change",
  site_condition: "Unforeseen site condition",
  schedule_omission: "Missed in the schedule",
  wastage_rework: "Wastage or rework",
  other: "Other",
};

export function isClaimableReason(reason: OffScheduleReason | null): boolean {
  return reason !== null && CLAIMABLE_REASONS.includes(reason);
}

export type OffScheduleItemRow = {
  siteId: string;
  reason: OffScheduleReason | null;
  value: number;
};

export type VariationCandidate = {
  siteId: string;
  siteCode: string;
  siteName: string;
  contractValue: number;
  claimableValue: number;
  absorbedValue: number;
  untaggedValue: number;
  totalOffScheduleValue: number;
  /** Claimable as a share of contract value — the "is this material?" test. */
  claimablePercentOfContract: number | null;
  /** Enough claimable spend to be worth a conversation with the client. */
  isCandidate: boolean;
  itemCount: number;
};

/** Claimable value at which a variation becomes worth raising. */
export const VARIATION_CANDIDATE_THRESHOLD_ZMW = 50_000;
/** …or this share of contract value, whichever comes first. */
export const VARIATION_CANDIDATE_PERCENT = 5;

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Fold off-schedule items into per-site variation candidates.
 *
 * Untagged value is reported separately rather than assumed either way. An
 * item nobody classified is not evidence of a claim, and it is not evidence of
 * our own error either — it is a gap in the discipline, and hiding it in
 * either column would make the claimable figure untrustworthy exactly when
 * someone wants to rely on it.
 */
export function buildVariationCandidates(input: {
  items: OffScheduleItemRow[];
  sites: Array<{ id: string; code: string; name: string; contractValue: number }>;
  thresholdZmw?: number;
  percentThreshold?: number;
}): VariationCandidate[] {
  const threshold = input.thresholdZmw ?? VARIATION_CANDIDATE_THRESHOLD_ZMW;
  const percentThreshold = input.percentThreshold ?? VARIATION_CANDIDATE_PERCENT;

  const bySite = new Map<
    string,
    { claimable: number; absorbed: number; untagged: number; count: number }
  >();

  for (const item of input.items) {
    const current =
      bySite.get(item.siteId) ?? { claimable: 0, absorbed: 0, untagged: 0, count: 0 };
    const value = toNumber(item.value);
    if (item.reason === null) {
      current.untagged += value;
    } else if (isClaimableReason(item.reason)) {
      current.claimable += value;
    } else {
      current.absorbed += value;
    }
    current.count += 1;
    bySite.set(item.siteId, current);
  }

  const out: VariationCandidate[] = [];

  for (const site of input.sites) {
    const totals = bySite.get(site.id);
    if (!totals || totals.count === 0) continue;

    const claimableValue = roundMoney(totals.claimable);
    const contractValue = toNumber(site.contractValue);
    const claimablePercentOfContract =
      contractValue > 0
        ? Math.round((claimableValue / contractValue) * 1000) / 10
        : null;

    out.push({
      siteId: site.id,
      siteCode: site.code,
      siteName: site.name,
      contractValue,
      claimableValue,
      absorbedValue: roundMoney(totals.absorbed),
      untaggedValue: roundMoney(totals.untagged),
      totalOffScheduleValue: roundMoney(
        totals.claimable + totals.absorbed + totals.untagged,
      ),
      claimablePercentOfContract,
      isCandidate:
        claimableValue >= threshold ||
        (claimablePercentOfContract !== null &&
          claimablePercentOfContract >= percentThreshold),
      itemCount: totals.count,
    });
  }

  return out.sort((a, b) => b.claimableValue - a.claimableValue);
}

/**
 * Off-schedule spend per site, split claimable / absorbed / untagged.
 *
 * "Off schedule" means a request item with no link to a material schedule
 * line — precisely the population the leak detector and boq-actuals already
 * treat as unplanned.
 */
export async function fetchOpsVariationCandidates(): Promise<VariationCandidate[]> {
  const supabase = getOpsSupabaseServiceClient();

  const [itemsResult, sitesResult] = await Promise.all([
    supabase
      .from("material_request_items")
      .select(
        "actual_total, estimated_total, off_schedule_reason, request:material_requests!material_request_items_request_id_fkey(site_id, status, scope, archived_at)",
      )
      .is("boq_line_item_id", null),
    supabase.from("sites").select("id, code, name, contract_value").eq("is_active", true),
  ]);

  if (itemsResult.error) {
    throw itemsResult.error;
  }
  if (sitesResult.error) {
    throw sitesResult.error;
  }

  type ItemRow = {
    actual_total: number | string | null;
    estimated_total: number | string | null;
    off_schedule_reason: OffScheduleReason | null;
    request:
      | {
          site_id: string | null;
          status: string;
          scope: string;
          archived_at: string | null;
        }
      | Array<{
          site_id: string | null;
          status: string;
          scope: string;
          archived_at: string | null;
        }>
      | null;
  };

  const items: OffScheduleItemRow[] = [];

  for (const row of (itemsResult.data ?? []) as unknown as ItemRow[]) {
    const request = Array.isArray(row.request) ? (row.request[0] ?? null) : row.request;
    // Only live project spend counts. A rejected or cancelled request never
    // became cost, and overhead has no client to bill.
    if (
      !request ||
      !request.site_id ||
      request.scope !== "site" ||
      request.archived_at ||
      ["draft", "rejected", "cancelled"].includes(request.status)
    ) {
      continue;
    }

    const priced = toNumber(row.actual_total);
    items.push({
      siteId: request.site_id,
      reason: row.off_schedule_reason,
      value: priced > 0 ? priced : toNumber(row.estimated_total),
    });
  }

  return buildVariationCandidates({
    items,
    sites: ((sitesResult.data ?? []) as Array<{
      id: string;
      code: string;
      name: string;
      contract_value: number | string | null;
    }>).map((site) => ({
      id: site.id,
      code: site.code,
      name: site.name,
      contractValue: toNumber(site.contract_value),
    })),
  });
}
