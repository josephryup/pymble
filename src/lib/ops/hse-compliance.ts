import { requireOpsUser } from "@/lib/ops/auth";
import { canViewOpsHseCompliance } from "@/lib/ops/hse-permissions";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsEmployeeStatus,
  OpsHseComplianceAuditStatus,
  OpsHseIncidentSeverity,
  OpsHseIncidentStatus,
  OpsHseInspectionFindingStatus,
  OpsHseInspectionStatus,
  OpsHseInspectionType,
  OpsHseRiskAssessmentStatus,
  OpsPpeIssueStatus,
  OpsPpeItemType,
  OpsSafetyTrainingStatus,
  OpsToolboxTalkStatus,
  OpsUserRole,
} from "@/lib/ops/types";

export type OpsHseComplianceSiteSummary = {
  code: string;
  id: string;
  name: string;
};

export type OpsHseComplianceUserSummary = {
  full_name: string;
  id: string;
  role: OpsUserRole;
};

export type OpsHseComplianceEmployeeSummary = {
  employee_number: string;
  full_name: string;
  id: string;
  job_title: string;
  status: OpsEmployeeStatus;
};

export type OpsHseComplianceEmployeeOption = OpsHseComplianceEmployeeSummary;

export type OpsPpeItemSummary = {
  created_at: string;
  created_by: string | null;
  description: string;
  id: string;
  is_active: boolean;
  item_code: string;
  item_name: string;
  ppe_type: OpsPpeItemType;
  reorder_level: number;
  stock_on_hand: number;
  storage_location: string;
  unit: string;
};

export type OpsPpeIssueSummary = {
  cancelled_at: string | null;
  created_at: string;
  created_by: string | null;
  due_return_date: string | null;
  employee: OpsHseComplianceEmployeeSummary | null;
  employee_id: string | null;
  id: string;
  issue_date: string;
  issue_number: string;
  issued_by: string | null;
  issued_by_user: OpsHseComplianceUserSummary | null;
  issued_to_name: string;
  item_description: string;
  notes: string;
  ppe_item: OpsPpeItemSummary | null;
  ppe_item_id: string | null;
  ppe_type: OpsPpeItemType;
  quantity: number;
  replacement_cost: number;
  return_condition_notes: string;
  returned_at: string | null;
  site: OpsHseComplianceSiteSummary | null;
  site_id: string | null;
  status: OpsPpeIssueStatus;
};

export type OpsToolboxTalkAttendeeSummary = {
  attended: boolean;
  attendee_name: string;
  company: string;
  employee: OpsHseComplianceEmployeeSummary | null;
  employee_id: string | null;
  id: string;
  notes: string;
  role_title: string;
  talk_id: string;
};

export type OpsToolboxTalkSummary = {
  actions_required: string;
  attendees: OpsToolboxTalkAttendeeSummary[];
  attendees_count: number;
  cancelled_at: string | null;
  completed_at: string | null;
  created_at: string;
  created_by: string | null;
  duration_minutes: number;
  facilitator: OpsHseComplianceUserSummary | null;
  facilitator_id: string | null;
  id: string;
  safety_category: string;
  site: OpsHseComplianceSiteSummary | null;
  site_id: string;
  status: OpsToolboxTalkStatus;
  summary: string;
  talk_date: string;
  talk_number: string;
  topic: string;
};

export type OpsHseInspectionFindingSummary = {
  cancelled_at: string | null;
  completed_at: string | null;
  completion_notes: string;
  corrective_action_id: string | null;
  created_at: string;
  created_by: string | null;
  description: string;
  due_date: string | null;
  finding_number: string;
  finding_type: string;
  id: string;
  inspection_id: string;
  responsible_user: OpsHseComplianceUserSummary | null;
  responsible_user_id: string | null;
  severity: OpsHseIncidentSeverity;
  site: OpsHseComplianceSiteSummary | null;
  site_id: string | null;
  status: OpsHseInspectionFindingStatus;
  title: string;
  verified_at: string | null;
};

export type OpsHseInspectionSummary = {
  action_count: number;
  action_required_at: string | null;
  cancelled_at: string | null;
  closed_at: string | null;
  completed_at: string | null;
  corrective_actions_required: string;
  created_at: string;
  created_by: string | null;
  findings: OpsHseInspectionFindingSummary[];
  findings_count: number;
  id: string;
  inspection_number: string;
  inspection_type: OpsHseInspectionType;
  inspector: OpsHseComplianceUserSummary | null;
  inspector_id: string | null;
  scheduled_date: string;
  score: number;
  site: OpsHseComplianceSiteSummary | null;
  site_id: string;
  status: OpsHseInspectionStatus;
  summary: string;
  title: string;
};

export type OpsSafetyTrainingRecordSummary = {
  cancelled_at: string | null;
  certificate_document_id: string | null;
  completed_by: string | null;
  completed_by_user: OpsHseComplianceUserSummary | null;
  completed_date: string | null;
  created_at: string;
  created_by: string | null;
  employee: OpsHseComplianceEmployeeSummary | null;
  employee_id: string | null;
  expiry_date: string | null;
  id: string;
  notes: string;
  planned_date: string;
  provider: string;
  score: number;
  site: OpsHseComplianceSiteSummary | null;
  site_id: string | null;
  status: OpsSafetyTrainingStatus;
  trainee_name: string;
  training_number: string;
  training_title: string;
  training_type: string;
};

export type OpsHseRiskAssessmentSummary = {
  activity: string;
  approved_at: string | null;
  archived_at: string | null;
  area_location: string;
  assessment_date: string;
  assessment_number: string;
  cancelled_at: string | null;
  control_measures: string;
  created_at: string;
  created_by: string | null;
  hazard_category: string;
  id: string;
  initial_risk: OpsHseIncidentSeverity;
  residual_risk: OpsHseIncidentSeverity;
  responsible_user: OpsHseComplianceUserSummary | null;
  responsible_user_id: string | null;
  review_date: string | null;
  site: OpsHseComplianceSiteSummary | null;
  site_id: string | null;
  status: OpsHseRiskAssessmentStatus;
  submitted_at: string | null;
  title: string;
};

export type OpsHseComplianceAuditSummary = {
  action_required: string;
  action_required_at: string | null;
  audit_number: string;
  audit_type: string;
  auditor: OpsHseComplianceUserSummary | null;
  auditor_id: string | null;
  cancelled_at: string | null;
  closed_at: string | null;
  completed_by: string | null;
  completed_by_user: OpsHseComplianceUserSummary | null;
  completed_date: string | null;
  created_at: string;
  created_by: string | null;
  findings_count: number;
  id: string;
  next_audit_date: string | null;
  non_conformance_count: number;
  scheduled_date: string;
  score: number;
  site: OpsHseComplianceSiteSummary | null;
  site_id: string | null;
  status: OpsHseComplianceAuditStatus;
  summary: string;
  title: string;
};

export type OpsHseAgeingAlert = {
  days_open: number;
  id: string;
  incident_number: string;
  occurred_at: string;
  severity: OpsHseIncidentSeverity;
  site: OpsHseComplianceSiteSummary | null;
  status: OpsHseIncidentStatus;
  title: string;
};

export type OpsHseComplianceStats = {
  actionRequiredInspections: number;
  actionRequiredAudits: number;
  agedIncidents: number;
  auditsDueSoon: number;
  completedTalks: number;
  expiredTraining: number;
  highRiskAssessments: number;
  issuedPpe: number;
  lowStockPpeItems: number;
  openInspections: number;
  openInspectionFindings: number;
  openRiskAssessments: number;
  overdueInspections: number;
  overduePpe: number;
  plannedTalks: number;
  reviewDueRiskAssessments: number;
  trainingDueSoon: number;
};

export type FetchPaginatedOpsPpeIssuesOptions = {
  listState: OpsListState;
  query?: string;
  status?: OpsPpeIssueStatus;
};

type RawRelation<T> = T | T[] | null;

type RawPpeItem = Omit<OpsPpeItemSummary, "reorder_level" | "stock_on_hand"> & {
  reorder_level: number | string;
  stock_on_hand: number | string;
};

type RawPpeIssue = Omit<
  OpsPpeIssueSummary,
  "employee" | "issued_by_user" | "ppe_item" | "quantity" | "replacement_cost" | "site"
> & {
  employee: RawRelation<OpsHseComplianceEmployeeSummary>;
  issued_by_user: RawRelation<OpsHseComplianceUserSummary>;
  ppe_item: RawRelation<RawPpeItem>;
  quantity: number | string;
  replacement_cost: number | string;
  site: RawRelation<OpsHseComplianceSiteSummary>;
};

type RawToolboxTalkAttendee = Omit<OpsToolboxTalkAttendeeSummary, "employee"> & {
  employee: RawRelation<OpsHseComplianceEmployeeSummary>;
};

type RawToolboxTalk = Omit<
  OpsToolboxTalkSummary,
  "attendees" | "attendees_count" | "duration_minutes" | "facilitator" | "site"
> & {
  attendees_count: number | string;
  duration_minutes: number | string;
  facilitator: RawRelation<OpsHseComplianceUserSummary>;
  site: RawRelation<OpsHseComplianceSiteSummary>;
};

type RawHseInspectionFinding = Omit<
  OpsHseInspectionFindingSummary,
  "responsible_user" | "site"
> & {
  responsible_user: RawRelation<OpsHseComplianceUserSummary>;
  site: RawRelation<OpsHseComplianceSiteSummary>;
};

type RawHseInspection = Omit<
  OpsHseInspectionSummary,
  "action_count" | "findings" | "findings_count" | "inspector" | "score" | "site"
> & {
  action_count: number | string;
  findings_count: number | string;
  inspector: RawRelation<OpsHseComplianceUserSummary>;
  score: number | string;
  site: RawRelation<OpsHseComplianceSiteSummary>;
};

type RawSafetyTrainingRecord = Omit<
  OpsSafetyTrainingRecordSummary,
  "completed_by_user" | "employee" | "score" | "site"
> & {
  completed_by_user: RawRelation<OpsHseComplianceUserSummary>;
  employee: RawRelation<OpsHseComplianceEmployeeSummary>;
  score: number | string;
  site: RawRelation<OpsHseComplianceSiteSummary>;
};

type RawHseRiskAssessment = Omit<
  OpsHseRiskAssessmentSummary,
  "responsible_user" | "site"
> & {
  responsible_user: RawRelation<OpsHseComplianceUserSummary>;
  site: RawRelation<OpsHseComplianceSiteSummary>;
};

type RawHseComplianceAudit = Omit<
  OpsHseComplianceAuditSummary,
  "auditor" | "completed_by_user" | "findings_count" | "non_conformance_count" | "score" | "site"
> & {
  auditor: RawRelation<OpsHseComplianceUserSummary>;
  completed_by_user: RawRelation<OpsHseComplianceUserSummary>;
  findings_count: number | string;
  non_conformance_count: number | string;
  score: number | string;
  site: RawRelation<OpsHseComplianceSiteSummary>;
};

type RawAgeingIncident = Omit<OpsHseAgeingAlert, "days_open" | "site"> & {
  site: RawRelation<OpsHseComplianceSiteSummary>;
};

function normalizeRelation<T>(value: RawRelation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function normalizeLimit(limit: number, max = 250) {
  return Math.min(Math.max(limit, 1), max);
}

function isMissingHseComplianceTable(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST200" ||
        error.code === "PGRST205" ||
        /ppe_items|ppe_issues|toolbox_talks|toolbox_talk_attendees|hse_inspections|hse_inspection_findings|safety_training_records|hse_risk_assessments|hse_compliance_audits|schema cache/i.test(
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

  if (isMissingHseComplianceTable(error)) {
    return 0;
  }

  if (error) {
    throw error;
  }

  return count ?? 0;
}

function normalizePpeItem(item: RawPpeItem): OpsPpeItemSummary {
  return {
    ...item,
    reorder_level: normalizeNumber(item.reorder_level),
    stock_on_hand: normalizeNumber(item.stock_on_hand),
  };
}

function normalizePpeItemRelation(value: RawRelation<RawPpeItem>) {
  const item = normalizeRelation(value);
  return item ? normalizePpeItem(item) : null;
}

export async function fetchRecentOpsPpeItems(limit = 18) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHseCompliance(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("ppe_items")
    .select(
      "id, item_code, ppe_type, item_name, description, storage_location, unit, stock_on_hand, reorder_level, is_active, created_by, created_at",
    )
    .order("is_active", { ascending: false })
    .order("stock_on_hand", { ascending: true })
    .order("item_name", { ascending: true })
    .limit(normalizeLimit(limit, 80));

  if (isMissingHseComplianceTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawPpeItem[]).map(normalizePpeItem);
}

export async function fetchActivePpeItemOptions(limit = 150) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHseCompliance(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("ppe_items")
    .select(
      "id, item_code, ppe_type, item_name, description, storage_location, unit, stock_on_hand, reorder_level, is_active, created_by, created_at",
    )
    .eq("is_active", true)
    .order("item_name", { ascending: true })
    .limit(normalizeLimit(limit, 300));

  if (isMissingHseComplianceTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawPpeItem[]).map(normalizePpeItem);
}

export async function fetchHseComplianceEmployeeOptions(limit = 200) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHseCompliance(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, employee_number, full_name, job_title, status")
    .in("status", ["active", "probation", "on_leave"])
    .order("full_name", { ascending: true })
    .limit(normalizeLimit(limit, 300));

  if (isMissingHseComplianceTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return (data ?? []) as OpsHseComplianceEmployeeOption[];
}

export async function fetchPaginatedOpsPpeIssues(
  options: FetchPaginatedOpsPpeIssuesOptions,
): Promise<OpsPaginatedResult<OpsPpeIssueSummary>> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHseCompliance(profile.role)) {
    return toOpsPaginatedResult([], 0, options.listState);
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("ppe_issues")
    .select(
      [
        "id",
        "issue_number",
        "site_id",
        "ppe_item_id",
        "employee_id",
        "issued_to_name",
        "ppe_type",
        "item_description",
        "quantity",
        "status",
        "issue_date",
        "due_return_date",
        "issued_by",
        "returned_at",
        "return_condition_notes",
        "replacement_cost",
        "notes",
        "cancelled_at",
        "created_by",
        "created_at",
        "site:sites!ppe_issues_site_id_fkey(id, code, name)",
        "ppe_item:ppe_items!ppe_issues_ppe_item_id_fkey(id, item_code, ppe_type, item_name, description, storage_location, unit, stock_on_hand, reorder_level, is_active, created_by, created_at)",
        "employee:employees!ppe_issues_employee_id_fkey(id, employee_number, full_name, job_title, status)",
        "issued_by_user:users!ppe_issues_issued_by_fkey(id, full_name, role)",
      ].join(", "),
      { count: "exact" },
    )
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }

  const searchFilter = opsIlikeOrFilter(
    ["issue_number", "issued_to_name", "item_description", "notes"],
    options.query ?? "",
  );

  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await query.range(options.listState.from, options.listState.to);

  if (isMissingHseComplianceTable(error)) {
    return toOpsPaginatedResult([], 0, options.listState);
  }

  if (error) {
    throw error;
  }

  return toOpsPaginatedResult(
    ((data ?? []) as unknown as RawPpeIssue[]).map((issue) => ({
      ...issue,
      employee: normalizeRelation(issue.employee),
      issued_by_user: normalizeRelation(issue.issued_by_user),
      ppe_item: normalizePpeItemRelation(issue.ppe_item),
      quantity: normalizeNumber(issue.quantity),
      replacement_cost: normalizeNumber(issue.replacement_cost),
      site: normalizeRelation(issue.site),
    })),
    count,
    options.listState,
  );
}

async function fetchToolboxTalkAttendees(talkIds: string[]) {
  if (talkIds.length === 0) {
    return new Map<string, OpsToolboxTalkAttendeeSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("toolbox_talk_attendees")
    .select(
      [
        "id",
        "talk_id",
        "employee_id",
        "attendee_name",
        "role_title",
        "company",
        "attended",
        "notes",
        "employee:employees!toolbox_talk_attendees_employee_id_fkey(id, employee_number, full_name, job_title, status)",
      ].join(", "),
    )
    .in("talk_id", talkIds)
    .order("attendee_name", { ascending: true });

  if (isMissingHseComplianceTable(error)) {
    return new Map<string, OpsToolboxTalkAttendeeSummary[]>();
  }

  if (error) {
    throw error;
  }

  const grouped = new Map<string, OpsToolboxTalkAttendeeSummary[]>();
  ((data ?? []) as unknown as RawToolboxTalkAttendee[]).forEach((attendee) => {
    grouped.set(attendee.talk_id, [
      ...(grouped.get(attendee.talk_id) ?? []),
      {
        ...attendee,
        employee: normalizeRelation(attendee.employee),
      },
    ]);
  });

  return grouped;
}

export async function fetchRecentOpsToolboxTalks(limit = 20) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHseCompliance(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("toolbox_talks")
    .select(
      [
        "id",
        "talk_number",
        "site_id",
        "topic",
        "safety_category",
        "status",
        "talk_date",
        "facilitator_id",
        "attendees_count",
        "duration_minutes",
        "summary",
        "actions_required",
        "completed_at",
        "cancelled_at",
        "created_by",
        "created_at",
        "site:sites!toolbox_talks_site_id_fkey(id, code, name)",
        "facilitator:users!toolbox_talks_facilitator_id_fkey(id, full_name, role)",
      ].join(", "),
    )
    .order("talk_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isMissingHseComplianceTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  const talks = (data ?? []) as unknown as RawToolboxTalk[];
  const attendeesByTalkId = await fetchToolboxTalkAttendees(talks.map((talk) => talk.id));

  return talks.map((talk) => ({
    ...talk,
    attendees: attendeesByTalkId.get(talk.id) ?? [],
    attendees_count: normalizeNumber(talk.attendees_count),
    duration_minutes: normalizeNumber(talk.duration_minutes),
    facilitator: normalizeRelation(talk.facilitator),
    site: normalizeRelation(talk.site),
  }));
}

async function fetchHseInspectionFindings(inspectionIds: string[]) {
  if (inspectionIds.length === 0) {
    return new Map<string, OpsHseInspectionFindingSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("hse_inspection_findings")
    .select(
      [
        "id",
        "finding_number",
        "inspection_id",
        "site_id",
        "finding_type",
        "severity",
        "status",
        "title",
        "description",
        "responsible_user_id",
        "due_date",
        "corrective_action_id",
        "completion_notes",
        "completed_at",
        "verified_at",
        "cancelled_at",
        "created_by",
        "created_at",
        "site:sites!hse_inspection_findings_site_id_fkey(id, code, name)",
        "responsible_user:users!hse_inspection_findings_responsible_user_id_fkey(id, full_name, role)",
      ].join(", "),
    )
    .in("inspection_id", inspectionIds)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (isMissingHseComplianceTable(error)) {
    return new Map<string, OpsHseInspectionFindingSummary[]>();
  }

  if (error) {
    throw error;
  }

  const grouped = new Map<string, OpsHseInspectionFindingSummary[]>();
  ((data ?? []) as unknown as RawHseInspectionFinding[]).forEach((finding) => {
    grouped.set(finding.inspection_id, [
      ...(grouped.get(finding.inspection_id) ?? []),
      {
        ...finding,
        responsible_user: normalizeRelation(finding.responsible_user),
        site: normalizeRelation(finding.site),
      },
    ]);
  });

  return grouped;
}

export async function fetchRecentOpsHseInspections(limit = 20) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHseCompliance(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("hse_inspections")
    .select(
      [
        "id",
        "inspection_number",
        "site_id",
        "inspection_type",
        "title",
        "status",
        "scheduled_date",
        "inspector_id",
        "score",
        "findings_count",
        "action_count",
        "summary",
        "corrective_actions_required",
        "completed_at",
        "action_required_at",
        "closed_at",
        "cancelled_at",
        "created_by",
        "created_at",
        "site:sites!hse_inspections_site_id_fkey(id, code, name)",
        "inspector:users!hse_inspections_inspector_id_fkey(id, full_name, role)",
      ].join(", "),
    )
    .order("scheduled_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isMissingHseComplianceTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  const inspections = (data ?? []) as unknown as RawHseInspection[];
  const findingsByInspectionId = await fetchHseInspectionFindings(inspections.map((inspection) => inspection.id));

  return inspections.map((inspection) => ({
    ...inspection,
    action_count: normalizeNumber(inspection.action_count),
    findings: findingsByInspectionId.get(inspection.id) ?? [],
    findings_count: normalizeNumber(inspection.findings_count),
    inspector: normalizeRelation(inspection.inspector),
    score: normalizeNumber(inspection.score),
    site: normalizeRelation(inspection.site),
  }));
}

export async function fetchRecentOpsSafetyTrainingRecords(limit = 20) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHseCompliance(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("safety_training_records")
    .select(
      [
        "id",
        "training_number",
        "site_id",
        "employee_id",
        "trainee_name",
        "training_title",
        "training_type",
        "provider",
        "status",
        "planned_date",
        "completed_date",
        "expiry_date",
        "certificate_document_id",
        "score",
        "notes",
        "completed_by",
        "cancelled_at",
        "created_by",
        "created_at",
        "site:sites!safety_training_records_site_id_fkey(id, code, name)",
        "employee:employees!safety_training_records_employee_id_fkey(id, employee_number, full_name, job_title, status)",
        "completed_by_user:users!safety_training_records_completed_by_fkey(id, full_name, role)",
      ].join(", "),
    )
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("planned_date", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isMissingHseComplianceTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawSafetyTrainingRecord[]).map((training) => ({
    ...training,
    completed_by_user: normalizeRelation(training.completed_by_user),
    employee: normalizeRelation(training.employee),
    score: normalizeNumber(training.score),
    site: normalizeRelation(training.site),
  }));
}

export async function fetchRecentOpsHseRiskAssessments(limit = 20) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHseCompliance(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("hse_risk_assessments")
    .select(
      [
        "id",
        "assessment_number",
        "site_id",
        "title",
        "activity",
        "area_location",
        "hazard_category",
        "initial_risk",
        "residual_risk",
        "control_measures",
        "responsible_user_id",
        "assessment_date",
        "review_date",
        "status",
        "submitted_at",
        "approved_at",
        "archived_at",
        "cancelled_at",
        "created_by",
        "created_at",
        "site:sites!hse_risk_assessments_site_id_fkey(id, code, name)",
        "responsible_user:users!hse_risk_assessments_responsible_user_id_fkey(id, full_name, role)",
      ].join(", "),
    )
    .order("review_date", { ascending: true, nullsFirst: false })
    .order("assessment_date", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isMissingHseComplianceTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawHseRiskAssessment[]).map((assessment) => ({
    ...assessment,
    responsible_user: normalizeRelation(assessment.responsible_user),
    site: normalizeRelation(assessment.site),
  }));
}

export async function fetchRecentOpsHseComplianceAudits(limit = 20) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHseCompliance(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("hse_compliance_audits")
    .select(
      [
        "id",
        "audit_number",
        "site_id",
        "audit_type",
        "title",
        "auditor_id",
        "scheduled_date",
        "completed_date",
        "score",
        "findings_count",
        "non_conformance_count",
        "summary",
        "action_required",
        "next_audit_date",
        "status",
        "completed_by",
        "action_required_at",
        "closed_at",
        "cancelled_at",
        "created_by",
        "created_at",
        "site:sites!hse_compliance_audits_site_id_fkey(id, code, name)",
        "auditor:users!hse_compliance_audits_auditor_id_fkey(id, full_name, role)",
        "completed_by_user:users!hse_compliance_audits_completed_by_fkey(id, full_name, role)",
      ].join(", "),
    )
    .order("scheduled_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isMissingHseComplianceTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawHseComplianceAudit[]).map((audit) => ({
    ...audit,
    auditor: normalizeRelation(audit.auditor),
    completed_by_user: normalizeRelation(audit.completed_by_user),
    findings_count: normalizeNumber(audit.findings_count),
    non_conformance_count: normalizeNumber(audit.non_conformance_count),
    score: normalizeNumber(audit.score),
    site: normalizeRelation(audit.site),
  }));
}

export async function fetchOpsHseAgeingAlerts(limit = 8) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHseCompliance(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("hse_incidents")
    .select(
      [
        "id",
        "incident_number",
        "title",
        "severity",
        "status",
        "occurred_at",
        "site:sites!hse_incidents_site_id_fkey(id, code, name)",
      ].join(", "),
    )
    .in("status", ["reported", "investigating", "action_required"])
    .order("occurred_at", { ascending: true })
    .limit(normalizeLimit(limit, 40));

  if (isMissingHseComplianceTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  const now = Date.now();

  return ((data ?? []) as unknown as RawAgeingIncident[]).map((incident) => ({
    ...incident,
    days_open: Math.max(
      0,
      Math.floor((now - new Date(incident.occurred_at).getTime()) / (1000 * 60 * 60 * 24)),
    ),
    site: normalizeRelation(incident.site),
  }));
}

export async function fetchOpsHseComplianceStats(): Promise<OpsHseComplianceStats> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHseCompliance(profile.role)) {
    return {
      actionRequiredInspections: 0,
      actionRequiredAudits: 0,
      agedIncidents: 0,
      auditsDueSoon: 0,
      completedTalks: 0,
      expiredTraining: 0,
      highRiskAssessments: 0,
      issuedPpe: 0,
      lowStockPpeItems: 0,
      openInspections: 0,
      openInspectionFindings: 0,
      openRiskAssessments: 0,
      overdueInspections: 0,
      overduePpe: 0,
      plannedTalks: 0,
      reviewDueRiskAssessments: 0,
      trainingDueSoon: 0,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const dueSoonDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [
    issuedPpe,
    overduePpe,
    plannedTalks,
    completedTalks,
    openInspections,
    actionRequiredInspections,
    overdueInspections,
    agedIncidents,
    lowStockPpeItems,
    openInspectionFindings,
    trainingDueSoon,
    expiredTrainingMarked,
    expiredTrainingByDate,
    openRiskAssessments,
    highRiskAssessments,
    reviewDueRiskAssessments,
    auditsDueSoon,
    actionRequiredAudits,
  ] = await Promise.all([
    countByQuery((supabase) =>
      supabase.from("ppe_issues").select("id", { count: "exact", head: true }).eq("status", "issued"),
    ),
    countByQuery((supabase) =>
      supabase
        .from("ppe_issues")
        .select("id", { count: "exact", head: true })
        .eq("status", "issued")
        .lt("due_return_date", today),
    ),
    countByQuery((supabase) =>
      supabase.from("toolbox_talks").select("id", { count: "exact", head: true }).eq("status", "planned"),
    ),
    countByQuery((supabase) =>
      supabase
        .from("toolbox_talks")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed"),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_inspections")
        .select("id", { count: "exact", head: true })
        .in("status", ["planned", "action_required"]),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_inspections")
        .select("id", { count: "exact", head: true })
        .eq("status", "action_required"),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_inspections")
        .select("id", { count: "exact", head: true })
        .in("status", ["planned", "action_required"])
        .lt("scheduled_date", today),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_incidents")
        .select("id", { count: "exact", head: true })
        .in("status", ["reported", "investigating", "action_required"])
        .lt("occurred_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ),
    countByQuery((supabase) =>
      supabase
        .from("ppe_items")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("stock_on_hand", 0),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_inspection_findings")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress", "corrected"]),
    ),
    countByQuery((supabase) =>
      supabase
        .from("safety_training_records")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("expiry_date", today)
        .lte("expiry_date", dueSoonDate),
    ),
    countByQuery((supabase) =>
      supabase
        .from("safety_training_records")
        .select("id", { count: "exact", head: true })
        .eq("status", "expired"),
    ),
    countByQuery((supabase) =>
      supabase
        .from("safety_training_records")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .lt("expiry_date", today),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_risk_assessments")
        .select("id", { count: "exact", head: true })
        .in("status", ["draft", "submitted"]),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_risk_assessments")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .in("residual_risk", ["high", "critical"]),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_risk_assessments")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .lte("review_date", dueSoonDate),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_compliance_audits")
        .select("id", { count: "exact", head: true })
        .eq("status", "planned")
        .lte("scheduled_date", dueSoonDate),
    ),
    countByQuery((supabase) =>
      supabase
        .from("hse_compliance_audits")
        .select("id", { count: "exact", head: true })
        .eq("status", "action_required"),
    ),
  ]);

  return {
    actionRequiredInspections,
    actionRequiredAudits,
    agedIncidents,
    auditsDueSoon,
    completedTalks,
    expiredTraining: expiredTrainingMarked + expiredTrainingByDate,
    highRiskAssessments,
    issuedPpe,
    lowStockPpeItems,
    openInspections,
    openInspectionFindings,
    openRiskAssessments,
    overdueInspections,
    overduePpe,
    plannedTalks,
    reviewDueRiskAssessments,
    trainingDueSoon,
  };
}
