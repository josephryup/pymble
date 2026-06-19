"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  OPS_HSE_ESCALATION_NOTIFICATION_ROLES,
  OPS_HSE_REVIEW_NOTIFICATION_ROLES,
  queueOpsHseRoleNotifications,
  queueOpsHseUserNotification,
} from "@/lib/ops/hse-notifications";
import { fanoutToOpsRoles } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import {
  canCancelOpsCorrectiveAction,
  canCancelOpsHseIncident,
  canCloseOpsHseIncident,
  canCompleteOpsCorrectiveAction,
  canCreateOpsCorrectiveAction,
  canCreateOpsHseIncident,
  canRequireOpsCorrectiveAction,
  canStartOpsCorrectiveAction,
  canStartOpsHseInvestigation,
  canVerifyOpsCorrectiveAction,
} from "@/lib/ops/hse-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsCorrectiveActionStatus,
  OpsHseIncidentSeverity,
  OpsHseIncidentStatus,
  OpsHseIncidentType,
  OpsPriority,
} from "@/lib/ops/types";

const HSE_ROUTE = "/ops/hse";

const incidentTypes = [
  "near_miss",
  "first_aid",
  "medical_treatment",
  "lost_time",
  "property_damage",
  "environmental",
  "unsafe_condition",
  "other",
] as const satisfies readonly OpsHseIncidentType[];

const incidentSeverities = [
  "low",
  "medium",
  "high",
  "critical",
] as const satisfies readonly OpsHseIncidentSeverity[];

const priorities = ["low", "normal", "high", "urgent"] as const satisfies readonly OpsPriority[];

const createIncidentSchema = z.object({
  description: z.string().trim().max(1400).default(""),
  immediate_action: z.string().trim().max(1000).default(""),
  incident_type: z.enum(incidentTypes),
  location_detail: z.string().trim().max(180).default(""),
  occurred_at: z.string().trim().default(""),
  people_involved: z.string().trim().max(500).default(""),
  severity: z.enum(incidentSeverities),
  site_id: z.string().uuid("Select a site."),
  title: z.string().trim().min(2, "Incident title is required.").max(180),
});

const incidentIdSchema = z.object({
  incident_id: z.string().uuid("Select an incident."),
});

const actionIdSchema = z.object({
  action_id: z.string().uuid("Select a corrective action."),
});

const actionRequiredSchema = incidentIdSchema.extend({
  investigation_summary: z.string().trim().max(1400).default(""),
  root_cause: z.string().trim().max(800).default(""),
});

const closeIncidentSchema = incidentIdSchema.extend({
  close_summary: z.string().trim().max(1000).default(""),
});

const correctiveActionSchema = z.object({
  description: z.string().trim().max(1000).default(""),
  due_date: z.string().trim().default(""),
  incident_id: z.string().trim().default(""),
  owner_id: z.string().trim().default(""),
  priority: z.enum(priorities),
  site_id: z.string().uuid("Select a site."),
  title: z.string().trim().min(2, "Corrective action title is required.").max(180),
});

const completeActionSchema = actionIdSchema.extend({
  completion_notes: z.string().trim().max(1000).default(""),
});

const verifyActionSchema = actionIdSchema.extend({
  verification_notes: z.string().trim().max(1000).default(""),
});

type SiteForHse = {
  id: string;
  is_active: boolean;
};

type HseIncidentForMutation = {
  created_by: string | null;
  id: string;
  incident_number: string;
  site_id: string;
  status: OpsHseIncidentStatus;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
};

type CorrectiveActionForMutation = {
  action_number: string;
  created_by: string | null;
  id: string;
  incident_id: string | null;
  site_id: string;
  status: OpsCorrectiveActionStatus;
  title: string;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function hseError(message: string): never {
  redirect(`${HSE_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function normalizeOptionalUuid(value: string) {
  return value || null;
}

function normalizeDate(value: string, fallback = new Date().toISOString().slice(0, 10)) {
  const date = value || fallback;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    hseError("Use a valid date.");
  }

  return date;
}

function normalizeDateTimeFromDate(value: string) {
  return new Date(`${normalizeDate(value)}T12:00:00+02:00`).toISOString();
}

function normalizeOptionalDate(value: string) {
  if (!value) {
    return null;
  }

  return normalizeDate(value);
}

function isHighOrCriticalSeverity(value: OpsHseIncidentSeverity) {
  return value === "high" || value === "critical";
}

function isEscalatedCorrectiveActionPriority(value: OpsPriority) {
  return value === "high" || value === "urgent";
}

async function fetchSite(siteId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("sites")
    .select("id, is_active")
    .eq("id", siteId)
    .maybeSingle<SiteForHse>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchIncident(incidentId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("hse_incidents")
    .select("id, incident_number, site_id, title, status, severity, created_by")
    .eq("id", incidentId)
    .maybeSingle<HseIncidentForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchCorrectiveAction(actionId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("corrective_actions")
    .select("id, action_number, incident_id, site_id, title, status, created_by")
    .eq("id", actionId)
    .maybeSingle<CorrectiveActionForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function assertActiveSite(siteId: string) {
  const site = await fetchSite(siteId);

  if (!site || !site.is_active) {
    hseError("Select an active site.");
  }

  return site;
}

export async function createHseIncidentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsHseIncident(profile.role)) {
    hseError("Your role cannot create HSE incidents.");
  }

  const parsed = createIncidentSchema.safeParse({
    description: field(formData, "description"),
    immediate_action: field(formData, "immediate_action"),
    incident_type: field(formData, "incident_type") || "other",
    location_detail: field(formData, "location_detail"),
    occurred_at: field(formData, "occurred_at"),
    people_involved: field(formData, "people_involved"),
    severity: field(formData, "severity") || "medium",
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    hseError(parsed.error.issues[0]?.message ?? "Check the incident details.");
  }

  await assertActiveSite(parsed.data.site_id);

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("hse_incidents")
    .insert({
      created_by: profile.id,
      description: parsed.data.description,
      immediate_action: parsed.data.immediate_action,
      incident_type: parsed.data.incident_type,
      location_detail: parsed.data.location_detail,
      occurred_at: normalizeDateTimeFromDate(parsed.data.occurred_at),
      people_involved: parsed.data.people_involved,
      reported_by: profile.id,
      severity: parsed.data.severity,
      site_id: parsed.data.site_id,
      title: parsed.data.title,
    })
    .select("id, incident_number")
    .single<{ id: string; incident_number: string }>();

  if (error || !data) {
    hseError(error?.message ?? "Could not create incident.");
  }

  await recordOpsAuditEvent({
    action: "hse_incident.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "hse_incident",
    metadata: { incident_number: data.incident_number },
    moduleKey: "hse",
    sourceId: data.id,
    sourceTable: "hse_incidents",
    summary: `Created HSE incident ${data.incident_number}`,
  });

  await queueOpsHseRoleNotifications({
    actionHref: `${HSE_ROUTE}#incident-register`,
    actorUserId: profile.id,
    body: `${profile.full_name} reported ${data.incident_number} with ${parsed.data.severity} severity.`,
    idempotencyKeyPrefix: `hse-incident-reported:${data.id}`,
    moduleKey: "hse",
    recipientRoles: isHighOrCriticalSeverity(parsed.data.severity)
      ? OPS_HSE_ESCALATION_NOTIFICATION_ROLES
      : OPS_HSE_REVIEW_NOTIFICATION_ROLES,
    sendCriticalEmail: isHighOrCriticalSeverity(parsed.data.severity),
    sourceId: data.id,
    sourceTable: "hse_incidents",
    title: isHighOrCriticalSeverity(parsed.data.severity)
      ? "High severity HSE incident"
      : "HSE incident reported",
  }).catch(() => null);

  revalidatePath(HSE_ROUTE);
  revalidatePath("/ops/notifications");
  redirect(`${HSE_ROUTE}?created=incident`);
}

export async function startHseInvestigationAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = incidentIdSchema.safeParse({ incident_id: field(formData, "incident_id") });

  if (!parsed.success) {
    hseError(parsed.error.issues[0]?.message ?? "Select an incident.");
  }

  const incident = await fetchIncident(parsed.data.incident_id);

  if (!incident) {
    hseError("Incident was not found.");
  }

  if (!canStartOpsHseInvestigation(profile.role, incident)) {
    hseError("Your role cannot start this investigation.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("hse_incidents")
    .update({
      assigned_to: profile.id,
      investigation_started_at: new Date().toISOString(),
      status: "investigating",
    })
    .eq("id", incident.id);

  if (error) {
    hseError(error.message);
  }

  await recordOpsAuditEvent({
    action: "hse_incident.investigation_started",
    actorUserId: profile.id,
    entityId: incident.id,
    entityType: "hse_incident",
    metadata: { incident_number: incident.incident_number },
    moduleKey: "hse",
    sourceId: incident.id,
    sourceTable: "hse_incidents",
    summary: `Started investigation for ${incident.incident_number}`,
  });

  revalidatePath(HSE_ROUTE);
  redirect(`${HSE_ROUTE}?updated=investigating`);
}

export async function requireHseCorrectiveActionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = actionRequiredSchema.safeParse({
    incident_id: field(formData, "incident_id"),
    investigation_summary: field(formData, "investigation_summary"),
    root_cause: field(formData, "root_cause"),
  });

  if (!parsed.success) {
    hseError(parsed.error.issues[0]?.message ?? "Check the investigation details.");
  }

  const incident = await fetchIncident(parsed.data.incident_id);

  if (!incident) {
    hseError("Incident was not found.");
  }

  if (!canRequireOpsCorrectiveAction(profile.role, incident)) {
    hseError("Your role cannot move this incident to corrective action.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("hse_incidents")
    .update({
      assigned_to: profile.id,
      investigation_summary: parsed.data.investigation_summary,
      root_cause: parsed.data.root_cause,
      status: "action_required",
    })
    .eq("id", incident.id);

  if (error) {
    hseError(error.message);
  }

  await recordOpsAuditEvent({
    action: "hse_incident.action_required",
    actorUserId: profile.id,
    entityId: incident.id,
    entityType: "hse_incident",
    metadata: { incident_number: incident.incident_number },
    moduleKey: "hse",
    sourceId: incident.id,
    sourceTable: "hse_incidents",
    summary: `Marked ${incident.incident_number} for corrective action`,
  });

  await queueOpsHseRoleNotifications({
    actionHref: `${HSE_ROUTE}#incident-register`,
    actorUserId: profile.id,
    body: `${incident.incident_number} now requires corrective action.`,
    idempotencyKeyPrefix: `hse-incident-action-required:${incident.id}`,
    moduleKey: "hse",
    recipientRoles: OPS_HSE_ESCALATION_NOTIFICATION_ROLES,
    sendCriticalEmail: true,
    sourceId: incident.id,
    sourceTable: "hse_incidents",
    title: "HSE corrective action required",
  }).catch(() => null);

  revalidatePath(HSE_ROUTE);
  revalidatePath("/ops/notifications");
  redirect(`${HSE_ROUTE}?updated=action_required`);
}

export async function closeHseIncidentAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = closeIncidentSchema.safeParse({
    close_summary: field(formData, "close_summary"),
    incident_id: field(formData, "incident_id"),
  });

  if (!parsed.success) {
    hseError(parsed.error.issues[0]?.message ?? "Select an incident.");
  }

  const incident = await fetchIncident(parsed.data.incident_id);

  if (!incident) {
    hseError("Incident was not found.");
  }

  if (!canCloseOpsHseIncident(profile.role, incident)) {
    hseError("Your role cannot close this incident.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("hse_incidents")
    .update({
      closed_at: new Date().toISOString(),
      closed_by: profile.id,
      investigation_summary: parsed.data.close_summary || undefined,
      status: "closed",
    })
    .eq("id", incident.id);

  if (error) {
    hseError(error.message);
  }

  await recordOpsAuditEvent({
    action: "hse_incident.closed",
    actorUserId: profile.id,
    entityId: incident.id,
    entityType: "hse_incident",
    metadata: { incident_number: incident.incident_number, severity: incident.severity },
    moduleKey: "hse",
    sourceId: incident.id,
    sourceTable: "hse_incidents",
    summary: `Closed HSE incident ${incident.incident_number}`,
  });

  // K4: notify leadership when an HSE incident is closed, especially for high
  // / critical severity. Per Part 2.7 of the workflow design.
  const leadership = await fanoutToOpsRoles(
    ["engineering_manager", "general_manager", "managing_director", "owner"],
    { excludeUserIds: [profile.id] },
  );
  const severityBadge = incident.severity.toUpperCase();
  await Promise.all(
    leadership.map((recipient) =>
      queueOpsNotification({
        actionHref: `${HSE_ROUTE}#hi-${incident.id}`,
        body: `${profile.full_name} closed ${incident.incident_number} (${severityBadge} severity): ${incident.title}.`,
        idempotencyKey: `hse-incident-closed:${incident.id}:${recipient.id}`,
        moduleKey: "hse",
        recipientId: recipient.id,
        sourceId: incident.id,
        sourceTable: "hse_incidents",
        title: `HSE incident closed: ${incident.incident_number}`,
      }).catch(() => null),
    ),
  );

  revalidatePath(HSE_ROUTE);
  revalidatePath("/ops/notifications");
  redirect(`${HSE_ROUTE}?updated=closed`);
}

export async function cancelHseIncidentAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = incidentIdSchema.safeParse({ incident_id: field(formData, "incident_id") });

  if (!parsed.success) {
    hseError(parsed.error.issues[0]?.message ?? "Select an incident.");
  }

  const incident = await fetchIncident(parsed.data.incident_id);

  if (!incident) {
    hseError("Incident was not found.");
  }

  if (!canCancelOpsHseIncident(profile.role, incident)) {
    hseError("Your role cannot cancel this incident.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("hse_incidents")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: profile.id,
      status: "cancelled",
    })
    .eq("id", incident.id);

  if (error) {
    hseError(error.message);
  }

  await recordOpsAuditEvent({
    action: "hse_incident.cancelled",
    actorUserId: profile.id,
    entityId: incident.id,
    entityType: "hse_incident",
    metadata: { incident_number: incident.incident_number },
    moduleKey: "hse",
    sourceId: incident.id,
    sourceTable: "hse_incidents",
    summary: `Cancelled HSE incident ${incident.incident_number}`,
  });

  revalidatePath(HSE_ROUTE);
  redirect(`${HSE_ROUTE}?updated=cancelled`);
}

export async function createCorrectiveActionAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsCorrectiveAction(profile.role)) {
    hseError("Your role cannot create corrective actions.");
  }

  const parsed = correctiveActionSchema.safeParse({
    description: field(formData, "description"),
    due_date: field(formData, "due_date"),
    incident_id: field(formData, "incident_id"),
    owner_id: field(formData, "owner_id"),
    priority: field(formData, "priority") || "normal",
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    hseError(parsed.error.issues[0]?.message ?? "Check the corrective action.");
  }

  const incident = parsed.data.incident_id ? await fetchIncident(parsed.data.incident_id) : null;
  const siteId = incident?.site_id ?? parsed.data.site_id;
  const ownerId = normalizeOptionalUuid(parsed.data.owner_id);
  await assertActiveSite(siteId);

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("corrective_actions")
    .insert({
      created_by: profile.id,
      description: parsed.data.description,
      due_date: normalizeOptionalDate(parsed.data.due_date),
      incident_id: incident?.id ?? null,
      owner_id: ownerId,
      priority: parsed.data.priority,
      site_id: siteId,
      title: parsed.data.title,
    })
    .select("id, action_number")
    .single<{ action_number: string; id: string }>();

  if (error || !data) {
    hseError(error?.message ?? "Could not create corrective action.");
  }

  await recordOpsAuditEvent({
    action: "corrective_action.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "corrective_action",
    metadata: { action_number: data.action_number, incident_id: incident?.id ?? null },
    moduleKey: "hse",
    sourceId: data.id,
    sourceTable: "corrective_actions",
    summary: `Created corrective action ${data.action_number}`,
  });

  await queueOpsHseUserNotification({
    actionHref: `${HSE_ROUTE}#incident-register`,
    actorUserId: profile.id,
    body: `${profile.full_name} assigned corrective action ${data.action_number} to you.`,
    idempotencyKeyPrefix: `hse-action-assigned:${data.id}`,
    moduleKey: "hse",
    recipientId: ownerId,
    sendCriticalEmail: isEscalatedCorrectiveActionPriority(parsed.data.priority),
    sourceId: data.id,
    sourceTable: "corrective_actions",
    title: "HSE corrective action assigned",
  }).catch(() => null);

  if (isEscalatedCorrectiveActionPriority(parsed.data.priority)) {
    await queueOpsHseRoleNotifications({
      actionHref: `${HSE_ROUTE}#incident-register`,
      actorUserId: profile.id,
      body: `${data.action_number} was created with ${parsed.data.priority} priority.`,
      idempotencyKeyPrefix: `hse-action-priority:${data.id}`,
      moduleKey: "hse",
      recipientRoles: OPS_HSE_ESCALATION_NOTIFICATION_ROLES,
      sendCriticalEmail: true,
      sourceId: data.id,
      sourceTable: "corrective_actions",
      title: "Priority HSE corrective action",
    }).catch(() => null);
  }

  revalidatePath(HSE_ROUTE);
  revalidatePath("/ops/notifications");
  redirect(`${HSE_ROUTE}?created=action`);
}

export async function startCorrectiveActionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = actionIdSchema.safeParse({ action_id: field(formData, "action_id") });

  if (!parsed.success) {
    hseError(parsed.error.issues[0]?.message ?? "Select a corrective action.");
  }

  const action = await fetchCorrectiveAction(parsed.data.action_id);

  if (!action) {
    hseError("Corrective action was not found.");
  }

  if (!canStartOpsCorrectiveAction(profile.role, action)) {
    hseError("Your role cannot start this corrective action.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("corrective_actions")
    .update({ status: "in_progress" })
    .eq("id", action.id);

  if (error) {
    hseError(error.message);
  }

  revalidatePath(HSE_ROUTE);
  redirect(`${HSE_ROUTE}?updated=action_started`);
}

export async function completeCorrectiveActionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = completeActionSchema.safeParse({
    action_id: field(formData, "action_id"),
    completion_notes: field(formData, "completion_notes"),
  });

  if (!parsed.success) {
    hseError(parsed.error.issues[0]?.message ?? "Check completion notes.");
  }

  const action = await fetchCorrectiveAction(parsed.data.action_id);

  if (!action) {
    hseError("Corrective action was not found.");
  }

  if (!canCompleteOpsCorrectiveAction(profile.id, profile.role, action)) {
    hseError("Your role cannot complete this corrective action.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("corrective_actions")
    .update({
      completed_at: new Date().toISOString(),
      completed_by: profile.id,
      completion_notes: parsed.data.completion_notes,
      status: "completed",
    })
    .eq("id", action.id);

  if (error) {
    hseError(error.message);
  }

  revalidatePath(HSE_ROUTE);
  redirect(`${HSE_ROUTE}?updated=action_completed`);
}

export async function verifyCorrectiveActionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = verifyActionSchema.safeParse({
    action_id: field(formData, "action_id"),
    verification_notes: field(formData, "verification_notes"),
  });

  if (!parsed.success) {
    hseError(parsed.error.issues[0]?.message ?? "Check verification notes.");
  }

  const action = await fetchCorrectiveAction(parsed.data.action_id);

  if (!action) {
    hseError("Corrective action was not found.");
  }

  if (!canVerifyOpsCorrectiveAction(profile.role, action)) {
    hseError("Your role cannot verify this corrective action.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("corrective_actions")
    .update({
      status: "verified",
      verification_notes: parsed.data.verification_notes,
      verified_at: new Date().toISOString(),
      verified_by: profile.id,
    })
    .eq("id", action.id);

  if (error) {
    hseError(error.message);
  }

  revalidatePath(HSE_ROUTE);
  redirect(`${HSE_ROUTE}?updated=action_verified`);
}

export async function cancelCorrectiveActionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = actionIdSchema.safeParse({ action_id: field(formData, "action_id") });

  if (!parsed.success) {
    hseError(parsed.error.issues[0]?.message ?? "Select a corrective action.");
  }

  const action = await fetchCorrectiveAction(parsed.data.action_id);

  if (!action) {
    hseError("Corrective action was not found.");
  }

  if (!canCancelOpsCorrectiveAction(profile.role, action)) {
    hseError("Your role cannot cancel this corrective action.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("corrective_actions")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: profile.id,
      status: "cancelled",
    })
    .eq("id", action.id);

  if (error) {
    hseError(error.message);
  }

  revalidatePath(HSE_ROUTE);
  redirect(`${HSE_ROUTE}?updated=action_cancelled`);
}
