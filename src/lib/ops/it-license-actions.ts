"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { canManageIT } from "@/lib/ops/it-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsItLicenseBilling, OpsItLicenseStatus } from "@/lib/ops/types";

const ROUTE = "/ops/it/licenses";

const BILLING = ["monthly", "annual", "one_time"] as const satisfies readonly OpsItLicenseBilling[];
const STATUS = ["active", "cancelled"] as const satisfies readonly OpsItLicenseStatus[];

const licenseSchema = z.object({
  billing: z.enum(BILLING).default("annual"),
  name: z.string().trim().min(2, "Name the software.").max(160),
  notes: z.string().trim().max(800).default(""),
  renewal_date: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), { message: "Use a valid date." })
    .default(""),
  seats_total: z.coerce.number().int().min(0).optional().or(z.literal("")),
  seats_used: z.coerce.number().int().min(0).optional().or(z.literal("")),
  unit_cost: z.coerce.number().min(0).optional().or(z.literal("")),
  vendor: z.string().trim().max(160).default(""),
});

const idSchema = z.object({ license_id: z.string().uuid("Select a licence.") });
const statusSchema = idSchema.extend({ status: z.enum(STATUS) });

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function licenseError(message: string): never {
  redirect(`${ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function nNum(value: number | "" | undefined) {
  return value === "" || value === undefined ? null : value;
}

export async function createItLicenseAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    licenseError("Your role cannot manage IT licences.");
  }

  const parsed = licenseSchema.safeParse({
    billing: field(formData, "billing") || "annual",
    name: field(formData, "name"),
    notes: field(formData, "notes"),
    renewal_date: field(formData, "renewal_date"),
    seats_total: field(formData, "seats_total") || "",
    seats_used: field(formData, "seats_used") || "",
    unit_cost: field(formData, "unit_cost") || "",
    vendor: field(formData, "vendor"),
  });
  if (!parsed.success) {
    licenseError(parsed.error.issues[0]?.message ?? "Check the licence details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_software_licenses")
    .insert({
      billing: parsed.data.billing,
      created_by: profile.id,
      name: parsed.data.name,
      notes: parsed.data.notes,
      renewal_date: parsed.data.renewal_date || null,
      seats_total: nNum(parsed.data.seats_total),
      seats_used: nNum(parsed.data.seats_used) ?? 0,
      status: "active",
      unit_cost: nNum(parsed.data.unit_cost),
      vendor: parsed.data.vendor,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    licenseError(error?.message ?? "Could not add the licence.");
  }

  await recordOpsAuditEvent({
    action: "it_license.create",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "it_software_license",
    moduleKey: "it-licenses",
    sourceId: data.id,
    sourceTable: "it_software_licenses",
    summary: `Added software licence ${parsed.data.name}`,
  });

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?created=license`);
}

export async function setItLicenseStatusAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    licenseError("Your role cannot manage IT licences.");
  }

  const parsed = statusSchema.safeParse({
    license_id: field(formData, "license_id"),
    status: field(formData, "status"),
  });
  if (!parsed.success) {
    licenseError("Select a valid status.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_software_licenses")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.license_id)
    .is("archived_at", null);
  if (error) {
    licenseError(error.message);
  }

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=status`);
}

export async function archiveItLicenseAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    licenseError("Your role cannot manage IT licences.");
  }

  const parsed = idSchema.safeParse({ license_id: field(formData, "license_id") });
  if (!parsed.success) {
    licenseError("Select a licence to archive.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_software_licenses")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", parsed.data.license_id)
    .is("archived_at", null);
  if (error) {
    licenseError(error.message);
  }

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=archived`);
}
