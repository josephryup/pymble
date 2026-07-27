/**
 * Completion rules for site inspection checklists.
 *
 * Three gates, all decided with the checklist audit:
 *
 *  1. **Every item resolved.** `pending` means nobody looked. `not_applicable`
 *     is a real answer and is allowed — the paper form's YES/NO could not
 *     express it, so inapplicable items were left blank and read as unchecked.
 *     `observation` records a concern that is not an outright failure.
 *
 *  2. **A photo per failed item.** A failure is the finding worth evidencing,
 *     and photographs are what survive a dispute months later.
 *
 *  3. **Hold points must pass.** These guard work that gets covered up — a pour
 *     over reinforcement, plaster over services. Blocking is the point.
 *
 * On gate 3 being overridable: an absolute block would be routed around within
 * a week (the concrete truck is on site and the engineer needs the pour to
 * happen), and the workaround would be invisible. An override that demands a
 * written reason, records who gave it and shows on the inspection is both
 * honest about site reality and far more useful evidence than a block that was
 * quietly bypassed by not using the system at all.
 *
 * Pure module — no database, no auth. The action layer supplies the rows.
 */

/** Mirrors the ops_qa_inspection_item_result enum. */
export type QaItemResult =
  | "pending"
  | "pass"
  | "fail"
  | "observation"
  | "not_applicable";

export type QaChecklistEvaluationItem = {
  id: string;
  lineNumber: number;
  text: string;
  result: QaItemResult;
  isHoldPoint: boolean;
  /** Number of photos attached as evidence to this item. */
  photoCount: number;
};

export type QaChecklistBlocker = {
  code: "pending_items" | "missing_photos" | "hold_points";
  message: string;
  lineNumbers: number[];
};

export type QaChecklistEvaluation = {
  total: number;
  passed: number;
  failed: number;
  observations: number;
  notApplicable: number;
  pending: number;
  /** Percentage of applicable items that passed. 100 when none apply. */
  score: number;
  blockers: QaChecklistBlocker[];
  /** True when the inspection may be completed without an override. */
  canComplete: boolean;
  /** True when only hold points block it — i.e. an override would release it. */
  overridable: boolean;
};

function lineNumbers(items: QaChecklistEvaluationItem[]) {
  return items.map((item) => item.lineNumber).sort((a, b) => a - b);
}

function plural(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export function evaluateQaChecklist(
  items: QaChecklistEvaluationItem[],
): QaChecklistEvaluation {
  const passed = items.filter((item) => item.result === "pass");
  const failed = items.filter((item) => item.result === "fail");
  const observations = items.filter((item) => item.result === "observation");
  const notApplicable = items.filter((item) => item.result === "not_applicable");
  const pending = items.filter((item) => item.result === "pending");

  // Score over applicable items only — marking something N/A should neither
  // reward nor punish the score.
  const applicable = passed.length + failed.length;
  const score = applicable === 0 ? 100 : Math.round((passed.length / applicable) * 100);

  const missingPhotos = failed.filter((item) => item.photoCount < 1);
  // A hold point guards work about to be covered up, so nothing short of a
  // clean pass releases it — an observation or a skip is not evidence that the
  // work is sound.
  const unmetHoldPoints = items.filter(
    (item) => item.isHoldPoint && item.result !== "pass",
  );

  const blockers: QaChecklistBlocker[] = [];
  if (pending.length > 0) {
    blockers.push({
      code: "pending_items",
      message: `${plural(pending.length, "item")} still unanswered.`,
      lineNumbers: lineNumbers(pending),
    });
  }
  if (missingPhotos.length > 0) {
    blockers.push({
      code: "missing_photos",
      message: `${plural(missingPhotos.length, "failed item")} need a photo as evidence.`,
      lineNumbers: lineNumbers(missingPhotos),
    });
  }
  if (unmetHoldPoints.length > 0) {
    blockers.push({
      code: "hold_points",
      message: `${plural(unmetHoldPoints.length, "hold point")} not passed. This work must not be covered up until resolved, or an override is recorded.`,
      lineNumbers: lineNumbers(unmetHoldPoints),
    });
  }

  return {
    total: items.length,
    passed: passed.length,
    failed: failed.length,
    observations: observations.length,
    notApplicable: notApplicable.length,
    pending: pending.length,
    score,
    blockers,
    canComplete: blockers.length === 0,
    // Pending answers and missing photos are the engineer's own work to finish;
    // no override exists for those. Only hold points can be released.
    overridable:
      blockers.length > 0 && blockers.every((blocker) => blocker.code === "hold_points"),
  };
}

export type QaOverrideDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Whether a hold-point override may be recorded. Deliberately strict: the
 * override is only for hold points, needs a substantive written reason, and
 * cannot be self-granted by whoever ran the inspection.
 */
export function canRecordQaOverride(input: {
  evaluation: QaChecklistEvaluation;
  reason: string;
  isSeniorRole: boolean;
  actorId: string;
  inspectorId: string | null;
}): QaOverrideDecision {
  if (!input.evaluation.overridable) {
    return {
      allowed: false,
      reason:
        "An override only releases hold points. Answer every item and attach photos to the failures first.",
    };
  }
  if (!input.isSeniorRole) {
    return {
      allowed: false,
      reason:
        "Only a Projects Manager, Engineering Manager, Operations Manager or leadership can release a hold point.",
    };
  }
  if (input.inspectorId && input.actorId === input.inspectorId) {
    return {
      allowed: false,
      reason: "The inspector cannot release their own hold point. Ask a second person.",
    };
  }
  if (input.reason.trim().length < 15) {
    return {
      allowed: false,
      reason: "Give a written reason of at least 15 characters for releasing the hold point.",
    };
  }
  return { allowed: true };
}
