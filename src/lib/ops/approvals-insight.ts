import { canDecideOpsApprovalStep } from "@/lib/ops/approval-permissions";
import {
  fetchOpsApprovalRequests,
  type OpsApprovalRequestSummary,
} from "@/lib/ops/approvals";
import { OPS_ESCALATION_SLA_DAYS } from "@/lib/ops/escalations";
import { formatOpsRole } from "@/lib/ops/roles";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsUserRole } from "@/lib/ops/types";

/**
 * Per-viewer intelligence for the approvals dashboard. The register used to
 * show status chips and nothing else; this layer answers the questions an
 * approver actually has: is this MY turn, who is it waiting on if not, how
 * far along the chain is it, and how long has it been stuck.
 */

export type OpsApprovalInsightStep = {
  approval_request_id: string;
  approver_role: OpsUserRole | null;
  approver_user_id: string | null;
  status: string;
  step_label: string;
  step_number: number;
  approver_sequence: number;
};

export type OpsApprovalViewerInsight = {
  /** Days since submission (calendar days, floored). */
  ageDays: number;
  /** Past the escalation SLA for approvals. */
  isOverdue: boolean;
  /** The chain has reached a step this viewer can decide. */
  isMyTurn: boolean;
  /** The viewer raised this request. */
  isMine: boolean;
  /** "Finance Manager" / a person's role label — who the chain waits on now. */
  waitingOn: string | null;
  decidedSteps: number;
  totalSteps: number;
};

export type OpsApprovalInsightViewer = {
  id: string;
  role: OpsUserRole;
};

const OPEN_STATUSES = ["submitted", "in_review"] as const;

function isOpen(status: string) {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

export function approvalAgeDays(submittedAt: string | null, now = new Date()) {
  if (!submittedAt) return 0;
  const elapsed = now.getTime() - new Date(submittedAt).getTime();
  return Math.max(0, Math.floor(elapsed / (24 * 60 * 60 * 1000)));
}

/**
 * Classifies one request for one viewer from its full step list. Pure so the
 * turn/progress rules are testable: the current step is the first pending
 * one in chain order, "my turn" requires the request to still be open and
 * self-approval is never someone's turn.
 */
export function classifyApprovalForViewer(
  request: Pick<
    OpsApprovalRequestSummary,
    "id" | "requested_by" | "status" | "submitted_at"
  >,
  steps: OpsApprovalInsightStep[],
  viewer: OpsApprovalInsightViewer,
  now = new Date(),
): OpsApprovalViewerInsight {
  const chain = [...steps].sort(
    (a, b) => a.step_number - b.step_number || a.approver_sequence - b.approver_sequence,
  );
  const decidedSteps = chain.filter((step) => step.status !== "pending").length;
  const currentStep = chain.find((step) => step.status === "pending") ?? null;

  const waitingOn = !isOpen(request.status)
    ? null
    : currentStep
      ? currentStep.approver_role
        ? formatOpsRole(currentStep.approver_role)
        : currentStep.step_label || "Assigned approver"
      : null;

  const isMine = request.requested_by === viewer.id;
  const isMyTurn =
    isOpen(request.status) &&
    currentStep !== null &&
    !isMine &&
    canDecideOpsApprovalStep(viewer.role, viewer.id, currentStep);

  const ageDays = approvalAgeDays(request.submitted_at, now);

  return {
    ageDays,
    decidedSteps,
    isMine,
    isMyTurn,
    isOverdue: isOpen(request.status) && ageDays >= OPS_ESCALATION_SLA_DAYS.approvals,
    totalSteps: chain.length,
    waitingOn,
  };
}

/** Batch-fetch every step for the given requests, grouped by request id. */
export async function fetchApprovalStepsForRequests(
  requestIds: string[],
): Promise<Map<string, OpsApprovalInsightStep[]>> {
  if (requestIds.length === 0) return new Map();

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("approval_steps")
    .select(
      "approval_request_id, step_number, approver_sequence, step_label, approver_role, approver_user_id, status",
    )
    .in("approval_request_id", requestIds);

  if (error) {
    throw error;
  }

  const grouped = new Map<string, OpsApprovalInsightStep[]>();
  for (const step of (data ?? []) as OpsApprovalInsightStep[]) {
    grouped.set(step.approval_request_id, [
      ...(grouped.get(step.approval_request_id) ?? []),
      step,
    ]);
  }
  return grouped;
}

export type OpsApprovalsPersonalSummary = {
  /** Requests whose current step this viewer can decide right now. */
  myTurn: Array<{ insight: OpsApprovalViewerInsight; request: OpsApprovalRequestSummary }>;
  /** Open requests this viewer raised. */
  myOpenRequests: Array<{ insight: OpsApprovalViewerInsight; request: OpsApprovalRequestSummary }>;
  /** Days the oldest my-turn item has been waiting. */
  oldestWaitingDays: number;
  overdueMyTurn: number;
};

/**
 * The viewer's real queue, independent of the register's pagination/filters —
 * scans the open requests the viewer can see (visibility is enforced inside
 * fetchOpsApprovalRequests) and classifies each.
 */
export async function fetchOpsApprovalsPersonalSummary(
  viewer: OpsApprovalInsightViewer,
  now = new Date(),
): Promise<OpsApprovalsPersonalSummary> {
  const openRequests = await fetchOpsApprovalRequests({
    limit: 100,
    status: ["submitted", "in_review"],
  });
  const steps = await fetchApprovalStepsForRequests(openRequests.map((request) => request.id));

  const classified = openRequests.map((request) => ({
    insight: classifyApprovalForViewer(request, steps.get(request.id) ?? [], viewer, now),
    request,
  }));

  const myTurn = classified
    .filter((entry) => entry.insight.isMyTurn)
    .sort((a, b) => b.insight.ageDays - a.insight.ageDays);

  return {
    myTurn,
    myOpenRequests: classified.filter((entry) => entry.insight.isMine),
    oldestWaitingDays: myTurn[0]?.insight.ageDays ?? 0,
    overdueMyTurn: myTurn.filter((entry) => entry.insight.isOverdue).length,
  };
}
