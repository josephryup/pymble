"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { canManageItTickets, canRaiseItTicket } from "@/lib/ops/it-permissions";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsItTicketCategory,
  OpsItTicketPriority,
  OpsItTicketStatus,
  OpsUserRole,
} from "@/lib/ops/types";

const HELPDESK_ROUTE = "/ops/it/helpdesk";
const MINE_ROUTE = "/ops/it/helpdesk/mine";

// Mirrors OPS_IT_ROLES — who staffs and oversees the help-desk queue.
const IT_NOTIFY_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "it_manager",
];

/** Notify the IT staff/oversight that a ticket needs attention. */
async function notifyItStaff(input: {
  actorId: string;
  body: string;
  idempotencyKey: string;
  ticketId: string;
  title: string;
}) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .in("role", IT_NOTIFY_ROLES)
    .eq("is_active", true);
  if (error) {
    return;
  }
  await Promise.all(
    (data ?? [])
      .map((row) => (row as { id: string }).id)
      .filter((id) => id !== input.actorId)
      .map((recipientId) =>
        queueOpsNotification({
          actionHref: `${HELPDESK_ROUTE}/${input.ticketId}`,
          body: input.body,
          idempotencyKey: `${input.idempotencyKey}:${recipientId}`,
          moduleKey: "it-helpdesk",
          recipientId,
          sourceId: input.ticketId,
          sourceTable: "it_tickets",
          title: input.title,
        }).catch(() => null),
      ),
  );
}

/** Notify a single named user (assignee or requester). */
async function notifyItUser(input: {
  actionHref: string;
  body: string;
  idempotencyKey: string;
  recipientId: string | null | undefined;
  ticketId: string;
  title: string;
}) {
  if (!input.recipientId) {
    return;
  }
  await queueOpsNotification({
    actionHref: input.actionHref,
    body: input.body,
    idempotencyKey: input.idempotencyKey,
    moduleKey: "it-helpdesk",
    recipientId: input.recipientId,
    sourceId: input.ticketId,
    sourceTable: "it_tickets",
    title: input.title,
  }).catch(() => null);
}

const TICKET_CATEGORIES = [
  "hardware",
  "software",
  "network",
  "email",
  "access",
  "printing",
  "site_connectivity",
  "security",
  "other",
] as const satisfies readonly OpsItTicketCategory[];

const TICKET_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const satisfies readonly OpsItTicketPriority[];

const TICKET_STATUSES = [
  "open",
  "in_progress",
  "on_hold",
  "awaiting_user",
  "resolved",
  "closed",
  "cancelled",
] as const satisfies readonly OpsItTicketStatus[];

const raiseSchema = z.object({
  category: z.enum(TICKET_CATEGORIES).default("other"),
  description: z.string().trim().max(2000).default(""),
  priority: z.enum(TICKET_PRIORITIES).default("normal"),
  site_id: z.string().trim().default(""),
  title: z.string().trim().min(4, "Describe the problem in the title.").max(160),
});

const ticketIdSchema = z.object({ ticket_id: z.string().uuid("Select a ticket.") });

const statusSchema = ticketIdSchema.extend({
  resolution_notes: z.string().trim().max(2000).default(""),
  status: z.enum(TICKET_STATUSES),
});

const assignSchema = ticketIdSchema.extend({
  assigned_to: z.string().trim().default(""),
});

const commentSchema = ticketIdSchema.extend({
  body: z.string().trim().min(1, "Write a comment.").max(2000),
  is_internal: z.enum(["true", "false"]).default("false"),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function helpdeskError(route: string, message: string): never {
  redirect(`${route}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function nullableUuid(value: string) {
  return value === "" ? null : value;
}

export async function raiseItTicketAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canRaiseItTicket(profile.role)) {
    helpdeskError(MINE_ROUTE, "Your role cannot raise IT tickets.");
  }

  const parsed = raiseSchema.safeParse({
    category: field(formData, "category") || "other",
    description: field(formData, "description"),
    priority: field(formData, "priority") || "normal",
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    helpdeskError(
      `${HELPDESK_ROUTE}/new`,
      parsed.error.issues[0]?.message ?? "Check the ticket details.",
    );
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: ticket, error } = await supabase
    .from("it_tickets")
    .insert({
      category: parsed.data.category,
      created_by: profile.id,
      description: parsed.data.description,
      priority: parsed.data.priority,
      raised_by: profile.id,
      site_id: nullableUuid(parsed.data.site_id),
      status: "open",
      title: parsed.data.title,
    })
    .select("id, ticket_ref")
    .single<{ id: string; ticket_ref: string }>();

  if (error || !ticket) {
    helpdeskError(`${HELPDESK_ROUTE}/new`, error?.message ?? "Could not raise the ticket.");
  }

  await recordOpsAuditEvent({
    action: "it_ticket.create",
    actorUserId: profile.id,
    entityId: ticket.id,
    entityType: "it_ticket",
    metadata: { category: parsed.data.category, priority: parsed.data.priority },
    moduleKey: "it-helpdesk",
    sourceId: ticket.id,
    sourceTable: "it_tickets",
    summary: `Raised IT ticket ${ticket.ticket_ref}: ${parsed.data.title}`,
  });

  await notifyItStaff({
    actorId: profile.id,
    body: `${ticket.ticket_ref}: ${parsed.data.title} (${parsed.data.priority})`,
    idempotencyKey: `it-ticket-raised:${ticket.id}`,
    ticketId: ticket.id,
    title: "New IT support ticket",
  });

  revalidatePath(HELPDESK_ROUTE);
  revalidatePath(MINE_ROUTE);
  redirect(`${MINE_ROUTE}?created=ticket`);
}

export async function updateItTicketStatusAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageItTickets(profile.role)) {
    helpdeskError(HELPDESK_ROUTE, "Your role cannot manage the help-desk queue.");
  }

  const parsed = statusSchema.safeParse({
    resolution_notes: field(formData, "resolution_notes"),
    status: field(formData, "status"),
    ticket_id: field(formData, "ticket_id"),
  });

  if (!parsed.success) {
    helpdeskError(HELPDESK_ROUTE, parsed.error.issues[0]?.message ?? "Select a valid status.");
  }

  const ticketRoute = `${HELPDESK_ROUTE}/${parsed.data.ticket_id}`;
  const supabase = getOpsSupabaseServiceClient();
  const { data: current, error: fetchError } = await supabase
    .from("it_tickets")
    .select("id, first_response_at, raised_by, ticket_ref")
    .eq("id", parsed.data.ticket_id)
    .is("archived_at", null)
    .maybeSingle<{
      first_response_at: string | null;
      id: string;
      raised_by: string | null;
      ticket_ref: string;
    }>();

  if (fetchError) {
    helpdeskError(ticketRoute, fetchError.message);
  }
  if (!current) {
    helpdeskError(HELPDESK_ROUTE, "That ticket no longer exists.");
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status: parsed.data.status };
  if (!current.first_response_at) {
    update.first_response_at = now;
  }
  if (parsed.data.resolution_notes) {
    update.resolution_notes = parsed.data.resolution_notes;
  }
  if (parsed.data.status === "resolved") {
    update.resolved_at = now;
  }
  if (parsed.data.status === "closed") {
    update.closed_at = now;
  }

  const { error } = await supabase
    .from("it_tickets")
    .update(update)
    .eq("id", parsed.data.ticket_id);

  if (error) {
    helpdeskError(ticketRoute, error.message);
  }

  await recordOpsAuditEvent({
    action: "it_ticket.status",
    actorUserId: profile.id,
    entityId: parsed.data.ticket_id,
    entityType: "it_ticket",
    metadata: { status: parsed.data.status },
    moduleKey: "it-helpdesk",
    sourceId: parsed.data.ticket_id,
    sourceTable: "it_tickets",
    summary: `Set IT ticket status to ${parsed.data.status}`,
  });

  // Keep the requester in the loop on the milestones that matter to them.
  if (["resolved", "closed", "awaiting_user"].includes(parsed.data.status)) {
    await notifyItUser({
      actionHref: ticketRoute,
      body: `${current.ticket_ref} is now ${parsed.data.status.replace(/_/g, " ")}.`,
      idempotencyKey: `it-ticket-status:${parsed.data.ticket_id}:${parsed.data.status}`,
      recipientId: current.raised_by === profile.id ? null : current.raised_by,
      ticketId: parsed.data.ticket_id,
      title: "Your IT ticket was updated",
    });
  }

  revalidatePath(ticketRoute);
  revalidatePath(HELPDESK_ROUTE);
  redirect(`${ticketRoute}?updated=status`);
}

export async function assignItTicketAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageItTickets(profile.role)) {
    helpdeskError(HELPDESK_ROUTE, "Your role cannot manage the help-desk queue.");
  }

  const parsed = assignSchema.safeParse({
    assigned_to: field(formData, "assigned_to"),
    ticket_id: field(formData, "ticket_id"),
  });

  if (!parsed.success) {
    helpdeskError(HELPDESK_ROUTE, "Select who to assign the ticket to.");
  }

  const ticketRoute = `${HELPDESK_ROUTE}/${parsed.data.ticket_id}`;
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("it_tickets")
    .update({ assigned_to: nullableUuid(parsed.data.assigned_to) })
    .eq("id", parsed.data.ticket_id)
    .is("archived_at", null);

  if (error) {
    helpdeskError(ticketRoute, error.message);
  }

  await recordOpsAuditEvent({
    action: "it_ticket.assign",
    actorUserId: profile.id,
    entityId: parsed.data.ticket_id,
    entityType: "it_ticket",
    metadata: { assigned_to: nullableUuid(parsed.data.assigned_to) },
    moduleKey: "it-helpdesk",
    sourceId: parsed.data.ticket_id,
    sourceTable: "it_tickets",
    summary: "Assigned IT ticket",
  });

  await notifyItUser({
    actionHref: ticketRoute,
    body: "An IT ticket has been assigned to you.",
    idempotencyKey: `it-ticket-assign:${parsed.data.ticket_id}:${parsed.data.assigned_to}`,
    recipientId:
      nullableUuid(parsed.data.assigned_to) === profile.id
        ? null
        : nullableUuid(parsed.data.assigned_to),
    ticketId: parsed.data.ticket_id,
    title: "IT ticket assigned to you",
  });

  revalidatePath(ticketRoute);
  revalidatePath(HELPDESK_ROUTE);
  redirect(`${ticketRoute}?updated=assignment`);
}

export async function addItTicketCommentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = commentSchema.safeParse({
    body: field(formData, "body"),
    is_internal: field(formData, "is_internal") || "false",
    ticket_id: field(formData, "ticket_id"),
  });

  if (!parsed.success) {
    helpdeskError(HELPDESK_ROUTE, parsed.error.issues[0]?.message ?? "Write a comment.");
  }

  const ticketRoute = `${HELPDESK_ROUTE}/${parsed.data.ticket_id}`;
  const isManager = canManageItTickets(profile.role);
  // Only IT can post internal notes; requesters always post public comments.
  const isInternal = isManager && parsed.data.is_internal === "true";

  const supabase = getOpsSupabaseServiceClient();
  const { data: ticket, error: fetchError } = await supabase
    .from("it_tickets")
    .select("id, raised_by, first_response_at")
    .eq("id", parsed.data.ticket_id)
    .is("archived_at", null)
    .maybeSingle<{ first_response_at: string | null; id: string; raised_by: string | null }>();

  if (fetchError) {
    helpdeskError(ticketRoute, fetchError.message);
  }
  if (!ticket) {
    helpdeskError(HELPDESK_ROUTE, "That ticket no longer exists.");
  }

  // A requester may only comment on their own ticket; IT may comment on any.
  if (!isManager && ticket.raised_by !== profile.id) {
    helpdeskError(HELPDESK_ROUTE, "You can only comment on tickets you raised.");
  }

  const { error } = await supabase.from("it_ticket_comments").insert({
    author_id: profile.id,
    body: parsed.data.body,
    is_internal: isInternal,
    ticket_id: parsed.data.ticket_id,
  });

  if (error) {
    helpdeskError(ticketRoute, error.message);
  }

  // First IT response on the record stamps first_response_at for SLA tracking.
  if (isManager && !isInternal && !ticket.first_response_at) {
    await supabase
      .from("it_tickets")
      .update({ first_response_at: new Date().toISOString() })
      .eq("id", parsed.data.ticket_id);
  }

  // Internal notes stay within IT. Public replies notify the other party.
  if (!isInternal) {
    if (isManager) {
      await notifyItUser({
        actionHref: ticketRoute,
        body: "IT replied to your support ticket.",
        idempotencyKey: `it-ticket-reply:${parsed.data.ticket_id}:${Date.now()}`,
        recipientId: ticket.raised_by === profile.id ? null : ticket.raised_by,
        ticketId: parsed.data.ticket_id,
        title: "Reply on your IT ticket",
      });
    } else {
      await notifyItStaff({
        actorId: profile.id,
        body: "The requester replied on their IT ticket.",
        idempotencyKey: `it-ticket-requester-reply:${parsed.data.ticket_id}:${Date.now()}`,
        ticketId: parsed.data.ticket_id,
        title: "Requester replied on a ticket",
      });
    }
  }

  revalidatePath(ticketRoute);
  redirect(`${ticketRoute}?updated=comment`);
}
