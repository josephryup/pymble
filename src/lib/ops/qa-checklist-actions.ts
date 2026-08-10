"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  canArchiveOpsQaChecklist,
  canCreateOpsEngineeringControl,
  canReleaseOpsQaHoldPoint,
  canSignOffOpsQaChecklist,
} from "@/lib/ops/engineering-controls-permissions";
import { swallowOpsError } from "@/lib/ops/log";
import { qaField, startQaChecklistCore } from "@/lib/ops/qa-checklist-core";
import {
  canCompleteQaChecklist,
  canRecordQaOverride,
  evaluateQaChecklist,
} from "@/lib/ops/qa-checklist-rules";
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
  redirect(`${ROUTE}?created=checklist&open=${result.id}#run-${result.id}`);
}

/**
 * Record one item's verdict. Single column: the checklist is an internal
 * accountability record, so there is one answer per check and one person
 * answerable for it.
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
      notes: z.string().trim().max(500).default(""),
    })
    .safeParse({
      run_id: qaField(formData, "run_id"),
      item_id: qaField(formData, "item_id"),
      result: qaField(formData, "result") || "pending",
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
  redirect(`${ROUTE}?updated=item&open=${run.id}#run-${run.id}`);
}

/** The patch that closes a run, shared by completion and PM sign-off. */
function completionPatch(run: { evaluation: { failed: number; score: number } }) {
  return {
    status: run.evaluation.failed > 0 ? ("action_required" as const) : ("completed" as const),
    score: run.evaluation.score,
    findings_count: run.evaluation.failed,
    action_count: run.evaluation.failed,
    completed_at: new Date().toISOString(),
  };
}

/**
 * Acknowledge a checklist as the Projects Manager — the signature that closes
 * it. The engineer finishes the fieldwork; the PM accepts it and the run is
 * completed in the same step, so there is no limbo state where the checklist is
 * signed but still open.
 */
export async function acknowledgeQaChecklistAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canSignOffOpsQaChecklist(profile.role)) {
    checklistError(
      "Only the Projects Manager or leadership can acknowledge a site checklist.",
    );
  }

  const parsed = z
    .object({
      run_id: z.string().uuid("Select a checklist."),
      note: z.string().trim().max(1000).default(""),
    })
    .safeParse({
      run_id: qaField(formData, "run_id"),
      note: qaField(formData, "note"),
    });

  if (!parsed.success) {
    checklistError(parsed.error.issues[0]?.message ?? "Check the sign-off details.");
  }

  const run = await fetchOpsQaChecklistRun(parsed.data.run_id);
  if (!run) {
    checklistError("Checklist was not found.");
  }
  if (run.status !== "planned") {
    checklistError("This checklist is already closed.");
  }
  if (run.pmSignedAt) {
    checklistError("This checklist has already been acknowledged.");
  }
  // Same principle as the hold-point override: the person who ran the checks is
  // not the person who accepts them.
  if (run.inspectorId && run.inspectorId === profile.id) {
    checklistError(
      "You started this checklist, so you cannot acknowledge it. Ask the Projects Manager or leadership.",
    );
  }

  // The fieldwork must be finished before it can be signed for — the signature
  // means "I accept these answers", not "I will accept whatever is filled in
  // later".
  const holdPointsReleased = Boolean(run.overrideAt);
  const outstanding = run.evaluation.blockers.filter(
    (blocker) => !(holdPointsReleased && blocker.code === "hold_points"),
  );
  if (outstanding.length > 0) {
    checklistError(outstanding.map((blocker) => blocker.message).join(" "));
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("qa_inspections")
    .update({
      pm_signed_at: now,
      pm_signed_by: profile.id,
      pm_sign_off_note: parsed.data.note,
      ...completionPatch(run),
    })
    .eq("id", run.id)
    .eq("status", "planned")
    .is("pm_signed_at", null);

  if (error) {
    checklistError(error.message);
  }

  await recordOpsAuditEvent({
    action: "qa_checklist.acknowledged",
    actorUserId: profile.id,
    entityId: run.id,
    entityType: "qa_inspection",
    metadata: {
      score: run.evaluation.score,
      failed: run.evaluation.failed,
      hold_points_released: holdPointsReleased,
      initiator: run.initiatorName,
      note: parsed.data.note,
    },
    moduleKey: "engineering_controls",
    sourceId: run.id,
    sourceTable: "qa_inspections",
    summary: `${profile.full_name} acknowledged ${run.inspectionNumber} run by ${run.initiatorName} (${run.evaluation.score}%)`,
  }).catch(
    swallowOpsError({ module: "engineering_controls", action: "acknowledgeQaChecklistAction" }),
  );

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=acknowledged&open=${run.id}#run-${run.id}`);
}

/**
 * Complete a checklist. Enforces the four gates in qa-checklist-rules.ts: every
 * item answered, a photo on every failure, hold points passed, and the Projects
 * Manager's acknowledgement. In practice the PM's sign-off already completes
 * the run — this path exists for a run that was signed and then reopened.
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

  // An override already recorded releases the hold-point gate only — never the
  // sign-off gate.
  const holdPointsReleased = Boolean(run.overrideAt);
  const decision = canCompleteQaChecklist({
    evaluation: run.evaluation,
    holdPointsReleased,
    pmSignedAt: run.pmSignedAt,
  });
  if (!decision.allowed) {
    checklistError(decision.reason);
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("qa_inspections")
    .update(completionPatch(run))
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
  redirect(`${ROUTE}?updated=completed&open=${run.id}#run-${run.id}`);
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
  redirect(`${ROUTE}?updated=override&open=${run.id}#run-${run.id}`);
}

/**
 * Take a checklist out of circulation. Developer and Managing Director only —
 * see canArchiveOpsQaChecklist. The row is kept and stays readable in
 * /ops/archive, from where it can be restored.
 */
export async function archiveQaChecklistAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canArchiveOpsQaChecklist(profile.role)) {
    checklistError("Only the Developer and the Managing Director can archive a site checklist.");
  }

  const run = await fetchOpsQaChecklistRun(qaField(formData, "run_id"));
  if (!run) {
    checklistError("Checklist was not found.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("qa_inspections")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", run.id)
    .is("archived_at", null);

  if (error) {
    checklistError(error.message);
  }

  await recordOpsAuditEvent({
    action: "qa_checklist.archived",
    actorUserId: profile.id,
    entityId: run.id,
    entityType: "qa_inspection",
    metadata: { status: run.status, initiator: run.initiatorName },
    moduleKey: "engineering_controls",
    sourceId: run.id,
    sourceTable: "qa_inspections",
    summary: `${profile.full_name} archived ${run.inspectionNumber}`,
  }).catch(
    swallowOpsError({ module: "engineering_controls", action: "archiveQaChecklistAction" }),
  );

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=archived`);
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
  redirect(`${ROUTE}?updated=evidence&open=${runId}#run-${runId}`);
}

/**
 * Re-open a completed checklist so an answer can be corrected. The Projects
 * Manager's acknowledgement is cleared with it: it was a signature on a
 * specific set of answers, so it cannot survive those answers changing.
 */
export async function reopenQaChecklistAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canReleaseOpsQaHoldPoint(profile.role)) {
    checklistError("Only a Projects Manager, Operations Manager or leadership can reopen a checklist.");
  }

  const run = await fetchOpsQaChecklistRun(qaField(formData, "run_id"));
  if (!run) {
    checklistError("Checklist was not found.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("qa_inspections")
    .update({
      status: "planned",
      completed_at: null,
      pm_signed_at: null,
      pm_signed_by: null,
      pm_sign_off_note: "",
    })
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
  redirect(`${ROUTE}?updated=reopened&open=${run.id}#run-${run.id}`);
}

/** Re-evaluated on the server so the UI can never fake a completable state. */
export { evaluateQaChecklist };
