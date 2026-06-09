import { NextResponse, type NextRequest } from "next/server";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { getOptionalOpsUser } from "@/lib/ops/auth";
import { canDownloadOpsDocument } from "@/lib/ops/document-access";
import { canViewOpsEmployeeDocuments } from "@/lib/ops/hr-permissions";
import { createOpsR2ReadUrl } from "@/lib/ops/r2";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsDocumentVisibility } from "@/lib/ops/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DocumentVersionRecord = {
  document_id: string;
  r2_key: string;
};

type DocumentRecord = {
  id: string;
  status: string;
  uploaded_by: string | null;
  visibility: OpsDocumentVisibility;
};

type EmployeeDocumentAccessRecord = {
  employee: { user_id: string | null } | { user_id: string | null }[] | null;
};

function normalizeEmployeeRelation(
  employee: EmployeeDocumentAccessRecord["employee"],
) {
  return Array.isArray(employee) ? (employee[0] ?? null) : employee;
}

function isMissingEmployeeDocumentAccessTable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST200" ||
        error.code === "PGRST205" ||
        /employee_documents|schema cache/i.test(error.message ?? "")),
  );
}

async function canDownloadLinkedEmployeeDocument({
  actorId,
  actorRole,
  documentId,
  supabase,
  versionId,
}: {
  actorId: string;
  actorRole: Parameters<typeof canViewOpsEmployeeDocuments>[0];
  documentId: string;
  supabase: ReturnType<typeof getOpsSupabaseServiceClient>;
  versionId: string;
}) {
  const { data, error } = await supabase
    .from("employee_documents")
    .select("employee:employees!employee_documents_employee_id_fkey(user_id)")
    .eq("document_id", documentId)
    .or(`document_version_id.eq.${versionId},document_version_id.is.null`)
    .neq("status", "archived");

  if (isMissingEmployeeDocumentAccessTable(error)) {
    return false;
  }

  if (error) {
    console.error("[ops] employee document access lookup failed", error.message);
    return false;
  }

  return ((data ?? []) as unknown as EmployeeDocumentAccessRecord[]).some((record) => {
    const employee = normalizeEmployeeRelation(record.employee);
    return canViewOpsEmployeeDocuments(actorRole) || employee?.user_id === actorId;
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const user = await getOptionalOpsUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { versionId } = await params;
  const supabase = getOpsSupabaseServiceClient();

  const { data: version, error: versionError } = await supabase
    .from("document_versions")
    .select("document_id, r2_key")
    .eq("id", versionId)
    .maybeSingle<DocumentVersionRecord>();

  if (versionError) {
    console.error("[ops] document version lookup failed", versionError.message);
    return NextResponse.json({ error: "Could not load this document." }, { status: 500 });
  }

  if (!version) {
    return NextResponse.json({ error: "Document version was not found." }, { status: 404 });
  }

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id, visibility, status, uploaded_by")
    .eq("id", version.document_id)
    .maybeSingle<DocumentRecord>();

  if (documentError) {
    console.error("[ops] document lookup failed", documentError.message);
    return NextResponse.json({ error: "Could not load this document." }, { status: 500 });
  }

  if (!document || document.status === "archived") {
    return NextResponse.json({ error: "Document was not found." }, { status: 404 });
  }

  const canDownload =
    canDownloadOpsDocument(user.profile.role, user.profile.id, document) ||
    (await canDownloadLinkedEmployeeDocument({
      actorId: user.profile.id,
      actorRole: user.profile.role,
      documentId: document.id,
      supabase,
      versionId,
    }));

  if (!canDownload) {
    return NextResponse.json({ error: "You do not have access to this document." }, { status: 403 });
  }

  await recordOpsAuditEvent({
    action: "document.downloaded",
    actorUserId: user.profile.id,
    entityId: document.id,
    entityType: "document",
    metadata: {
      document_id: document.id,
      document_version_id: versionId,
      visibility: document.visibility,
    },
    moduleKey: "documents",
    sourceId: document.id,
    sourceTable: "documents",
    summary: "Document version downloaded.",
  }).catch((error: unknown) => {
    console.warn(
      "[ops] document download audit failed",
      error instanceof Error ? error.message : "Unknown audit error",
    );
  });

  const downloadUrl = await createOpsR2ReadUrl(version.r2_key);
  return NextResponse.redirect(downloadUrl);
}
