import { requireOpsUser } from "@/lib/ops/auth";
import { canViewOpsEngineeringControls } from "@/lib/ops/engineering-controls-permissions";
import {
  buildOpsEngineeringProgrammePressureReport,
  buildOpsEngineeringQaCategoryReport,
  type OpsEngineeringProgrammeMilestoneSource,
  type OpsEngineeringProgrammePressureReport,
  type OpsEngineeringQaCategoryRow,
  type OpsEngineeringQaCategorySource,
} from "@/lib/ops/engineering-controls-reporting";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { canViewSensitiveOpsFoundation } from "@/lib/ops/permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsDocumentStatus,
  OpsDocumentVisibility,
  OpsDrawingRegisterStatus,
  OpsMaterialTestStatus,
  OpsPriority,
  OpsProgrammeMilestoneStatus,
  OpsQaFindingCategory,
  OpsQaInspectionItemResult,
  OpsQaInspectionStatus,
  OpsSiteInstructionFollowUpStatus,
  OpsSiteInstructionFollowUpType,
  OpsSiteInstructionStatus,
  OpsSnagItemStatus,
  OpsUserRole,
} from "@/lib/ops/types";

export type OpsEngineeringSiteSummary = {
  code: string;
  id: string;
  name: string;
};

export type OpsEngineeringUserSummary = {
  full_name: string;
  id: string;
  role: OpsUserRole;
};

export type OpsSiteInstructionSummary = {
  acknowledged_at: string | null;
  assigned_to: string | null;
  assigned_to_user: OpsEngineeringUserSummary | null;
  cancelled_at: string | null;
  closed_at: string | null;
  created_at: string;
  created_by: string | null;
  description: string;
  id: string;
  instruction_date: string;
  instruction_number: string;
  instruction_type: string;
  issued_by: string | null;
  issued_by_user: OpsEngineeringUserSummary | null;
  priority: OpsPriority;
  required_by: string | null;
  response_notes: string;
  site: OpsEngineeringSiteSummary | null;
  site_id: string;
  status: OpsSiteInstructionStatus;
  title: string;
};

export type OpsQaInspectionItemSummary = {
  action_required: boolean;
  checklist_item: string;
  due_date: string | null;
  finding_category: OpsQaFindingCategory;
  id: string;
  line_number: number;
  notes: string;
  result: OpsQaInspectionItemResult;
  responsible_user: OpsEngineeringUserSummary | null;
  responsible_user_id: string | null;
};

export type OpsQaInspectionSummary = {
  action_count: number;
  action_required: string;
  cancelled_at: string | null;
  closed_at: string | null;
  completed_at: string | null;
  created_at: string;
  created_by: string | null;
  findings_count: number;
  id: string;
  inspection_date: string;
  inspection_number: string;
  inspection_type: string;
  inspector: OpsEngineeringUserSummary | null;
  inspector_id: string | null;
  items: OpsQaInspectionItemSummary[];
  score: number;
  site: OpsEngineeringSiteSummary | null;
  site_id: string;
  status: OpsQaInspectionStatus;
  summary: string;
  title: string;
};

export type OpsMaterialTestSummary = {
  cancelled_at: string | null;
  completed_at: string | null;
  created_at: string;
  created_by: string | null;
  id: string;
  lab_reference: string;
  location: string;
  qa_inspection_id: string | null;
  required_by: string | null;
  result_summary: string;
  result_value: string;
  sample_reference: string;
  site: OpsEngineeringSiteSummary | null;
  site_id: string;
  standard_reference: string;
  status: OpsMaterialTestStatus;
  test_date: string;
  test_number: string;
  test_type: string;
  tested_by: string;
};

export type OpsSnagItemSummary = {
  assigned_to: string | null;
  assigned_to_user: OpsEngineeringUserSummary | null;
  cancelled_at: string | null;
  created_at: string;
  created_by: string | null;
  description: string;
  due_date: string | null;
  id: string;
  location: string;
  priority: OpsPriority;
  qa_inspection_id: string | null;
  resolution_notes: string;
  resolved_at: string | null;
  site: OpsEngineeringSiteSummary | null;
  site_id: string;
  snag_number: string;
  status: OpsSnagItemStatus;
  title: string;
  verified_at: string | null;
};

export type OpsDrawingRecordSummary = {
  archived_at: string | null;
  created_at: string;
  created_by: string | null;
  discipline: string;
  document_id: string | null;
  document_version: {
    document: {
      category: string;
      id: string;
      status: OpsDocumentStatus;
      title: string;
    } | null;
    file_name: string;
    id: string;
    version_number: number;
  } | null;
  document_version_id: string | null;
  drawing_number: string;
  id: string;
  issued_date: string | null;
  notes: string;
  received_date: string;
  revision: string;
  site: OpsEngineeringSiteSummary | null;
  site_id: string;
  status: OpsDrawingRegisterStatus;
  title: string;
};

export type OpsProgrammeMilestoneSummary = {
  actual_date: string | null;
  baseline_date: string;
  cancelled_at: string | null;
  completed_at: string | null;
  created_at: string;
  created_by: string | null;
  delay_reason: string;
  forecast_date: string | null;
  id: string;
  milestone_number: string;
  notes: string;
  owner: OpsEngineeringUserSummary | null;
  owner_id: string | null;
  progress_percent: number;
  site: OpsEngineeringSiteSummary | null;
  site_id: string;
  status: OpsProgrammeMilestoneStatus;
  title: string;
};

export type OpsSiteInstructionFollowUpSummary = {
  assigned_to: string | null;
  assigned_to_user: OpsEngineeringUserSummary | null;
  cancelled_at: string | null;
  closed_at: string | null;
  created_at: string;
  created_by: string | null;
  description: string;
  due_date: string | null;
  id: string;
  instruction: Pick<OpsSiteInstructionSummary, "id" | "instruction_number" | "title"> | null;
  instruction_id: string;
  site: OpsEngineeringSiteSummary | null;
  site_id: string;
  status: OpsSiteInstructionFollowUpStatus;
  task_type: OpsSiteInstructionFollowUpType;
  title: string;
};

export type OpsDrawingDocumentVersionOption = {
  category: string;
  document_id: string;
  document_title: string;
  file_name: string;
  status: OpsDocumentStatus;
  version_id: string;
  version_number: number;
};

export type OpsEngineeringControlStats = {
  actionRequiredInspections: number;
  currentDrawings: number;
  delayedMilestones: number;
  failedTests: number;
  openFollowUps: number;
  openInstructions: number;
  openSnags: number;
  overdueSnags: number;
  plannedInspections: number;
};

export type FetchPaginatedOpsSiteInstructionsOptions = {
  listState: OpsListState;
  query?: string;
  status?: OpsSiteInstructionStatus;
};

type RawRelation<T> = T | T[] | null;

type RawSiteInstruction = Omit<
  OpsSiteInstructionSummary,
  "assigned_to_user" | "issued_by_user" | "site"
> & {
  assigned_to_user: RawRelation<OpsEngineeringUserSummary>;
  issued_by_user: RawRelation<OpsEngineeringUserSummary>;
  site: RawRelation<OpsEngineeringSiteSummary>;
};

type RawQaInspection = Omit<
  OpsQaInspectionSummary,
  "action_count" | "findings_count" | "inspector" | "items" | "score" | "site"
> & {
  action_count: number | string;
  findings_count: number | string;
  inspector: RawRelation<OpsEngineeringUserSummary>;
  score: number | string;
  site: RawRelation<OpsEngineeringSiteSummary>;
};

type RawQaInspectionItem = Omit<
  OpsQaInspectionItemSummary,
  "line_number" | "responsible_user"
> & {
  inspection_id: string;
  line_number: number | string;
  responsible_user: RawRelation<OpsEngineeringUserSummary>;
};

type RawMaterialTest = Omit<OpsMaterialTestSummary, "site"> & {
  site: RawRelation<OpsEngineeringSiteSummary>;
};

type RawSnagItem = Omit<OpsSnagItemSummary, "assigned_to_user" | "site"> & {
  assigned_to_user: RawRelation<OpsEngineeringUserSummary>;
  site: RawRelation<OpsEngineeringSiteSummary>;
};

type RawDrawingRecord = Omit<OpsDrawingRecordSummary, "document_version" | "site"> & {
  document_version: RawRelation<OpsDrawingRecordSummary["document_version"]>;
  site: RawRelation<OpsEngineeringSiteSummary>;
};

type RawProgrammeMilestone = Omit<
  OpsProgrammeMilestoneSummary,
  "owner" | "progress_percent" | "site"
> & {
  owner: RawRelation<OpsEngineeringUserSummary>;
  progress_percent: number | string;
  site: RawRelation<OpsEngineeringSiteSummary>;
};

type RawInstructionFollowUp = Omit<
  OpsSiteInstructionFollowUpSummary,
  "assigned_to_user" | "instruction" | "site"
> & {
  assigned_to_user: RawRelation<OpsEngineeringUserSummary>;
  instruction: RawRelation<OpsSiteInstructionFollowUpSummary["instruction"]>;
  site: RawRelation<OpsEngineeringSiteSummary>;
};

type RawDocumentOption = {
  category: string;
  current_version_number: number | string;
  id: string;
  status: OpsDocumentStatus;
  title: string;
  uploaded_by: string | null;
  visibility: OpsDocumentVisibility;
};

type RawDocumentVersionOption = {
  document_id: string;
  file_name: string;
  id: string;
  version_number: number | string;
};

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function normalizeRelation<T>(value: RawRelation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeLimit(limit: number, max = 250) {
  return Math.min(Math.max(limit, 1), max);
}

function todayInLusaka() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Lusaka",
    year: "numeric",
  }).format(new Date());
}

function isMissingEngineeringTable(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST200" ||
        error.code === "PGRST205" ||
        /site_instructions|site_instruction_follow_ups|qa_inspections|qa_inspection_items|material_tests|snag_items|drawing_register|programme_milestones|finding_category|document_version_id|schema cache/i.test(
          error.message ?? "",
        )),
  );
}

async function countByQuery(
  buildQuery: (
    supabase: ReturnType<typeof getOpsSupabaseServiceClient>,
  ) => PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }>,
) {
  const supabase = getOpsSupabaseServiceClient();
  const { count, error } = await buildQuery(supabase);

  if (isMissingEngineeringTable(error)) {
    return 0;
  }

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function fetchQaInspectionItems(inspectionIds: string[]) {
  if (inspectionIds.length === 0) {
    return new Map<string, OpsQaInspectionItemSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("qa_inspection_items")
    .select(
      [
        "id",
        "inspection_id",
        "line_number",
        "checklist_item",
        "finding_category",
        "result",
        "action_required",
        "responsible_user_id",
        "due_date",
        "notes",
        "responsible_user:users!qa_inspection_items_responsible_user_id_fkey(id, full_name, role)",
      ].join(", "),
    )
    .in("inspection_id", inspectionIds)
    .order("line_number", { ascending: true });

  if (isMissingEngineeringTable(error)) {
    return new Map<string, OpsQaInspectionItemSummary[]>();
  }

  if (error) {
    throw error;
  }

  const grouped = new Map<string, OpsQaInspectionItemSummary[]>();

  ((data ?? []) as unknown as RawQaInspectionItem[]).forEach((item) => {
    grouped.set(item.inspection_id, [
      ...(grouped.get(item.inspection_id) ?? []),
      {
        ...item,
        line_number: normalizeNumber(item.line_number),
        responsible_user: normalizeRelation(item.responsible_user),
      },
    ]);
  });

  return grouped;
}

export async function fetchEngineeringUserOptions(limit = 200) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEngineeringControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, role")
    .eq("is_active", true)
    .order("full_name", { ascending: true })
    .limit(normalizeLimit(limit, 300));

  if (error) {
    throw error;
  }

  return (data ?? []) as OpsEngineeringUserSummary[];
}

export async function fetchQaInspectionOptions(limit = 80) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEngineeringControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("qa_inspections")
    .select("id, inspection_number, title, status")
    .in("status", ["planned", "completed", "action_required"])
    .order("inspection_date", { ascending: false })
    .limit(normalizeLimit(limit, 150));

  if (isMissingEngineeringTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return (data ?? []) as Array<{
    id: string;
    inspection_number: string;
    status: OpsQaInspectionStatus;
    title: string;
  }>;
}

export async function fetchDrawingDocumentVersionOptions(limit = 120): Promise<OpsDrawingDocumentVersionOption[]> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEngineeringControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: documents, error: documentError } = await supabase
    .from("documents")
    .select("id, title, category, visibility, status, current_version_number, uploaded_by")
    .neq("status", "archived")
    .order("title", { ascending: true })
    .limit(normalizeLimit(limit, 200));

  if (isMissingEngineeringTable(documentError)) {
    return [];
  }

  if (documentError) {
    throw documentError;
  }

  const canViewAllDocuments = canViewSensitiveOpsFoundation(profile.role);
  const visibleDocuments = ((documents ?? []) as unknown as RawDocumentOption[]).filter(
    (document) =>
      canViewAllDocuments ||
      document.visibility === "company" ||
      document.uploaded_by === profile.id,
  );
  const visibleDocumentIds = visibleDocuments.map((document) => document.id);

  if (visibleDocumentIds.length === 0) {
    return [];
  }

  const { data: versions, error: versionError } = await supabase
    .from("document_versions")
    .select("id, document_id, version_number, file_name")
    .in("document_id", visibleDocumentIds)
    .order("version_number", { ascending: false })
    .limit(500);

  if (isMissingEngineeringTable(versionError)) {
    return [];
  }

  if (versionError) {
    throw versionError;
  }

  const documentById = new Map(visibleDocuments.map((document) => [document.id, document]));

  return ((versions ?? []) as unknown as RawDocumentVersionOption[])
    .filter((version) => {
      const document = documentById.get(version.document_id);
      return (
        document &&
        normalizeNumber(version.version_number) === normalizeNumber(document.current_version_number)
      );
    })
    .map((version) => {
      const document = documentById.get(version.document_id);

      return {
        category: document?.category ?? "general",
        document_id: version.document_id,
        document_title: document?.title ?? "Untitled document",
        file_name: version.file_name,
        status: document?.status ?? "active",
        version_id: version.id,
        version_number: normalizeNumber(version.version_number),
      };
    });
}

export async function fetchPaginatedOpsSiteInstructions(
  options: FetchPaginatedOpsSiteInstructionsOptions,
): Promise<OpsPaginatedResult<OpsSiteInstructionSummary>> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEngineeringControls(profile.role)) {
    return toOpsPaginatedResult([], 0, options.listState);
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("site_instructions")
    .select(
      [
        "id",
        "instruction_number",
        "site_id",
        "instruction_type",
        "status",
        "priority",
        "title",
        "description",
        "instruction_date",
        "required_by",
        "issued_by",
        "assigned_to",
        "response_notes",
        "acknowledged_at",
        "closed_at",
        "cancelled_at",
        "created_by",
        "created_at",
        "site:sites!site_instructions_site_id_fkey(id, code, name)",
        "issued_by_user:users!site_instructions_issued_by_fkey(id, full_name, role)",
        "assigned_to_user:users!site_instructions_assigned_to_fkey(id, full_name, role)",
      ].join(", "),
      { count: "exact" },
    )
    .order("instruction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }

  const searchFilter = opsIlikeOrFilter(
    ["instruction_number", "title", "description", "response_notes"],
    options.query ?? "",
  );

  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await query.range(options.listState.from, options.listState.to);

  if (isMissingEngineeringTable(error)) {
    return toOpsPaginatedResult([], 0, options.listState);
  }

  if (error) {
    throw error;
  }

  return toOpsPaginatedResult(
    ((data ?? []) as unknown as RawSiteInstruction[]).map((instruction) => ({
      ...instruction,
      assigned_to_user: normalizeRelation(instruction.assigned_to_user),
      issued_by_user: normalizeRelation(instruction.issued_by_user),
      site: normalizeRelation(instruction.site),
    })),
    count,
    options.listState,
  );
}

function normalizeInstructionFollowUp(followUp: RawInstructionFollowUp): OpsSiteInstructionFollowUpSummary {
  return {
    ...followUp,
    assigned_to_user: normalizeRelation(followUp.assigned_to_user),
    instruction: normalizeRelation(followUp.instruction),
    site: normalizeRelation(followUp.site),
  };
}

export async function fetchOpsSiteInstructionFollowUpsForInstructions(instructionIds: string[]) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEngineeringControls(profile.role) || instructionIds.length === 0) {
    return new Map<string, OpsSiteInstructionFollowUpSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("site_instruction_follow_ups")
    .select(
      [
        "id",
        "instruction_id",
        "site_id",
        "task_type",
        "status",
        "title",
        "description",
        "assigned_to",
        "due_date",
        "closed_at",
        "cancelled_at",
        "created_by",
        "created_at",
        "site:sites!site_instruction_follow_ups_site_id_fkey(id, code, name)",
        "instruction:site_instructions!site_instruction_follow_ups_instruction_id_fkey(id, instruction_number, title)",
        "assigned_to_user:users!site_instruction_follow_ups_assigned_to_fkey(id, full_name, role)",
      ].join(", "),
    )
    .in("instruction_id", instructionIds)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (isMissingEngineeringTable(error)) {
    return new Map<string, OpsSiteInstructionFollowUpSummary[]>();
  }

  if (error) {
    throw error;
  }

  const grouped = new Map<string, OpsSiteInstructionFollowUpSummary[]>();

  ((data ?? []) as unknown as RawInstructionFollowUp[]).forEach((followUp) => {
    grouped.set(followUp.instruction_id, [
      ...(grouped.get(followUp.instruction_id) ?? []),
      normalizeInstructionFollowUp(followUp),
    ]);
  });

  return grouped;
}

export async function fetchRecentOpsSiteInstructionFollowUps(limit = 20) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEngineeringControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("site_instruction_follow_ups")
    .select(
      [
        "id",
        "instruction_id",
        "site_id",
        "task_type",
        "status",
        "title",
        "description",
        "assigned_to",
        "due_date",
        "closed_at",
        "cancelled_at",
        "created_by",
        "created_at",
        "site:sites!site_instruction_follow_ups_site_id_fkey(id, code, name)",
        "instruction:site_instructions!site_instruction_follow_ups_instruction_id_fkey(id, instruction_number, title)",
        "assigned_to_user:users!site_instruction_follow_ups_assigned_to_fkey(id, full_name, role)",
      ].join(", "),
    )
    .in("status", ["open", "in_progress"])
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isMissingEngineeringTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawInstructionFollowUp[]).map(normalizeInstructionFollowUp);
}

export async function fetchRecentOpsQaInspections(limit = 20) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEngineeringControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("qa_inspections")
    .select(
      [
        "id",
        "inspection_number",
        "site_id",
        "inspection_type",
        "status",
        "title",
        "inspection_date",
        "inspector_id",
        "score",
        "findings_count",
        "action_count",
        "summary",
        "action_required",
        "completed_at",
        "closed_at",
        "cancelled_at",
        "created_by",
        "created_at",
        "site:sites!qa_inspections_site_id_fkey(id, code, name)",
        "inspector:users!qa_inspections_inspector_id_fkey(id, full_name, role)",
      ].join(", "),
    )
    .order("inspection_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isMissingEngineeringTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  const inspections = (data ?? []) as unknown as RawQaInspection[];
  const itemsByInspectionId = await fetchQaInspectionItems(inspections.map((inspection) => inspection.id));

  return inspections.map((inspection) => ({
    ...inspection,
    action_count: normalizeNumber(inspection.action_count),
    findings_count: normalizeNumber(inspection.findings_count),
    inspector: normalizeRelation(inspection.inspector),
    items: itemsByInspectionId.get(inspection.id) ?? [],
    score: normalizeNumber(inspection.score),
    site: normalizeRelation(inspection.site),
  }));
}

export async function fetchRecentOpsMaterialTests(limit = 20) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEngineeringControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("material_tests")
    .select(
      [
        "id",
        "test_number",
        "site_id",
        "qa_inspection_id",
        "status",
        "test_type",
        "sample_reference",
        "location",
        "test_date",
        "required_by",
        "standard_reference",
        "lab_reference",
        "tested_by",
        "result_value",
        "result_summary",
        "completed_at",
        "cancelled_at",
        "created_by",
        "created_at",
        "site:sites!material_tests_site_id_fkey(id, code, name)",
      ].join(", "),
    )
    .order("test_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isMissingEngineeringTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawMaterialTest[]).map((test) => ({
    ...test,
    site: normalizeRelation(test.site),
  }));
}

export async function fetchRecentOpsSnagItems(limit = 20) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEngineeringControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("snag_items")
    .select(
      [
        "id",
        "snag_number",
        "site_id",
        "qa_inspection_id",
        "status",
        "priority",
        "title",
        "location",
        "description",
        "assigned_to",
        "due_date",
        "resolution_notes",
        "resolved_at",
        "verified_at",
        "cancelled_at",
        "created_by",
        "created_at",
        "site:sites!snag_items_site_id_fkey(id, code, name)",
        "assigned_to_user:users!snag_items_assigned_to_fkey(id, full_name, role)",
      ].join(", "),
    )
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isMissingEngineeringTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawSnagItem[]).map((snag) => ({
    ...snag,
    assigned_to_user: normalizeRelation(snag.assigned_to_user),
    site: normalizeRelation(snag.site),
  }));
}

export async function fetchRecentOpsDrawingRecords(limit = 20) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEngineeringControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("drawing_register")
    .select(
      [
        "id",
        "site_id",
        "drawing_number",
        "title",
        "discipline",
        "revision",
        "status",
        "issued_date",
        "received_date",
        "document_id",
        "document_version_id",
        "notes",
        "archived_at",
        "created_by",
        "created_at",
        "site:sites!drawing_register_site_id_fkey(id, code, name)",
        "document_version:document_versions!drawing_register_document_version_id_fkey(id, document_id, version_number, file_name, document:documents!document_versions_document_id_fkey(id, title, category, status))",
      ].join(", "),
    )
    .order("received_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isMissingEngineeringTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawDrawingRecord[]).map((drawing) => ({
    ...drawing,
    document_version: normalizeRelation(drawing.document_version),
    site: normalizeRelation(drawing.site),
  }));
}

export async function fetchRecentOpsProgrammeMilestones(limit = 20) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEngineeringControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("programme_milestones")
    .select(
      [
        "id",
        "milestone_number",
        "site_id",
        "title",
        "status",
        "baseline_date",
        "forecast_date",
        "actual_date",
        "progress_percent",
        "owner_id",
        "delay_reason",
        "notes",
        "completed_at",
        "cancelled_at",
        "created_by",
        "created_at",
        "site:sites!programme_milestones_site_id_fkey(id, code, name)",
        "owner:users!programme_milestones_owner_id_fkey(id, full_name, role)",
      ].join(", "),
    )
    .order("baseline_date", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isMissingEngineeringTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawProgrammeMilestone[]).map((milestone) => ({
    ...milestone,
    owner: normalizeRelation(milestone.owner),
    progress_percent: normalizeNumber(milestone.progress_percent),
    site: normalizeRelation(milestone.site),
  }));
}

export async function fetchOpsEngineeringControlStats(): Promise<OpsEngineeringControlStats> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEngineeringControls(profile.role)) {
    return {
      actionRequiredInspections: 0,
      currentDrawings: 0,
      delayedMilestones: 0,
      failedTests: 0,
      openFollowUps: 0,
      openInstructions: 0,
      openSnags: 0,
      overdueSnags: 0,
      plannedInspections: 0,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const [
    openInstructions,
    plannedInspections,
    actionRequiredInspections,
    failedTests,
    openSnags,
    overdueSnags,
    currentDrawings,
    delayedMilestones,
    openFollowUps,
  ] = await Promise.all([
    countByQuery((supabase) =>
      supabase
        .from("site_instructions")
        .select("id", { count: "exact", head: true })
        .in("status", ["draft", "issued", "acknowledged"]),
    ),
    countByQuery((supabase) =>
      supabase.from("qa_inspections").select("id", { count: "exact", head: true }).eq("status", "planned"),
    ),
    countByQuery((supabase) =>
      supabase
        .from("qa_inspections")
        .select("id", { count: "exact", head: true })
        .eq("status", "action_required"),
    ),
    countByQuery((supabase) =>
      supabase.from("material_tests").select("id", { count: "exact", head: true }).eq("status", "failed"),
    ),
    countByQuery((supabase) =>
      supabase
        .from("snag_items")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress", "resolved"]),
    ),
    countByQuery((supabase) =>
      supabase
        .from("snag_items")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"])
        .lt("due_date", today),
    ),
    countByQuery((supabase) =>
      supabase.from("drawing_register").select("id", { count: "exact", head: true }).eq("status", "current"),
    ),
    countByQuery((supabase) =>
      supabase
        .from("programme_milestones")
        .select("id", { count: "exact", head: true })
        .eq("status", "delayed"),
    ),
    countByQuery((supabase) =>
      supabase
        .from("site_instruction_follow_ups")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]),
    ),
  ]);

  return {
    actionRequiredInspections,
    currentDrawings,
    delayedMilestones,
    failedTests,
    openFollowUps,
    openInstructions,
    openSnags,
    overdueSnags,
    plannedInspections,
  };
}

export async function fetchOpsEngineeringProgrammePressureReport(): Promise<OpsEngineeringProgrammePressureReport> {
  const emptyReport = buildOpsEngineeringProgrammePressureReport({
    milestones: [],
    todayDate: todayInLusaka(),
  });
  const { profile } = await requireOpsUser();

  if (!canViewOpsEngineeringControls(profile.role)) {
    return emptyReport;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("programme_milestones")
    .select(
      [
        "milestone_number",
        "site_id",
        "title",
        "status",
        "baseline_date",
        "forecast_date",
        "actual_date",
        "progress_percent",
        "delay_reason",
        "site:sites!programme_milestones_site_id_fkey(id, code, name)",
      ].join(", "),
    )
    .order("baseline_date", { ascending: true })
    .limit(300);

  if (isMissingEngineeringTable(error)) {
    return emptyReport;
  }

  if (error) {
    throw error;
  }

  return buildOpsEngineeringProgrammePressureReport({
    milestones: (data ?? []) as unknown as OpsEngineeringProgrammeMilestoneSource[],
    todayDate: todayInLusaka(),
  });
}

export async function fetchOpsEngineeringQaCategoryReport(): Promise<OpsEngineeringQaCategoryRow[]> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEngineeringControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("qa_inspection_items")
    .select("finding_category, result, action_required")
    .or("action_required.eq.true,result.eq.fail,result.eq.observation")
    .limit(500);

  if (isMissingEngineeringTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return buildOpsEngineeringQaCategoryReport((data ?? []) as unknown as OpsEngineeringQaCategorySource[]);
}
