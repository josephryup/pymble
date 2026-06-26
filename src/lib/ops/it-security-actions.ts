"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { canManageIT } from "@/lib/ops/it-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsItBackupStatus,
  OpsItIncidentSeverity,
  OpsItIncidentStatus,
} from "@/lib/ops/types";

const ROUTE = "/ops/it/security";

const SEVERITY = ["low", "medium", "high", "critical"] as const satisfies readonly OpsItIncidentSeverity[];
const INCIDENT_STATUS = ["open", "investigating", "resolved"] as const satisfies readonly OpsItIncidentStatus[];
const BACKUP_STATUS = ["success", "failed", "in_progress"] as const satisfies readonly OpsItBackupStatus[];

const incidentSchema = z.object({
  severity: z.enum(SEVERITY).default("medium"),
  summary: z.string().trim().max(2000).default(""),
  title: z.string().trim().min(3, "Give the incident a title.").max(180),
});

const incidentStatusSchema = z.object({
  incident_id: z.string().uuid("Select an incident."),
  status: z.enum(INCIDENT_STATUS),
});

const incidentIdSchema = z.object({ incident_id: z.string().uuid("Select an incident.") });

const backupSchema = z.object({
  frequency: z.string().trim().max(80).default(""),
  name: z.string().trim().min(2, "Name the backup job.").max(160),
  notes: z.string().trim().max(800).default(""),
  status: z.enum(BACKUP_STATUS).default("success"),
  target: z.string().trim().max(200).default(""),
});

const backupStatusSchema = z.object({
  backup_id: z.string().uuid("Select a backup."),
  status: z.enum(BACKUP_STATUS),
});

const backupIdSchema = z.object({ backup_id: z.string().uuid("Select a backup.") });

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function securityError(message: string): never {
  redirect(`${ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

async function requireItManager() {
  const { profile } = await requireOpsUser();
  if (!canManageIT(profile.role)) {
    securityError("Your role cannot manage IT security records.");
  }
  return profile;
}

export async function createItSecurityIncidentAction(formData: FormData) {
  const profile = await requireItManager();

  const parsed = incidentSchema.safeParse({
    severity: field(formData, "severity") || "medium",
    summary: field(formData, "summary"),
    title: field(formData, "title"),
  });
  if (!parsed.success) {
    securityError(parsed.error.issues[0]?.message ?? "Check the incident details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_security_incidents")
    .insert({
      created_by: profile.id,
      severity: parsed.data.severity,
      status: "open",
      summary: parsed.data.summary,
      title: parsed.data.title,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    securityError(error?.message ?? "Could not log the incident.");
  }

  await recordOpsAuditEvent({
    action: "it_security_incident.create",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "it_security_incident",
    metadata: { severity: parsed.data.severity },
    moduleKey: "it-security",
    sourceId: data.id,
    sourceTable: "it_security_incidents",
    summary: `Logged security incident: ${parsed.data.title}`,
  });

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?created=incident`);
}

export async function setItSecurityIncidentStatusAction(formData: FormData) {
  const profile = await requireItManager();

  const parsed = incidentStatusSchema.safeParse({
    incident_id: field(formData, "incident_id"),
    status: field(formData, "status"),
  });
  if (!parsed.success) {
    securityError("Select a valid status.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_security_incidents")
    .update({
      resolved_at: parsed.data.status === "resolved" ? new Date().toISOString().slice(0, 10) : null,
      status: parsed.data.status,
    })
    .eq("id", parsed.data.incident_id)
    .is("archived_at", null);
  if (error) {
    securityError(error.message);
  }

  await recordOpsAuditEvent({
    action: "it_security_incident.status",
    actorUserId: profile.id,
    entityId: parsed.data.incident_id,
    entityType: "it_security_incident",
    metadata: { status: parsed.data.status },
    moduleKey: "it-security",
    sourceId: parsed.data.incident_id,
    sourceTable: "it_security_incidents",
    summary: `Set security incident to ${parsed.data.status}`,
  });

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=incident`);
}

export async function archiveItSecurityIncidentAction(formData: FormData) {
  const profile = await requireItManager();

  const parsed = incidentIdSchema.safeParse({ incident_id: field(formData, "incident_id") });
  if (!parsed.success) {
    securityError("Select an incident to archive.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_security_incidents")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", parsed.data.incident_id)
    .is("archived_at", null);
  if (error) {
    securityError(error.message);
  }

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=archived`);
}

export async function createItBackupRecordAction(formData: FormData) {
  const profile = await requireItManager();

  const parsed = backupSchema.safeParse({
    frequency: field(formData, "frequency"),
    name: field(formData, "name"),
    notes: field(formData, "notes"),
    status: field(formData, "status") || "success",
    target: field(formData, "target"),
  });
  if (!parsed.success) {
    securityError(parsed.error.issues[0]?.message ?? "Check the backup details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_backup_records")
    .insert({
      created_by: profile.id,
      frequency: parsed.data.frequency,
      last_run_at: new Date().toISOString(),
      name: parsed.data.name,
      notes: parsed.data.notes,
      status: parsed.data.status,
      target: parsed.data.target,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) {
    securityError(error?.message ?? "Could not add the backup record.");
  }

  await recordOpsAuditEvent({
    action: "it_backup.create",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "it_backup_record",
    moduleKey: "it-security",
    sourceId: data.id,
    sourceTable: "it_backup_records",
    summary: `Added backup job ${parsed.data.name}`,
  });

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?created=backup`);
}

export async function setItBackupStatusAction(formData: FormData) {
  await requireItManager();

  const parsed = backupStatusSchema.safeParse({
    backup_id: field(formData, "backup_id"),
    status: field(formData, "status"),
  });
  if (!parsed.success) {
    securityError("Select a valid status.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_backup_records")
    .update({ last_run_at: new Date().toISOString(), status: parsed.data.status })
    .eq("id", parsed.data.backup_id)
    .is("archived_at", null);
  if (error) {
    securityError(error.message);
  }

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=backup`);
}

export async function archiveItBackupRecordAction(formData: FormData) {
  const profile = await requireItManager();

  const parsed = backupIdSchema.safeParse({ backup_id: field(formData, "backup_id") });
  if (!parsed.success) {
    securityError("Select a backup to archive.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_backup_records")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", parsed.data.backup_id)
    .is("archived_at", null);
  if (error) {
    securityError(error.message);
  }

  revalidatePath(ROUTE);
  redirect(`${ROUTE}?updated=archived`);
}
