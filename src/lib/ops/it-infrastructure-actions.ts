"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { canManageIT } from "@/lib/ops/it-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsItNetworkDeviceType, OpsItNetworkStatus } from "@/lib/ops/types";

const ROUTE = "/ops/it/infrastructure";

const TYPES = [
  "router",
  "switch",
  "access_point",
  "firewall",
  "server",
  "isp_link",
  "other",
] as const satisfies readonly OpsItNetworkDeviceType[];

const STATUSES = [
  "online",
  "offline",
  "maintenance",
  "retired",
] as const satisfies readonly OpsItNetworkStatus[];

const deviceSchema = z.object({
  device_type: z.enum(TYPES).default("other"),
  ip_address: z.string().trim().max(64).default(""),
  isp_provider: z.string().trim().max(120).default(""),
  location: z.string().trim().max(160).default(""),
  name: z.string().trim().min(2, "Name the device.").max(160),
  notes: z.string().trim().max(800).default(""),
  site_id: z.string().trim().default(""),
  status: z.enum(STATUSES).default("online"),
});

const idSchema = z.object({ device_id: z.string().uuid("Select a device.") });
const statusSchema = idSchema.extend({ status: z.enum(STATUSES) });

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function deviceError(message: string): never {
  redirect(`${ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

export async function createItNetworkDeviceAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    deviceError("Your role cannot manage IT infrastructure.");
  }

  const parsed = deviceSchema.safeParse({
    device_type: field(formData, "device_type") || "other",
    ip_address: field(formData, "ip_address"),
    isp_provider: field(formData, "isp_provider"),
    location: field(formData, "location"),
    name: field(formData, "name"),
    notes: field(formData, "notes"),
    site_id: field(formData, "site_id"),
    status: field(formData, "status") || "online",
  });
  if (!parsed.success) {
    deviceError(parsed.error.issues[0]?.message ?? "Check the device details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_network_devices")
    .insert({
      created_by: profile.id,
      device_type: parsed.data.device_type,
      ip_address: parsed.data.ip_address,
      isp_provider: parsed.data.isp_provider,
      last_checked_at: new Date().toISOString(),
      location: parsed.data.location,
      name: parsed.data.name,
      notes: parsed.data.notes,
      site_id: parsed.data.site_id || null,
      status: parsed.data.status,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    deviceError(error?.message ?? "Could not add the device.");
  }

  await recordOpsAuditEvent({
    action: "it_network_device.create",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "it_network_device",
    moduleKey: "it-infrastructure",
    sourceId: data.id,
    sourceTable: "it_network_devices",
    summary: `Added network device ${parsed.data.name}`,
  });

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?created=device`);
}

export async function setItNetworkDeviceStatusAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    deviceError("Your role cannot manage IT infrastructure.");
  }

  const parsed = statusSchema.safeParse({
    device_id: field(formData, "device_id"),
    status: field(formData, "status"),
  });
  if (!parsed.success) {
    deviceError("Select a valid status.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_network_devices")
    .update({ last_checked_at: new Date().toISOString(), status: parsed.data.status })
    .eq("id", parsed.data.device_id)
    .is("archived_at", null);
  if (error) {
    deviceError(error.message);
  }

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=status`);
}

export async function archiveItNetworkDeviceAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    deviceError("Your role cannot manage IT infrastructure.");
  }

  const parsed = idSchema.safeParse({ device_id: field(formData, "device_id") });
  if (!parsed.success) {
    deviceError("Select a device to archive.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_network_devices")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", parsed.data.device_id)
    .is("archived_at", null);
  if (error) {
    deviceError(error.message);
  }

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=archived`);
}
