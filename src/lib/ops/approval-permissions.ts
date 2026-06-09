import { canOverrideApprovalDecision } from "@/lib/ops/permissions";
import { isManagingDirectorRole } from "@/lib/ops/roles";
import type { OpsUserRole } from "@/lib/ops/types";

export type OpsApprovalStepDecisionTarget = {
  approver_role: OpsUserRole | null;
  approver_user_id: string | null;
};

export function canDecideOpsApprovalStep(
  actorRole: OpsUserRole,
  actorId: string,
  step: OpsApprovalStepDecisionTarget,
) {
  if (canOverrideApprovalDecision(actorRole)) {
    return true;
  }

  if (step.approver_user_id === actorId) {
    return true;
  }

  if (!step.approver_role) {
    return false;
  }

  return (
    step.approver_role === actorRole ||
    (step.approver_role === "managing_director" && isManagingDirectorRole(actorRole))
  );
}
