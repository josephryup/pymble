"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { IT_CHECKLIST_TEMPLATES } from "@/lib/ops/it-checklists";
import { canManageIT } from "@/lib/ops/it-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsItChecklistKind } from "@/lib/ops/types";

const ROUTE = "/ops/it/checklists";

const runSchema = z.object({
  employee_name: z.string().trim().min(2, "Enter the employee name.").max(160),
  kind: z.enum(["onboarding", "offboarding"]),
  notes: z.string().trim().max(800).default(""),
});

const itemToggleSchema = z.object({
  is_done: z.enum(["true", "false"]),
  item_id: z.string().uuid("Select an item."),
  run_id: z.string().uuid("Select a run."),
});

const runIdSchema = z.object({ run_id: z.string().uuid("Select a run.") });

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function checklistError(route: string, message: string): never {
  redirect(`${route}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

export async function createItChecklistRunAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    checklistError(ROUTE, "Your role cannot manage IT checklists.");
  }

  const parsed = runSchema.safeParse({
    employee_name: field(formData, "employee_name"),
    kind: field(formData, "kind"),
    notes: field(formData, "notes"),
  });
  if (!parsed.success) {
    checklistError(ROUTE, parsed.error.issues[0]?.message ?? "Check the checklist details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: run, error } = await supabase
    .from("it_checklist_runs")
    .insert({
      created_by: profile.id,
      employee_name: parsed.data.employee_name,
      kind: parsed.data.kind,
      notes: parsed.data.notes,
      status: "in_progress",
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !run) {
    checklistError(ROUTE, error?.message ?? "Could not create the checklist.");
  }

  const template = IT_CHECKLIST_TEMPLATES[parsed.data.kind as OpsItChecklistKind];
  const { error: itemsError } = await supabase.from("it_checklist_items").insert(
    template.map((label, index) => ({ label, run_id: run.id, sort_order: index })),
  );
  if (itemsError) {
    await supabase.from("it_checklist_runs").delete().eq("id", run.id);
    checklistError(ROUTE, itemsError.message);
  }

  await recordOpsAuditEvent({
    action: "it_checklist.create",
    actorUserId: profile.id,
    entityId: run.id,
    entityType: "it_checklist_run",
    metadata: { kind: parsed.data.kind },
    moduleKey: "it-checklists",
    sourceId: run.id,
    sourceTable: "it_checklist_runs",
    summary: `Started ${parsed.data.kind} checklist for ${parsed.data.employee_name}`,
  });

  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${run.id}`);
}

export async function toggleItChecklistItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    checklistError(ROUTE, "Your role cannot manage IT checklists.");
  }

  const parsed = itemToggleSchema.safeParse({
    is_done: field(formData, "is_done"),
    item_id: field(formData, "item_id"),
    run_id: field(formData, "run_id"),
  });
  if (!parsed.success) {
    checklistError(ROUTE, "Could not update the item.");
  }

  const nextDone = parsed.data.is_done === "true";
  const runRoute = `${ROUTE}/${parsed.data.run_id}`;
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_checklist_items")
    .update({
      done_at: nextDone ? new Date().toISOString() : null,
      done_by: nextDone ? profile.id : null,
      is_done: nextDone,
    })
    .eq("id", parsed.data.item_id)
    .eq("run_id", parsed.data.run_id);
  if (error) {
    checklistError(runRoute, error.message);
  }

  revalidatePath(runRoute);
  revalidatePath(ROUTE);
  redirect(runRoute);
}

export async function completeItChecklistRunAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    checklistError(ROUTE, "Your role cannot manage IT checklists.");
  }

  const parsed = runIdSchema.safeParse({ run_id: field(formData, "run_id") });
  if (!parsed.success) {
    checklistError(ROUTE, "Select a checklist.");
  }

  const runRoute = `${ROUTE}/${parsed.data.run_id}`;
  const supabase = getOpsSupabaseServiceClient();
  const { count, error: countError } = await supabase
    .from("it_checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("run_id", parsed.data.run_id)
    .eq("is_done", false);
  if (countError) {
    checklistError(runRoute, countError.message);
  }
  if ((count ?? 0) > 0) {
    checklistError(runRoute, "Tick every step before marking the checklist complete.");
  }

  const { error } = await supabase
    .from("it_checklist_runs")
    .update({ completed_at: new Date().toISOString(), status: "completed" })
    .eq("id", parsed.data.run_id)
    .is("archived_at", null);
  if (error) {
    checklistError(runRoute, error.message);
  }

  await recordOpsAuditEvent({
    action: "it_checklist.complete",
    actorUserId: profile.id,
    entityId: parsed.data.run_id,
    entityType: "it_checklist_run",
    moduleKey: "it-checklists",
    sourceId: parsed.data.run_id,
    sourceTable: "it_checklist_runs",
    summary: "Completed an IT checklist",
  });

  revalidatePath(runRoute);
  revalidatePath(ROUTE);
  redirect(`${runRoute}?updated=completed`);
}

export async function archiveItChecklistRunAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    checklistError(ROUTE, "Your role cannot manage IT checklists.");
  }

  const parsed = runIdSchema.safeParse({ run_id: field(formData, "run_id") });
  if (!parsed.success) {
    checklistError(ROUTE, "Select a checklist to archive.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_checklist_runs")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", parsed.data.run_id)
    .is("archived_at", null);
  if (error) {
    checklistError(ROUTE, error.message);
  }

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=archived`);
}
