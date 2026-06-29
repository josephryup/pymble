"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { logOpsServerError } from "@/lib/ops/log";
import {
  canAllocateSubcontractor,
  canApproveSubcontractorPayment,
  canArchiveSubcontractor,
  canManageSubcontractor,
  canRequestSubcontractorPayment,
} from "@/lib/ops/subcontractor-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

const ROUTE = "/ops/subcontractors";
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const optionalUuid = z
  .string()
  .trim()
  .default("")
  .transform((v) => (v.length > 0 ? v : null));

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function subError(message: string): never {
  redirect(
    `${ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`,
  );
}

const subSchema = z.object({
  kind: z.enum(["company", "general"]).default("company"),
  company_name: z.string().trim().min(2, "Name is required.").max(200),
  trade_specialty: z.string().trim().max(200).default(""),
  contact_name: z.string().trim().max(200).default(""),
  contact_phone: z.string().trim().max(40).default(""),
  contact_email: z.string().trim().max(200).default(""),
  tpin: z.string().trim().max(40).default(""),
  registration_number: z.string().trim().max(80).default(""),
  bank_name: z.string().trim().max(120).default(""),
  bank_account_number: z.string().trim().max(80).default(""),
  status: z.enum([
    "prospect",
    "kyc_pending",
    "approved",
    "suspended",
    "blacklisted",
  ]),
  kyc_notes: z.string().trim().max(4000).default(""),
  performance_rating: z
    .string()
    .trim()
    .default("")
    .transform((v) => (v === "" ? null : Number(v))),
  performance_notes: z.string().trim().max(4000).default(""),
  retention_percent: z.coerce.number().min(0).max(50).default(5),
});

const updateSubSchema = subSchema.extend({
  id: z.string().uuid("Select a subcontractor."),
});

export async function createSubcontractorAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageSubcontractor(profile.role)) {
    subError("Your role cannot manage subcontractors.");
  }
  const parsed = subSchema.safeParse({
    kind: field(formData, "kind") || "company",
    company_name: field(formData, "company_name"),
    trade_specialty: field(formData, "trade_specialty"),
    contact_name: field(formData, "contact_name"),
    contact_phone: field(formData, "contact_phone"),
    contact_email: field(formData, "contact_email"),
    tpin: field(formData, "tpin"),
    registration_number: field(formData, "registration_number"),
    bank_name: field(formData, "bank_name"),
    bank_account_number: field(formData, "bank_account_number"),
    status: field(formData, "status") || "prospect",
    kyc_notes: field(formData, "kyc_notes"),
    performance_rating: field(formData, "performance_rating"),
    performance_notes: field(formData, "performance_notes"),
    retention_percent: field(formData, "retention_percent") || "5",
  });
  if (!parsed.success) {
    subError(parsed.error.issues[0]?.message ?? "Check the subcontractor details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("subcontractors")
    .insert({ ...parsed.data, created_by: profile.id })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    logOpsServerError(error, {
      module: "subcontractors",
      action: "createSubcontractorAction",
    });
    subError(error?.message ?? "The subcontractor could not be created.");
  }

  await recordOpsAuditEvent({
    action: "subcontractor.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "subcontractor",
    metadata: { company_name: parsed.data.company_name, kind: parsed.data.kind },
    moduleKey: "subcontractors",
    sourceId: data.id,
    sourceTable: "subcontractors",
    summary: `Created subcontractor: ${parsed.data.company_name}`,
  }).catch(() => null);

  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${data.id}?created=subcontractor`);
}

export async function updateSubcontractorAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageSubcontractor(profile.role)) {
    subError("Your role cannot edit subcontractors.");
  }
  const parsed = updateSubSchema.safeParse({
    id: field(formData, "id"),
    kind: field(formData, "kind") || "company",
    company_name: field(formData, "company_name"),
    trade_specialty: field(formData, "trade_specialty"),
    contact_name: field(formData, "contact_name"),
    contact_phone: field(formData, "contact_phone"),
    contact_email: field(formData, "contact_email"),
    tpin: field(formData, "tpin"),
    registration_number: field(formData, "registration_number"),
    bank_name: field(formData, "bank_name"),
    bank_account_number: field(formData, "bank_account_number"),
    status: field(formData, "status") || "prospect",
    kyc_notes: field(formData, "kyc_notes"),
    performance_rating: field(formData, "performance_rating"),
    performance_notes: field(formData, "performance_notes"),
    retention_percent: field(formData, "retention_percent") || "5",
  });
  if (!parsed.success) {
    subError(parsed.error.issues[0]?.message ?? "Check the subcontractor details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { id, ...patch } = parsed.data;
  const { error } = await supabase
    .from("subcontractors")
    .update(patch)
    .eq("id", id)
    .is("archived_at", null);
  if (error) {
    subError(error.message);
  }
  await recordOpsAuditEvent({
    action: "subcontractor.updated",
    actorUserId: profile.id,
    entityId: id,
    entityType: "subcontractor",
    moduleKey: "subcontractors",
    sourceId: id,
    sourceTable: "subcontractors",
    summary: `Updated subcontractor: ${patch.company_name}`,
  }).catch(() => null);
  revalidatePath(ROUTE);
  revalidatePath(`${ROUTE}/${id}`);
  redirect(`${ROUTE}/${id}?updated=subcontractor`);
}

export async function archiveSubcontractorAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canArchiveSubcontractor(profile.role)) {
    subError("Only Operations Manager or leadership can archive subcontractors.");
  }
  const id = field(formData, "id");
  if (!id) subError("Select a subcontractor.");
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("subcontractors")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", id);
  if (error) subError(error.message);
  await recordOpsAuditEvent({
    action: "subcontractor.archived",
    actorUserId: profile.id,
    entityId: id,
    entityType: "subcontractor",
    moduleKey: "subcontractors",
    sourceId: id,
    sourceTable: "subcontractors",
  }).catch(() => null);
  revalidatePath(ROUTE);
  redirect(ROUTE);
}

const assignmentSchema = z.object({
  subcontractor_id: z.string().uuid("Pick a subcontractor."),
  site_id: z.string().uuid("Pick a site."),
  project_task_id: optionalUuid,
  scope: z.string().trim().min(2, "Describe the scope.").max(2000),
  agreed_amount: z.coerce.number().min(0),
  start_date: z.string().regex(datePattern, "Pick a start date."),
  end_date: z
    .string()
    .trim()
    .default("")
    .transform((v) => (v && datePattern.test(v) ? v : null)),
  status: z.enum(["planned", "active", "completed", "cancelled"]),
  notes: z.string().trim().max(4000).default(""),
});

export async function createSubcontractorAssignmentAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canAllocateSubcontractor(profile.role)) {
    subError("Your role cannot allocate subcontractors.");
  }
  const parsed = assignmentSchema.safeParse({
    subcontractor_id: field(formData, "subcontractor_id"),
    site_id: field(formData, "site_id"),
    project_task_id: field(formData, "project_task_id"),
    scope: field(formData, "scope"),
    agreed_amount: field(formData, "agreed_amount") || "0",
    start_date: field(formData, "start_date"),
    end_date: field(formData, "end_date"),
    status: field(formData, "status") || "planned",
    notes: field(formData, "notes"),
  });
  if (!parsed.success) {
    subError(parsed.error.issues[0]?.message ?? "Check the assignment details.");
  }
  if (parsed.data.end_date && parsed.data.end_date < parsed.data.start_date) {
    subError("End date must be on or after the start date.");
  }
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("subcontractor_assignments")
    .insert({ ...parsed.data, created_by: profile.id })
    .select("id, subcontractor_id")
    .single<{ id: string; subcontractor_id: string }>();
  if (error || !data) {
    logOpsServerError(error, {
      module: "subcontractor_assignments",
      action: "createSubcontractorAssignmentAction",
    });
    subError(error?.message ?? "The assignment could not be created.");
  }
  await recordOpsAuditEvent({
    action: "subcontractor_assignment.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "subcontractor_assignment",
    metadata: {
      subcontractor_id: parsed.data.subcontractor_id,
      site_id: parsed.data.site_id,
    },
    moduleKey: "subcontractors",
    sourceId: data.id,
    sourceTable: "subcontractor_assignments",
    summary: "Allocated subcontractor to site",
  }).catch(() => null);
  revalidatePath(`${ROUTE}/${data.subcontractor_id}`);
  redirect(`${ROUTE}/${data.subcontractor_id}?updated=assignment`);
}

const paymentSchema = z.object({
  assignment_id: z.string().uuid("Pick an assignment."),
  payment_type: z.enum(["advance", "interim", "retention_release", "final"]),
  amount: z.coerce.number().positive("Amount must be greater than zero."),
  retention_held: z.coerce.number().min(0).default(0),
  reference: z.string().trim().max(200).default(""),
  scheduled_for: z
    .string()
    .trim()
    .default("")
    .transform((v) => (v && datePattern.test(v) ? v : null)),
  notes: z.string().trim().max(2000).default(""),
});

export async function requestSubcontractorPaymentAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canRequestSubcontractorPayment(profile.role)) {
    subError("Your role cannot request subcontractor payments.");
  }
  const parsed = paymentSchema.safeParse({
    assignment_id: field(formData, "assignment_id"),
    payment_type: field(formData, "payment_type"),
    amount: field(formData, "amount"),
    retention_held: field(formData, "retention_held") || "0",
    reference: field(formData, "reference"),
    scheduled_for: field(formData, "scheduled_for"),
    notes: field(formData, "notes"),
  });
  if (!parsed.success) {
    subError(parsed.error.issues[0]?.message ?? "Check the payment details.");
  }
  const supabase = getOpsSupabaseServiceClient();
  const { data: assignment } = await supabase
    .from("subcontractor_assignments")
    .select("subcontractor_id")
    .eq("id", parsed.data.assignment_id)
    .maybeSingle<{ subcontractor_id: string }>();
  if (!assignment) subError("Assignment not found.");

  const { data, error } = await supabase
    .from("subcontractor_payments")
    .insert({ ...parsed.data, requested_by: profile.id, status: "pending" })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    logOpsServerError(error, {
      module: "subcontractor_payments",
      action: "requestSubcontractorPaymentAction",
    });
    subError(error?.message ?? "The payment could not be requested.");
  }
  await recordOpsAuditEvent({
    action: "subcontractor_payment.requested",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "subcontractor_payment",
    metadata: { amount: parsed.data.amount, type: parsed.data.payment_type },
    moduleKey: "subcontractors",
    sourceId: data.id,
    sourceTable: "subcontractor_payments",
    summary: `Requested ${parsed.data.payment_type} payment`,
  }).catch(() => null);
  revalidatePath(`${ROUTE}/${assignment.subcontractor_id}`);
  redirect(`${ROUTE}/${assignment.subcontractor_id}?updated=payment-requested`);
}

const paymentDecisionSchema = z.object({
  id: z.string().uuid("Pick a payment."),
  decision: z.enum(["approved", "paid", "rejected"]),
  notes: z.string().trim().max(2000).default(""),
});

export async function decideSubcontractorPaymentAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canApproveSubcontractorPayment(profile.role)) {
    subError("Only Finance can approve or mark subcontractor payments paid.");
  }
  const parsed = paymentDecisionSchema.safeParse({
    id: field(formData, "id"),
    decision: field(formData, "decision"),
    notes: field(formData, "notes"),
  });
  if (!parsed.success) {
    subError(parsed.error.issues[0]?.message ?? "Check the decision fields.");
  }
  const supabase = getOpsSupabaseServiceClient();
  const { data: payment } = await supabase
    .from("subcontractor_payments")
    .select("assignment_id")
    .eq("id", parsed.data.id)
    .maybeSingle<{ assignment_id: string }>();
  if (!payment) subError("Payment not found.");
  const { data: assignment } = await supabase
    .from("subcontractor_assignments")
    .select("subcontractor_id")
    .eq("id", payment.assignment_id)
    .maybeSingle<{ subcontractor_id: string }>();

  const patch: Record<string, unknown> = {
    status: parsed.data.decision,
    notes: parsed.data.notes || undefined,
    approved_by: profile.id,
  };
  if (parsed.data.decision === "paid") {
    patch.paid_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from("subcontractor_payments")
    .update(patch)
    .eq("id", parsed.data.id);
  if (error) subError(error.message);

  await recordOpsAuditEvent({
    action: `subcontractor_payment.${parsed.data.decision}`,
    actorUserId: profile.id,
    entityId: parsed.data.id,
    entityType: "subcontractor_payment",
    moduleKey: "subcontractors",
    sourceId: parsed.data.id,
    sourceTable: "subcontractor_payments",
    summary: `Marked payment ${parsed.data.decision}`,
  }).catch(() => null);

  if (assignment?.subcontractor_id) {
    revalidatePath(`${ROUTE}/${assignment.subcontractor_id}`);
    redirect(
      `${ROUTE}/${assignment.subcontractor_id}?updated=payment-${parsed.data.decision}`,
    );
  }
  redirect(ROUTE);
}
