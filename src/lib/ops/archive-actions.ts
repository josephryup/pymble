"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { OPS_ARCHIVE_ADAPTERS, isOpsArchiveType } from "@/lib/ops/archive";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { canDeleteOpsArchived, canViewOpsBackoffice } from "@/lib/ops/permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

const ARCHIVE_ROUTE = "/ops/archive";

const restoreSchema = z.object({
  type: z.string().refine(isOpsArchiveType, { message: "Unknown record type." }),
  id: z.string().uuid("Select a record to restore."),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function archiveError(message: string): never {
  redirect(`${ARCHIVE_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

/**
 * Restore (un-archive) a single record from the Archive viewer. Restricted to
 * back-office roles. Each entity type's restore patch is defined by its adapter,
 * so this one action handles every archivable type.
 */
export async function restoreOpsArchivedItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsBackoffice(profile.role)) {
    archiveError("Only leadership and the Operations Manager can restore archived records.");
  }

  const parsed = restoreSchema.safeParse({
    type: field(formData, "type"),
    id: field(formData, "id"),
  });

  if (!parsed.success) {
    archiveError(parsed.error.issues[0]?.message ?? "Select a record to restore.");
  }

  const adapter = OPS_ARCHIVE_ADAPTERS[parsed.data.type];
  const supabase = getOpsSupabaseServiceClient();

  const { error } = await supabase
    .from(adapter.table)
    .update(adapter.restorePatch)
    .eq("id", parsed.data.id);

  if (error) {
    archiveError(error.message);
  }

  await recordOpsAuditEvent({
    action: `${adapter.auditEntityType}.restored`,
    actorUserId: profile.id,
    entityId: parsed.data.id,
    entityType: adapter.auditEntityType,
    metadata: { restored_from: "archive" },
    moduleKey: adapter.auditModuleKey,
    sourceId: parsed.data.id,
    sourceTable: adapter.table,
    summary: `Restored ${adapter.singular} from the archive`,
  }).catch(() => null);

  // Refresh both the archive view and the entity's own module.
  revalidatePath(ARCHIVE_ROUTE);
  revalidatePath(adapter.moduleHref);
  redirect(`${ARCHIVE_ROUTE}?type=${parsed.data.type}&updated=restored`);
}

/**
 * Permanently delete an archived record. Developer-only and irreversible. If
 * other records still reference it (a foreign-key RESTRICT), Postgres rejects
 * the delete — we surface a clear message rather than cascading, so attendance
 * and financial history is never silently destroyed.
 */
export async function deleteOpsArchivedItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canDeleteOpsArchived(profile.role)) {
    archiveError("Only the Developer can permanently delete archived records.");
  }

  const parsed = restoreSchema.safeParse({
    type: field(formData, "type"),
    id: field(formData, "id"),
  });

  if (!parsed.success) {
    archiveError(parsed.error.issues[0]?.message ?? "Select a record to delete.");
  }

  const adapter = OPS_ARCHIVE_ADAPTERS[parsed.data.type];
  const supabase = getOpsSupabaseServiceClient();

  const { error } = await supabase.from(adapter.table).delete().eq("id", parsed.data.id);

  if (error) {
    // 23503 = foreign_key_violation: the record still has linked rows.
    if (error.code === "23503") {
      archiveError(
        `This ${adapter.singular} still has linked records (history, line items, or related documents) and cannot be permanently deleted.`,
      );
    }
    archiveError(error.message);
  }

  await recordOpsAuditEvent({
    action: `${adapter.auditEntityType}.deleted`,
    actorUserId: profile.id,
    entityId: parsed.data.id,
    entityType: adapter.auditEntityType,
    metadata: { deleted_from: "archive" },
    moduleKey: adapter.auditModuleKey,
    sourceId: parsed.data.id,
    sourceTable: adapter.table,
    summary: `Permanently deleted ${adapter.singular} from the archive`,
  }).catch(() => null);

  revalidatePath(ARCHIVE_ROUTE);
  revalidatePath(adapter.moduleHref);
  redirect(`${ARCHIVE_ROUTE}?type=${parsed.data.type}&updated=deleted`);
}
