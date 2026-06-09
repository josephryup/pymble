"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  canAcknowledgeOpsSiteInstruction,
  canArchiveOpsDrawingRecord,
  canCancelOpsMaterialTest,
  canCancelOpsProgrammeMilestone,
  canCancelOpsQaInspection,
  canCancelOpsSiteInstruction,
  canCancelOpsSiteInstructionFollowUp,
  canCancelOpsSnagItem,
  canCloseOpsQaInspection,
  canCloseOpsSiteInstruction,
  canCloseOpsSiteInstructionFollowUp,
  canCompleteOpsProgrammeMilestone,
  canCompleteOpsQaInspection,
  canCreateOpsEngineeringControl,
  canIssueOpsSiteInstruction,
  canRequireOpsQaInspectionAction,
  canResolveOpsSnagItem,
  canStartOpsSiteInstructionFollowUp,
  canStartOpsSnagItem,
  canSupersedeOpsDrawingRecord,
  canUpdateOpsMaterialTest,
  canUpdateOpsProgrammeMilestone,
  canVerifyOpsSnagItem,
} from "@/lib/ops/engineering-controls-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsDrawingRegisterStatus,
  OpsMaterialTestStatus,
  OpsProgrammeMilestoneStatus,
  OpsQaInspectionStatus,
  OpsSiteInstructionFollowUpStatus,
  OpsSiteInstructionStatus,
  OpsSnagItemStatus,
} from "@/lib/ops/types";

const ENGINEERING_ROUTE = "/ops/engineering-controls";

const optionalUuid = z.string().uuid().or(z.literal("")).transform((value) => value || null);
const qaFindingCategorySchema = z.enum([
  "workmanship",
  "material",
  "design",
  "safety",
  "environmental",
  "documentation",
  "dimensional",
  "testing",
  "coordination",
  "other",
]);
const instructionFollowUpTypeSchema = z.enum([
  "qa_inspection",
  "snag",
  "material_test",
  "drawing_update",
  "programme_update",
  "other",
]);

const siteInstructionSchema = z.object({
  assigned_to: optionalUuid,
  description: z.string().trim().max(2000).default(""),
  instruction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter an instruction date."),
  instruction_type: z.string().trim().regex(/^[a-z][a-z0-9_]*$/, "Use a simple instruction type.").default("general"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  required_by: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).transform((value) => value || null),
  site_id: z.string().uuid("Select a project/site."),
  title: z.string().trim().min(2, "Instruction title is required.").max(180),
});

const qaInspectionSchema = z.object({
  inspection_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter an inspection date."),
  inspection_type: z.string().trim().regex(/^[a-z][a-z0-9_]*$/, "Use a simple inspection type.").default("general"),
  inspector_id: optionalUuid,
  site_id: z.string().uuid("Select a project/site."),
  title: z.string().trim().min(2, "Inspection title is required.").max(180),
});

const qaInspectionItemSchema = z.object({
  action_required: z.boolean().default(false),
  checklist_item: z.string().trim().min(2, "Checklist item is required.").max(220),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).transform((value) => value || null),
  finding_category: qaFindingCategorySchema.default("other"),
  inspection_id: z.string().uuid("Select a QA inspection."),
  notes: z.string().trim().max(800).default(""),
  responsible_user_id: optionalUuid,
  result: z.enum(["pending", "pass", "fail", "observation", "not_applicable"]).default("pending"),
});

const completeInspectionSchema = z.object({
  action_count: z.coerce.number().int().min(0).default(0),
  findings_count: z.coerce.number().int().min(0).default(0),
  inspection_id: z.string().uuid("Select a QA inspection."),
  score: z.coerce.number().min(0).max(100).default(0),
  summary: z.string().trim().max(1600).default(""),
});

const materialTestSchema = z.object({
  lab_reference: z.string().trim().max(120).default(""),
  location: z.string().trim().max(160).default(""),
  qa_inspection_id: optionalUuid,
  required_by: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).transform((value) => value || null),
  sample_reference: z.string().trim().max(120).default(""),
  site_id: z.string().uuid("Select a project/site."),
  standard_reference: z.string().trim().max(160).default(""),
  test_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a test date."),
  test_type: z.string().trim().min(2, "Test type is required.").max(120),
  tested_by: z.string().trim().max(160).default(""),
});

const materialTestResultSchema = z.object({
  result_summary: z.string().trim().max(1600).default(""),
  result_value: z.string().trim().max(160).default(""),
  status: z.enum(["submitted", "passed", "failed"]),
  test_id: z.string().uuid("Select a material test."),
});

const snagItemSchema = z.object({
  assigned_to: optionalUuid,
  description: z.string().trim().max(1600).default(""),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).transform((value) => value || null),
  location: z.string().trim().max(160).default(""),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  qa_inspection_id: optionalUuid,
  site_id: z.string().uuid("Select a project/site."),
  title: z.string().trim().min(2, "Snag title is required.").max(180),
});

const drawingRecordSchema = z.object({
  discipline: z.string().trim().max(120).default(""),
  document_id: optionalUuid,
  document_version_id: optionalUuid,
  drawing_number: z.string().trim().min(1, "Drawing number is required.").max(120),
  issued_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).transform((value) => value || null),
  notes: z.string().trim().max(1200).default(""),
  received_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a received date."),
  revision: z.string().trim().max(40).default("0"),
  site_id: z.string().uuid("Select a project/site."),
  title: z.string().trim().min(2, "Drawing title is required.").max(180),
});

const instructionFollowUpSchema = z.object({
  assigned_to: optionalUuid,
  description: z.string().trim().max(1200).default(""),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).transform((value) => value || null),
  instruction_id: z.string().uuid("Select a site instruction."),
  task_type: instructionFollowUpTypeSchema.default("other"),
  title: z.string().trim().min(2, "Follow-up title is required.").max(180),
});

const programmeMilestoneSchema = z.object({
  baseline_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a baseline date."),
  forecast_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).transform((value) => value || null),
  notes: z.string().trim().max(1200).default(""),
  owner_id: optionalUuid,
  progress_percent: z.coerce.number().min(0).max(100).default(0),
  site_id: z.string().uuid("Select a project/site."),
  title: z.string().trim().min(2, "Milestone title is required.").max(180),
});

const programmeUpdateSchema = z.object({
  delay_reason: z.string().trim().max(1200).default(""),
  forecast_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).transform((value) => value || null),
  milestone_id: z.string().uuid("Select a programme milestone."),
  notes: z.string().trim().max(1200).default(""),
  progress_percent: z.coerce.number().min(0).max(100).default(0),
  status: z.enum(["planned", "on_track", "delayed"]),
});

const idSchemas = {
  drawing: z.object({ drawing_id: z.string().uuid("Select a drawing record.") }),
  followUp: z.object({ follow_up_id: z.string().uuid("Select a follow-up task.") }),
  inspection: z.object({ inspection_id: z.string().uuid("Select a QA inspection.") }),
  instruction: z.object({ instruction_id: z.string().uuid("Select a site instruction.") }),
  milestone: z.object({ milestone_id: z.string().uuid("Select a programme milestone.") }),
  snag: z.object({ snag_id: z.string().uuid("Select a snag item.") }),
  test: z.object({ test_id: z.string().uuid("Select a material test.") }),
};

type InstructionPermissionRecord = {
  assigned_to: string | null;
  id: string;
  instruction_number: string;
  site_id: string;
  status: OpsSiteInstructionStatus;
};

type InspectionPermissionRecord = {
  id: string;
  inspection_number: string;
  status: OpsQaInspectionStatus;
};

type TestPermissionRecord = {
  id: string;
  status: OpsMaterialTestStatus;
  test_number: string;
};

type SnagPermissionRecord = {
  assigned_to: string | null;
  id: string;
  snag_number: string;
  status: OpsSnagItemStatus;
};

type DrawingPermissionRecord = {
  drawing_number: string;
  id: string;
  status: OpsDrawingRegisterStatus;
};

type DrawingDocumentVersionRecord = {
  document_id: string;
  id: string;
};

type MilestonePermissionRecord = {
  id: string;
  milestone_number: string;
  status: OpsProgrammeMilestoneStatus;
};

type InstructionFollowUpPermissionRecord = {
  assigned_to: string | null;
  id: string;
  status: OpsSiteInstructionFollowUpStatus;
  title: string;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function engineeringError(message: string): never {
  redirect(`${ENGINEERING_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function engineeringNotice(value: string): never {
  redirect(`${ENGINEERING_ROUTE}?updated=${encodeURIComponent(value)}`);
}

async function fetchInstruction(instructionId: string) {
  const { data, error } = await getOpsSupabaseServiceClient()
    .from("site_instructions")
    .select("id, instruction_number, status, assigned_to, site_id")
    .eq("id", instructionId)
    .maybeSingle<InstructionPermissionRecord>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchInspection(inspectionId: string) {
  const { data, error } = await getOpsSupabaseServiceClient()
    .from("qa_inspections")
    .select("id, inspection_number, status")
    .eq("id", inspectionId)
    .maybeSingle<InspectionPermissionRecord>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchTest(testId: string) {
  const { data, error } = await getOpsSupabaseServiceClient()
    .from("material_tests")
    .select("id, test_number, status")
    .eq("id", testId)
    .maybeSingle<TestPermissionRecord>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchSnag(snagId: string) {
  const { data, error } = await getOpsSupabaseServiceClient()
    .from("snag_items")
    .select("id, snag_number, status, assigned_to")
    .eq("id", snagId)
    .maybeSingle<SnagPermissionRecord>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchDrawing(drawingId: string) {
  const { data, error } = await getOpsSupabaseServiceClient()
    .from("drawing_register")
    .select("id, drawing_number, status")
    .eq("id", drawingId)
    .maybeSingle<DrawingPermissionRecord>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchDrawingDocumentVersion(versionId: string | null) {
  if (!versionId) {
    return null;
  }

  const { data, error } = await getOpsSupabaseServiceClient()
    .from("document_versions")
    .select("id, document_id")
    .eq("id", versionId)
    .maybeSingle<DrawingDocumentVersionRecord>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchMilestone(milestoneId: string) {
  const { data, error } = await getOpsSupabaseServiceClient()
    .from("programme_milestones")
    .select("id, milestone_number, status")
    .eq("id", milestoneId)
    .maybeSingle<MilestonePermissionRecord>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchInstructionFollowUp(followUpId: string) {
  const { data, error } = await getOpsSupabaseServiceClient()
    .from("site_instruction_follow_ups")
    .select("id, title, status, assigned_to")
    .eq("id", followUpId)
    .maybeSingle<InstructionFollowUpPermissionRecord>();

  if (error) {
    throw error;
  }

  return data;
}

async function auditEngineering(input: {
  action: string;
  actorUserId: string;
  entityId: string;
  entityType: string;
  sourceTable: string;
  summary: string;
}) {
  await recordOpsAuditEvent({
    ...input,
    moduleKey: "engineering_controls",
    sourceId: input.entityId,
  }).catch(() => null);
}

export async function createSiteInstructionAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsEngineeringControl(profile.role)) {
    engineeringError("Your role cannot create site instructions.");
  }

  const parsed = siteInstructionSchema.safeParse({
    assigned_to: field(formData, "assigned_to"),
    description: field(formData, "description"),
    instruction_date: field(formData, "instruction_date"),
    instruction_type: field(formData, "instruction_type") || "general",
    priority: field(formData, "priority") || "normal",
    required_by: field(formData, "required_by"),
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Check the site instruction.");
  }

  const { data, error } = await getOpsSupabaseServiceClient()
    .from("site_instructions")
    .insert({
      ...parsed.data,
      created_by: profile.id,
    })
    .select("id, instruction_number")
    .single<{ id: string; instruction_number: string }>();

  if (error || !data) {
    engineeringError(error?.message ?? "Could not create site instruction.");
  }

  await auditEngineering({
    action: "site_instruction.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "site_instruction",
    sourceTable: "site_instructions",
    summary: `Created site instruction ${data.instruction_number}`,
  });

  revalidatePath(ENGINEERING_ROUTE);
  redirect(`${ENGINEERING_ROUTE}?created=instruction`);
}

export async function issueSiteInstructionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.instruction.safeParse({ instruction_id: field(formData, "instruction_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a site instruction.");
  }

  const instruction = await fetchInstruction(parsed.data.instruction_id);

  if (!instruction || !canIssueOpsSiteInstruction(profile.role, instruction)) {
    engineeringError("Your role cannot issue this instruction.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("site_instructions")
    .update({ issued_by: profile.id, status: "issued" })
    .eq("id", instruction.id);

  if (error) {
    engineeringError(error.message);
  }

  await auditEngineering({
    action: "site_instruction.issued",
    actorUserId: profile.id,
    entityId: instruction.id,
    entityType: "site_instruction",
    sourceTable: "site_instructions",
    summary: `Issued site instruction ${instruction.instruction_number}`,
  });

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("instruction_issued");
}

export async function acknowledgeSiteInstructionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.instruction.safeParse({ instruction_id: field(formData, "instruction_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a site instruction.");
  }

  const instruction = await fetchInstruction(parsed.data.instruction_id);

  if (!instruction || !canAcknowledgeOpsSiteInstruction(profile.id, profile.role, instruction)) {
    engineeringError("Your role cannot acknowledge this instruction.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("site_instructions")
    .update({
      acknowledged_at: new Date().toISOString(),
      response_notes: field(formData, "response_notes"),
      status: "acknowledged",
    })
    .eq("id", instruction.id);

  if (error) {
    engineeringError(error.message);
  }

  await auditEngineering({
    action: "site_instruction.acknowledged",
    actorUserId: profile.id,
    entityId: instruction.id,
    entityType: "site_instruction",
    sourceTable: "site_instructions",
    summary: `Acknowledged site instruction ${instruction.instruction_number}`,
  });

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("instruction_acknowledged");
}

export async function closeSiteInstructionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.instruction.safeParse({ instruction_id: field(formData, "instruction_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a site instruction.");
  }

  const instruction = await fetchInstruction(parsed.data.instruction_id);

  if (!instruction || !canCloseOpsSiteInstruction(profile.role, instruction)) {
    engineeringError("Your role cannot close this instruction.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("site_instructions")
    .update({ closed_at: new Date().toISOString(), closed_by: profile.id, status: "closed" })
    .eq("id", instruction.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("instruction_closed");
}

export async function cancelSiteInstructionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.instruction.safeParse({ instruction_id: field(formData, "instruction_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a site instruction.");
  }

  const instruction = await fetchInstruction(parsed.data.instruction_id);

  if (!instruction || !canCancelOpsSiteInstruction(profile.role, instruction)) {
    engineeringError("Your role cannot cancel this instruction.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("site_instructions")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: profile.id, status: "cancelled" })
    .eq("id", instruction.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("instruction_cancelled");
}

export async function createSiteInstructionFollowUpAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsEngineeringControl(profile.role)) {
    engineeringError("Your role cannot create site instruction follow-ups.");
  }

  const parsed = instructionFollowUpSchema.safeParse({
    assigned_to: field(formData, "assigned_to"),
    description: field(formData, "description"),
    due_date: field(formData, "due_date"),
    instruction_id: field(formData, "instruction_id"),
    task_type: field(formData, "task_type") || "other",
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Check the follow-up task.");
  }

  const instruction = await fetchInstruction(parsed.data.instruction_id);

  if (!instruction || instruction.status === "cancelled") {
    engineeringError("This site instruction cannot accept follow-up tasks.");
  }

  const { data, error } = await getOpsSupabaseServiceClient()
    .from("site_instruction_follow_ups")
    .insert({
      ...parsed.data,
      created_by: profile.id,
      site_id: instruction.site_id,
    })
    .select("id, title")
    .single<{ id: string; title: string }>();

  if (error || !data) {
    engineeringError(error?.message ?? "Could not create follow-up task.");
  }

  await auditEngineering({
    action: "site_instruction_follow_up.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "site_instruction_follow_up",
    sourceTable: "site_instruction_follow_ups",
    summary: `Created follow-up task for ${instruction.instruction_number}`,
  });

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("instruction_follow_up");
}

export async function startSiteInstructionFollowUpAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.followUp.safeParse({ follow_up_id: field(formData, "follow_up_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a follow-up task.");
  }

  const followUp = await fetchInstructionFollowUp(parsed.data.follow_up_id);

  if (!followUp || !canStartOpsSiteInstructionFollowUp(profile.id, profile.role, followUp)) {
    engineeringError("Your role cannot start this follow-up task.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("site_instruction_follow_ups")
    .update({ status: "in_progress" })
    .eq("id", followUp.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("follow_up_started");
}

export async function closeSiteInstructionFollowUpAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.followUp.safeParse({ follow_up_id: field(formData, "follow_up_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a follow-up task.");
  }

  const followUp = await fetchInstructionFollowUp(parsed.data.follow_up_id);

  if (!followUp || !canCloseOpsSiteInstructionFollowUp(profile.id, profile.role, followUp)) {
    engineeringError("Your role cannot close this follow-up task.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("site_instruction_follow_ups")
    .update({ closed_at: new Date().toISOString(), closed_by: profile.id, status: "closed" })
    .eq("id", followUp.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("follow_up_closed");
}

export async function cancelSiteInstructionFollowUpAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.followUp.safeParse({ follow_up_id: field(formData, "follow_up_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a follow-up task.");
  }

  const followUp = await fetchInstructionFollowUp(parsed.data.follow_up_id);

  if (!followUp || !canCancelOpsSiteInstructionFollowUp(profile.role, followUp)) {
    engineeringError("Your role cannot cancel this follow-up task.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("site_instruction_follow_ups")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: profile.id, status: "cancelled" })
    .eq("id", followUp.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("follow_up_cancelled");
}

export async function createQaInspectionAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsEngineeringControl(profile.role)) {
    engineeringError("Your role cannot create QA inspections.");
  }

  const parsed = qaInspectionSchema.safeParse({
    inspection_date: field(formData, "inspection_date"),
    inspection_type: field(formData, "inspection_type") || "general",
    inspector_id: field(formData, "inspector_id"),
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Check the QA inspection.");
  }

  const { data, error } = await getOpsSupabaseServiceClient()
    .from("qa_inspections")
    .insert({ ...parsed.data, created_by: profile.id })
    .select("id, inspection_number")
    .single<{ id: string; inspection_number: string }>();

  if (error || !data) {
    engineeringError(error?.message ?? "Could not create QA inspection.");
  }

  await auditEngineering({
    action: "qa_inspection.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "qa_inspection",
    sourceTable: "qa_inspections",
    summary: `Created QA inspection ${data.inspection_number}`,
  });

  revalidatePath(ENGINEERING_ROUTE);
  redirect(`${ENGINEERING_ROUTE}?created=inspection`);
}

export async function addQaInspectionItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsEngineeringControl(profile.role)) {
    engineeringError("Your role cannot add QA inspection items.");
  }

  const parsed = qaInspectionItemSchema.safeParse({
    action_required: checked(formData, "action_required"),
    checklist_item: field(formData, "checklist_item"),
    due_date: field(formData, "due_date"),
    finding_category: field(formData, "finding_category") || "other",
    inspection_id: field(formData, "inspection_id"),
    notes: field(formData, "notes"),
    responsible_user_id: field(formData, "responsible_user_id"),
    result: field(formData, "result") || "pending",
  });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Check the QA inspection item.");
  }

  const inspection = await fetchInspection(parsed.data.inspection_id);

  if (!inspection || inspection.status === "closed" || inspection.status === "cancelled") {
    engineeringError("This QA inspection cannot accept checklist items.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { count, error: countError } = await supabase
    .from("qa_inspection_items")
    .select("id", { count: "exact", head: true })
    .eq("inspection_id", inspection.id);

  if (countError) {
    engineeringError(countError.message);
  }

  const { error } = await supabase.from("qa_inspection_items").insert({
    ...parsed.data,
    created_by: profile.id,
    line_number: (count ?? 0) + 1,
  });

  if (error) {
    engineeringError(error.message);
  }

  await auditEngineering({
    action: "qa_inspection_item.created",
    actorUserId: profile.id,
    entityId: inspection.id,
    entityType: "qa_inspection",
    sourceTable: "qa_inspections",
    summary: `Added checklist item to ${inspection.inspection_number}`,
  });

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("inspection_item");
}

export async function completeQaInspectionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = completeInspectionSchema.safeParse({
    action_count: field(formData, "action_count") || "0",
    findings_count: field(formData, "findings_count") || "0",
    inspection_id: field(formData, "inspection_id"),
    score: field(formData, "score") || "0",
    summary: field(formData, "summary"),
  });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Check inspection completion.");
  }

  const inspection = await fetchInspection(parsed.data.inspection_id);

  if (!inspection || !canCompleteOpsQaInspection(profile.role, inspection)) {
    engineeringError("Your role cannot complete this inspection.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("qa_inspections")
    .update({
      action_count: parsed.data.action_count,
      completed_at: new Date().toISOString(),
      findings_count: parsed.data.findings_count,
      score: parsed.data.score,
      status: "completed",
      summary: parsed.data.summary,
    })
    .eq("id", inspection.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("inspection_completed");
}

export async function requireQaInspectionActionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.inspection.safeParse({ inspection_id: field(formData, "inspection_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a QA inspection.");
  }

  const inspection = await fetchInspection(parsed.data.inspection_id);

  if (!inspection || !canRequireOpsQaInspectionAction(profile.role, inspection)) {
    engineeringError("Your role cannot require action for this inspection.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("qa_inspections")
    .update({
      action_required: field(formData, "action_required"),
      status: "action_required",
    })
    .eq("id", inspection.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("inspection_action_required");
}

export async function closeQaInspectionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.inspection.safeParse({ inspection_id: field(formData, "inspection_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a QA inspection.");
  }

  const inspection = await fetchInspection(parsed.data.inspection_id);

  if (!inspection || !canCloseOpsQaInspection(profile.role, inspection)) {
    engineeringError("Your role cannot close this inspection.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("qa_inspections")
    .update({ closed_at: new Date().toISOString(), closed_by: profile.id, status: "closed" })
    .eq("id", inspection.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("inspection_closed");
}

export async function cancelQaInspectionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.inspection.safeParse({ inspection_id: field(formData, "inspection_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a QA inspection.");
  }

  const inspection = await fetchInspection(parsed.data.inspection_id);

  if (!inspection || !canCancelOpsQaInspection(profile.role, inspection)) {
    engineeringError("Your role cannot cancel this inspection.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("qa_inspections")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: profile.id, status: "cancelled" })
    .eq("id", inspection.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("inspection_cancelled");
}

export async function createMaterialTestAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsEngineeringControl(profile.role)) {
    engineeringError("Your role cannot create material tests.");
  }

  const parsed = materialTestSchema.safeParse({
    lab_reference: field(formData, "lab_reference"),
    location: field(formData, "location"),
    qa_inspection_id: field(formData, "qa_inspection_id"),
    required_by: field(formData, "required_by"),
    sample_reference: field(formData, "sample_reference"),
    site_id: field(formData, "site_id"),
    standard_reference: field(formData, "standard_reference"),
    test_date: field(formData, "test_date"),
    test_type: field(formData, "test_type"),
    tested_by: field(formData, "tested_by"),
  });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Check the material test.");
  }

  const { data, error } = await getOpsSupabaseServiceClient()
    .from("material_tests")
    .insert({ ...parsed.data, created_by: profile.id })
    .select("id, test_number")
    .single<{ id: string; test_number: string }>();

  if (error || !data) {
    engineeringError(error?.message ?? "Could not create material test.");
  }

  await auditEngineering({
    action: "material_test.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "material_test",
    sourceTable: "material_tests",
    summary: `Created material test ${data.test_number}`,
  });

  revalidatePath(ENGINEERING_ROUTE);
  redirect(`${ENGINEERING_ROUTE}?created=material_test`);
}

export async function updateMaterialTestResultAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = materialTestResultSchema.safeParse({
    result_summary: field(formData, "result_summary"),
    result_value: field(formData, "result_value"),
    status: field(formData, "status"),
    test_id: field(formData, "test_id"),
  });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Check the material test result.");
  }

  const test = await fetchTest(parsed.data.test_id);

  if (!test || !canUpdateOpsMaterialTest(profile.role, test)) {
    engineeringError("Your role cannot update this material test.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("material_tests")
    .update({
      completed_at: parsed.data.status === "passed" || parsed.data.status === "failed"
        ? new Date().toISOString()
        : null,
      result_summary: parsed.data.result_summary,
      result_value: parsed.data.result_value,
      status: parsed.data.status,
    })
    .eq("id", test.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("material_test_updated");
}

export async function cancelMaterialTestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.test.safeParse({ test_id: field(formData, "test_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a material test.");
  }

  const test = await fetchTest(parsed.data.test_id);

  if (!test || !canCancelOpsMaterialTest(profile.role, test)) {
    engineeringError("Your role cannot cancel this material test.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("material_tests")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: profile.id, status: "cancelled" })
    .eq("id", test.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("material_test_cancelled");
}

export async function createSnagItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsEngineeringControl(profile.role)) {
    engineeringError("Your role cannot create snag items.");
  }

  const parsed = snagItemSchema.safeParse({
    assigned_to: field(formData, "assigned_to"),
    description: field(formData, "description"),
    due_date: field(formData, "due_date"),
    location: field(formData, "location"),
    priority: field(formData, "priority") || "normal",
    qa_inspection_id: field(formData, "qa_inspection_id"),
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Check the snag item.");
  }

  const { data, error } = await getOpsSupabaseServiceClient()
    .from("snag_items")
    .insert({ ...parsed.data, created_by: profile.id })
    .select("id, snag_number")
    .single<{ id: string; snag_number: string }>();

  if (error || !data) {
    engineeringError(error?.message ?? "Could not create snag item.");
  }

  await auditEngineering({
    action: "snag_item.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "snag_item",
    sourceTable: "snag_items",
    summary: `Created snag item ${data.snag_number}`,
  });

  revalidatePath(ENGINEERING_ROUTE);
  redirect(`${ENGINEERING_ROUTE}?created=snag`);
}

export async function startSnagItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.snag.safeParse({ snag_id: field(formData, "snag_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a snag item.");
  }

  const snag = await fetchSnag(parsed.data.snag_id);

  if (!snag || !canStartOpsSnagItem(profile.role, snag)) {
    engineeringError("Your role cannot start this snag item.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("snag_items")
    .update({ status: "in_progress" })
    .eq("id", snag.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("snag_started");
}

export async function resolveSnagItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.snag.safeParse({ snag_id: field(formData, "snag_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a snag item.");
  }

  const snag = await fetchSnag(parsed.data.snag_id);

  if (!snag || !canResolveOpsSnagItem(profile.id, profile.role, snag)) {
    engineeringError("Your role cannot resolve this snag item.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("snag_items")
    .update({
      resolution_notes: field(formData, "resolution_notes"),
      resolved_at: new Date().toISOString(),
      status: "resolved",
    })
    .eq("id", snag.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("snag_resolved");
}

export async function verifySnagItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.snag.safeParse({ snag_id: field(formData, "snag_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a snag item.");
  }

  const snag = await fetchSnag(parsed.data.snag_id);

  if (!snag || !canVerifyOpsSnagItem(profile.role, snag)) {
    engineeringError("Your role cannot verify this snag item.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("snag_items")
    .update({ status: "verified", verified_at: new Date().toISOString(), verified_by: profile.id })
    .eq("id", snag.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("snag_verified");
}

export async function cancelSnagItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.snag.safeParse({ snag_id: field(formData, "snag_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a snag item.");
  }

  const snag = await fetchSnag(parsed.data.snag_id);

  if (!snag || !canCancelOpsSnagItem(profile.role, snag)) {
    engineeringError("Your role cannot cancel this snag item.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("snag_items")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: profile.id, status: "cancelled" })
    .eq("id", snag.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("snag_cancelled");
}

export async function createDrawingRecordAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsEngineeringControl(profile.role)) {
    engineeringError("Your role cannot create drawing records.");
  }

  const parsed = drawingRecordSchema.safeParse({
    discipline: field(formData, "discipline"),
    document_id: field(formData, "document_id"),
    document_version_id: field(formData, "document_version_id"),
    drawing_number: field(formData, "drawing_number"),
    issued_date: field(formData, "issued_date"),
    notes: field(formData, "notes"),
    received_date: field(formData, "received_date"),
    revision: field(formData, "revision") || "0",
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Check the drawing record.");
  }

  const linkedVersion = await fetchDrawingDocumentVersion(parsed.data.document_version_id);

  if (parsed.data.document_version_id && !linkedVersion) {
    engineeringError("Selected document version was not found.");
  }

  const { data, error } = await getOpsSupabaseServiceClient()
    .from("drawing_register")
    .insert({
      ...parsed.data,
      created_by: profile.id,
      document_id: linkedVersion?.document_id ?? parsed.data.document_id,
      document_version_id: linkedVersion?.id ?? null,
    })
    .select("id, drawing_number")
    .single<{ drawing_number: string; id: string }>();

  if (error || !data) {
    engineeringError(error?.message ?? "Could not create drawing record.");
  }

  await auditEngineering({
    action: "drawing_record.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "drawing_record",
    sourceTable: "drawing_register",
    summary: `Created drawing record ${data.drawing_number}`,
  });

  revalidatePath(ENGINEERING_ROUTE);
  redirect(`${ENGINEERING_ROUTE}?created=drawing`);
}

export async function supersedeDrawingRecordAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.drawing.safeParse({ drawing_id: field(formData, "drawing_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a drawing record.");
  }

  const drawing = await fetchDrawing(parsed.data.drawing_id);

  if (!drawing || !canSupersedeOpsDrawingRecord(profile.role, drawing)) {
    engineeringError("Your role cannot supersede this drawing.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("drawing_register")
    .update({ status: "superseded" })
    .eq("id", drawing.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("drawing_superseded");
}

export async function archiveDrawingRecordAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.drawing.safeParse({ drawing_id: field(formData, "drawing_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a drawing record.");
  }

  const drawing = await fetchDrawing(parsed.data.drawing_id);

  if (!drawing || !canArchiveOpsDrawingRecord(profile.role, drawing)) {
    engineeringError("Your role cannot archive this drawing.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("drawing_register")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id, status: "archived" })
    .eq("id", drawing.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("drawing_archived");
}

export async function createProgrammeMilestoneAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsEngineeringControl(profile.role)) {
    engineeringError("Your role cannot create programme milestones.");
  }

  const parsed = programmeMilestoneSchema.safeParse({
    baseline_date: field(formData, "baseline_date"),
    forecast_date: field(formData, "forecast_date"),
    notes: field(formData, "notes"),
    owner_id: field(formData, "owner_id"),
    progress_percent: field(formData, "progress_percent") || "0",
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Check the programme milestone.");
  }

  const { data, error } = await getOpsSupabaseServiceClient()
    .from("programme_milestones")
    .insert({ ...parsed.data, created_by: profile.id })
    .select("id, milestone_number")
    .single<{ id: string; milestone_number: string }>();

  if (error || !data) {
    engineeringError(error?.message ?? "Could not create programme milestone.");
  }

  await auditEngineering({
    action: "programme_milestone.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "programme_milestone",
    sourceTable: "programme_milestones",
    summary: `Created programme milestone ${data.milestone_number}`,
  });

  revalidatePath(ENGINEERING_ROUTE);
  redirect(`${ENGINEERING_ROUTE}?created=milestone`);
}

export async function updateProgrammeMilestoneAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = programmeUpdateSchema.safeParse({
    delay_reason: field(formData, "delay_reason"),
    forecast_date: field(formData, "forecast_date"),
    milestone_id: field(formData, "milestone_id"),
    notes: field(formData, "notes"),
    progress_percent: field(formData, "progress_percent") || "0",
    status: field(formData, "status") || "on_track",
  });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Check the programme milestone.");
  }

  const milestone = await fetchMilestone(parsed.data.milestone_id);

  if (!milestone || !canUpdateOpsProgrammeMilestone(profile.role, milestone)) {
    engineeringError("Your role cannot update this programme milestone.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("programme_milestones")
    .update({
      delay_reason: parsed.data.delay_reason,
      forecast_date: parsed.data.forecast_date,
      notes: parsed.data.notes,
      progress_percent: parsed.data.progress_percent,
      status: parsed.data.status,
    })
    .eq("id", milestone.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("milestone_updated");
}

export async function completeProgrammeMilestoneAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.milestone.safeParse({ milestone_id: field(formData, "milestone_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a programme milestone.");
  }

  const milestone = await fetchMilestone(parsed.data.milestone_id);

  if (!milestone || !canCompleteOpsProgrammeMilestone(profile.role, milestone)) {
    engineeringError("Your role cannot complete this programme milestone.");
  }

  const now = new Date().toISOString();
  const { error } = await getOpsSupabaseServiceClient()
    .from("programme_milestones")
    .update({
      actual_date: now.slice(0, 10),
      completed_at: now,
      progress_percent: 100,
      status: "completed",
    })
    .eq("id", milestone.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("milestone_completed");
}

export async function cancelProgrammeMilestoneAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = idSchemas.milestone.safeParse({ milestone_id: field(formData, "milestone_id") });

  if (!parsed.success) {
    engineeringError(parsed.error.issues[0]?.message ?? "Select a programme milestone.");
  }

  const milestone = await fetchMilestone(parsed.data.milestone_id);

  if (!milestone || !canCancelOpsProgrammeMilestone(profile.role, milestone)) {
    engineeringError("Your role cannot cancel this programme milestone.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("programme_milestones")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: profile.id, status: "cancelled" })
    .eq("id", milestone.id);

  if (error) {
    engineeringError(error.message);
  }

  revalidatePath(ENGINEERING_ROUTE);
  engineeringNotice("milestone_cancelled");
}
