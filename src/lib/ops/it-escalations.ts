import { logOpsServerError } from "@/lib/ops/log";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsItTicketPriority, OpsUserRole } from "@/lib/ops/types";

// Mirrors OPS_IT_ROLES — who is alerted by the IT sweep.
const IT_ROLES: OpsUserRole[] = ["developer", "managing_director", "owner", "it_manager"];

// First-response SLA target (hours) by priority. A ticket with no first
// response older than this has breached its response SLA.
const RESPONSE_SLA_HOURS: Record<OpsItTicketPriority, number> = {
  high: 8,
  low: 72,
  normal: 24,
  urgent: 4,
};

// Lead time (days) before a renewal/warranty/rotation date at which IT is warned.
const EXPIRY_LEAD_DAYS = 30;

function todayInLusaka() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Africa/Lusaka",
    year: "numeric",
  }).format(new Date());
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00+02:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function safeQueue(
  label: string,
  fn: () => Promise<void>,
): Promise<number> {
  try {
    await fn();
    return 1;
  } catch (error) {
    logOpsServerError(error, { action: `it-escalations:${label}`, module: "it" });
    return 0;
  }
}

export type ItEscalationsSweepResult = {
  creditRotationsDue: number;
  licencesExpiring: number;
  notificationsQueued: number;
  slaBreaches: number;
  today: string;
  warrantiesExpiring: number;
};

/**
 * Daily IT sweep: surfaces help-desk SLA breaches, software renewals, hardware
 * warranties, and credential rotations that need attention, and notifies IT.
 * Idempotent per day via date-scoped notification keys.
 */
export async function runOpsItEscalationsSweep(
  today = todayInLusaka(),
): Promise<ItEscalationsSweepResult> {
  const supabase = getOpsSupabaseServiceClient();

  const { data: itUsers, error: usersError } = await supabase
    .from("users")
    .select("id")
    .in("role", IT_ROLES)
    .eq("is_active", true);
  if (usersError) {
    logOpsServerError(usersError, { action: "it-escalations:users", module: "it" });
  }
  const recipientIds = (itUsers ?? []).map((row) => row.id as string);

  let queued = 0;
  const notifyIt = async (input: {
    actionHref: string;
    body: string;
    keyPrefix: string;
    sourceId: string;
    sourceTable: string;
    title: string;
  }) => {
    for (const recipientId of recipientIds) {
      queued += await safeQueue(`${input.keyPrefix}:${recipientId}`, () =>
        queueOpsNotification({
          actionHref: input.actionHref,
          body: input.body,
          idempotencyKey: `${input.keyPrefix}:${today}:${recipientId}`,
          moduleKey: "it",
          recipientId,
          sourceId: input.sourceId,
          sourceTable: input.sourceTable,
          title: input.title,
        }),
      );
    }
  };

  // ── 1. Help-desk response-SLA breaches (open, no first response yet) ──────
  const { data: openTickets, error: ticketsError } = await supabase
    .from("it_tickets")
    .select("id, ticket_ref, title, priority, created_at, first_response_at")
    .eq("status", "open")
    .is("first_response_at", null)
    .is("archived_at", null)
    .limit(200);
  if (ticketsError) {
    logOpsServerError(ticketsError, { action: "it-escalations:tickets", module: "it" });
  }

  const nowMs = Date.now();
  let slaBreaches = 0;
  for (const ticket of openTickets ?? []) {
    const priority = ticket.priority as OpsItTicketPriority;
    const ageHours = (nowMs - new Date(ticket.created_at as string).getTime()) / 3_600_000;
    if (ageHours < RESPONSE_SLA_HOURS[priority]) {
      continue;
    }
    slaBreaches += 1;
    await notifyIt({
      actionHref: `/ops/it/helpdesk/${ticket.id}`,
      body: `${ticket.ticket_ref}: "${ticket.title}" (${priority}) has had no response within its SLA.`,
      keyPrefix: `it-sla:${ticket.id}`,
      sourceId: ticket.id as string,
      sourceTable: "it_tickets",
      title: "IT ticket past response SLA",
    });
  }

  // ── 2. Software licences renewing/expired within the lead window ──────────
  const horizon = addDays(today, EXPIRY_LEAD_DAYS);
  const { data: licences, error: licencesError } = await supabase
    .from("it_software_licenses")
    .select("id, name, renewal_date")
    .eq("status", "active")
    .not("renewal_date", "is", null)
    .lte("renewal_date", horizon)
    .is("archived_at", null)
    .limit(200);
  if (licencesError) {
    logOpsServerError(licencesError, { action: "it-escalations:licences", module: "it" });
  }
  for (const licence of licences ?? []) {
    await notifyIt({
      actionHref: "/ops/it/licenses",
      body: `${licence.name} renews on ${licence.renewal_date}.`,
      keyPrefix: `it-licence:${licence.id}`,
      sourceId: licence.id as string,
      sourceTable: "it_software_licenses",
      title: "Software licence renewal due",
    });
  }

  // ── 3. Hardware warranties expiring within the lead window ────────────────
  const { data: assets, error: assetsError } = await supabase
    .from("it_assets")
    .select("id, asset_tag, name, warranty_expiry")
    .not("warranty_expiry", "is", null)
    .lte("warranty_expiry", horizon)
    .gte("warranty_expiry", today)
    .not("status", "in", "(retired,disposed)")
    .is("archived_at", null)
    .limit(200);
  if (assetsError) {
    logOpsServerError(assetsError, { action: "it-escalations:assets", module: "it" });
  }
  for (const asset of assets ?? []) {
    await notifyIt({
      actionHref: "/ops/it/assets",
      body: `${asset.asset_tag} (${asset.name}) warranty expires ${asset.warranty_expiry}.`,
      keyPrefix: `it-warranty:${asset.id}`,
      sourceId: asset.id as string,
      sourceTable: "it_assets",
      title: "Asset warranty expiring",
    });
  }

  // ── 4. Credentials due for rotation ───────────────────────────────────────
  const { data: credentials, error: credentialsError } = await supabase
    .from("it_credentials")
    .select("id, name, rotation_due_date")
    .not("rotation_due_date", "is", null)
    .lte("rotation_due_date", today)
    .is("archived_at", null)
    .limit(200);
  if (credentialsError) {
    logOpsServerError(credentialsError, { action: "it-escalations:credentials", module: "it" });
  }
  for (const credential of credentials ?? []) {
    await notifyIt({
      actionHref: "/ops/it/credentials",
      body: `${credential.name} is due for rotation (${credential.rotation_due_date}).`,
      keyPrefix: `it-rotation:${credential.id}`,
      sourceId: credential.id as string,
      sourceTable: "it_credentials",
      title: "Credential rotation due",
    });
  }

  return {
    creditRotationsDue: (credentials ?? []).length,
    licencesExpiring: (licences ?? []).length,
    notificationsQueued: queued,
    slaBreaches,
    today,
    warrantiesExpiring: (assets ?? []).length,
  };
}
