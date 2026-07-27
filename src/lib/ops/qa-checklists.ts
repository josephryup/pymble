import { requireOpsUser } from "@/lib/ops/auth";
import {
  canViewOpsEngineeringControls,
} from "@/lib/ops/engineering-controls-permissions";
import {
  evaluateQaChecklist,
  type QaChecklistEvaluation,
  type QaItemResult,
} from "@/lib/ops/qa-checklist-rules";
import { qaChecklistTemplate } from "@/lib/ops/qa-checklist-templates";
import { fetchActiveOpsAssignedSiteIds, requiresOpsSiteAssignment } from "@/lib/ops/site-assignments";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsQaInspectionStatus } from "@/lib/ops/types";

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
  clientResult: QaItemResult;
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
  inspectorId: string | null;
  summary: string;
  needsTemplateReview: boolean;
  // Client sign-off (external party — no account).
  clientRepName: string;
  clientRepRole: string;
  clientSignatureName: string;
  clientSignedAt: string | null;
  clientComment: string;
  // Hold-point override.
  overrideReason: string;
  overrideAt: string | null;
  items: QaChecklistItem[];
  evaluation: QaChecklistEvaluation;
};

const INSPECTION_COLUMNS =
  "id, inspection_number, site_id, inspection_type, template_key, title, location, status, inspection_date, inspector_id, summary, client_rep_name, client_rep_role, client_signature_name, client_signed_at, client_comment, hold_point_override_reason, hold_point_override_at, created_at, site:sites!qa_inspections_site_id_fkey(id, code, name)";

const ITEM_COLUMNS =
  "id, inspection_id, line_number, checklist_item, criterion, is_hold_point, result, client_result, notes";

function normalizeRelation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type FetchQaChecklistOptions = {
  siteId?: string | null;
  status?: OpsQaInspectionStatus | null;
  limit?: number;
};

export async function fetchOpsQaChecklistRuns(
  options: FetchQaChecklistOptions = {},
): Promise<QaChecklistRun[]> {
  const { profile } = await requireOpsUser();
  if (!canViewOpsEngineeringControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("qa_inspections")
    .select(INSPECTION_COLUMNS)
    .is("cancelled_at", null)
    .order("inspection_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);

  // Site engineers and supervisors see only the sites they are assigned to,
  // matching every other site-scoped read in the workspace.
  if (requiresOpsSiteAssignment(profile.role)) {
    const siteIds = await fetchActiveOpsAssignedSiteIds(profile.id);
    if (siteIds.length === 0) return [];
    query = query.in("site_id", siteIds);
  }
  if (options.siteId) query = query.eq("site_id", options.siteId);
  if (options.status) query = query.eq("status", options.status);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  if (rows.length === 0) return [];

  const ids = rows.map((row) => String(row.id));
  const [itemsRes, photosRes] = await Promise.all([
    supabase.from("qa_inspection_items").select(ITEM_COLUMNS).in("inspection_id", ids)
      .order("line_number", { ascending: true }),
    supabase
      .from("site_photos")
      .select("id, r2_key, qa_inspection_item_id")
      .not("qa_inspection_item_id", "is", null),
  ]);

  if (itemsRes.error) throw itemsRes.error;
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
      clientResult: (raw.client_result as QaItemResult) ?? "pending",
      notes: String(raw.notes ?? ""),
      photoCount: photoKeys.length,
      photoKeys,
    };
    const key = String(raw.inspection_id);
    const bucket = itemsByInspection.get(key) ?? [];
    bucket.push(item);
    itemsByInspection.set(key, bucket);
  }

  return rows.map((row) => {
    const id = String(row.id);
    const items = itemsByInspection.get(id) ?? [];
    const site = normalizeRelation(row.site as { code: string; name: string } | null);
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
      summary: String(row.summary ?? ""),
      needsTemplateReview: Boolean(template?.needsReview),
      clientRepName: String(row.client_rep_name ?? ""),
      clientRepRole: String(row.client_rep_role ?? ""),
      clientSignatureName: String(row.client_signature_name ?? ""),
      clientSignedAt: (row.client_signed_at as string | null) ?? null,
      clientComment: String(row.client_comment ?? ""),
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
}

export async function fetchOpsQaChecklistRun(id: string): Promise<QaChecklistRun | null> {
  const runs = await fetchOpsQaChecklistRuns({ limit: 200 });
  return runs.find((run) => run.id === id) ?? null;
}

export type QaChecklistStats = {
  open: number;
  blockedByHoldPoint: number;
  awaitingClient: number;
  failedItems: number;
};

export async function fetchOpsQaChecklistStats(): Promise<QaChecklistStats> {
  const runs = await fetchOpsQaChecklistRuns({ limit: 200 });

  return {
    open: runs.filter((run) => run.status === "planned").length,
    blockedByHoldPoint: runs.filter(
      (run) =>
        run.status === "planned" &&
        run.evaluation.blockers.some((blocker) => blocker.code === "hold_points"),
    ).length,
    awaitingClient: runs.filter((run) => run.status !== "planned" && !run.clientSignedAt).length,
    failedItems: runs.reduce((sum, run) => sum + run.evaluation.failed, 0),
  };
}
