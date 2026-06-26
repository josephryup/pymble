"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { canManageIT } from "@/lib/ops/it-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

const ROUTE = "/ops/it/access";

const grantSchema = z.object({
  access_level: z.string().trim().max(80).default(""),
  account_identifier: z.string().trim().max(160).default(""),
  notes: z.string().trim().max(800).default(""),
  system_name: z.string().trim().min(2, "Name the system.").max(160),
  user_id: z.string().trim().default(""),
});

const idSchema = z.object({ grant_id: z.string().uuid("Select a grant.") });

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function accessError(message: string): never {
  redirect(`${ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

export async function createItAccessGrantAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    accessError("Your role cannot manage the access register.");
  }

  const parsed = grantSchema.safeParse({
    access_level: field(formData, "access_level"),
    account_identifier: field(formData, "account_identifier"),
    notes: field(formData, "notes"),
    system_name: field(formData, "system_name"),
    user_id: field(formData, "user_id"),
  });
  if (!parsed.success) {
    accessError(parsed.error.issues[0]?.message ?? "Check the access details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_access_grants")
    .insert({
      access_level: parsed.data.access_level,
      account_identifier: parsed.data.account_identifier,
      created_by: profile.id,
      notes: parsed.data.notes,
      status: "active",
      system_name: parsed.data.system_name,
      user_id: parsed.data.user_id || null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    accessError(error?.message ?? "Could not record the access grant.");
  }

  await recordOpsAuditEvent({
    action: "it_access.grant",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "it_access_grant",
    moduleKey: "it-access",
    sourceId: data.id,
    sourceTable: "it_access_grants",
    summary: `Recorded access to ${parsed.data.system_name}`,
  });

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?created=grant`);
}

export async function revokeItAccessGrantAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    accessError("Your role cannot manage the access register.");
  }

  const parsed = idSchema.safeParse({ grant_id: field(formData, "grant_id") });
  if (!parsed.success) {
    accessError("Select a grant to revoke.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_access_grants")
    .update({ status: "revoked", revoked_at: new Date().toISOString().slice(0, 10) })
    .eq("id", parsed.data.grant_id)
    .is("archived_at", null);
  if (error) {
    accessError(error.message);
  }

  await recordOpsAuditEvent({
    action: "it_access.revoke",
    actorUserId: profile.id,
    entityId: parsed.data.grant_id,
    entityType: "it_access_grant",
    moduleKey: "it-access",
    sourceId: parsed.data.grant_id,
    sourceTable: "it_access_grants",
    summary: "Revoked an access grant",
  });

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=revoked`);
}

export async function archiveItAccessGrantAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    accessError("Your role cannot manage the access register.");
  }

  const parsed = idSchema.safeParse({ grant_id: field(formData, "grant_id") });
  if (!parsed.success) {
    accessError("Select a grant to archive.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_access_grants")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", parsed.data.grant_id)
    .is("archived_at", null);
  if (error) {
    accessError(error.message);
  }

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=archived`);
}
