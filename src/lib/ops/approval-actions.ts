"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { canDecideOpsApprovalStep } from "@/lib/ops/approval-permissions";
import {
  canOverrideApprovalDecision,
  canViewSensitiveOpsFoundation,
} from "@/lib/ops/permissions";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsApprovalStatus,
  OpsMaterialRequestStatus,
  OpsPurchaseOrderStatus,
  OpsUserRole,
} from "@/lib/ops/types";

const decisionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  approval_request_id: z.string().uuid("Select an approval request."),
  comment: z.string().trim().max(800).default(""),
});

const commentSchema = z.object({
  approval_request_id: z.string().uuid("Select an approval request."),
  body: z.string().trim().min(2, "Comment is required.").max(800),
});

type ApprovalRequestForDecision = {
  id: string;
  module_key: string;
  requested_by: string | null;
  source_id: string;
  source_table: string;
  status: OpsApprovalStatus;
  title: string;
};

type ApprovalStepForDecision = {
  approval_request_id: string;
  approver_role: OpsUserRole | null;
  approver_user_id: string | null;
  id: string;
  step_number: number;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function approvalError(approvalRequestId: string, message: string): never {
  redirect(`/ops/approvals/${approvalRequestId}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

async function fetchApprovalRequestForDecision(approvalRequestId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("approval_requests")
    .select("id, module_key, source_table, source_id, title, status, requested_by")
    .eq("id", approvalRequestId)
    .maybeSingle<ApprovalRequestForDecision>();

  if (error) {
    throw error;
  }

  return data;
}

async function canAccessApprovalRequest(
  request: ApprovalRequestForDecision,
  actorId: string,
  actorRole: OpsUserRole,
) {
  if (canViewSensitiveOpsFoundation(actorRole) || request.requested_by === actorId) {
    return true;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { count, error } = await supabase
    .from("approval_steps")
    .select("id", { count: "exact", head: true })
    .eq("approval_request_id", request.id)
    .or(`approver_user_id.eq.${actorId},approver_role.eq.${actorRole}`);

  if (error) {
    throw error;
  }

  return (count ?? 0) > 0;
}

async function syncMaterialRequestApprovalStatus(
  sourceTable: string,
  sourceId: string,
  status: OpsApprovalStatus,
  decidedAt: string,
) {
  if (sourceTable !== "material_requests") {
    return;
  }

  if (!["in_review", "approved", "rejected"].includes(status)) {
    return;
  }

  const update: {
    approved_at?: string | null;
    rejected_at?: string | null;
    status: OpsMaterialRequestStatus;
  } = {
    status: status as OpsMaterialRequestStatus,
  };

  if (status === "approved") {
    update.approved_at = decidedAt;
    update.rejected_at = null;
  }

  if (status === "rejected") {
    update.approved_at = null;
    update.rejected_at = decidedAt;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase.from("material_requests").update(update).eq("id", sourceId);

  if (error) {
    throw error;
  }
}

async function syncPurchaseOrderApprovalStatus(
  sourceTable: string,
  sourceId: string,
  status: OpsApprovalStatus,
  decidedAt: string,
  actorId: string,
) {
  if (sourceTable !== "purchase_orders") {
    return;
  }

  if (!["approved", "rejected"].includes(status)) {
    return;
  }

  const update: {
    approved_at?: string | null;
    approved_by?: string | null;
    status: OpsPurchaseOrderStatus;
  } =
    status === "approved"
      ? {
          approved_at: decidedAt,
          approved_by: actorId,
          status: "approved",
        }
      : {
          approved_at: null,
          approved_by: null,
          status: "rejected",
        };

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update(update)
    .eq("id", sourceId)
    .eq("status", "approval_pending");

  if (error) {
    throw error;
  }
}

export async function decideOpsApprovalAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = decisionSchema.safeParse({
    action: field(formData, "action"),
    approval_request_id: field(formData, "approval_request_id"),
    comment: field(formData, "comment"),
  });

  if (!parsed.success) {
    redirect(`/ops/approvals?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the approval decision.")}`);
  }

  if (parsed.data.action === "reject" && parsed.data.comment.length < 2) {
    approvalError(parsed.data.approval_request_id, "A rejection reason is required.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const request = await fetchApprovalRequestForDecision(parsed.data.approval_request_id);

  if (!request) {
    approvalError(parsed.data.approval_request_id, "Approval request was not found.");
  }

  if (!["submitted", "in_review"].includes(request.status)) {
    approvalError(request.id, "This approval request is no longer pending.");
  }

  const { data: step, error: stepError } = await supabase
    .from("approval_steps")
    .select("id, approval_request_id, step_number, approver_role, approver_user_id")
    .eq("approval_request_id", request.id)
    .eq("status", "pending")
    .order("step_number", { ascending: true })
    .order("approver_sequence", { ascending: true })
    .limit(1)
    .maybeSingle<ApprovalStepForDecision>();

  if (stepError || !step) {
    approvalError(request.id, stepError?.message ?? "No pending approval step was found.");
  }

  if (!canDecideOpsApprovalStep(profile.role, profile.id, step)) {
    approvalError(request.id, "Your role cannot decide this approval step.");
  }

  if (request.requested_by === profile.id && !canOverrideApprovalDecision(profile.role)) {
    approvalError(request.id, "You cannot approve or reject your own request.");
  }

  const now = new Date().toISOString();
  const nextStepStatus = parsed.data.action === "approve" ? "approved" : "rejected";
  const { error: updateStepError } = await supabase
    .from("approval_steps")
    .update({
      comments: parsed.data.comment,
      decision_at: now,
      decision_by: profile.id,
      status: nextStepStatus,
    })
    .eq("id", step.id)
    .eq("status", "pending");

  if (updateStepError) {
    approvalError(request.id, updateStepError.message);
  }

  if (parsed.data.comment) {
    await supabase.from("approval_comments").insert({
      approval_request_id: request.id,
      author_id: profile.id,
      body: parsed.data.comment,
    });
  }

  let nextRequestStatus: OpsApprovalStatus = "rejected";
  let nextCurrentStep = step.step_number;
  let resolvedAt: string | null = now;

  if (parsed.data.action === "approve") {
    const { data: nextPendingStep, error: nextStepError } = await supabase
      .from("approval_steps")
      .select("step_number")
      .eq("approval_request_id", request.id)
      .eq("status", "pending")
      .order("step_number", { ascending: true })
      .order("approver_sequence", { ascending: true })
      .limit(1)
      .maybeSingle<{ step_number: number }>();

    if (nextStepError) {
      approvalError(request.id, nextStepError.message);
    }

    if (nextPendingStep) {
      nextRequestStatus = "in_review";
      nextCurrentStep = nextPendingStep.step_number;
      resolvedAt = null;
    } else {
      nextRequestStatus = "approved";
    }
  }

  const { error: requestUpdateError } = await supabase
    .from("approval_requests")
    .update({
      current_step_number: nextCurrentStep,
      resolved_at: resolvedAt,
      status: nextRequestStatus,
    })
    .eq("id", request.id);

  if (requestUpdateError) {
    approvalError(request.id, requestUpdateError.message);
  }

  await syncMaterialRequestApprovalStatus(
    request.source_table,
    request.source_id,
    nextRequestStatus,
    now,
  ).catch(() => null);
  await syncPurchaseOrderApprovalStatus(
    request.source_table,
    request.source_id,
    nextRequestStatus,
    now,
    profile.id,
  ).catch(() => null);

  await recordOpsAuditEvent({
    action: `approval.${parsed.data.action === "approve" ? "approved" : "rejected"}`,
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "approval_request",
    metadata: {
      decision: parsed.data.action,
      source_id: request.source_id,
      source_table: request.source_table,
      step_id: step.id,
    },
    moduleKey: request.module_key,
    sourceId: request.source_id,
    sourceTable: request.source_table,
    summary: `${profile.full_name} ${parsed.data.action === "approve" ? "approved" : "rejected"} ${request.title}`,
  }).catch(() => null);

  if (request.requested_by && request.requested_by !== profile.id) {
    await queueOpsNotification({
      actionHref: `/ops/approvals/${request.id}`,
      body: `${profile.full_name} ${parsed.data.action === "approve" ? "approved" : "rejected"} ${request.title}.`,
      idempotencyKey: `approval-decision:${request.id}:${nextRequestStatus}:${request.requested_by}`,
      moduleKey: request.module_key,
      recipientId: request.requested_by,
      sourceId: request.id,
      sourceTable: "approval_requests",
      title: `Approval ${nextRequestStatus}`,
    }).catch(() => null);
  }

  revalidatePath("/ops/approvals");
  revalidatePath(`/ops/approvals/${request.id}`);
  revalidatePath("/ops/documents");
  revalidatePath("/ops/material-requests");
  revalidatePath("/ops/rfq-po");
  redirect(`/ops/approvals/${request.id}?updated=${nextRequestStatus}`);
}

export async function addOpsApprovalCommentAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = commentSchema.safeParse({
    approval_request_id: field(formData, "approval_request_id"),
    body: field(formData, "body"),
  });

  if (!parsed.success) {
    redirect(`/ops/approvals?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the approval comment.")}`);
  }

  const request = await fetchApprovalRequestForDecision(parsed.data.approval_request_id);

  if (!request) {
    approvalError(parsed.data.approval_request_id, "Approval request was not found.");
  }

  if (!(await canAccessApprovalRequest(request, profile.id, profile.role))) {
    approvalError(request.id, "You do not have access to this approval request.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase.from("approval_comments").insert({
    approval_request_id: request.id,
    author_id: profile.id,
    body: parsed.data.body,
  });

  if (error) {
    approvalError(request.id, error.message);
  }

  await recordOpsAuditEvent({
    action: "approval.comment_added",
    actorUserId: profile.id,
    entityId: request.id,
    entityType: "approval_request",
    moduleKey: request.module_key,
    sourceId: request.source_id,
    sourceTable: request.source_table,
    summary: `${profile.full_name} commented on ${request.title}`,
  }).catch(() => null);

  revalidatePath(`/ops/approvals/${request.id}`);
  redirect(`/ops/approvals/${request.id}?updated=comment`);
}
