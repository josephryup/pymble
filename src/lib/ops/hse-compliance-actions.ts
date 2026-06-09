"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  OPS_HSE_ESCALATION_NOTIFICATION_ROLES,
  OPS_HSE_REVIEW_NOTIFICATION_ROLES,
  queueOpsHseRoleNotifications,
  queueOpsHseUserNotification,
} from "@/lib/ops/hse-notifications";
import {
  canAddOpsToolboxTalkAttendee,
  canAdjustOpsPpeItem,
  canApproveOpsHseRiskAssessment,
  canArchiveOpsHseRiskAssessment,
  canCancelOpsHseComplianceAudit,
  canCancelOpsHseInspection,
  canCancelOpsHseInspectionFinding,
  canCancelOpsPpeIssue,
  canCancelOpsHseRiskAssessment,
  canCancelOpsSafetyTraining,
  canCancelOpsToolboxTalk,
  canCloseOpsHseComplianceAudit,
  canCompleteOpsSafetyTraining,
  canCorrectOpsHseInspectionFinding,
  canCompleteOpsHseComplianceAudit,
  canCreateOpsHseComplianceAudit,
  canCreateOpsHseInspectionFinding,
  canCompleteOpsHseInspection,
  canCompleteOpsToolboxTalk,
  canCreateOpsHseInspection,
  canCreateOpsPpeIssue,
  canCreateOpsPpeItem,
  canCreateOpsHseRiskAssessment,
  canCreateOpsSafetyTraining,
  canCreateOpsToolboxTalk,
  canMarkOpsPpeIssueDamaged,
  canMarkOpsPpeIssueLost,
  canRequireOpsHseComplianceAuditAction,
  canRequireOpsHseInspectionAction,
  canReturnOpsPpeIssue,
  canCloseOpsHseInspection,
  canStartOpsHseInspectionFinding,
  canSubmitOpsHseRiskAssessment,
  canVerifyOpsHseInspectionFinding,
} from "@/lib/ops/hse-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsHseIncidentSeverity,
  OpsHseComplianceAuditStatus,
  OpsHseInspectionFindingStatus,
  OpsHseInspectionStatus,
  OpsHseInspectionType,
  OpsHseRiskAssessmentStatus,
  OpsPpeIssueStatus,
  OpsPpeItemType,
  OpsSafetyTrainingStatus,
  OpsToolboxTalkStatus,
} from "@/lib/ops/types";

const HSE_COMPLIANCE_ROUTE = "/ops/hse-compliance";

const ppeTypes = [
  "helmet",
  "vest",
  "boots",
  "gloves",
  "goggles",
  "harness",
  "respirator",
  "ear_protection",
  "other",
] as const satisfies readonly OpsPpeItemType[];

const inspectionTypes = [
  "site_walk",
  "scaffolding",
  "lifting",
  "electrical",
  "excavation",
  "fire",
  "environmental",
  "plant_equipment",
  "housekeeping",
  "other",
] as const satisfies readonly OpsHseInspectionType[];

const findingSeverities = ["low", "medium", "high", "critical"] as const satisfies readonly OpsHseIncidentSeverity[];

const ppeItemSchema = z.object({
  description: z.string().trim().max(900).default(""),
  item_name: z.string().trim().min(2, "PPE item name is required.").max(160),
  ppe_type: z.enum(ppeTypes),
  reorder_level: z.coerce.number().int().min(0, "Reorder level cannot be negative.").default(0),
  stock_on_hand: z.coerce.number().int().min(0, "Stock cannot be negative.").default(0),
  storage_location: z.string().trim().max(160).default(""),
  unit: z.string().trim().max(30).default("each"),
});

const ppeItemIdSchema = z.object({
  ppe_item_id: z.string().uuid("Select a PPE item."),
});

const ppeItemAdjustSchema = ppeItemIdSchema.extend({
  quantity_delta: z.coerce.number().int().refine((value) => value !== 0, {
    message: "Adjustment quantity cannot be zero.",
  }),
});

const ppeIssueSchema = z.object({
  due_return_date: z.string().trim().default(""),
  employee_id: z.string().trim().default(""),
  issue_date: z.string().trim().default(""),
  issued_to_name: z.string().trim().min(2, "Issued-to name is required.").max(160),
  item_description: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(900).default(""),
  ppe_item_id: z.string().trim().default(""),
  ppe_type: z.enum(ppeTypes),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1.").default(1),
  site_id: z.string().trim().default(""),
});

const ppeIssueIdSchema = z.object({
  issue_id: z.string().uuid("Select a PPE issue."),
});

const ppeReturnSchema = ppeIssueIdSchema.extend({
  return_condition_notes: z.string().trim().max(700).default(""),
});

const ppeLossSchema = ppeIssueIdSchema.extend({
  replacement_cost: z.coerce.number().min(0, "Replacement cost cannot be negative.").default(0),
  return_condition_notes: z.string().trim().max(700).default(""),
});

const toolboxTalkSchema = z.object({
  facilitator_id: z.string().trim().default(""),
  safety_category: z.string().trim().max(120).default(""),
  site_id: z.string().uuid("Select a site."),
  summary: z.string().trim().max(1200).default(""),
  talk_date: z.string().trim().default(""),
  topic: z.string().trim().min(2, "Toolbox topic is required.").max(180),
});

const toolboxTalkIdSchema = z.object({
  talk_id: z.string().uuid("Select a toolbox talk."),
});

const completeToolboxTalkSchema = toolboxTalkIdSchema.extend({
  actions_required: z.string().trim().max(900).default(""),
  attendees_count: z.coerce.number().int().min(0, "Attendees cannot be negative.").default(0),
  duration_minutes: z.coerce.number().int().min(0, "Duration cannot be negative.").default(0),
  summary: z.string().trim().max(1200).default(""),
});

const toolboxTalkAttendeeSchema = toolboxTalkIdSchema.extend({
  attendee_name: z.string().trim().min(2, "Attendee name is required.").max(160),
  company: z.string().trim().max(160).default("Pymble Construction Limited"),
  employee_id: z.string().trim().default(""),
  notes: z.string().trim().max(700).default(""),
  role_title: z.string().trim().max(120).default(""),
});

const inspectionSchema = z.object({
  inspection_type: z.enum(inspectionTypes),
  inspector_id: z.string().trim().default(""),
  scheduled_date: z.string().trim().default(""),
  site_id: z.string().uuid("Select a site."),
  summary: z.string().trim().max(1200).default(""),
  title: z.string().trim().min(2, "Inspection title is required.").max(180),
});

const inspectionIdSchema = z.object({
  inspection_id: z.string().uuid("Select an inspection."),
});

const completeInspectionSchema = inspectionIdSchema.extend({
  action_count: z.coerce.number().int().min(0, "Action count cannot be negative.").default(0),
  findings_count: z.coerce.number().int().min(0, "Findings cannot be negative.").default(0),
  score: z.coerce.number().min(0, "Score cannot be negative.").max(100, "Score cannot exceed 100.").default(0),
  summary: z.string().trim().max(1200).default(""),
});

const requireInspectionActionSchema = inspectionIdSchema.extend({
  corrective_actions_required: z.string().trim().min(2, "Action requirement is required.").max(1200),
});

const inspectionFindingSchema = inspectionIdSchema.extend({
  description: z.string().trim().max(1600).default(""),
  due_date: z.string().trim().default(""),
  finding_type: z.string().trim().regex(/^[a-z][a-z0-9_]*$/, "Use a simple finding type.").default("observation"),
  responsible_user_id: z.string().trim().default(""),
  severity: z.enum(findingSeverities).default("low"),
  title: z.string().trim().min(2, "Finding title is required.").max(180),
});

const findingIdSchema = z.object({
  finding_id: z.string().uuid("Select an inspection finding."),
});

const findingCorrectionSchema = findingIdSchema.extend({
  completion_notes: z.string().trim().max(1200).default(""),
});

const safetyTrainingSchema = z.object({
  employee_id: z.string().trim().default(""),
  expiry_date: z.string().trim().default(""),
  notes: z.string().trim().max(1200).default(""),
  planned_date: z.string().trim().default(""),
  provider: z.string().trim().max(160).default(""),
  site_id: z.string().trim().default(""),
  trainee_name: z.string().trim().min(2, "Trainee name is required.").max(160),
  training_title: z.string().trim().min(2, "Training title is required.").max(180),
  training_type: z.string().trim().regex(/^[a-z][a-z0-9_]*$/, "Use a simple training type.").default("general"),
});

const safetyTrainingIdSchema = z.object({
  training_id: z.string().uuid("Select a training record."),
});

const completeSafetyTrainingSchema = safetyTrainingIdSchema.extend({
  completed_date: z.string().trim().default(""),
  expiry_date: z.string().trim().default(""),
  notes: z.string().trim().max(1200).default(""),
  score: z.coerce.number().min(0, "Score cannot be negative.").max(100, "Score cannot exceed 100.").default(0),
});

const riskAssessmentSchema = z.object({
  activity: z.string().trim().max(300).default(""),
  area_location: z.string().trim().max(180).default(""),
  assessment_date: z.string().trim().default(""),
  control_measures: z.string().trim().max(1800).default(""),
  hazard_category: z.string().trim().regex(/^[a-z][a-z0-9_]*$/, "Use a simple hazard category.").default("general"),
  initial_risk: z.enum(findingSeverities).default("medium"),
  residual_risk: z.enum(findingSeverities).default("low"),
  responsible_user_id: z.string().trim().default(""),
  review_date: z.string().trim().default(""),
  site_id: z.string().trim().default(""),
  title: z.string().trim().min(2, "Risk assessment title is required.").max(180),
});

const riskAssessmentIdSchema = z.object({
  assessment_id: z.string().uuid("Select a risk assessment."),
});

const complianceAuditSchema = z.object({
  audit_type: z.string().trim().regex(/^[a-z][a-z0-9_]*$/, "Use a simple audit type.").default("general"),
  auditor_id: z.string().trim().default(""),
  scheduled_date: z.string().trim().default(""),
  site_id: z.string().trim().default(""),
  summary: z.string().trim().max(1200).default(""),
  title: z.string().trim().min(2, "Audit title is required.").max(180),
});

const complianceAuditIdSchema = z.object({
  audit_id: z.string().uuid("Select a compliance audit."),
});

const completeComplianceAuditSchema = complianceAuditIdSchema.extend({
  completed_date: z.string().trim().default(""),
  findings_count: z.coerce.number().int().min(0, "Findings cannot be negative.").default(0),
  next_audit_date: z.string().trim().default(""),
  non_conformance_count: z.coerce.number().int().min(0, "Non-conformances cannot be negative.").default(0),
  score: z.coerce.number().min(0, "Score cannot be negative.").max(100, "Score cannot exceed 100.").default(0),
  summary: z.string().trim().max(1200).default(""),
});

const requireComplianceAuditActionSchema = complianceAuditIdSchema.extend({
  action_required: z.string().trim().min(2, "Action requirement is required.").max(1200),
});

type SiteForHseCompliance = {
  id: string;
  is_active: boolean;
};

type EmployeeForHseCompliance = {
  full_name: string;
  id: string;
  status: string;
};

type PpeIssueForMutation = {
  created_by: string | null;
  id: string;
  issue_number: string;
  ppe_item_id: string | null;
  quantity: number;
  status: OpsPpeIssueStatus;
};

type PpeItemForMutation = {
  id: string;
  is_active: boolean;
  item_code: string;
  item_name: string;
  ppe_type: OpsPpeItemType;
  stock_on_hand: number;
};

type ToolboxTalkForMutation = {
  attendees_count: number;
  created_by: string | null;
  id: string;
  status: OpsToolboxTalkStatus;
  talk_number: string;
};

type HseInspectionForMutation = {
  created_by: string | null;
  findings_count: number;
  id: string;
  inspection_number: string;
  site_id: string;
  status: OpsHseInspectionStatus;
};

type HseInspectionFindingForMutation = {
  created_by: string | null;
  finding_number: string;
  id: string;
  status: OpsHseInspectionFindingStatus;
};

type SafetyTrainingForMutation = {
  created_by: string | null;
  id: string;
  status: OpsSafetyTrainingStatus;
  training_number: string;
};

type HseRiskAssessmentForMutation = {
  assessment_number: string;
  created_by: string | null;
  id: string;
  residual_risk: OpsHseIncidentSeverity;
  responsible_user_id: string | null;
  status: OpsHseRiskAssessmentStatus;
  title: string;
};

type HseComplianceAuditForMutation = {
  auditor_id: string | null;
  audit_number: string;
  created_by: string | null;
  id: string;
  status: OpsHseComplianceAuditStatus;
  title: string;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function hseComplianceError(message: string): never {
  redirect(`${HSE_COMPLIANCE_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function normalizeOptionalUuid(value: string) {
  return value || null;
}

function normalizeDate(value: string, fallback = new Date().toISOString().slice(0, 10)) {
  const date = value || fallback;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    hseComplianceError("Use a valid date.");
  }

  return date;
}

function normalizeOptionalDate(value: string) {
  if (!value) {
    return null;
  }

  return normalizeDate(value);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isHighOrCriticalSeverity(value: OpsHseIncidentSeverity) {
  return value === "high" || value === "critical";
}

async function assertActiveSite(siteId: string | null) {
  if (!siteId) {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("sites")
    .select("id, is_active")
    .eq("id", siteId)
    .maybeSingle<SiteForHseCompliance>();

  if (error) {
    throw error;
  }

  if (!data || !data.is_active) {
    hseComplianceError("Select an active site.");
  }

  return data;
}

async function fetchEmployee(employeeId: string | null) {
  if (!employeeId) {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, status")
    .eq("id", employeeId)
    .maybeSingle<EmployeeForHseCompliance>();

  if (error) {
    throw error;
  }

  if (!data || data.status === "exited") {
    hseComplianceError("Select an active employee.");
  }

  return data;
}

async function fetchPpeIssue(issueId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("ppe_issues")
    .select("id, issue_number, ppe_item_id, quantity, status, created_by")
    .eq("id", issueId)
    .maybeSingle<PpeIssueForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchPpeItem(itemId: string | null) {
  if (!itemId) {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("ppe_items")
    .select("id, item_code, item_name, ppe_type, stock_on_hand, is_active")
    .eq("id", itemId)
    .maybeSingle<PpeItemForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function adjustPpeItemStock(ppeItemId: string, quantityDelta: number) {
  const { error } = await getOpsSupabaseServiceClient().rpc("ops_adjust_ppe_item_stock", {
    p_ppe_item_id: ppeItemId,
    p_quantity_delta: quantityDelta,
  });

  if (error) {
    throw error;
  }
}

async function fetchToolboxTalk(talkId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("toolbox_talks")
    .select("id, talk_number, status, attendees_count, created_by")
    .eq("id", talkId)
    .maybeSingle<ToolboxTalkForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchHseInspection(inspectionId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("hse_inspections")
    .select("id, inspection_number, site_id, findings_count, status, created_by")
    .eq("id", inspectionId)
    .maybeSingle<HseInspectionForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchHseInspectionFinding(findingId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("hse_inspection_findings")
    .select("id, finding_number, status, created_by")
    .eq("id", findingId)
    .maybeSingle<HseInspectionFindingForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchSafetyTrainingRecord(trainingId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("safety_training_records")
    .select("id, training_number, status, created_by")
    .eq("id", trainingId)
    .maybeSingle<SafetyTrainingForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchHseRiskAssessment(assessmentId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("hse_risk_assessments")
    .select("id, assessment_number, title, residual_risk, responsible_user_id, status, created_by")
    .eq("id", assessmentId)
    .maybeSingle<HseRiskAssessmentForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchHseComplianceAudit(auditId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("hse_compliance_audits")
    .select("id, audit_number, title, auditor_id, status, created_by")
    .eq("id", auditId)
    .maybeSingle<HseComplianceAuditForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createPpeItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsPpeItem(profile.role)) {
    hseComplianceError("Your role cannot create PPE stock items.");
  }

  const parsed = ppeItemSchema.safeParse({
    description: field(formData, "description"),
    item_name: field(formData, "item_name"),
    ppe_type: field(formData, "ppe_type") || "other",
    reorder_level: field(formData, "reorder_level") || "0",
    stock_on_hand: field(formData, "stock_on_hand") || "0",
    storage_location: field(formData, "storage_location"),
    unit: field(formData, "unit") || "each",
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check the PPE stock item.");
  }

  const { data, error } = await getOpsSupabaseServiceClient()
    .from("ppe_items")
    .insert({
      created_by: profile.id,
      description: parsed.data.description,
      item_name: parsed.data.item_name,
      ppe_type: parsed.data.ppe_type,
      reorder_level: parsed.data.reorder_level,
      stock_on_hand: parsed.data.stock_on_hand,
      storage_location: parsed.data.storage_location,
      unit: parsed.data.unit || "each",
    })
    .select("id, item_code")
    .single<{ id: string; item_code: string }>();

  if (error || !data) {
    hseComplianceError(error?.message ?? "Could not create PPE stock item.");
  }

  await recordOpsAuditEvent({
    action: "ppe_item.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "ppe_item",
    metadata: { item_code: data.item_code, ppe_type: parsed.data.ppe_type },
    moduleKey: "hse_compliance",
    sourceId: data.id,
    sourceTable: "ppe_items",
    summary: `Created PPE stock item ${data.item_code}`,
  }).catch(() => null);

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?created=ppe_item#ppe-stock`);
}

export async function adjustPpeItemStockAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = ppeItemAdjustSchema.safeParse({
    ppe_item_id: field(formData, "ppe_item_id"),
    quantity_delta: field(formData, "quantity_delta"),
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check the PPE stock adjustment.");
  }

  const item = await fetchPpeItem(parsed.data.ppe_item_id);

  if (!item) {
    hseComplianceError("PPE stock item was not found.");
  }

  if (!canAdjustOpsPpeItem(profile.role, item)) {
    hseComplianceError("Your role cannot adjust this PPE stock item.");
  }

  try {
    await adjustPpeItemStock(item.id, parsed.data.quantity_delta);
  } catch (error) {
    hseComplianceError(errorMessage(error, "Could not adjust PPE stock."));
  }

  await recordOpsAuditEvent({
    action: "ppe_item.stock_adjusted",
    actorUserId: profile.id,
    entityId: item.id,
    entityType: "ppe_item",
    metadata: {
      item_code: item.item_code,
      quantity_delta: parsed.data.quantity_delta,
    },
    moduleKey: "hse_compliance",
    sourceId: item.id,
    sourceTable: "ppe_items",
    summary: `Adjusted PPE stock ${item.item_code}`,
  }).catch(() => null);

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=ppe_stock#ppe-stock`);
}

export async function createPpeIssueAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsPpeIssue(profile.role)) {
    hseComplianceError("Your role cannot issue PPE.");
  }

  const parsed = ppeIssueSchema.safeParse({
    due_return_date: field(formData, "due_return_date"),
    employee_id: field(formData, "employee_id"),
    issue_date: field(formData, "issue_date"),
    issued_to_name: field(formData, "issued_to_name"),
    item_description: field(formData, "item_description"),
    notes: field(formData, "notes"),
    ppe_item_id: field(formData, "ppe_item_id"),
    ppe_type: field(formData, "ppe_type") || "other",
    quantity: field(formData, "quantity") || "1",
    site_id: field(formData, "site_id"),
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check the PPE issue.");
  }

  const siteId = normalizeOptionalUuid(parsed.data.site_id);
  const employeeId = normalizeOptionalUuid(parsed.data.employee_id);
  const ppeItemId = normalizeOptionalUuid(parsed.data.ppe_item_id);
  const [employee, , ppeItem] = await Promise.all([
    fetchEmployee(employeeId),
    assertActiveSite(siteId),
    fetchPpeItem(ppeItemId),
  ]);

  if (ppeItemId && !ppeItem) {
    hseComplianceError("PPE stock item was not found.");
  }

  if (ppeItem && !ppeItem.is_active) {
    hseComplianceError("PPE stock item is inactive.");
  }

  const issueDate = normalizeDate(parsed.data.issue_date);
  const dueReturnDate = normalizeOptionalDate(parsed.data.due_return_date);
  const ppeType = ppeItem?.ppe_type ?? parsed.data.ppe_type;
  const itemDescription = parsed.data.item_description || ppeItem?.item_name || "";

  if (dueReturnDate && dueReturnDate < issueDate) {
    hseComplianceError("Due return date cannot be before issue date.");
  }

  if (ppeItem) {
    try {
      await adjustPpeItemStock(ppeItem.id, parsed.data.quantity * -1);
    } catch (error) {
      hseComplianceError(errorMessage(error, "Could not reserve PPE stock."));
    }
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("ppe_issues")
    .insert({
      created_by: profile.id,
      due_return_date: dueReturnDate,
      employee_id: employee?.id ?? null,
      issue_date: issueDate,
      issued_by: profile.id,
      issued_to_name: parsed.data.issued_to_name,
      item_description: itemDescription,
      notes: parsed.data.notes,
      ppe_item_id: ppeItem?.id ?? null,
      ppe_type: ppeType,
      quantity: parsed.data.quantity,
      site_id: siteId,
      status: "issued",
    })
    .select("id, issue_number")
    .single<{ id: string; issue_number: string }>();

  if (error || !data) {
    if (ppeItem) {
      await adjustPpeItemStock(ppeItem.id, parsed.data.quantity).catch(() => null);
    }
    hseComplianceError(error?.message ?? "Could not issue PPE.");
  }

  await recordOpsAuditEvent({
    action: "ppe_issue.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "ppe_issue",
    metadata: { issue_number: data.issue_number, ppe_item_id: ppeItem?.id ?? null, ppe_type: ppeType },
    moduleKey: "hse_compliance",
    sourceId: data.id,
    sourceTable: "ppe_issues",
    summary: `Issued PPE ${data.issue_number}`,
  }).catch(() => null);

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?created=ppe`);
}

export async function returnPpeIssueAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = ppeReturnSchema.safeParse({
    issue_id: field(formData, "issue_id"),
    return_condition_notes: field(formData, "return_condition_notes"),
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Select a PPE issue.");
  }

  const issue = await fetchPpeIssue(parsed.data.issue_id);

  if (!issue) {
    hseComplianceError("PPE issue was not found.");
  }

  if (!canReturnOpsPpeIssue(profile.role, issue)) {
    hseComplianceError("Your role cannot return this PPE issue.");
  }

  const { data, error } = await getOpsSupabaseServiceClient()
    .from("ppe_issues")
    .update({
      return_condition_notes: parsed.data.return_condition_notes,
      returned_at: new Date().toISOString(),
      status: "returned",
    })
    .eq("id", issue.id)
    .eq("status", "issued")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    hseComplianceError(error?.message ?? "PPE issue was already updated.");
  }

  if (issue.ppe_item_id) {
    try {
      await adjustPpeItemStock(issue.ppe_item_id, issue.quantity);
    } catch (error) {
      hseComplianceError(errorMessage(error, "PPE was returned, but stock could not be adjusted."));
    }
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=ppe_returned`);
}

export async function markPpeIssueDamagedAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = ppeLossSchema.safeParse({
    issue_id: field(formData, "issue_id"),
    replacement_cost: field(formData, "replacement_cost") || "0",
    return_condition_notes: field(formData, "return_condition_notes"),
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check damaged PPE details.");
  }

  const issue = await fetchPpeIssue(parsed.data.issue_id);

  if (!issue) {
    hseComplianceError("PPE issue was not found.");
  }

  if (!canMarkOpsPpeIssueDamaged(profile.role, issue)) {
    hseComplianceError("Your role cannot mark this PPE as damaged.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("ppe_issues")
    .update({
      replacement_cost: parsed.data.replacement_cost,
      return_condition_notes: parsed.data.return_condition_notes,
      returned_at: new Date().toISOString(),
      status: "damaged",
    })
    .eq("id", issue.id)
    .eq("status", "issued");

  if (error) {
    hseComplianceError(error.message);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=ppe_damaged`);
}

export async function markPpeIssueLostAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = ppeLossSchema.safeParse({
    issue_id: field(formData, "issue_id"),
    replacement_cost: field(formData, "replacement_cost") || "0",
    return_condition_notes: field(formData, "return_condition_notes"),
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check lost PPE details.");
  }

  const issue = await fetchPpeIssue(parsed.data.issue_id);

  if (!issue) {
    hseComplianceError("PPE issue was not found.");
  }

  if (!canMarkOpsPpeIssueLost(profile.role, issue)) {
    hseComplianceError("Your role cannot mark this PPE as lost.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("ppe_issues")
    .update({
      replacement_cost: parsed.data.replacement_cost,
      return_condition_notes: parsed.data.return_condition_notes,
      status: "lost",
    })
    .eq("id", issue.id)
    .eq("status", "issued");

  if (error) {
    hseComplianceError(error.message);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=ppe_lost`);
}

export async function cancelPpeIssueAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = ppeIssueIdSchema.safeParse({ issue_id: field(formData, "issue_id") });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Select a PPE issue.");
  }

  const issue = await fetchPpeIssue(parsed.data.issue_id);

  if (!issue) {
    hseComplianceError("PPE issue was not found.");
  }

  if (!canCancelOpsPpeIssue(profile.role, issue)) {
    hseComplianceError("Your role cannot cancel this PPE issue.");
  }

  const { data, error } = await getOpsSupabaseServiceClient()
    .from("ppe_issues")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: profile.id, status: "cancelled" })
    .eq("id", issue.id)
    .eq("status", "issued")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error || !data) {
    hseComplianceError(error?.message ?? "PPE issue was already updated.");
  }

  if (issue.ppe_item_id) {
    try {
      await adjustPpeItemStock(issue.ppe_item_id, issue.quantity);
    } catch (error) {
      hseComplianceError(errorMessage(error, "PPE was cancelled, but stock could not be adjusted."));
    }
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=ppe_cancelled`);
}

export async function createToolboxTalkAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsToolboxTalk(profile.role)) {
    hseComplianceError("Your role cannot create toolbox talks.");
  }

  const parsed = toolboxTalkSchema.safeParse({
    facilitator_id: field(formData, "facilitator_id"),
    safety_category: field(formData, "safety_category"),
    site_id: field(formData, "site_id"),
    summary: field(formData, "summary"),
    talk_date: field(formData, "talk_date"),
    topic: field(formData, "topic"),
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check the toolbox talk.");
  }

  await assertActiveSite(parsed.data.site_id);

  const { data, error } = await getOpsSupabaseServiceClient()
    .from("toolbox_talks")
    .insert({
      created_by: profile.id,
      facilitator_id: normalizeOptionalUuid(parsed.data.facilitator_id),
      safety_category: parsed.data.safety_category,
      site_id: parsed.data.site_id,
      status: "planned",
      summary: parsed.data.summary,
      talk_date: normalizeDate(parsed.data.talk_date),
      topic: parsed.data.topic,
    })
    .select("id, talk_number")
    .single<{ id: string; talk_number: string }>();

  if (error || !data) {
    hseComplianceError(error?.message ?? "Could not create toolbox talk.");
  }

  await recordOpsAuditEvent({
    action: "toolbox_talk.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "toolbox_talk",
    metadata: { talk_number: data.talk_number },
    moduleKey: "hse_compliance",
    sourceId: data.id,
    sourceTable: "toolbox_talks",
    summary: `Created toolbox talk ${data.talk_number}`,
  }).catch(() => null);

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?created=toolbox`);
}

export async function createToolboxTalkAttendeeAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = toolboxTalkAttendeeSchema.safeParse({
    attendee_name: field(formData, "attendee_name"),
    company: field(formData, "company") || "Pymble Construction Limited",
    employee_id: field(formData, "employee_id"),
    notes: field(formData, "notes"),
    role_title: field(formData, "role_title"),
    talk_id: field(formData, "talk_id"),
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check toolbox attendee details.");
  }

  const employeeId = normalizeOptionalUuid(parsed.data.employee_id);
  const [talk, employee] = await Promise.all([
    fetchToolboxTalk(parsed.data.talk_id),
    fetchEmployee(employeeId),
  ]);

  if (!talk) {
    hseComplianceError("Toolbox talk was not found.");
  }

  if (!canAddOpsToolboxTalkAttendee(profile.role, talk)) {
    hseComplianceError("Your role cannot add attendees to this toolbox talk.");
  }

  const attendeeName = parsed.data.attendee_name || employee?.full_name || "";

  const { data, error } = await getOpsSupabaseServiceClient()
    .from("toolbox_talk_attendees")
    .insert({
      attendee_name: attendeeName,
      company: parsed.data.company || "Pymble Construction Limited",
      created_by: profile.id,
      employee_id: employee?.id ?? null,
      notes: parsed.data.notes,
      role_title: parsed.data.role_title,
      talk_id: talk.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    hseComplianceError(error?.message ?? "Could not add toolbox attendee.");
  }

  const { error: countError } = await getOpsSupabaseServiceClient()
    .from("toolbox_talks")
    .update({ attendees_count: talk.attendees_count + 1 })
    .eq("id", talk.id)
    .neq("status", "cancelled");

  if (countError) {
    hseComplianceError(countError.message);
  }

  await recordOpsAuditEvent({
    action: "toolbox_talk.attendee_added",
    actorUserId: profile.id,
    entityId: talk.id,
    entityType: "toolbox_talk",
    metadata: { attendee_id: data.id, attendee_name: attendeeName, talk_number: talk.talk_number },
    moduleKey: "hse_compliance",
    sourceId: talk.id,
    sourceTable: "toolbox_talks",
    summary: `Added attendee to toolbox talk ${talk.talk_number}`,
  }).catch(() => null);

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=toolbox_attendee#toolbox-panel`);
}

export async function completeToolboxTalkAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = completeToolboxTalkSchema.safeParse({
    actions_required: field(formData, "actions_required"),
    attendees_count: field(formData, "attendees_count") || "0",
    duration_minutes: field(formData, "duration_minutes") || "0",
    summary: field(formData, "summary"),
    talk_id: field(formData, "talk_id"),
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check completion details.");
  }

  const talk = await fetchToolboxTalk(parsed.data.talk_id);

  if (!talk) {
    hseComplianceError("Toolbox talk was not found.");
  }

  if (!canCompleteOpsToolboxTalk(profile.role, talk)) {
    hseComplianceError("Your role cannot complete this toolbox talk.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("toolbox_talks")
    .update({
      actions_required: parsed.data.actions_required,
      attendees_count: parsed.data.attendees_count,
      completed_at: new Date().toISOString(),
      duration_minutes: parsed.data.duration_minutes,
      status: "completed",
      summary: parsed.data.summary,
    })
    .eq("id", talk.id)
    .eq("status", "planned");

  if (error) {
    hseComplianceError(error.message);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=toolbox_completed`);
}

export async function cancelToolboxTalkAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = toolboxTalkIdSchema.safeParse({ talk_id: field(formData, "talk_id") });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Select a toolbox talk.");
  }

  const talk = await fetchToolboxTalk(parsed.data.talk_id);

  if (!talk) {
    hseComplianceError("Toolbox talk was not found.");
  }

  if (!canCancelOpsToolboxTalk(profile.role, talk)) {
    hseComplianceError("Your role cannot cancel this toolbox talk.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("toolbox_talks")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: profile.id, status: "cancelled" })
    .eq("id", talk.id)
    .eq("status", "planned");

  if (error) {
    hseComplianceError(error.message);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=toolbox_cancelled`);
}

export async function createHseInspectionAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsHseInspection(profile.role)) {
    hseComplianceError("Your role cannot create HSE inspections.");
  }

  const parsed = inspectionSchema.safeParse({
    inspection_type: field(formData, "inspection_type") || "other",
    inspector_id: field(formData, "inspector_id"),
    scheduled_date: field(formData, "scheduled_date"),
    site_id: field(formData, "site_id"),
    summary: field(formData, "summary"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check the inspection.");
  }

  await assertActiveSite(parsed.data.site_id);

  const { data, error } = await getOpsSupabaseServiceClient()
    .from("hse_inspections")
    .insert({
      created_by: profile.id,
      inspection_type: parsed.data.inspection_type,
      inspector_id: normalizeOptionalUuid(parsed.data.inspector_id),
      scheduled_date: normalizeDate(parsed.data.scheduled_date),
      site_id: parsed.data.site_id,
      status: "planned",
      summary: parsed.data.summary,
      title: parsed.data.title,
    })
    .select("id, inspection_number")
    .single<{ id: string; inspection_number: string }>();

  if (error || !data) {
    hseComplianceError(error?.message ?? "Could not create HSE inspection.");
  }

  await recordOpsAuditEvent({
    action: "hse_inspection.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "hse_inspection",
    metadata: { inspection_number: data.inspection_number },
    moduleKey: "hse_compliance",
    sourceId: data.id,
    sourceTable: "hse_inspections",
    summary: `Created HSE inspection ${data.inspection_number}`,
  }).catch(() => null);

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?created=inspection`);
}

export async function completeHseInspectionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = completeInspectionSchema.safeParse({
    action_count: field(formData, "action_count") || "0",
    findings_count: field(formData, "findings_count") || "0",
    inspection_id: field(formData, "inspection_id"),
    score: field(formData, "score") || "0",
    summary: field(formData, "summary"),
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check inspection completion.");
  }

  const inspection = await fetchHseInspection(parsed.data.inspection_id);

  if (!inspection) {
    hseComplianceError("Inspection was not found.");
  }

  if (!canCompleteOpsHseInspection(profile.role, inspection)) {
    hseComplianceError("Your role cannot complete this inspection.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("hse_inspections")
    .update({
      action_count: parsed.data.action_count,
      completed_at: new Date().toISOString(),
      findings_count: parsed.data.findings_count,
      score: parsed.data.score,
      status: "completed",
      summary: parsed.data.summary,
    })
    .eq("id", inspection.id)
    .eq("status", "planned");

  if (error) {
    hseComplianceError(error.message);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=inspection_completed`);
}

export async function requireHseInspectionActionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = requireInspectionActionSchema.safeParse({
    corrective_actions_required: field(formData, "corrective_actions_required"),
    inspection_id: field(formData, "inspection_id"),
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check required actions.");
  }

  const inspection = await fetchHseInspection(parsed.data.inspection_id);

  if (!inspection) {
    hseComplianceError("Inspection was not found.");
  }

  if (!canRequireOpsHseInspectionAction(profile.role, inspection)) {
    hseComplianceError("Your role cannot require action for this inspection.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("hse_inspections")
    .update({
      action_required_at: new Date().toISOString(),
      corrective_actions_required: parsed.data.corrective_actions_required,
      status: "action_required",
    })
    .eq("id", inspection.id)
    .in("status", ["planned", "completed"]);

  if (error) {
    hseComplianceError(error.message);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=inspection_action_required`);
}

export async function closeHseInspectionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = inspectionIdSchema.safeParse({ inspection_id: field(formData, "inspection_id") });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Select an inspection.");
  }

  const inspection = await fetchHseInspection(parsed.data.inspection_id);

  if (!inspection) {
    hseComplianceError("Inspection was not found.");
  }

  if (!canCloseOpsHseInspection(profile.role, inspection)) {
    hseComplianceError("Your role cannot close this inspection.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("hse_inspections")
    .update({ closed_at: new Date().toISOString(), closed_by: profile.id, status: "closed" })
    .eq("id", inspection.id)
    .in("status", ["completed", "action_required"]);

  if (error) {
    hseComplianceError(error.message);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=inspection_closed`);
}

export async function cancelHseInspectionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = inspectionIdSchema.safeParse({ inspection_id: field(formData, "inspection_id") });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Select an inspection.");
  }

  const inspection = await fetchHseInspection(parsed.data.inspection_id);

  if (!inspection) {
    hseComplianceError("Inspection was not found.");
  }

  if (!canCancelOpsHseInspection(profile.role, inspection)) {
    hseComplianceError("Your role cannot cancel this inspection.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("hse_inspections")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: profile.id, status: "cancelled" })
    .eq("id", inspection.id)
    .in("status", ["planned", "action_required"]);

  if (error) {
    hseComplianceError(error.message);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=inspection_cancelled`);
}

export async function createHseInspectionFindingAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = inspectionFindingSchema.safeParse({
    description: field(formData, "description"),
    due_date: field(formData, "due_date"),
    finding_type: field(formData, "finding_type") || "observation",
    inspection_id: field(formData, "inspection_id"),
    responsible_user_id: field(formData, "responsible_user_id"),
    severity: field(formData, "severity") || "low",
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check inspection finding details.");
  }

  const inspection = await fetchHseInspection(parsed.data.inspection_id);

  if (!inspection) {
    hseComplianceError("Inspection was not found.");
  }

  if (!canCreateOpsHseInspectionFinding(profile.role, inspection)) {
    hseComplianceError("Your role cannot add findings to this inspection.");
  }

  const { data, error } = await getOpsSupabaseServiceClient()
    .from("hse_inspection_findings")
    .insert({
      created_by: profile.id,
      description: parsed.data.description,
      due_date: normalizeOptionalDate(parsed.data.due_date),
      finding_type: parsed.data.finding_type,
      inspection_id: inspection.id,
      responsible_user_id: normalizeOptionalUuid(parsed.data.responsible_user_id),
      severity: parsed.data.severity,
      site_id: inspection.site_id,
      status: "open",
      title: parsed.data.title,
    })
    .select("id, finding_number")
    .single<{ finding_number: string; id: string }>();

  if (error || !data) {
    hseComplianceError(error?.message ?? "Could not create inspection finding.");
  }

  const { error: inspectionCountError } = await getOpsSupabaseServiceClient()
    .from("hse_inspections")
    .update({ findings_count: inspection.findings_count + 1 })
    .eq("id", inspection.id)
    .neq("status", "cancelled");

  if (inspectionCountError) {
    hseComplianceError(inspectionCountError.message);
  }

  await recordOpsAuditEvent({
    action: "hse_inspection_finding.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "hse_inspection_finding",
    metadata: { finding_number: data.finding_number, inspection_number: inspection.inspection_number },
    moduleKey: "hse_compliance",
    sourceId: data.id,
    sourceTable: "hse_inspection_findings",
    summary: `Created inspection finding ${data.finding_number}`,
  }).catch(() => null);

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?created=inspection_finding#inspection-panel`);
}

export async function startHseInspectionFindingAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = findingIdSchema.safeParse({ finding_id: field(formData, "finding_id") });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Select an inspection finding.");
  }

  const finding = await fetchHseInspectionFinding(parsed.data.finding_id);

  if (!finding) {
    hseComplianceError("Inspection finding was not found.");
  }

  if (!canStartOpsHseInspectionFinding(profile.role, finding)) {
    hseComplianceError("Your role cannot start this inspection finding.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("hse_inspection_findings")
    .update({ status: "in_progress" })
    .eq("id", finding.id)
    .eq("status", "open");

  if (error) {
    hseComplianceError(error.message);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=finding_started#inspection-panel`);
}

export async function correctHseInspectionFindingAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = findingCorrectionSchema.safeParse({
    completion_notes: field(formData, "completion_notes"),
    finding_id: field(formData, "finding_id"),
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check finding correction details.");
  }

  const finding = await fetchHseInspectionFinding(parsed.data.finding_id);

  if (!finding) {
    hseComplianceError("Inspection finding was not found.");
  }

  if (!canCorrectOpsHseInspectionFinding(profile.role, finding)) {
    hseComplianceError("Your role cannot correct this inspection finding.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("hse_inspection_findings")
    .update({
      completed_at: new Date().toISOString(),
      completion_notes: parsed.data.completion_notes,
      status: "corrected",
    })
    .eq("id", finding.id)
    .in("status", ["open", "in_progress"]);

  if (error) {
    hseComplianceError(error.message);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=finding_corrected#inspection-panel`);
}

export async function verifyHseInspectionFindingAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = findingIdSchema.safeParse({ finding_id: field(formData, "finding_id") });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Select an inspection finding.");
  }

  const finding = await fetchHseInspectionFinding(parsed.data.finding_id);

  if (!finding) {
    hseComplianceError("Inspection finding was not found.");
  }

  if (!canVerifyOpsHseInspectionFinding(profile.role, finding)) {
    hseComplianceError("Your role cannot verify this inspection finding.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("hse_inspection_findings")
    .update({
      status: "verified",
      verified_at: new Date().toISOString(),
      verified_by: profile.id,
    })
    .eq("id", finding.id)
    .eq("status", "corrected");

  if (error) {
    hseComplianceError(error.message);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=finding_verified#inspection-panel`);
}

export async function cancelHseInspectionFindingAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = findingIdSchema.safeParse({ finding_id: field(formData, "finding_id") });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Select an inspection finding.");
  }

  const finding = await fetchHseInspectionFinding(parsed.data.finding_id);

  if (!finding) {
    hseComplianceError("Inspection finding was not found.");
  }

  if (!canCancelOpsHseInspectionFinding(profile.role, finding)) {
    hseComplianceError("Your role cannot cancel this inspection finding.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("hse_inspection_findings")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: profile.id,
      status: "cancelled",
    })
    .eq("id", finding.id)
    .in("status", ["open", "in_progress"]);

  if (error) {
    hseComplianceError(error.message);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=finding_cancelled#inspection-panel`);
}

export async function createSafetyTrainingRecordAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsSafetyTraining(profile.role)) {
    hseComplianceError("Your role cannot create safety training records.");
  }

  const parsed = safetyTrainingSchema.safeParse({
    employee_id: field(formData, "employee_id"),
    expiry_date: field(formData, "expiry_date"),
    notes: field(formData, "notes"),
    planned_date: field(formData, "planned_date"),
    provider: field(formData, "provider"),
    site_id: field(formData, "site_id"),
    trainee_name: field(formData, "trainee_name"),
    training_title: field(formData, "training_title"),
    training_type: field(formData, "training_type") || "general",
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check safety training details.");
  }

  const siteId = normalizeOptionalUuid(parsed.data.site_id);
  const employeeId = normalizeOptionalUuid(parsed.data.employee_id);
  const [employee] = await Promise.all([
    fetchEmployee(employeeId),
    assertActiveSite(siteId),
  ]);
  const plannedDate = normalizeDate(parsed.data.planned_date);
  const expiryDate = normalizeOptionalDate(parsed.data.expiry_date);

  if (expiryDate && expiryDate < plannedDate) {
    hseComplianceError("Training expiry cannot be before planned date.");
  }

  const { data, error } = await getOpsSupabaseServiceClient()
    .from("safety_training_records")
    .insert({
      created_by: profile.id,
      employee_id: employee?.id ?? null,
      expiry_date: expiryDate,
      notes: parsed.data.notes,
      planned_date: plannedDate,
      provider: parsed.data.provider,
      site_id: siteId,
      status: "planned",
      trainee_name: parsed.data.trainee_name,
      training_title: parsed.data.training_title,
      training_type: parsed.data.training_type,
    })
    .select("id, training_number")
    .single<{ id: string; training_number: string }>();

  if (error || !data) {
    hseComplianceError(error?.message ?? "Could not create safety training record.");
  }

  await recordOpsAuditEvent({
    action: "safety_training.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "safety_training_record",
    metadata: { training_number: data.training_number, training_type: parsed.data.training_type },
    moduleKey: "hse_compliance",
    sourceId: data.id,
    sourceTable: "safety_training_records",
    summary: `Created safety training ${data.training_number}`,
  }).catch(() => null);

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?created=training#training-panel`);
}

export async function completeSafetyTrainingRecordAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = completeSafetyTrainingSchema.safeParse({
    completed_date: field(formData, "completed_date"),
    expiry_date: field(formData, "expiry_date"),
    notes: field(formData, "notes"),
    score: field(formData, "score") || "0",
    training_id: field(formData, "training_id"),
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check safety training completion.");
  }

  const training = await fetchSafetyTrainingRecord(parsed.data.training_id);

  if (!training) {
    hseComplianceError("Safety training record was not found.");
  }

  if (!canCompleteOpsSafetyTraining(profile.role, training)) {
    hseComplianceError("Your role cannot complete this safety training.");
  }

  const completedDate = normalizeDate(parsed.data.completed_date);
  const expiryDate = normalizeOptionalDate(parsed.data.expiry_date);

  if (expiryDate && expiryDate < completedDate) {
    hseComplianceError("Training expiry cannot be before completion date.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("safety_training_records")
    .update({
      completed_by: profile.id,
      completed_date: completedDate,
      expiry_date: expiryDate,
      notes: parsed.data.notes,
      score: parsed.data.score,
      status: "completed",
    })
    .eq("id", training.id)
    .eq("status", "planned");

  if (error) {
    hseComplianceError(error.message);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=training_completed#training-panel`);
}

export async function cancelSafetyTrainingRecordAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = safetyTrainingIdSchema.safeParse({ training_id: field(formData, "training_id") });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Select a safety training record.");
  }

  const training = await fetchSafetyTrainingRecord(parsed.data.training_id);

  if (!training) {
    hseComplianceError("Safety training record was not found.");
  }

  if (!canCancelOpsSafetyTraining(profile.role, training)) {
    hseComplianceError("Your role cannot cancel this safety training.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("safety_training_records")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: profile.id,
      status: "cancelled",
    })
    .eq("id", training.id)
    .eq("status", "planned");

  if (error) {
    hseComplianceError(error.message);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=training_cancelled#training-panel`);
}

export async function createHseRiskAssessmentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsHseRiskAssessment(profile.role)) {
    hseComplianceError("Your role cannot create risk assessments.");
  }

  const parsed = riskAssessmentSchema.safeParse({
    activity: field(formData, "activity"),
    area_location: field(formData, "area_location"),
    assessment_date: field(formData, "assessment_date"),
    control_measures: field(formData, "control_measures"),
    hazard_category: field(formData, "hazard_category") || "general",
    initial_risk: field(formData, "initial_risk") || "medium",
    residual_risk: field(formData, "residual_risk") || "low",
    responsible_user_id: field(formData, "responsible_user_id"),
    review_date: field(formData, "review_date"),
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check risk assessment details.");
  }

  const siteId = normalizeOptionalUuid(parsed.data.site_id);
  await assertActiveSite(siteId);
  const assessmentDate = normalizeDate(parsed.data.assessment_date);
  const reviewDate = normalizeOptionalDate(parsed.data.review_date);
  const responsibleUserId = normalizeOptionalUuid(parsed.data.responsible_user_id);

  if (reviewDate && reviewDate < assessmentDate) {
    hseComplianceError("Review date cannot be before assessment date.");
  }

  const { data, error } = await getOpsSupabaseServiceClient()
    .from("hse_risk_assessments")
    .insert({
      activity: parsed.data.activity,
      area_location: parsed.data.area_location,
      assessment_date: assessmentDate,
      control_measures: parsed.data.control_measures,
      created_by: profile.id,
      hazard_category: parsed.data.hazard_category,
      initial_risk: parsed.data.initial_risk,
      residual_risk: parsed.data.residual_risk,
      responsible_user_id: responsibleUserId,
      review_date: reviewDate,
      site_id: siteId,
      status: "draft",
      title: parsed.data.title,
    })
    .select("id, assessment_number")
    .single<{ assessment_number: string; id: string }>();

  if (error || !data) {
    hseComplianceError(error?.message ?? "Could not create risk assessment.");
  }

  await recordOpsAuditEvent({
    action: "hse_risk_assessment.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "hse_risk_assessment",
    metadata: {
      assessment_number: data.assessment_number,
      residual_risk: parsed.data.residual_risk,
    },
    moduleKey: "hse_compliance",
    sourceId: data.id,
    sourceTable: "hse_risk_assessments",
    summary: `Created risk assessment ${data.assessment_number}`,
  }).catch(() => null);

  await queueOpsHseUserNotification({
    actionHref: `${HSE_COMPLIANCE_ROUTE}#risk-assessment-panel`,
    actorUserId: profile.id,
    body: `${profile.full_name} assigned risk assessment ${data.assessment_number} to you.`,
    idempotencyKeyPrefix: `hse-risk-assigned:${data.id}`,
    moduleKey: "hse_compliance",
    recipientId: responsibleUserId,
    sourceId: data.id,
    sourceTable: "hse_risk_assessments",
    title: "Risk assessment assigned",
  }).catch(() => null);

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  revalidatePath("/ops/notifications");
  redirect(`${HSE_COMPLIANCE_ROUTE}?created=risk_assessment#risk-assessment-panel`);
}

export async function submitHseRiskAssessmentAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = riskAssessmentIdSchema.safeParse({ assessment_id: field(formData, "assessment_id") });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Select a risk assessment.");
  }

  const assessment = await fetchHseRiskAssessment(parsed.data.assessment_id);

  if (!assessment) {
    hseComplianceError("Risk assessment was not found.");
  }

  if (!canSubmitOpsHseRiskAssessment(profile.id, profile.role, assessment)) {
    hseComplianceError("Your role cannot submit this risk assessment.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("hse_risk_assessments")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      submitted_by: profile.id,
    })
    .eq("id", assessment.id)
    .eq("status", "draft");

  if (error) {
    hseComplianceError(error.message);
  }

  await recordOpsAuditEvent({
    action: "hse_risk_assessment.submitted",
    actorUserId: profile.id,
    entityId: assessment.id,
    entityType: "hse_risk_assessment",
    metadata: {
      assessment_number: assessment.assessment_number,
      residual_risk: assessment.residual_risk,
    },
    moduleKey: "hse_compliance",
    sourceId: assessment.id,
    sourceTable: "hse_risk_assessments",
    summary: `Submitted risk assessment ${assessment.assessment_number}`,
  }).catch(() => null);

  await queueOpsHseRoleNotifications({
    actionHref: `${HSE_COMPLIANCE_ROUTE}#risk-assessment-panel`,
    actorUserId: profile.id,
    body: `${profile.full_name} submitted ${assessment.assessment_number} for HSE review.`,
    idempotencyKeyPrefix: `hse-risk-submitted:${assessment.id}`,
    moduleKey: "hse_compliance",
    recipientRoles: OPS_HSE_REVIEW_NOTIFICATION_ROLES,
    sourceId: assessment.id,
    sourceTable: "hse_risk_assessments",
    title: "Risk assessment ready for review",
  }).catch(() => null);

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  revalidatePath("/ops/notifications");
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=risk_submitted#risk-assessment-panel`);
}

export async function approveHseRiskAssessmentAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = riskAssessmentIdSchema.safeParse({ assessment_id: field(formData, "assessment_id") });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Select a risk assessment.");
  }

  const assessment = await fetchHseRiskAssessment(parsed.data.assessment_id);

  if (!assessment) {
    hseComplianceError("Risk assessment was not found.");
  }

  if (!canApproveOpsHseRiskAssessment(profile.role, assessment)) {
    hseComplianceError("Your role cannot approve this risk assessment.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("hse_risk_assessments")
    .update({
      approved_at: new Date().toISOString(),
      approved_by: profile.id,
      status: "approved",
    })
    .eq("id", assessment.id)
    .eq("status", "submitted");

  if (error) {
    hseComplianceError(error.message);
  }

  await recordOpsAuditEvent({
    action: "hse_risk_assessment.approved",
    actorUserId: profile.id,
    entityId: assessment.id,
    entityType: "hse_risk_assessment",
    metadata: {
      assessment_number: assessment.assessment_number,
      residual_risk: assessment.residual_risk,
    },
    moduleKey: "hse_compliance",
    sourceId: assessment.id,
    sourceTable: "hse_risk_assessments",
    summary: `Approved risk assessment ${assessment.assessment_number}`,
  }).catch(() => null);

  if (isHighOrCriticalSeverity(assessment.residual_risk)) {
    await queueOpsHseRoleNotifications({
      actionHref: `${HSE_COMPLIANCE_ROUTE}#risk-assessment-panel`,
      actorUserId: profile.id,
      body: `${assessment.assessment_number} was approved with ${assessment.residual_risk} residual risk.`,
      idempotencyKeyPrefix: `hse-risk-high-residual:${assessment.id}`,
      moduleKey: "hse_compliance",
      recipientRoles: OPS_HSE_ESCALATION_NOTIFICATION_ROLES,
      sendCriticalEmail: true,
      sourceId: assessment.id,
      sourceTable: "hse_risk_assessments",
      title: "High residual HSE risk",
    }).catch(() => null);
  }

  await queueOpsHseUserNotification({
    actionHref: `${HSE_COMPLIANCE_ROUTE}#risk-assessment-panel`,
    actorUserId: profile.id,
    body: `${assessment.assessment_number} has been approved.`,
    idempotencyKeyPrefix: `hse-risk-approved:${assessment.id}`,
    moduleKey: "hse_compliance",
    recipientId: assessment.responsible_user_id ?? assessment.created_by,
    sourceId: assessment.id,
    sourceTable: "hse_risk_assessments",
    title: "Risk assessment approved",
  }).catch(() => null);

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  revalidatePath("/ops/notifications");
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=risk_approved#risk-assessment-panel`);
}

export async function archiveHseRiskAssessmentAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = riskAssessmentIdSchema.safeParse({ assessment_id: field(formData, "assessment_id") });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Select a risk assessment.");
  }

  const assessment = await fetchHseRiskAssessment(parsed.data.assessment_id);

  if (!assessment) {
    hseComplianceError("Risk assessment was not found.");
  }

  if (!canArchiveOpsHseRiskAssessment(profile.role, assessment)) {
    hseComplianceError("Your role cannot archive this risk assessment.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("hse_risk_assessments")
    .update({
      archived_at: new Date().toISOString(),
      archived_by: profile.id,
      status: "archived",
    })
    .eq("id", assessment.id)
    .eq("status", "approved");

  if (error) {
    hseComplianceError(error.message);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=risk_archived#risk-assessment-panel`);
}

export async function cancelHseRiskAssessmentAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = riskAssessmentIdSchema.safeParse({ assessment_id: field(formData, "assessment_id") });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Select a risk assessment.");
  }

  const assessment = await fetchHseRiskAssessment(parsed.data.assessment_id);

  if (!assessment) {
    hseComplianceError("Risk assessment was not found.");
  }

  if (!canCancelOpsHseRiskAssessment(profile.role, assessment)) {
    hseComplianceError("Your role cannot cancel this risk assessment.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("hse_risk_assessments")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: profile.id,
      status: "cancelled",
    })
    .eq("id", assessment.id)
    .in("status", ["draft", "submitted"]);

  if (error) {
    hseComplianceError(error.message);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=risk_cancelled#risk-assessment-panel`);
}

export async function createHseComplianceAuditAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsHseComplianceAudit(profile.role)) {
    hseComplianceError("Your role cannot create compliance audits.");
  }

  const parsed = complianceAuditSchema.safeParse({
    audit_type: field(formData, "audit_type") || "general",
    auditor_id: field(formData, "auditor_id"),
    scheduled_date: field(formData, "scheduled_date"),
    site_id: field(formData, "site_id"),
    summary: field(formData, "summary"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check compliance audit details.");
  }

  const siteId = normalizeOptionalUuid(parsed.data.site_id);
  await assertActiveSite(siteId);
  const auditorId = normalizeOptionalUuid(parsed.data.auditor_id);

  const { data, error } = await getOpsSupabaseServiceClient()
    .from("hse_compliance_audits")
    .insert({
      audit_type: parsed.data.audit_type,
      auditor_id: auditorId,
      created_by: profile.id,
      scheduled_date: normalizeDate(parsed.data.scheduled_date),
      site_id: siteId,
      status: "planned",
      summary: parsed.data.summary,
      title: parsed.data.title,
    })
    .select("id, audit_number")
    .single<{ audit_number: string; id: string }>();

  if (error || !data) {
    hseComplianceError(error?.message ?? "Could not create compliance audit.");
  }

  await recordOpsAuditEvent({
    action: "hse_compliance_audit.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "hse_compliance_audit",
    metadata: { audit_number: data.audit_number, audit_type: parsed.data.audit_type },
    moduleKey: "hse_compliance",
    sourceId: data.id,
    sourceTable: "hse_compliance_audits",
    summary: `Created compliance audit ${data.audit_number}`,
  }).catch(() => null);

  await queueOpsHseUserNotification({
    actionHref: `${HSE_COMPLIANCE_ROUTE}#audit-panel`,
    actorUserId: profile.id,
    body: `${profile.full_name} assigned compliance audit ${data.audit_number} to you.`,
    idempotencyKeyPrefix: `hse-audit-assigned:${data.id}`,
    moduleKey: "hse_compliance",
    recipientId: auditorId,
    sourceId: data.id,
    sourceTable: "hse_compliance_audits",
    title: "Compliance audit assigned",
  }).catch(() => null);

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  revalidatePath("/ops/notifications");
  redirect(`${HSE_COMPLIANCE_ROUTE}?created=compliance_audit#audit-panel`);
}

export async function completeHseComplianceAuditAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = completeComplianceAuditSchema.safeParse({
    audit_id: field(formData, "audit_id"),
    completed_date: field(formData, "completed_date"),
    findings_count: field(formData, "findings_count") || "0",
    next_audit_date: field(formData, "next_audit_date"),
    non_conformance_count: field(formData, "non_conformance_count") || "0",
    score: field(formData, "score") || "0",
    summary: field(formData, "summary"),
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check compliance audit completion.");
  }

  const audit = await fetchHseComplianceAudit(parsed.data.audit_id);

  if (!audit) {
    hseComplianceError("Compliance audit was not found.");
  }

  if (!canCompleteOpsHseComplianceAudit(profile.role, audit)) {
    hseComplianceError("Your role cannot complete this compliance audit.");
  }

  const completedDate = normalizeDate(parsed.data.completed_date);
  const nextAuditDate = normalizeOptionalDate(parsed.data.next_audit_date);

  if (nextAuditDate && nextAuditDate < completedDate) {
    hseComplianceError("Next audit date cannot be before completed date.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("hse_compliance_audits")
    .update({
      completed_by: profile.id,
      completed_date: completedDate,
      findings_count: parsed.data.findings_count,
      next_audit_date: nextAuditDate,
      non_conformance_count: parsed.data.non_conformance_count,
      score: parsed.data.score,
      status: "completed",
      summary: parsed.data.summary,
    })
    .eq("id", audit.id)
    .eq("status", "planned");

  if (error) {
    hseComplianceError(error.message);
  }

  await recordOpsAuditEvent({
    action: "hse_compliance_audit.completed",
    actorUserId: profile.id,
    entityId: audit.id,
    entityType: "hse_compliance_audit",
    metadata: {
      audit_number: audit.audit_number,
      findings_count: parsed.data.findings_count,
      non_conformance_count: parsed.data.non_conformance_count,
      score: parsed.data.score,
    },
    moduleKey: "hse_compliance",
    sourceId: audit.id,
    sourceTable: "hse_compliance_audits",
    summary: `Completed compliance audit ${audit.audit_number}`,
  }).catch(() => null);

  if (parsed.data.non_conformance_count > 0) {
    await queueOpsHseRoleNotifications({
      actionHref: `${HSE_COMPLIANCE_ROUTE}#audit-panel`,
      actorUserId: profile.id,
      body: `${audit.audit_number} was completed with ${parsed.data.non_conformance_count} non-conformance(s).`,
      idempotencyKeyPrefix: `hse-audit-nc:${audit.id}`,
      moduleKey: "hse_compliance",
      recipientRoles: OPS_HSE_ESCALATION_NOTIFICATION_ROLES,
      sendCriticalEmail: true,
      sourceId: audit.id,
      sourceTable: "hse_compliance_audits",
      title: "Audit non-conformance follow-up",
    }).catch(() => null);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  revalidatePath("/ops/notifications");
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=audit_completed#audit-panel`);
}

export async function requireHseComplianceAuditActionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = requireComplianceAuditActionSchema.safeParse({
    action_required: field(formData, "action_required"),
    audit_id: field(formData, "audit_id"),
  });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Check audit action requirement.");
  }

  const audit = await fetchHseComplianceAudit(parsed.data.audit_id);

  if (!audit) {
    hseComplianceError("Compliance audit was not found.");
  }

  if (!canRequireOpsHseComplianceAuditAction(profile.role, audit)) {
    hseComplianceError("Your role cannot require action for this compliance audit.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("hse_compliance_audits")
    .update({
      action_required: parsed.data.action_required,
      action_required_at: new Date().toISOString(),
      status: "action_required",
    })
    .eq("id", audit.id)
    .in("status", ["planned", "completed"]);

  if (error) {
    hseComplianceError(error.message);
  }

  await recordOpsAuditEvent({
    action: "hse_compliance_audit.action_required",
    actorUserId: profile.id,
    entityId: audit.id,
    entityType: "hse_compliance_audit",
    metadata: { audit_number: audit.audit_number },
    moduleKey: "hse_compliance",
    sourceId: audit.id,
    sourceTable: "hse_compliance_audits",
    summary: `Marked compliance audit ${audit.audit_number} action required`,
  }).catch(() => null);

  await queueOpsHseRoleNotifications({
    actionHref: `${HSE_COMPLIANCE_ROUTE}#audit-panel`,
    actorUserId: profile.id,
    body: `${audit.audit_number} now requires HSE compliance action.`,
    idempotencyKeyPrefix: `hse-audit-action-required:${audit.id}`,
    moduleKey: "hse_compliance",
    recipientRoles: OPS_HSE_ESCALATION_NOTIFICATION_ROLES,
    sendCriticalEmail: true,
    sourceId: audit.id,
    sourceTable: "hse_compliance_audits",
    title: "Audit action required",
  }).catch(() => null);

  await queueOpsHseUserNotification({
    actionHref: `${HSE_COMPLIANCE_ROUTE}#audit-panel`,
    actorUserId: profile.id,
    body: `${audit.audit_number} now requires HSE compliance action.`,
    idempotencyKeyPrefix: `hse-audit-action-required-owner:${audit.id}`,
    moduleKey: "hse_compliance",
    recipientId: audit.auditor_id ?? audit.created_by,
    sendCriticalEmail: true,
    sourceId: audit.id,
    sourceTable: "hse_compliance_audits",
    title: "Audit action required",
  }).catch(() => null);

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  revalidatePath("/ops/notifications");
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=audit_action_required#audit-panel`);
}

export async function closeHseComplianceAuditAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = complianceAuditIdSchema.safeParse({ audit_id: field(formData, "audit_id") });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Select a compliance audit.");
  }

  const audit = await fetchHseComplianceAudit(parsed.data.audit_id);

  if (!audit) {
    hseComplianceError("Compliance audit was not found.");
  }

  if (!canCloseOpsHseComplianceAudit(profile.role, audit)) {
    hseComplianceError("Your role cannot close this compliance audit.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("hse_compliance_audits")
    .update({
      closed_at: new Date().toISOString(),
      closed_by: profile.id,
      status: "closed",
    })
    .eq("id", audit.id)
    .in("status", ["completed", "action_required"]);

  if (error) {
    hseComplianceError(error.message);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=audit_closed#audit-panel`);
}

export async function cancelHseComplianceAuditAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = complianceAuditIdSchema.safeParse({ audit_id: field(formData, "audit_id") });

  if (!parsed.success) {
    hseComplianceError(parsed.error.issues[0]?.message ?? "Select a compliance audit.");
  }

  const audit = await fetchHseComplianceAudit(parsed.data.audit_id);

  if (!audit) {
    hseComplianceError("Compliance audit was not found.");
  }

  if (!canCancelOpsHseComplianceAudit(profile.role, audit)) {
    hseComplianceError("Your role cannot cancel this compliance audit.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("hse_compliance_audits")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: profile.id,
      status: "cancelled",
    })
    .eq("id", audit.id)
    .in("status", ["planned", "action_required"]);

  if (error) {
    hseComplianceError(error.message);
  }

  revalidatePath(HSE_COMPLIANCE_ROUTE);
  redirect(`${HSE_COMPLIANCE_ROUTE}?updated=audit_cancelled#audit-panel`);
}
