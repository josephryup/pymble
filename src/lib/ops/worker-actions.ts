"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import { canManageOps } from "@/lib/ops/permissions";

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

  if (!canManageOps(profile.role)) {
    workerError("Your role cannot create workers yet.");
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
    metadata: {
      worker_code: parsed.data.worker_code,
      full_name: parsed.data.full_name,
    },
  });

  revalidatePath("/ops");
  revalidatePath("/ops/workers");
  redirect("/ops/workers?created=worker");
}
