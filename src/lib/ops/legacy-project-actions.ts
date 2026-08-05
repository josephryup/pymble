"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { canManageOpsProjectBudget } from "@/lib/ops/finance-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

const ROUTE = "/ops/finance/legacy-projects";

const legacyProjectSchema = z.object({
  client_name: z.string().trim().max(160).default(""),
  code: z
    .string()
    .trim()
    .min(2, "Give the project a short reference code.")
    .max(40)
    // The code is how a finance person recognises the project on a statement,
    // so keep it typeable and stable rather than allowing free punctuation.
    .regex(/^[A-Za-z0-9][A-Za-z0-9 _/-]*$/, "Use letters, numbers, spaces, dashes or slashes."),
  completed_on: z.string().trim().default(""),
  cost_treatment: z.enum(["opening_balance", "current_period"]),
  description: z.string().trim().max(1000).default(""),
  name: z.string().trim().min(2, "Give the project a name.").max(180),
  notes: z.string().trim().max(1000).default(""),
});

const projectIdSchema = z.object({
  legacy_project_id: z.string().uuid("Select a completed project."),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function legacyError(message: string): never {
  redirect(`${ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

/**
 * Register a completed project so its unpaid balances can be recorded.
 *
 * Gated on the same permission as project budgets rather than a new one: this
 * is a finance master-data record, and whoever is trusted to define where money
 * is budgeted is the right person to define where an old debt belongs.
 */
export async function createOpsLegacyProjectAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsProjectBudget(profile.role)) {
    legacyError("Your role cannot register completed projects.");
  }

  const parsed = legacyProjectSchema.safeParse({
    client_name: field(formData, "client_name"),
    code: field(formData, "code"),
    completed_on: field(formData, "completed_on"),
    cost_treatment: field(formData, "cost_treatment") || "current_period",
    description: field(formData, "description"),
    name: field(formData, "name"),
    notes: field(formData, "notes"),
  });

  if (!parsed.success) {
    legacyError(parsed.error.issues[0]?.message ?? "Check the project details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: created, error } = await supabase
    .from("legacy_projects")
    .insert({
      client_name: parsed.data.client_name,
      code: parsed.data.code,
      completed_on: parsed.data.completed_on || null,
      cost_treatment: parsed.data.cost_treatment,
      created_by: profile.id,
      description: parsed.data.description,
      name: parsed.data.name,
      notes: parsed.data.notes,
    })
    .select("id, code, name")
    .single<{ id: string; code: string; name: string }>();

  if (error) {
    // The unique index is on lower(code), so a duplicate is a real collision
    // rather than a casing difference.
    if (error.code === "23505") {
      legacyError("A completed project with that code already exists.");
    }
    legacyError(error.message);
  }

  await recordOpsAuditEvent({
    action: "legacy_project.registered",
    actorUserId: profile.id,
    entityId: created.id,
    entityType: "legacy_project",
    metadata: {
      code: created.code,
      cost_treatment: parsed.data.cost_treatment,
    },
    moduleKey: "finance",
    sourceId: created.id,
    sourceTable: "legacy_projects",
    summary: `Registered completed project ${created.code} — ${created.name}`,
  }).catch(() => null);

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?created=legacy_project`);
}

/**
 * Close a project to new payables once everything owed on it is recorded.
 *
 * Deliberately not a delete: the payables and their journals reference it, and
 * a finished project with a history is exactly what this register is for.
 */
export async function setOpsLegacyProjectActiveAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsProjectBudget(profile.role)) {
    legacyError("Your role cannot change completed projects.");
  }

  const parsed = projectIdSchema.safeParse({
    legacy_project_id: field(formData, "legacy_project_id"),
  });

  if (!parsed.success) {
    legacyError("Select a completed project.");
  }

  const nextActive = field(formData, "is_active") === "true";
  const supabase = getOpsSupabaseServiceClient();

  const { error } = await supabase
    .from("legacy_projects")
    .update({ is_active: nextActive })
    .eq("id", parsed.data.legacy_project_id);

  if (error) {
    legacyError(error.message);
  }

  await recordOpsAuditEvent({
    action: nextActive ? "legacy_project.reopened" : "legacy_project.closed",
    actorUserId: profile.id,
    entityId: parsed.data.legacy_project_id,
    entityType: "legacy_project",
    moduleKey: "finance",
    sourceId: parsed.data.legacy_project_id,
    sourceTable: "legacy_projects",
    summary: nextActive
      ? "Reopened a completed project for further payables"
      : "Closed a completed project to new payables",
  }).catch(() => null);

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=legacy_project`);
}
