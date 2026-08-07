import {
  isDeveloperRole,
  isGeneralManagerRole,
  isManagingDirectorRole,
  isOperationsManagerRole,
} from "@/lib/ops/roles";
import type { OpsDocumentVisibility, OpsUserRole } from "@/lib/ops/types";

export type OpsDocumentMutationTarget = {
  uploaded_by: string | null;
};

/**
 * Five-tier document visibility. Group visibility governs every attachment.
 *
 *  public         — any signed-in staff member
 *  management     — MD, GM, Operations Manager, Projects Manager
 *  finance        — MD + Finance Manager + Accountant
 *  md_restricted  — Managing Director only
 *  private        — the uploader only
 *
 * Owner + Developer are super-admins and see every tier (per the MD's
 * decision). The uploader can always see what they uploaded.
 */
export const OPS_DOCUMENT_VISIBILITY_ORDER: OpsDocumentVisibility[] = [
  "public",
  "management",
  "finance",
  "md_restricted",
  "private",
];

export const OPS_DOCUMENT_VISIBILITY_LABELS: Record<OpsDocumentVisibility, string> = {
  public: "Public — all staff",
  management: "Management — MD, GM, Ops & Projects Managers",
  finance: "Finance — MD & Finance team",
  md_restricted: "MD only",
  private: "Private — only me",
};

export const OPS_DOCUMENT_VISIBILITY_SHORT: Record<OpsDocumentVisibility, string> = {
  public: "Public",
  management: "Management",
  finance: "Finance",
  md_restricted: "MD only",
  private: "Private",
};

function isProjectsManagerRole(role: OpsUserRole) {
  return role === "projects_manager" || role === "engineering_manager";
}

function isFinanceRole(role: OpsUserRole) {
  return role === "finance_manager" || role === "accountant";
}

/** Owner + Developer bypass every tier (super-admin oversight/maintenance). */
export function isOpsDocumentSuperAdmin(role: OpsUserRole) {
  return isDeveloperRole(role) || role === "owner";
}

/** The management tier: MD, GM, Operations Manager, Projects Manager. */
function isManagementTier(role: OpsUserRole) {
  return (
    isManagingDirectorRole(role) ||
    isGeneralManagerRole(role) ||
    isOperationsManagerRole(role) ||
    isProjectsManagerRole(role)
  );
}

/**
 * Whether a viewer may see a document of the given visibility. `isUploader`
 * is the actor being the document's uploader — they always retain access to
 * their own upload.
 *
 * `isRecipient` is the actor having been named explicitly on the document (a
 * document_recipients row). A direct share overrides the tier entirely — that
 * is what "send this document to Mary" means. It is deliberately checked
 * BEFORE the visibility switch so it also opens `private` and `md_restricted`
 * documents to the people the uploader chose, and only to them.
 */
export function canViewOpsDocumentVisibility(
  role: OpsUserRole,
  visibility: OpsDocumentVisibility,
  isUploader: boolean,
  isRecipient = false,
) {
  if (isOpsDocumentSuperAdmin(role)) return true;
  if (isUploader) return true;
  if (isRecipient) return true;

  switch (visibility) {
    case "public":
      return true;
    case "management":
      return isManagementTier(role);
    case "finance":
      // isManagingDirectorRole already covers owner; MD sees finance docs.
      return isManagingDirectorRole(role) || isFinanceRole(role);
    case "md_restricted":
      return isManagingDirectorRole(role);
    case "private":
      return false; // only the uploader (handled above) or super-admins
    default:
      return false;
  }
}

/**
 * Visibility tiers a role is allowed to ASSIGN when uploading. Everyone can
 * post Public or Private; a user may also target any tier they can see
 * (so an Ops Manager can file a Management doc, Finance can file a Finance
 * doc). This never lets someone grant themselves more access than they have.
 */
export function assignableOpsDocumentVisibilities(
  role: OpsUserRole,
): OpsDocumentVisibility[] {
  return OPS_DOCUMENT_VISIBILITY_ORDER.filter(
    (visibility) =>
      visibility === "public" ||
      visibility === "private" ||
      canViewOpsDocumentVisibility(role, visibility, false),
  );
}

export function canMutateOpsDocument(
  actorId: string,
  actorRole: OpsUserRole,
  document: OpsDocumentMutationTarget,
) {
  return isOpsDocumentSuperAdmin(actorRole) || document.uploaded_by === actorId;
}
