import { requireOpsUser } from "@/lib/ops/auth";
import {
  opsIlikePattern,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { canViewSensitiveOpsFoundation } from "@/lib/ops/permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsApprovalStatus, OpsDocumentStatus, OpsDocumentVisibility } from "@/lib/ops/types";

export type OpsDocumentVersionSummary = {
  checksum_sha256: string | null;
  content_type: string;
  created_at: string;
  file_name: string;
  file_size_bytes: number;
  id: string;
  uploaded_by: string | null;
  version_number: number;
};

export type OpsLinkedDocument = {
  category: string;
  created_at: string;
  current_version_number: number;
  description: string;
  document_id: string;
  link_id: string;
  status: OpsDocumentStatus;
  title: string;
  uploaded_by: string | null;
  versions: OpsDocumentVersionSummary[];
  visibility: OpsDocumentVisibility;
};

export type OpsDocumentLibraryItem = {
  approval_requested_at: string | null;
  approval_request_id: string | null;
  approval_status: OpsApprovalStatus | null;
  category: string;
  created_at: string;
  current_version_number: number;
  description: string;
  document_id: string;
  status: OpsDocumentStatus;
  title: string;
  uploaded_by: string | null;
  uploader: {
    full_name: string;
    id: string;
  } | null;
  versions: OpsDocumentVersionSummary[];
  visibility: OpsDocumentVisibility;
};

export type FetchOpsDocumentsForRecordInput = {
  moduleKey?: string;
  sourceId: string;
  sourceTable: string;
};

export type FetchOpsDocumentsForRecordsInput = {
  moduleKey?: string;
  sourceIds: string[];
  sourceTable: string;
};

export type FetchOpsDocumentLibraryOptions = {
  category?: string;
  limit?: number;
  query?: string;
  status?: OpsDocumentStatus;
  visibility?: OpsDocumentVisibility;
};

export type FetchPaginatedOpsDocumentLibraryOptions = FetchOpsDocumentLibraryOptions & {
  listState: OpsListState;
};

type RawDocument = {
  category: string;
  created_at: string;
  current_version_number: number;
  description: string;
  id: string;
  status: OpsDocumentStatus;
  title: string;
  uploaded_by: string | null;
  visibility: OpsDocumentVisibility;
};

type RawDocumentWithUploader = RawDocument & {
  uploader: OpsDocumentLibraryItem["uploader"] | OpsDocumentLibraryItem["uploader"][];
};

type RawDocumentLink = {
  document_id: string;
  id: string;
  source_id?: string;
};

type RawDocumentVersion = Omit<OpsDocumentVersionSummary, "file_size_bytes"> & {
  document_id: string;
  file_size_bytes: number | string;
};

type RawDocumentApproval = {
  created_at: string;
  id: string;
  source_id: string;
  status: OpsApprovalStatus;
};

function normalizeFileSize(value: number | string) {
  return Number(value);
}

function normalizeLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? 40, 1), 80);
}

function normalizeUploader(uploader: RawDocumentWithUploader["uploader"]) {
  return Array.isArray(uploader) ? (uploader[0] ?? null) : uploader;
}

function versionsByDocumentId(versions: RawDocumentVersion[]) {
  const grouped = new Map<string, OpsDocumentVersionSummary[]>();

  versions.forEach((version) => {
    const summary: OpsDocumentVersionSummary = {
      checksum_sha256: version.checksum_sha256,
      content_type: version.content_type,
      created_at: version.created_at,
      file_name: version.file_name,
      file_size_bytes: normalizeFileSize(version.file_size_bytes),
      id: version.id,
      uploaded_by: version.uploaded_by,
      version_number: version.version_number,
    };
    grouped.set(version.document_id, [...(grouped.get(version.document_id) ?? []), summary]);
  });

  return grouped;
}

function approvalsByDocumentId(approvals: RawDocumentApproval[]) {
  const grouped = new Map<string, RawDocumentApproval>();

  approvals.forEach((approval) => {
    if (!grouped.has(approval.source_id)) {
      grouped.set(approval.source_id, approval);
    }
  });

  return grouped;
}

function currentVersionFilter(documents: Array<Pick<RawDocument, "current_version_number" | "id">>) {
  return documents
    .map(
      (document) =>
        `and(document_id.eq.${document.id},version_number.eq.${document.current_version_number})`,
    )
    .join(",");
}

function currentVersionByDocumentId(versions: RawDocumentVersion[]) {
  const grouped = new Map<string, RawDocumentVersion>();

  versions.forEach((version) => {
    if (!grouped.has(version.document_id)) {
      grouped.set(version.document_id, version);
    }
  });

  return grouped;
}

function approvalsForCurrentVersions(
  approvals: RawDocumentApproval[],
  currentVersions: Map<string, RawDocumentVersion>,
) {
  const currentApprovals = approvals.filter((approval) => {
    const currentVersion = currentVersions.get(approval.source_id);
    return currentVersion ? approval.created_at >= currentVersion.created_at : false;
  });

  return approvalsByDocumentId(currentApprovals);
}

async function fetchOpsDocumentLibraryItems(
  options: FetchOpsDocumentLibraryOptions = {},
  listState?: OpsListState,
) {
  const { profile } = await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const canViewAll = canViewSensitiveOpsFoundation(profile.role);

  let documentQuery = supabase
    .from("documents")
    .select(
      "id, title, description, category, visibility, status, current_version_number, uploaded_by, created_at, uploader:users!documents_uploaded_by_fkey(id, full_name)",
      listState ? { count: "exact" } : undefined,
    )
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  if (options.category) {
    documentQuery = documentQuery.eq("category", options.category);
  }

  if (options.status) {
    documentQuery = documentQuery.eq("status", options.status);
  }

  if (options.visibility) {
    documentQuery = documentQuery.eq("visibility", options.visibility);
  }

  const searchPattern = opsIlikePattern(options.query ?? "");

  if (searchPattern) {
    documentQuery = documentQuery.ilike("title", searchPattern);
  }

  if (!canViewAll) {
    documentQuery = documentQuery.or(`visibility.eq.company,uploaded_by.eq.${profile.id}`);
  }

  const { data: documents, error: documentError, count } = await (listState
    ? documentQuery.range(listState.from, listState.to)
    : documentQuery.limit(normalizeLimit(options.limit)));

  if (documentError) {
    throw documentError;
  }

  const visibleDocuments = (documents ?? []) as unknown as RawDocumentWithUploader[];
  const documentIds = visibleDocuments.map((document) => document.id);

  if (documentIds.length === 0) {
    return {
      count,
      items: [],
    };
  }

  const versionQuery = supabase
    .from("document_versions")
    .select(
      "id, document_id, version_number, file_name, content_type, file_size_bytes, checksum_sha256, uploaded_by, created_at",
    )
    .or(currentVersionFilter(visibleDocuments))
    .order("version_number", { ascending: false });

  const approvalQuery = supabase
    .from("approval_requests")
    .select("id, source_id, status, created_at")
    .eq("module_key", "documents")
    .eq("source_table", "documents")
    .in("source_id", documentIds)
    .order("created_at", { ascending: false });

  const [
    { data: versions, error: versionError },
    { data: approvalData, error: approvalError },
  ] = await Promise.all([versionQuery, approvalQuery]);

  if (versionError) {
    throw versionError;
  }

  if (approvalError) {
    throw approvalError;
  }

  const currentVersions = (versions ?? []) as unknown as RawDocumentVersion[];
  const groupedVersions = versionsByDocumentId(currentVersions);
  const currentVersionLookup = currentVersionByDocumentId(currentVersions);
  const groupedApprovals = approvalsForCurrentVersions(
    (approvalData ?? []) as unknown as RawDocumentApproval[],
    currentVersionLookup,
  );

  return {
    count,
    items: visibleDocuments.map((document) => ({
      approval_requested_at: groupedApprovals.get(document.id)?.created_at ?? null,
      approval_request_id: groupedApprovals.get(document.id)?.id ?? null,
      approval_status: groupedApprovals.get(document.id)?.status ?? null,
      category: document.category,
      created_at: document.created_at,
      current_version_number: document.current_version_number,
      description: document.description,
      document_id: document.id,
      status: document.status,
      title: document.title,
      uploaded_by: document.uploaded_by,
      uploader: normalizeUploader(document.uploader),
      versions: groupedVersions.get(document.id) ?? [],
      visibility: document.visibility,
    })),
  };
}

export async function fetchOpsDocumentLibrary(options: FetchOpsDocumentLibraryOptions = {}) {
  const result = await fetchOpsDocumentLibraryItems(options);
  return result.items;
}

export async function fetchPaginatedOpsDocumentLibrary(
  options: FetchPaginatedOpsDocumentLibraryOptions,
): Promise<OpsPaginatedResult<OpsDocumentLibraryItem>> {
  const result = await fetchOpsDocumentLibraryItems(options, options.listState);
  return toOpsPaginatedResult(result.items, result.count, options.listState);
}

export async function fetchOpsDocumentById(documentId: string) {
  const { profile } = await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select(
      "id, title, description, category, visibility, status, current_version_number, uploaded_by, created_at, uploader:users!documents_uploaded_by_fkey(id, full_name)",
    )
    .eq("id", documentId)
    .neq("status", "archived")
    .maybeSingle();

  if (documentError) {
    throw documentError;
  }

  if (!document) {
    return null;
  }

  const rawDocument = document as unknown as RawDocumentWithUploader;
  const canViewAll = canViewSensitiveOpsFoundation(profile.role);

  if (
    !canViewAll &&
    rawDocument.visibility !== "company" &&
    rawDocument.uploaded_by !== profile.id
  ) {
    return null;
  }

  const versionQuery = supabase
    .from("document_versions")
    .select(
      "id, document_id, version_number, file_name, content_type, file_size_bytes, checksum_sha256, uploaded_by, created_at",
    )
    .eq("document_id", documentId)
    .order("version_number", { ascending: false });

  const approvalQuery = supabase
    .from("approval_requests")
    .select("id, source_id, status, created_at")
    .eq("module_key", "documents")
    .eq("source_table", "documents")
    .eq("source_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1);

  const [
    { data: versions, error: versionError },
    { data: approvalData, error: approvalError },
  ] = await Promise.all([versionQuery, approvalQuery]);

  if (versionError) {
    throw versionError;
  }

  if (approvalError) {
    throw approvalError;
  }

  const versionItems = (versions ?? []) as unknown as RawDocumentVersion[];
  const groupedVersions = versionsByDocumentId(versionItems);
  const currentVersionItem =
    versionItems.find((version) => version.version_number === rawDocument.current_version_number) ??
    versionItems[0];
  const latestApproval =
    ((approvalData ?? []) as unknown as RawDocumentApproval[]).find(
      (approval) => currentVersionItem && approval.created_at >= currentVersionItem.created_at,
    ) ?? null;

  return {
    approval_requested_at: latestApproval?.created_at ?? null,
    approval_request_id: latestApproval?.id ?? null,
    approval_status: latestApproval?.status ?? null,
    category: rawDocument.category,
    created_at: rawDocument.created_at,
    current_version_number: rawDocument.current_version_number,
    description: rawDocument.description,
    document_id: rawDocument.id,
    status: rawDocument.status,
    title: rawDocument.title,
    uploaded_by: rawDocument.uploaded_by,
    uploader: normalizeUploader(rawDocument.uploader),
    versions: groupedVersions.get(rawDocument.id) ?? [],
    visibility: rawDocument.visibility,
  } satisfies OpsDocumentLibraryItem;
}

export async function fetchOpsDocumentsForRecord(input: FetchOpsDocumentsForRecordInput) {
  const { profile } = await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();

  let linkQuery = supabase
    .from("document_links")
    .select("id, document_id")
    .eq("source_table", input.sourceTable)
    .eq("source_id", input.sourceId)
    .order("created_at", { ascending: false });

  if (input.moduleKey) {
    linkQuery = linkQuery.eq("module_key", input.moduleKey);
  }

  const { data: links, error: linkError } = await linkQuery;

  if (linkError) {
    throw linkError;
  }

  const rawLinks = (links ?? []) as RawDocumentLink[];
  const documentIds = rawLinks.map((link) => link.document_id);

  if (documentIds.length === 0) {
    return [];
  }

  const { data: documents, error: documentError } = await supabase
    .from("documents")
    .select("id, title, description, category, visibility, status, current_version_number, uploaded_by, created_at")
    .in("id", documentIds)
    .neq("status", "archived");

  if (documentError) {
    throw documentError;
  }

  const canViewAll = canViewSensitiveOpsFoundation(profile.role);
  const visibleDocuments = ((documents ?? []) as RawDocument[]).filter(
    (document) =>
      canViewAll || document.visibility === "company" || document.uploaded_by === profile.id,
  );
  const visibleDocumentIds = visibleDocuments.map((document) => document.id);

  if (visibleDocumentIds.length === 0) {
    return [];
  }

  const { data: versions, error: versionError } = await supabase
    .from("document_versions")
    .select(
      "id, document_id, version_number, file_name, content_type, file_size_bytes, checksum_sha256, uploaded_by, created_at",
    )
    .or(currentVersionFilter(visibleDocuments))
    .order("version_number", { ascending: false });

  if (versionError) {
    throw versionError;
  }

  const groupedVersions = versionsByDocumentId((versions ?? []) as unknown as RawDocumentVersion[]);

  const linkByDocument = new Map(rawLinks.map((link) => [link.document_id, link.id]));

  return visibleDocuments.map((document) => ({
    category: document.category,
    created_at: document.created_at,
    current_version_number: document.current_version_number,
    description: document.description,
    document_id: document.id,
    link_id: linkByDocument.get(document.id) ?? "",
    status: document.status,
    title: document.title,
    uploaded_by: document.uploaded_by,
    versions: groupedVersions.get(document.id) ?? [],
    visibility: document.visibility,
  }));
}

export async function fetchOpsDocumentsForRecords(input: FetchOpsDocumentsForRecordsInput) {
  const { profile } = await requireOpsUser();

  if (input.sourceIds.length === 0) {
    return new Map<string, OpsLinkedDocument[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  let linkQuery = supabase
    .from("document_links")
    .select("id, document_id, source_id")
    .eq("source_table", input.sourceTable)
    .in("source_id", input.sourceIds)
    .order("created_at", { ascending: false });

  if (input.moduleKey) {
    linkQuery = linkQuery.eq("module_key", input.moduleKey);
  }

  const { data: links, error: linkError } = await linkQuery;

  if (linkError) {
    throw linkError;
  }

  const rawLinks = (links ?? []) as RawDocumentLink[];
  const documentIds = Array.from(new Set(rawLinks.map((link) => link.document_id)));

  if (documentIds.length === 0) {
    return new Map<string, OpsLinkedDocument[]>();
  }

  const { data: documents, error: documentError } = await supabase
    .from("documents")
    .select(
      "id, title, description, category, visibility, status, current_version_number, uploaded_by, created_at",
    )
    .in("id", documentIds)
    .neq("status", "archived");

  if (documentError) {
    throw documentError;
  }

  const canViewAll = canViewSensitiveOpsFoundation(profile.role);
  const visibleDocuments = ((documents ?? []) as RawDocument[]).filter(
    (document) =>
      canViewAll || document.visibility === "company" || document.uploaded_by === profile.id,
  );
  const visibleDocumentIds = visibleDocuments.map((document) => document.id);

  if (visibleDocumentIds.length === 0) {
    return new Map<string, OpsLinkedDocument[]>();
  }

  const { data: versions, error: versionError } = await supabase
    .from("document_versions")
    .select(
      "id, document_id, version_number, file_name, content_type, file_size_bytes, checksum_sha256, uploaded_by, created_at",
    )
    .or(currentVersionFilter(visibleDocuments))
    .order("version_number", { ascending: false });

  if (versionError) {
    throw versionError;
  }

  const documentById = new Map(visibleDocuments.map((document) => [document.id, document]));
  const groupedVersions = versionsByDocumentId((versions ?? []) as unknown as RawDocumentVersion[]);
  const grouped = new Map<string, OpsLinkedDocument[]>();

  rawLinks.forEach((link) => {
    if (!link.source_id) {
      return;
    }

    const document = documentById.get(link.document_id);

    if (!document) {
      return;
    }

    grouped.set(link.source_id, [
      ...(grouped.get(link.source_id) ?? []),
      {
        category: document.category,
        created_at: document.created_at,
        current_version_number: document.current_version_number,
        description: document.description,
        document_id: document.id,
        link_id: link.id,
        status: document.status,
        title: document.title,
        uploaded_by: document.uploaded_by,
        versions: groupedVersions.get(document.id) ?? [],
        visibility: document.visibility,
      },
    ]);
  });

  return grouped;
}
