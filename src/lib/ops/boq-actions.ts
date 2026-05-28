"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import { canManageOps } from "@/lib/ops/permissions";

const createBoqSchema = z.object({
  site_id: z.string().uuid("Select a Pymble site."),
  title: z.string().trim().min(2, "BOQ title is required.").max(160),
  version: z.coerce.number().int().positive().default(1),
  status: z.enum(["draft", "issued"]),
});

const createLineItemSchema = z.object({
  boq_id: z.string().uuid("Select a BOQ document."),
  description: z.string().trim().min(2, "Line item description is required.").max(220),
  unit: z.string().trim().min(1, "Unit is required.").max(40),
  quantity: z.coerce.number().min(0, "Quantity cannot be negative."),
  unit_rate: z.coerce.number().min(0, "Unit rate cannot be negative."),
  actual_quantity: z.coerce.number().min(0, "Actual quantity cannot be negative.").default(0),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function boqError(message: string): never {
  redirect(`/ops/boq?error=${encodeURIComponent(message)}`);
}

export async function createBoqDocumentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOps(profile.role)) {
    boqError("Your role cannot create BOQ documents yet.");
  }

  const parsed = createBoqSchema.safeParse({
    site_id: field(formData, "site_id"),
    status: field(formData, "status") || "draft",
    title: field(formData, "title"),
    version: field(formData, "version") || "1",
  });

  if (!parsed.success) {
    boqError(parsed.error.issues[0]?.message ?? "Check the BOQ details.");
  }

  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("boq_documents")
    .insert({
      ...parsed.data,
      created_by: profile.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    boqError(error?.message ?? "The BOQ document could not be created.");
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "boq.created",
    entity_type: "boq_document",
    entity_id: data.id,
    metadata: {
      site_id: parsed.data.site_id,
      title: parsed.data.title,
    },
  });

  revalidatePath("/ops/boq");
  redirect("/ops/boq?created=boq");
}

export async function createBoqLineItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOps(profile.role)) {
    boqError("Your role cannot add BOQ line items yet.");
  }

  const parsed = createLineItemSchema.safeParse({
    actual_quantity: field(formData, "actual_quantity") || "0",
    boq_id: field(formData, "boq_id"),
    description: field(formData, "description"),
    quantity: field(formData, "quantity"),
    unit: field(formData, "unit"),
    unit_rate: field(formData, "unit_rate"),
  });

  if (!parsed.success) {
    boqError(parsed.error.issues[0]?.message ?? "Check the line item details.");
  }

  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("boq_line_items")
    .insert(parsed.data)
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    boqError(error?.message ?? "The line item could not be added.");
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "boq_line_item.created",
    entity_type: "boq_line_item",
    entity_id: data.id,
    metadata: {
      boq_id: parsed.data.boq_id,
    },
  });

  revalidatePath("/ops/boq");
  redirect("/ops/boq?created=line");
}
