"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import { fanoutToOpsRoles } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import {
  isDeveloperRole,
  isGeneralManagerRole,
  isHumanResourceRole,
  isManagingDirectorRole,
} from "@/lib/ops/roles";

const createWorkerSchema = z.object({
  worker_code: z
    .string()
    .trim()
    .min(2, "Worker code is required.")
    .max(24, "Worker code must be 24 characters or fewer.")
    .transform((value) => value.toUpperCase().replace(/\s+/g, "-")),
  full_name: z.string().trim().min(2, "Worker name is required.").max(140),
  trade: z.string().trim().min(2, "Trade is required.").max(100),
  phone: z.string().trim().min(6, "Phone number is required.").max(40),
  daily_rate: z.coerce.number().positive("Daily rate must be greater than zero."),
  site_id: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null))
    .pipe(z.string().uuid().nullable()),
  momo_provider: z
    .string()
    .trim()
    .transform((value) => (value.length > 0 ? value : null))
    .pipe(z.enum(["mtn", "airtel"]).nullable()),
  momo_number: z.string().trim().max(40).default(""),
  worker_type: z.enum(["casual", "permanent"]),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function workerError(message: string): never {
  redirect(`/ops/workers?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

export async function createWorkerAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canEditWorker(profile.role)) {
    workerError(
      "Only Leadership, Operations Manager, Projects Manager, Engineering Manager, and Human Resources can add workers.",
    );
  }

  const parsed = createWorkerSchema.safeParse({
    worker_code: field(formData, "worker_code"),
    full_name: field(formData, "full_name"),
    trade: field(formData, "trade"),
    phone: field(formData, "phone"),
    daily_rate: field(formData, "daily_rate"),
    site_id: field(formData, "site_id"),
    momo_provider: field(formData, "momo_provider"),
    momo_number: field(formData, "momo_number"),
    worker_type: field(formData, "worker_type") || "casual",
  });

  if (!parsed.success) {
    workerError(parsed.error.issues[0]?.message ?? "Check the worker details and try again.");
  }

  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("workers")
    .insert({
      ...parsed.data,
      momo_number: parsed.data.momo_number || null,
      created_by: profile.id,
      is_active: true,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    workerError(
      error
        ? error.code === "23505"
          ? "That worker code or active phone number already exists."
          : error.message
        : "The worker could not be created.",
    );
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "worker.created",
    entity_type: "worker",
    entity_id: data.id,
    module_key: "workers",
    source_table: "workers",
    source_id: data.id,
    metadata: {
      worker_code: parsed.data.worker_code,
      full_name: parsed.data.full_name,
    },
  });

  // Phase M: notify HR + operations + leadership that a new worker was added.
  const recipients = await fanoutToOpsRoles(
    ["human_resource", "hr", "operations_manager", "managing_director", "owner"],
    { excludeUserIds: [profile.id] },
  );
  await Promise.all(
    recipients.map((recipient) =>
      queueOpsNotification({
        actionHref: "/ops/workers",
        body: `${profile.full_name} added ${parsed.data.full_name} (${parsed.data.worker_code}) to the worker roster.`,
        idempotencyKey: `worker-created:${data.id}:${recipient.id}`,
        moduleKey: "workers",
        recipientId: recipient.id,
        sourceId: data.id,
        sourceTable: "workers",
        title: `New worker added: ${parsed.data.full_name}`,
      }).catch(() => null),
    ),
  );

  revalidatePath("/ops");
  revalidatePath("/ops/workers");
  revalidatePath("/ops/notifications");
  redirect("/ops/workers?created=worker");
}

const workerIdSchema = z.object({
  id: z.string().uuid("Select a worker."),
});

const updateWorkerSchema = createWorkerSchema.extend({
  id: z.string().uuid(),
});

/**
 * Worker records. Edit and create are open to the heads who supervise the
 * people on site: leadership, Operations Manager, Projects Manager,
 * Engineering Manager, and Human Resources.
 *
 * Excludes Procurement / Finance / HSE / Quantity Surveyor — their roles are
 * to consume worker data (payroll, attendance, incidents), not maintain it.
 */
function canEditWorker(role: string) {
  return (
    isDeveloperRole(role) ||
    isManagingDirectorRole(role) ||
    isGeneralManagerRole(role) ||
    isHumanResourceRole(role) ||
    role === "operations_manager" ||
    role === "projects_manager" ||
    role === "engineering_manager"
  );
}

function canArchiveWorker(role: string) {
  return (
    isDeveloperRole(role) ||
    isManagingDirectorRole(role) ||
    isGeneralManagerRole(role) ||
    isHumanResourceRole(role)
  );
}

function canDeleteWorker(role: string) {
  return isDeveloperRole(role);
}

export async function updateWorkerAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canEditWorker(profile.role)) {
    workerError(
      "Only Leadership, Operations Manager, Projects Manager, Engineering Manager, and Human Resources can edit worker records.",
    );
  }

  const parsed = updateWorkerSchema.safeParse({
    id: field(formData, "id"),
    worker_code: field(formData, "worker_code"),
    full_name: field(formData, "full_name"),
    trade: field(formData, "trade"),
    phone: field(formData, "phone"),
    daily_rate: field(formData, "daily_rate"),
    site_id: field(formData, "site_id"),
    momo_provider: field(formData, "momo_provider"),
    momo_number: field(formData, "momo_number"),
    worker_type: field(formData, "worker_type") || "casual",
  });

  if (!parsed.success) {
    workerError(parsed.error.issues[0]?.message ?? "Check the worker details and try again.");
  }

  const { id, ...patch } = parsed.data;
  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("workers")
    .update({
      ...patch,
      momo_number: patch.momo_number || null,
    })
    .eq("id", id)
    .is("archived_at", null);

  if (error) {
    workerError(
      error.code === "23505"
        ? "That worker code or active phone number already exists."
        : error.message,
    );
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "worker.updated",
    entity_type: "worker",
    entity_id: id,
    module_key: "workers",
    source_table: "workers",
    source_id: id,
    metadata: {
      worker_code: patch.worker_code,
    },
  });

  revalidatePath("/ops/workers");
  redirect("/ops/workers?updated=worker");
}

export async function archiveWorkerAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canArchiveWorker(profile.role)) {
    workerError(
      "Only the Developer, Managing Director, General Manager, or Human Resource can archive a worker.",
    );
  }

  const parsed = workerIdSchema.safeParse({ id: field(formData, "id") });
  if (!parsed.success) {
    workerError("Select a worker to archive.");
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("workers")
    .update({
      archived_at: new Date().toISOString(),
      archived_by: profile.id,
      is_active: false,
    })
    .eq("id", parsed.data.id);

  if (error) {
    workerError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "worker.archived",
    entity_type: "worker",
    entity_id: parsed.data.id,
    module_key: "workers",
    source_table: "workers",
    source_id: parsed.data.id,
  });

  revalidatePath("/ops/workers");
  redirect("/ops/workers?updated=archived");
}

export async function deleteWorkerAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canDeleteWorker(profile.role)) {
    workerError("Only the Developer can permanently delete a worker.");
  }

  const parsed = workerIdSchema.safeParse({ id: field(formData, "id") });
  if (!parsed.success) {
    workerError("Select a worker to delete.");
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase.from("workers").delete().eq("id", parsed.data.id);

  if (error) {
    workerError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "worker.deleted",
    entity_type: "worker",
    entity_id: parsed.data.id,
    module_key: "workers",
    source_table: "workers",
    source_id: parsed.data.id,
  });

  revalidatePath("/ops/workers");
  redirect("/ops/workers?updated=deleted");
}
