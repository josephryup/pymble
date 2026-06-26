"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { canManageIT } from "@/lib/ops/it-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

const ROUTE = "/ops/it/credentials";

const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), { message: "Use a valid date." })
  .default("");

const credentialSchema = z.object({
  account_identifier: z.string().trim().max(160).default(""),
  name: z.string().trim().min(2, "Name the credential.").max(160),
  notes: z.string().trim().max(800).default(""),
  owner_user_id: z.string().trim().default(""),
  rotation_due_date: optionalDate,
  system_name: z.string().trim().max(160).default(""),
  vault_location: z.string().trim().max(200).default(""),
});

const idSchema = z.object({ credential_id: z.string().uuid("Select a credential.") });

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function credentialError(message: string): never {
  redirect(`${ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

export async function createItCredentialAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    credentialError("Your role cannot manage the credential register.");
  }

  const parsed = credentialSchema.safeParse({
    account_identifier: field(formData, "account_identifier"),
    name: field(formData, "name"),
    notes: field(formData, "notes"),
    owner_user_id: field(formData, "owner_user_id"),
    rotation_due_date: field(formData, "rotation_due_date"),
    system_name: field(formData, "system_name"),
    vault_location: field(formData, "vault_location"),
  });
  if (!parsed.success) {
    credentialError(parsed.error.issues[0]?.message ?? "Check the credential details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_credentials")
    .insert({
      account_identifier: parsed.data.account_identifier,
      created_by: profile.id,
      name: parsed.data.name,
      notes: parsed.data.notes,
      owner_user_id: parsed.data.owner_user_id || null,
      rotation_due_date: parsed.data.rotation_due_date || null,
      system_name: parsed.data.system_name,
      vault_location: parsed.data.vault_location,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    credentialError(error?.message ?? "Could not record the credential.");
  }

  await recordOpsAuditEvent({
    action: "it_credential.create",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "it_credential",
    moduleKey: "it-credentials",
    sourceId: data.id,
    sourceTable: "it_credentials",
    summary: `Recorded credential metadata for ${parsed.data.name}`,
  });

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?created=credential`);
}

export async function markItCredentialRotatedAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    credentialError("Your role cannot manage the credential register.");
  }

  const parsed = idSchema.safeParse({ credential_id: field(formData, "credential_id") });
  if (!parsed.success) {
    credentialError("Select a credential.");
  }

  const supabase = getOpsSupabaseServiceClient();
  // Mark rotated today and push the next rotation 90 days out.
  const today = new Date();
  const next = new Date();
  next.setDate(next.getDate() + 90);
  const { error } = await supabase
    .from("it_credentials")
    .update({
      last_rotated_at: today.toISOString().slice(0, 10),
      rotation_due_date: next.toISOString().slice(0, 10),
    })
    .eq("id", parsed.data.credential_id)
    .is("archived_at", null);
  if (error) {
    credentialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "it_credential.rotated",
    actorUserId: profile.id,
    entityId: parsed.data.credential_id,
    entityType: "it_credential",
    moduleKey: "it-credentials",
    sourceId: parsed.data.credential_id,
    sourceTable: "it_credentials",
    summary: "Marked credential rotated",
  });

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=rotated`);
}

export async function archiveItCredentialAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    credentialError("Your role cannot manage the credential register.");
  }

  const parsed = idSchema.safeParse({ credential_id: field(formData, "credential_id") });
  if (!parsed.success) {
    credentialError("Select a credential to archive.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_credentials")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", parsed.data.credential_id)
    .is("archived_at", null);
  if (error) {
    credentialError(error.message);
  }

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=archived`);
}
