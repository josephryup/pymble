"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { canManageItAssets } from "@/lib/ops/it-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsItAssetStatus, OpsItAssetType } from "@/lib/ops/types";

const ASSETS_ROUTE = "/ops/it/assets";

const ASSET_TYPES = [
  "laptop",
  "desktop",
  "printer",
  "phone",
  "tablet",
  "monitor",
  "network",
  "server",
  "other",
] as const satisfies readonly OpsItAssetType[];

const ASSET_STATUSES = [
  "in_use",
  "spare",
  "repair",
  "retired",
  "disposed",
  "lost",
] as const satisfies readonly OpsItAssetStatus[];

const optionalDateSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: "Use a valid date.",
  })
  .default("");

const assetSchema = z.object({
  asset_type: z.enum(ASSET_TYPES).default("other"),
  assigned_to: z.string().trim().default(""),
  location: z.string().trim().max(160).default(""),
  manufacturer: z.string().trim().max(120).default(""),
  model: z.string().trim().max(120).default(""),
  name: z.string().trim().min(2, "Give the asset a name.").max(160),
  notes: z.string().trim().max(800).default(""),
  purchase_cost: z.coerce.number().min(0).optional().or(z.literal("")),
  purchase_date: optionalDateSchema,
  serial_number: z.string().trim().max(120).default(""),
  site_id: z.string().trim().default(""),
  status: z.enum(ASSET_STATUSES).default("in_use"),
  warranty_expiry: optionalDateSchema,
});

const assetIdSchema = z.object({ asset_id: z.string().uuid("Select an asset.") });

const statusSchema = assetIdSchema.extend({ status: z.enum(ASSET_STATUSES) });

const assignSchema = assetIdSchema.extend({
  assigned_to: z.string().trim().default(""),
  note: z.string().trim().max(400).default(""),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function assetError(message: string): never {
  redirect(`${ASSETS_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function nullableUuid(value: string) {
  return value === "" ? null : value;
}

function nullableNumber(value: number | "" | undefined) {
  return value === "" || value === undefined ? null : value;
}

function nullableDate(value: string) {
  return value === "" ? null : value;
}

export async function createItAssetAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageItAssets(profile.role)) {
    assetError("Your role cannot manage IT assets.");
  }

  const parsed = assetSchema.safeParse({
    asset_type: field(formData, "asset_type") || "other",
    assigned_to: field(formData, "assigned_to"),
    location: field(formData, "location"),
    manufacturer: field(formData, "manufacturer"),
    model: field(formData, "model"),
    name: field(formData, "name"),
    notes: field(formData, "notes"),
    purchase_cost: field(formData, "purchase_cost") || "",
    purchase_date: field(formData, "purchase_date"),
    serial_number: field(formData, "serial_number"),
    site_id: field(formData, "site_id"),
    status: field(formData, "status") || "in_use",
    warranty_expiry: field(formData, "warranty_expiry"),
  });

  if (!parsed.success) {
    assetError(parsed.error.issues[0]?.message ?? "Check the asset details.");
  }

  const assignedTo = nullableUuid(parsed.data.assigned_to);
  const supabase = getOpsSupabaseServiceClient();
  const { data: asset, error } = await supabase
    .from("it_assets")
    .insert({
      asset_type: parsed.data.asset_type,
      assigned_to: assignedTo,
      created_by: profile.id,
      location: parsed.data.location,
      manufacturer: parsed.data.manufacturer,
      model: parsed.data.model,
      name: parsed.data.name,
      notes: parsed.data.notes,
      purchase_cost: nullableNumber(parsed.data.purchase_cost),
      purchase_date: nullableDate(parsed.data.purchase_date),
      serial_number: parsed.data.serial_number,
      site_id: nullableUuid(parsed.data.site_id),
      status: parsed.data.status,
      warranty_expiry: nullableDate(parsed.data.warranty_expiry),
    })
    .select("id, asset_tag")
    .single<{ asset_tag: string; id: string }>();

  if (error || !asset) {
    assetError(error?.message ?? "Could not create the asset.");
  }

  if (assignedTo) {
    await supabase.from("it_asset_assignments").insert({
      asset_id: asset.id,
      assigned_to: assignedTo,
      created_by: profile.id,
    });
  }

  await recordOpsAuditEvent({
    action: "it_asset.create",
    actorUserId: profile.id,
    entityId: asset.id,
    entityType: "it_asset",
    moduleKey: "it-assets",
    sourceId: asset.id,
    sourceTable: "it_assets",
    summary: `Registered IT asset ${asset.asset_tag} (${parsed.data.name})`,
  });

  revalidatePath(ASSETS_ROUTE);
  redirect(`${ASSETS_ROUTE}?created=asset`);
}

export async function updateItAssetStatusAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageItAssets(profile.role)) {
    assetError("Your role cannot manage IT assets.");
  }

  const parsed = statusSchema.safeParse({
    asset_id: field(formData, "asset_id"),
    status: field(formData, "status"),
  });

  if (!parsed.success) {
    assetError(parsed.error.issues[0]?.message ?? "Select a valid status.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_assets")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.asset_id)
    .is("archived_at", null);

  if (error) {
    assetError(error.message);
  }

  await recordOpsAuditEvent({
    action: "it_asset.status",
    actorUserId: profile.id,
    entityId: parsed.data.asset_id,
    entityType: "it_asset",
    metadata: { status: parsed.data.status },
    moduleKey: "it-assets",
    sourceId: parsed.data.asset_id,
    sourceTable: "it_assets",
    summary: `Set IT asset status to ${parsed.data.status}`,
  });

  revalidatePath(ASSETS_ROUTE);
  redirect(`${ASSETS_ROUTE}?updated=status`);
}

export async function assignItAssetAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageItAssets(profile.role)) {
    assetError("Your role cannot manage IT assets.");
  }

  const parsed = assignSchema.safeParse({
    asset_id: field(formData, "asset_id"),
    assigned_to: field(formData, "assigned_to"),
    note: field(formData, "note"),
  });

  if (!parsed.success) {
    assetError(parsed.error.issues[0]?.message ?? "Select who to assign the asset to.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: current, error: fetchError } = await supabase
    .from("it_assets")
    .select("id, assigned_to")
    .eq("id", parsed.data.asset_id)
    .is("archived_at", null)
    .maybeSingle<{ assigned_to: string | null; id: string }>();

  if (fetchError) {
    assetError(fetchError.message);
  }
  if (!current) {
    assetError("That asset no longer exists.");
  }

  const nextHolder = nullableUuid(parsed.data.assigned_to);
  if (current.assigned_to === nextHolder) {
    redirect(`${ASSETS_ROUTE}?updated=assignment`);
  }

  const { error: updateError } = await supabase
    .from("it_assets")
    .update({ assigned_to: nextHolder })
    .eq("id", parsed.data.asset_id);

  if (updateError) {
    assetError(updateError.message);
  }

  // Close the open assignment record, then open a new one for the new holder.
  await supabase
    .from("it_asset_assignments")
    .update({ released_at: new Date().toISOString() })
    .eq("asset_id", parsed.data.asset_id)
    .is("released_at", null);

  if (nextHolder) {
    await supabase.from("it_asset_assignments").insert({
      asset_id: parsed.data.asset_id,
      assigned_to: nextHolder,
      created_by: profile.id,
      note: parsed.data.note,
    });
  }

  await recordOpsAuditEvent({
    action: "it_asset.assign",
    actorUserId: profile.id,
    entityId: parsed.data.asset_id,
    entityType: "it_asset",
    metadata: { assigned_to: nextHolder },
    moduleKey: "it-assets",
    sourceId: parsed.data.asset_id,
    sourceTable: "it_assets",
    summary: nextHolder ? "Assigned IT asset to staff" : "Released IT asset",
  });

  revalidatePath(ASSETS_ROUTE);
  redirect(`${ASSETS_ROUTE}?updated=assignment`);
}

export async function archiveItAssetAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageItAssets(profile.role)) {
    assetError("Your role cannot manage IT assets.");
  }

  const parsed = assetIdSchema.safeParse({ asset_id: field(formData, "asset_id") });
  if (!parsed.success) {
    assetError("Select an asset to archive.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_assets")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", parsed.data.asset_id)
    .is("archived_at", null);

  if (error) {
    assetError(error.message);
  }

  await recordOpsAuditEvent({
    action: "it_asset.archive",
    actorUserId: profile.id,
    entityId: parsed.data.asset_id,
    entityType: "it_asset",
    moduleKey: "it-assets",
    sourceId: parsed.data.asset_id,
    sourceTable: "it_assets",
    summary: "Archived IT asset",
  });

  revalidatePath(ASSETS_ROUTE);
  redirect(`${ASSETS_ROUTE}?updated=archived`);
}
