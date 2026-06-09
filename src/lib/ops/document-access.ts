import { canViewSensitiveOpsFoundation } from "@/lib/ops/permissions";
import type { OpsDocumentStatus, OpsDocumentVisibility, OpsUserRole } from "@/lib/ops/types";

export type OpsDocumentDownloadTarget = {
  status: OpsDocumentStatus | string;
  uploaded_by: string | null;
  visibility: OpsDocumentVisibility;
};

export function canDownloadOpsDocument(
  actorRole: OpsUserRole,
  actorId: string,
  document: OpsDocumentDownloadTarget,
) {
  if (document.status === "archived") {
    return false;
  }

  return (
    canViewSensitiveOpsFoundation(actorRole) ||
    document.visibility === "company" ||
    document.uploaded_by === actorId
  );
}
