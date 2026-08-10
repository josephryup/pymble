import { requireOpsUser } from "@/lib/ops/auth";
import {
  canViewOpsEngineeringControls,
} from "@/lib/ops/engineering-controls-permissions";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import {
  evaluateQaChecklist,
  isAwaitingQaSignOff,
  type QaChecklistEvaluation,
  type QaChecklistEvaluationItem,
  type QaItemResult,
} from "@/lib/ops/qa-checklist-rules";
import { qaChecklistTemplate } from "@/lib/ops/qa-checklist-templates";
import { fetchActiveOpsAssignedSiteIds, requiresOpsSiteAssignment } from "@/lib/ops/site-assignments";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsQaInspectionStatus, OpsUserRole } from "@/lib/ops/types";

/**
 * Read model for site inspection checklists.
 *
 * Reads the same qa_inspections / qa_inspection_items rows the engineering
 * controls page uses; this module is the site-facing view of them, with the
 * template metadata and completion evaluation attached.
 */

export type QaChecklistItem = {
  id: string;
  lineNumber: number;
  text: string;
  criterion: string;
  isHoldPoint: boolean;
  result: QaItemResult;
  notes: string;
  photoCount: number;
  photoKeys: string[];
};

export type QaChecklistRun = {
  id: string;
  inspectionNumber: string;
  siteId: string;
  siteLabel: string;
  templateKey: string | null;
  process: string;
  title: string;
  location: string;
  status: OpsQaInspectionStatus;
  inspectionDate: string;
  /** Who started the run — the person accountable for the answers. */
  inspectorId: string | null;
  initiatorName: string;
  summary: string;
  needsTemplateReview: boolean;
  // Projects Manager acknowledgement. Completion is blocked until this is set.
  pmSignedAt: string | null;
  pmSignedByName: string;
  pmSignOffNote: string;
  // Hold-point override.
  overrideReason: string;
  overrideAt: string | null;
  items: QaChecklistItem[];
  evaluation: QaChecklistEvaluation;
};

const INSPECTION_COLUMNS =
  "id, inspection_number, site_id, inspection_type, template_key, title, location, status, inspection_date, inspector_id, summary, pm_signed_at, pm_sign_off_note, hold_point_override_reason, hold_point_override_at, created_at, site:sites!qa_inspections_site_id_fkey(id, code, name), initiator:users!qa_inspections_inspector_id_fkey(id, full_name), pmSigner:users!qa_inspections_pm_signed_by_fkey(id, full_name)";

const ITEM_COLUMNS =
  "id, inspection_id, line_number, checklist_item, criterion, is_hold_point, result, notes";

function normalizeRelation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type FetchQaChecklistOptions = {
  siteId?: string | null;
  status?: OpsQaInspectionStatus | null;
  limit?: number;
  /** One run by id, for the action layer. */
  runId?: string;
  /** Free text over inspection number, title and location. */
  query?: string;
  /** Page window. Supply this instead of `limit` for the list view. */
  listState?: OpsListState;
};

/**
 * The site ids this viewer may read, or null when they may read all of them.
 * Site engineers and supervisors see only the sites they are assigned to,
 * matching every other site-scoped read in the workspace.
 */
async function visibleChecklistSiteIds(profile: { id: string; role: OpsUserRole }) {
  if (!requiresOpsSiteAssignment(profile.role)) return null;
  return fetchActiveOpsAssignedSiteIds(profile.id);
}

export async function fetchOpsQaChecklistRuns(
  options: FetchQaChecklistOptions = {},
): Promise<QaChecklistRun[]> {
  return (await fetchPaginatedOpsQaChecklistRuns(options)).items;
}

export async function fetchPaginatedOpsQaChecklistRuns(
  options: FetchQaChecklistOptions = {},
): Promise<OpsPaginatedResult<QaChecklistRun>> {
  const listState = options.listState ?? {
    from: 0,
    page: 1,
    pageSize: options.limit ?? 50,
    query: options.query ?? "",
    to: (options.limit ?? 50) - 1,
  };
  const empty = toOpsPaginatedResult<QaChecklistRun>([], 0, listState);

  const { profile } = await requireOpsUser();
  if (!canViewOpsEngineeringControls(profile.role)) {
    return empty;
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("qa_inspections")
    .select(INSPECTION_COLUMNS, { count: "exact" })
    .is("cancelled_at", null)
    .is("archived_at", null)
    .order("inspection_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(listState.from, listState.to);

  const siteIds = await visibleChecklistSiteIds(profile);
  if (siteIds) {
    if (siteIds.length === 0) return empty;
    query = query.in("site_id", siteIds);
  }
  if (options.runId) query = query.eq("id", options.runId);
  if (options.siteId) query = query.eq("site_id", options.siteId);
  if (options.status) query = query.eq("status", options.status);

  const search = opsIlikeOrFilter(
    ["inspection_number", "title", "location", "inspection_type"],
    listState.query,
  );
  if (search) query = query.or(search);

  const { count, data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  if (rows.length === 0) return toOpsPaginatedResult<QaChecklistRun>([], count, listState);

  const ids = rows.map((row) => String(row.id));
  const itemsRes = await supabase
    .from("qa_inspection_items")
    .select(ITEM_COLUMNS)
    .in("inspection_id", ids)
    .order("line_number", { ascending: true });
  if (itemsRes.error) throw itemsRes.error;

  // Photos for THESE items only. This used to fetch every site photo ever
  // linked to any checklist item, on every render (UI/UX audit §1d).
  const itemIds = ((itemsRes.data ?? []) as Array<{ id: string }>).map((item) => item.id);
  const photosRes = itemIds.length
    ? await supabase
        .from("site_photos")
        .select("id, r2_key, qa_inspection_item_id")
        .in("qa_inspection_item_id", itemIds)
    : { data: [], error: null };

  if (photosRes.error) throw photosRes.error;

  const photosByItem = new Map<string, string[]>();
  for (const photo of (photosRes.data ?? []) as Array<{
    r2_key: string;
    qa_inspection_item_id: string | null;
  }>) {
    if (!photo.qa_inspection_item_id) continue;
    const bucket = photosByItem.get(photo.qa_inspection_item_id) ?? [];
    bucket.push(photo.r2_key);
    photosByItem.set(photo.qa_inspection_item_id, bucket);
  }

  const itemsByInspection = new Map<string, QaChecklistItem[]>();
  for (const raw of (itemsRes.data ?? []) as Array<Record<string, unknown>>) {
    const id = String(raw.id);
    const photoKeys = photosByItem.get(id) ?? [];
    const item: QaChecklistItem = {
      id,
      lineNumber: Number(raw.line_number ?? 0),
      text: String(raw.checklist_item ?? ""),
      criterion: String(raw.criterion ?? ""),
      isHoldPoint: Boolean(raw.is_hold_point),
      result: (raw.result as QaItemResult) ?? "pending",
      notes: String(raw.notes ?? ""),
      photoCount: photoKeys.length,
      photoKeys,
    };
    const key = String(raw.inspection_id);
    const bucket = itemsByInspection.get(key) ?? [];
    bucket.push(item);
    itemsByInspection.set(key, bucket);
  }

  const runs = rows.map((row) => {
    const id = String(row.id);
    const items = itemsByInspection.get(id) ?? [];
    const site = normalizeRelation(row.site as { code: string; name: string } | null);
    const initiator = normalizeRelation(row.initiator as { full_name: string } | null);
    const pmSigner = normalizeRelation(row.pmSigner as { full_name: string } | null);
    const templateKey = (row.template_key as string | null) ?? null;
    const template = templateKey ? qaChecklistTemplate(templateKey) : null;

    return {
      id,
      inspectionNumber: String(row.inspection_number ?? ""),
      siteId: String(row.site_id ?? ""),
      siteLabel: site ? `${site.code} - ${site.name}` : "Site unavailable",
      templateKey,
      process: template?.process ?? String(row.inspection_type ?? "general"),
      title: String(row.title ?? ""),
      location: String(row.location ?? ""),
      status: row.status as OpsQaInspectionStatus,
      inspectionDate: String(row.inspection_date ?? ""),
      inspectorId: (row.inspector_id as string | null) ?? null,
      initiatorName: initiator?.full_name ?? "Unknown",
      summary: String(row.summary ?? ""),
      needsTemplateReview: Boolean(template?.needsReview),
      pmSignedAt: (row.pm_signed_at as string | null) ?? null,
      pmSignedByName: pmSigner?.full_name ?? "",
      pmSignOffNote: String(row.pm_sign_off_note ?? ""),
      overrideReason: String(row.hold_point_override_reason ?? ""),
      overrideAt: (row.hold_point_override_at as string | null) ?? null,
      items,
      evaluation: evaluateQaChecklist(
        items.map((item) => ({
          id: item.id,
          lineNumber: item.lineNumber,
          text: item.text,
          result: item.result,
          isHoldPoint: item.isHoldPoint,
          photoCount: item.photoCount,
        })),
      ),
    };
  });

  return toOpsPaginatedResult(runs, count, listState);
}

/**
 * One run, fetched as one row. This used to pull 200 full runs — with their
 * items and every checklist photo in the database — and then find one of them
 * in memory, on every single checklist mutation (UI/UX audit §1d).
 */
export async function fetchOpsQaChecklistRun(id: string): Promise<QaChecklistRun | null> {
  const runs = await fetchOpsQaChecklistRuns({ limit: 1, runId: id });
  return runs[0] ?? null;
}

export type QaChecklistStats = {
  open: number;
  blockedByHoldPoint: number;
  awaitingSignOff: number;
  failedItems: number;
};

const NO_CHECKLIST_STATS: QaChecklistStats = {
  open: 0,
  blockedByHoldPoint: 0,
  awaitingSignOff: 0,
  failedItems: 0,
};

/**
 * The four KPI numbers.
 *
 * This used to call fetchOpsQaChecklistRuns({ limit: 200 }) — 200 inspections
 * with their full item lists, plus every checklist-linked photo row in the
 * database, to produce four integers, on every page render (UI/UX audit §1d).
 *
 * Now it reads one narrow row per live inspection, and item rows only for the
 * ones still open — which is the working set, and the only set the three
 * "outstanding work" numbers can come from. `failedItems` is a count query.
 */
export async function fetchOpsQaChecklistStats(): Promise<QaChecklistStats> {
  const { profile } = await requireOpsUser();
  if (!canViewOpsEngineeringControls(profile.role)) {
    return NO_CHECKLIST_STATS;
  }

  const supabase = getOpsSupabaseServiceClient();
  let headers = supabase
    .from("qa_inspections")
    .select("id, status, pm_signed_at, hold_point_override_at")
    .is("cancelled_at", null)
    .is("archived_at", null);

  const siteIds = await visibleChecklistSiteIds(profile);
  if (siteIds) {
    if (siteIds.length === 0) return NO_CHECKLIST_STATS;
    headers = headers.in("site_id", siteIds);
  }

  const { data, error } = await headers;
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    status: OpsQaInspectionStatus;
    pm_signed_at: string | null;
    hold_point_override_at: string | null;
  }>;
  if (rows.length === 0) return NO_CHECKLIST_STATS;

  const openRuns = rows.filter((row) => row.status === "planned");
  const liveIds = rows.map((row) => row.id);

  const [itemsRes, failedRes] = await Promise.all([
    openRuns.length
      ? supabase
          .from("qa_inspection_items")
          .select("id, inspection_id, line_number, result, is_hold_point")
          .in("inspection_id", openRuns.map((row) => row.id))
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("qa_inspection_items")
      .select("id", { count: "exact", head: true })
      .eq("result", "fail")
      .in("inspection_id", liveIds),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (failedRes.error) throw failedRes.error;

  const openItems = (itemsRes.data ?? []) as Array<{
    id: string;
    inspection_id: string;
    line_number: number;
    result: QaItemResult;
    is_hold_point: boolean;
  }>;

  // A failed item needs a photo before the run can complete, so the evaluation
  // needs photo counts — but only for the failures still open.
  const openFailedIds = openItems.filter((item) => item.result === "fail").map((item) => item.id);
  const photosRes = openFailedIds.length
    ? await supabase
        .from("site_photos")
        .select("qa_inspection_item_id")
        .in("qa_inspection_item_id", openFailedIds)
    : { data: [], error: null };
  if (photosRes.error) throw photosRes.error;

  const photoCounts = new Map<string, number>();
  for (const photo of (photosRes.data ?? []) as Array<{ qa_inspection_item_id: string | null }>) {
    if (!photo.qa_inspection_item_id) continue;
    photoCounts.set(
      photo.qa_inspection_item_id,
      (photoCounts.get(photo.qa_inspection_item_id) ?? 0) + 1,
    );
  }

  const itemsByRun = new Map<string, QaChecklistEvaluationItem[]>();
  for (const item of openItems) {
    const bucket = itemsByRun.get(item.inspection_id) ?? [];
    bucket.push({
      id: item.id,
      lineNumber: item.line_number,
      text: "",
      result: item.result,
      isHoldPoint: item.is_hold_point,
      photoCount: photoCounts.get(item.id) ?? 0,
    });
    itemsByRun.set(item.inspection_id, bucket);
  }

  let blockedByHoldPoint = 0;
  let awaitingSignOff = 0;
  for (const run of openRuns) {
    const evaluation = evaluateQaChecklist(itemsByRun.get(run.id) ?? []);
    if (evaluation.blockers.some((blocker) => blocker.code === "hold_points")) {
      blockedByHoldPoint += 1;
    }
    // The fieldwork is finished and the only thing left is the PM's signature —
    // the queue a Projects Manager opens this page to clear.
    if (
      isAwaitingQaSignOff({
        evaluation,
        holdPointsReleased: Boolean(run.hold_point_override_at),
        pmSignedAt: run.pm_signed_at,
      })
    ) {
      awaitingSignOff += 1;
    }
  }

  return {
    open: openRuns.length,
    blockedByHoldPoint,
    awaitingSignOff,
    failedItems: failedRes.count ?? 0,
  };
}
