"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  canCreateOpsEngineeringControl,
  canReleaseOpsQaHoldPoint,
} from "@/lib/ops/engineering-controls-permissions";
import { swallowOpsError } from "@/lib/ops/log";
import { qaField, startQaChecklistCore } from "@/lib/ops/qa-checklist-core";
import { canRecordQaOverride, evaluateQaChecklist } from "@/lib/ops/qa-checklist-rules";
import { fetchOpsQaChecklistRun } from "@/lib/ops/qa-checklists";
import { uploadSitePhotoCore } from "@/lib/ops/photo-core";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

const ROUTE = "/ops/site-checklists";

function checklistError(message: string): never {
  redirect(`${ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

const RESULTS = ["pending", "pass", "fail", "observation", "not_applicable"] as const;

export async function startQaChecklistAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const result = await startQaChecklistCore(formData, profile);

  if (!result.ok) {
    checklistError(result.message);
  }

  await recordOpsAuditEvent({
    action: "qa_checklist.started",
    actorUserId: profile.id,
    entityId: result.id,
    entityType: "qa_inspection",
    metadata: { template_key: qaField(formData, "template_key") },
    moduleKey: "engineering_controls",
    sourceId: result.id,
    sourceTable: "qa_inspections",
    summary: `${profile.full_name} started a site checklist`,
  }).catch(swallowOpsError({ module: "engineering_controls", action: "startQaChecklistAction" }));

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?created=checklist#run-${result.id}`);
}

/**
 * Record one item's verdicts. Both the contractor and the client column are
 * captured here — the client's is entered by the inspector on the client
 * representative's behalf, since the client has no account by design.
 */
export async function setQaChecklistItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsEngineeringControl(profile.role)) {
    checklistError("Your role cannot record checklist results.");
  }

  const parsed = z
    .object({
      run_id: z.string().uuid("Select a checklist."),
      item_id: z.string().uuid("Select an item."),
      result: z.enum(RESULTS),
      client_result: z.enum(RESULTS),
      notes: z.string().trim().max(500).default(""),
    })
    .safeParse({
      run_id: qaField(formData, "run_id"),
      item_id: qaField(formData, "item_id"),
      result: qaField(formData, "result") || "pending",
      client_result: qaField(formData, "client_result") || "pending",
      notes: qaField(formData, "notes"),
    });

  if (!parsed.success) {
    checklistError(parsed.error.issues[0]?.message ?? "Check the item details.");
  }

  const run = await fetchOpsQaChecklistRun(parsed.data.run_id);
  if (!run) {
    checklistError("Checklist was not found.");
  }
  if (run.status !== "planned") {
    checklistError("This checklist is already completed. Reopen it to change an answer.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("qa_inspection_items")
    .update({
      result: parsed.data.result,
      client_result: parsed.data.client_result,
      notes: parsed.data.notes,
      // A failure is what the action tracker should pick up.
      action_required: parsed.data.result === "fail",
    })
    .eq("id", parsed.data.item_id)
    .eq("inspection_id", run.id);

  if (error) {
    checklistError(error.message);
  }

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=item#run-${run.id}`);
}

/**
 * Complete a checklist. Enforces the three gates in qa-checklist-rules.ts:
 * every item answered, a photo on every failure, hold points passed.
 */
export async function completeQaChecklistAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsEngineeringControl(profile.role)) {
    checklistError("Your role cannot complete checklists.");
  }

  const runId = qaField(formData, "run_id");
  const run = await fetchOpsQaChecklistRun(runId);
  if (!run) {
    checklistError("Checklist was not found.");
  }
  if (run.status !== "planned") {
    checklistError("This checklist is already completed.");
  }

  // An override already recorded releases the hold-point gate only.
  const holdPointsReleased = Boolean(run.overrideAt);
  const blockers = run.evaluation.blockers.filter(
    (blocker) => !(holdPointsReleased && blocker.code === "hold_points"),
  );

  if (blockers.length > 0) {
    checklistError(blockers.map((blocker) => blocker.message).join(" "));
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("qa_inspections")
    .update({
      status: run.evaluation.failed > 0 ? "action_required" : "completed",
      score: run.evaluation.score,
      findings_count: run.evaluation.failed,
      action_count: run.evaluation.failed,
      completed_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("status", "planned");

  if (error) {
    checklistError(error.message);
  }

  await recordOpsAuditEvent({
    action: "qa_checklist.completed",
    actorUserId: profile.id,
    entityId: run.id,
    entityType: "qa_inspection",
    metadata: {
      score: run.evaluation.score,
      failed: run.evaluation.failed,
      hold_points_released: holdPointsReleased,
    },
    moduleKey: "engineering_controls",
    sourceId: run.id,
    sourceTable: "qa_inspections",
    summary: `${profile.full_name} completed ${run.inspectionNumber} (${run.evaluation.score}%)`,
  }).catch(
    swallowOpsError({ module: "engineering_controls", action: "completeQaChecklistAction" }),
  );

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=completed#run-${run.id}`);
}

/**
 * Release unmet hold points. Deliberately hard to do: senior role, written
 * reason, and never the inspector themselves — see qa-checklist-rules.ts for
 * why this exists at all rather than being an absolute block.
 */
export async function overrideQaHoldPointAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const runId = qaField(formData, "run_id");
  const reason = qaField(formData, "reason");

  const run = await fetchOpsQaChecklistRun(runId);
  if (!run) {
    checklistError("Checklist was not found.");
  }

  const decision = canRecordQaOverride({
    evaluation: run.evaluation,
    reason,
    isSeniorRole: canReleaseOpsQaHoldPoint(profile.role),
    actorId: profile.id,
    inspectorId: run.inspectorId,
  });

  if (!decision.allowed) {
    checklistError(decision.reason);
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("qa_inspections")
    .update({
      hold_point_override_reason: reason.trim(),
      hold_point_override_by: profile.id,
      hold_point_override_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  if (error) {
    checklistError(error.message);
  }

  await recordOpsAuditEvent({
    action: "qa_checklist.hold_point_released",
    actorUserId: profile.id,
    entityId: run.id,
    entityType: "qa_inspection",
    metadata: {
      reason: reason.trim(),
      hold_point_lines: run.evaluation.blockers.find((b) => b.code === "hold_points")?.lineNumbers,
    },
    moduleKey: "engineering_controls",
    sourceId: run.id,
    sourceTable: "qa_inspections",
    summary: `${profile.full_name} released a hold point on ${run.inspectionNumber}`,
  }).catch(
    swallowOpsError({ module: "engineering_controls", action: "overrideQaHoldPointAction" }),
  );

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=override#run-${run.id}`);
}

/**
 * Capture the external client representative's sign-off on the inspector's
 * device. No account, no invite, no login — the record states who signed, in
 * what capacity, when, and whose device witnessed it.
 */
export async function recordQaClientSignOffAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsEngineeringControl(profile.role)) {
    checklistError("Your role cannot record a client sign-off.");
  }

  const parsed = z
    .object({
      run_id: z.string().uuid("Select a checklist."),
      client_rep_name: z.string().trim().min(2, "Enter the client representative's name.").max(160),
      client_rep_role: z.string().trim().max(120).default(""),
      client_signature_name: z
        .string()
        .trim()
        .min(2, "The client must type their full name to sign.")
        .max(160),
      client_comment: z.string().trim().max(1000).default(""),
    })
    .safeParse({
      run_id: qaField(formData, "run_id"),
      client_rep_name: qaField(formData, "client_rep_name"),
      client_rep_role: qaField(formData, "client_rep_role"),
      client_signature_name: qaField(formData, "client_signature_name"),
      client_comment: qaField(formData, "client_comment"),
    });

  if (!parsed.success) {
    checklistError(parsed.error.issues[0]?.message ?? "Check the sign-off details.");
  }

  const run = await fetchOpsQaChecklistRun(parsed.data.run_id);
  if (!run) {
    checklistError("Checklist was not found.");
  }
  if (run.status === "planned") {
    checklistError("Complete the checklist before asking the client to sign it.");
  }
  if (run.clientSignedAt) {
    checklistError("This checklist has already been signed by the client.");
  }

  // The typed signature must match the named representative — a mismatch means
  // someone signed for somebody else, which is exactly what this record exists
  // to prevent.
  if (
    parsed.data.client_signature_name.trim().toLowerCase() !==
    parsed.data.client_rep_name.trim().toLowerCase()
  ) {
    checklistError("The typed signature must match the client representative's name.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("qa_inspections")
    .update({
      client_rep_name: parsed.data.client_rep_name,
      client_rep_role: parsed.data.client_rep_role,
      client_signature_name: parsed.data.client_signature_name,
      client_comment: parsed.data.client_comment,
      client_signed_at: new Date().toISOString(),
      client_witnessed_by: profile.id,
    })
    .eq("id", run.id)
    .is("client_signed_at", null);

  if (error) {
    checklistError(error.message);
  }

  await recordOpsAuditEvent({
    action: "qa_checklist.client_signed",
    actorUserId: profile.id,
    entityId: run.id,
    entityType: "qa_inspection",
    metadata: {
      client_rep_name: parsed.data.client_rep_name,
      client_rep_role: parsed.data.client_rep_role,
    },
    moduleKey: "engineering_controls",
    sourceId: run.id,
    sourceTable: "qa_inspections",
    summary: `${parsed.data.client_rep_name} signed ${run.inspectionNumber}, witnessed by ${profile.full_name}`,
  }).catch(
    swallowOpsError({ module: "engineering_controls", action: "recordQaClientSignOffAction" }),
  );

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=signed#run-${run.id}`);
}

/**
 * Attach photo evidence to a failed item.
 *
 * Wraps uploadSitePhotoCore rather than uploadSitePhotoAction so the redirect
 * lands back on the checklist instead of the photo gallery. The upload itself,
 * including R2 and the offline replay contract, is entirely the shared core's.
 */
export async function attachQaChecklistEvidenceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const runId = qaField(formData, "run_id");
  const result = await uploadSitePhotoCore(formData, profile);

  if (!result.ok) {
    checklistError(result.message);
  }

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=evidence#run-${runId}`);
}

/** Re-open a completed checklist so an answer can be corrected. */
export async function reopenQaChecklistAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canReleaseOpsQaHoldPoint(profile.role)) {
    checklistError("Only a Projects Manager, Operations Manager or leadership can reopen a checklist.");
  }

  const run = await fetchOpsQaChecklistRun(qaField(formData, "run_id"));
  if (!run) {
    checklistError("Checklist was not found.");
  }
  if (run.clientSignedAt) {
    checklistError("A checklist the client has signed cannot be reopened. Run a new inspection.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("qa_inspections")
    .update({ status: "planned", completed_at: null })
    .eq("id", run.id);

  if (error) {
    checklistError(error.message);
  }

  await recordOpsAuditEvent({
    action: "qa_checklist.reopened",
    actorUserId: profile.id,
    entityId: run.id,
    entityType: "qa_inspection",
    moduleKey: "engineering_controls",
    sourceId: run.id,
    sourceTable: "qa_inspections",
    summary: `${profile.full_name} reopened ${run.inspectionNumber}`,
  }).catch(swallowOpsError({ module: "engineering_controls", action: "reopenQaChecklistAction" }));

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=reopened#run-${run.id}`);
}

/** Re-evaluated on the server so the UI can never fake a completable state. */
export { evaluateQaChecklist };
