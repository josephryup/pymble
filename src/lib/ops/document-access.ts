import { canViewOpsDocumentVisibility } from "@/lib/ops/document-permissions";
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
  /**
   * Whether the actor was named on the document (a document_recipients row).
   * A direct share carries download rights, not just visibility — otherwise
   * "sent to you" would show a file you cannot open.
   */
  isRecipient = false,
) {
  if (document.status === "archived") {
    return false;
  }

  return canViewOpsDocumentVisibility(
    actorRole,
    document.visibility,
    document.uploaded_by === actorId,
    isRecipient,
  );
}
