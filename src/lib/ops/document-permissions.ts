import { canViewSensitiveOpsFoundation } from "@/lib/ops/permissions";
import type { OpsUserRole } from "@/lib/ops/types";

export type OpsDocumentMutationTarget = {
  uploaded_by: string | null;
};

export function canMutateOpsDocument(
  actorId: string,
  actorRole: OpsUserRole,
  document: OpsDocumentMutationTarget,
) {
  return canViewSensitiveOpsFoundation(actorRole) || document.uploaded_by === actorId;
}
