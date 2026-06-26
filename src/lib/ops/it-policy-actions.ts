"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { canManageIT } from "@/lib/ops/it-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsItPolicyCategory } from "@/lib/ops/types";

const ROUTE = "/ops/it/policies";

const CATEGORIES = [
  "acceptable_use",
  "password",
  "byod",
  "cybersecurity",
  "data_retention",
  "other",
] as const satisfies readonly OpsItPolicyCategory[];

const policySchema = z.object({
  body: z.string().trim().max(20000).default(""),
  category: z.enum(CATEGORIES).default("other"),
  title: z.string().trim().min(3, "Give the policy a title.").max(180),
  version: z.coerce.number().int().min(1).default(1),
});

const idSchema = z.object({ policy_id: z.string().uuid("Select a policy.") });

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function policyError(route: string, message: string): never {
  redirect(`${route}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

export async function createItPolicyAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    policyError(ROUTE, "Your role cannot manage IT policies.");
  }

  const parsed = policySchema.safeParse({
    body: field(formData, "body"),
    category: field(formData, "category") || "other",
    title: field(formData, "title"),
    version: field(formData, "version") || 1,
  });
  if (!parsed.success) {
    policyError(ROUTE, parsed.error.issues[0]?.message ?? "Check the policy details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_policies")
    .insert({
      body: parsed.data.body,
      category: parsed.data.category,
      created_by: profile.id,
      status: "draft",
      title: parsed.data.title,
      version: parsed.data.version,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    policyError(ROUTE, error?.message ?? "Could not create the policy.");
  }

  await recordOpsAuditEvent({
    action: "it_policy.create",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "it_policy",
    moduleKey: "it-policies",
    sourceId: data.id,
    sourceTable: "it_policies",
    summary: `Drafted IT policy ${parsed.data.title}`,
  });

  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${data.id}`);
}

export async function publishItPolicyAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    policyError(ROUTE, "Your role cannot manage IT policies.");
  }

  const parsed = idSchema.safeParse({ policy_id: field(formData, "policy_id") });
  if (!parsed.success) {
    policyError(ROUTE, "Select a policy.");
  }

  const policyRoute = `${ROUTE}/${parsed.data.policy_id}`;
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_policies")
    .update({ published_at: new Date().toISOString(), status: "published" })
    .eq("id", parsed.data.policy_id)
    .is("archived_at", null);
  if (error) {
    policyError(policyRoute, error.message);
  }

  await recordOpsAuditEvent({
    action: "it_policy.publish",
    actorUserId: profile.id,
    entityId: parsed.data.policy_id,
    entityType: "it_policy",
    moduleKey: "it-policies",
    sourceId: parsed.data.policy_id,
    sourceTable: "it_policies",
    summary: "Published an IT policy",
  });

  revalidatePath(policyRoute);
  revalidatePath(ROUTE);
  redirect(`${policyRoute}?updated=published`);
}

export async function acknowledgeItPolicyAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = idSchema.safeParse({ policy_id: field(formData, "policy_id") });
  if (!parsed.success) {
    policyError(ROUTE, "Select a policy.");
  }

  const policyRoute = `${ROUTE}/${parsed.data.policy_id}`;
  const supabase = getOpsSupabaseServiceClient();
  // Only published policies can be acknowledged.
  const { data: policy, error: fetchError } = await supabase
    .from("it_policies")
    .select("id, status")
    .eq("id", parsed.data.policy_id)
    .is("archived_at", null)
    .maybeSingle<{ id: string; status: string }>();
  if (fetchError) {
    policyError(policyRoute, fetchError.message);
  }
  if (!policy || policy.status !== "published") {
    policyError(policyRoute, "This policy is not published yet.");
  }

  const { error } = await supabase
    .from("it_policy_acknowledgements")
    .upsert(
      { policy_id: parsed.data.policy_id, user_id: profile.id },
      { onConflict: "policy_id,user_id", ignoreDuplicates: true },
    );
  if (error) {
    policyError(policyRoute, error.message);
  }

  revalidatePath(policyRoute);
  redirect(`${policyRoute}?updated=acknowledged`);
}

export async function archiveItPolicyAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    policyError(ROUTE, "Your role cannot manage IT policies.");
  }

  const parsed = idSchema.safeParse({ policy_id: field(formData, "policy_id") });
  if (!parsed.success) {
    policyError(ROUTE, "Select a policy to archive.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_policies")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id, status: "archived" })
    .eq("id", parsed.data.policy_id)
    .is("archived_at", null);
  if (error) {
    policyError(ROUTE, error.message);
  }

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=archived`);
}
