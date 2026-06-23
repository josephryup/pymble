import { requireOpsUser } from "@/lib/ops/auth";
import {
  createOpsPagination,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { logOpsServerError } from "@/lib/ops/log";
import { canViewOpsBackoffice } from "@/lib/ops/permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Cross-cutting archive viewer. Entities are archived through different
 * mechanisms — most carry `archived_at`/`archived_by`, a few use
 * `is_active = false` — so each archivable type is described by an adapter that
 * knows how to find its archived rows, label them, and restore them.
 *
 * v1 covers the operational core. Financial records (invoices, payroll runs,
 * payment requests) are intentionally excluded and remain managed from their
 * own modules.
 */

export const OPS_ARCHIVE_TYPES = [
  "workers",
  "sites",
  "suppliers",
  "material_requests",
  "equipment",
  "subcontractors",
  "department_reports",
  "documents",
] as const;

export type OpsArchiveType = (typeof OPS_ARCHIVE_TYPES)[number];

export function isOpsArchiveType(value: string): value is OpsArchiveType {
  return (OPS_ARCHIVE_TYPES as readonly string[]).includes(value);
}

type ArchiveMechanism = "archived_at" | "is_active";

type ArchiveRow = Record<string, unknown>;

export type OpsArchiveAdapter = {
  /** Plural label for tabs/headings. */
  label: string;
  /** Singular noun for confirmations/messages. */
  singular: string;
  table: string;
  mechanism: ArchiveMechanism;
  /** Columns to select for the list view. */
  columns: string;
  /** Link back to the entity's own module. */
  moduleHref: string;
  /** Patch applied on restore (un-archive). */
  restorePatch: Record<string, unknown>;
  /** Audit metadata for the restore event. */
  auditEntityType: string;
  auditModuleKey: string;
  toItem: (row: ArchiveRow) => { title: string; subtitle: string; archivedAt: string | null };
};

function text(row: ArchiveRow, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function timestamp(row: ArchiveRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export const OPS_ARCHIVE_ADAPTERS: Record<OpsArchiveType, OpsArchiveAdapter> = {
  workers: {
    label: "Workers",
    singular: "worker",
    table: "workers",
    mechanism: "archived_at",
    columns: "id, full_name, worker_code, trade, archived_at",
    moduleHref: "/ops/workers",
    restorePatch: { archived_at: null, archived_by: null, is_active: true },
    auditEntityType: "worker",
    auditModuleKey: "workers",
    toItem: (row) => ({
      title: text(row, "full_name") || text(row, "worker_code") || "Worker",
      subtitle: [text(row, "worker_code"), text(row, "trade")].filter(Boolean).join(" · "),
      archivedAt: timestamp(row, "archived_at"),
    }),
  },
  sites: {
    label: "Project sites",
    singular: "site",
    table: "sites",
    mechanism: "is_active",
    columns: "id, code, name, location, updated_at",
    moduleHref: "/ops/sites",
    restorePatch: { is_active: true },
    auditEntityType: "site",
    auditModuleKey: "sites",
    toItem: (row) => ({
      title: text(row, "name") || text(row, "code") || "Site",
      subtitle: [text(row, "code"), text(row, "location")].filter(Boolean).join(" · "),
      // Sites carry no archive timestamp; surface the last-modified time instead.
      archivedAt: timestamp(row, "updated_at"),
    }),
  },
  suppliers: {
    label: "Suppliers",
    singular: "supplier",
    table: "suppliers",
    mechanism: "archived_at",
    columns: "id, legal_name, supplier_code, archived_at",
    moduleHref: "/ops/suppliers",
    restorePatch: { archived_at: null },
    auditEntityType: "supplier",
    auditModuleKey: "suppliers",
    toItem: (row) => ({
      title: text(row, "legal_name") || text(row, "supplier_code") || "Supplier",
      subtitle: text(row, "supplier_code"),
      archivedAt: timestamp(row, "archived_at"),
    }),
  },
  material_requests: {
    label: "Material requests",
    singular: "material request",
    table: "material_requests",
    mechanism: "archived_at",
    columns: "id, title, request_number, archived_at",
    moduleHref: "/ops/material-requests",
    restorePatch: { archived_at: null, archived_by: null },
    auditEntityType: "material_request",
    auditModuleKey: "material_requests",
    toItem: (row) => ({
      title: text(row, "title") || text(row, "request_number") || "Material request",
      subtitle: text(row, "request_number"),
      archivedAt: timestamp(row, "archived_at"),
    }),
  },
  equipment: {
    label: "Equipment",
    singular: "equipment record",
    table: "equipment",
    mechanism: "archived_at",
    columns: "id, name, equipment_code, archived_at",
    moduleHref: "/ops/equipment",
    restorePatch: { archived_at: null, archived_by: null, status: "available" },
    auditEntityType: "equipment",
    auditModuleKey: "equipment",
    toItem: (row) => ({
      title: text(row, "name") || text(row, "equipment_code") || "Equipment",
      subtitle: text(row, "equipment_code"),
      archivedAt: timestamp(row, "archived_at"),
    }),
  },
  subcontractors: {
    label: "Subcontractors",
    singular: "subcontractor",
    table: "subcontractors",
    mechanism: "archived_at",
    columns: "id, company_name, status, archived_at",
    moduleHref: "/ops/subcontractors",
    restorePatch: { archived_at: null, archived_by: null },
    auditEntityType: "subcontractor",
    auditModuleKey: "subcontractors",
    toItem: (row) => ({
      title: text(row, "company_name") || "Subcontractor",
      subtitle: text(row, "status"),
      archivedAt: timestamp(row, "archived_at"),
    }),
  },
  department_reports: {
    label: "Department reports",
    singular: "department report",
    table: "department_reports",
    mechanism: "archived_at",
    columns: "id, title, department, period, archived_at",
    moduleHref: "/ops/department-reports",
    restorePatch: { archived_at: null, archived_by: null },
    auditEntityType: "department_report",
    auditModuleKey: "department_reports",
    toItem: (row) => ({
      title: text(row, "title") || "Department report",
      subtitle: [text(row, "department"), text(row, "period")].filter(Boolean).join(" · "),
      archivedAt: timestamp(row, "archived_at"),
    }),
  },
  documents: {
    label: "Documents",
    singular: "document",
    table: "documents",
    mechanism: "archived_at",
    columns: "id, title, status, archived_at",
    moduleHref: "/ops/documents",
    // Documents are archived with status = 'archived'; restore returns them to active.
    restorePatch: { archived_at: null, status: "active" },
    auditEntityType: "document",
    auditModuleKey: "documents",
    toItem: (row) => ({
      title: text(row, "title") || "Document",
      subtitle: text(row, "status"),
      archivedAt: timestamp(row, "archived_at"),
    }),
  },
};

export type OpsArchivedItem = {
  id: string;
  type: OpsArchiveType;
  title: string;
  subtitle: string;
  archivedAt: string | null;
};

export type OpsArchiveSummaryEntry = {
  type: OpsArchiveType;
  label: string;
  count: number;
  moduleHref: string;
};

/** Count of archived records per type, for the archive overview. */
export async function fetchOpsArchiveSummary(): Promise<OpsArchiveSummaryEntry[]> {
  const { profile } = await requireOpsUser();
  if (!canViewOpsBackoffice(profile.role)) {
    return [];
  }
  const supabase = getOpsSupabaseServiceClient();

  const entries = await Promise.all(
    OPS_ARCHIVE_TYPES.map(async (type) => {
      const adapter = OPS_ARCHIVE_ADAPTERS[type];
      try {
        const selected = supabase
          .from(adapter.table)
          .select("id", { count: "exact", head: true });
        const filtered =
          adapter.mechanism === "archived_at"
            ? selected.not("archived_at", "is", null)
            : selected.eq("is_active", false);
        const { count } = await filtered;
        return {
          type,
          label: adapter.label,
          count: count ?? 0,
          moduleHref: adapter.moduleHref,
        } satisfies OpsArchiveSummaryEntry;
      } catch (error) {
        logOpsServerError(error, { module: "archive", action: "fetchOpsArchiveSummary", entityId: type });
        return { type, label: adapter.label, count: 0, moduleHref: adapter.moduleHref };
      }
    }),
  );

  return entries;
}

/** Paginated archived records for one type. */
export async function fetchOpsArchivedItems(
  type: OpsArchiveType,
  listState: OpsListState,
): Promise<OpsPaginatedResult<OpsArchivedItem>> {
  const { profile } = await requireOpsUser();
  if (!canViewOpsBackoffice(profile.role)) {
    return { items: [], pagination: createOpsPagination(0, listState) };
  }

  const adapter = OPS_ARCHIVE_ADAPTERS[type];
  const supabase = getOpsSupabaseServiceClient();

  const selected = supabase.from(adapter.table).select(adapter.columns, { count: "exact" });
  const filtered =
    adapter.mechanism === "archived_at"
      ? selected.not("archived_at", "is", null).order("archived_at", { ascending: false })
      : selected.eq("is_active", false).order("updated_at", { ascending: false });

  const { data, error, count } = await filtered.range(listState.from, listState.to);

  if (error) {
    logOpsServerError(error, { module: "archive", action: "fetchOpsArchivedItems", entityId: type });
    throw error;
  }

  const items: OpsArchivedItem[] = ((data ?? []) as unknown as ArchiveRow[]).map((row) => {
    const mapped = adapter.toItem(row);
    return {
      id: text(row, "id"),
      type,
      title: mapped.title,
      subtitle: mapped.subtitle,
      archivedAt: mapped.archivedAt,
    };
  });

  return { items, pagination: createOpsPagination(count, listState) };
}
