import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsItTicketCategory,
  OpsItTicketPriority,
  OpsItTicketStatus,
  OpsUserRole,
} from "@/lib/ops/types";

export type OpsItUserRef = {
  full_name: string;
  id: string;
  role: OpsUserRole;
};

export type OpsItTicketSiteRef = {
  code: string;
  id: string;
  name: string;
};

export type OpsItTicketSummary = {
  archived_at: string | null;
  asset_id: string | null;
  assigned_to: string | null;
  assignee: OpsItUserRef | null;
  category: OpsItTicketCategory;
  closed_at: string | null;
  created_at: string;
  description: string;
  first_response_at: string | null;
  id: string;
  priority: OpsItTicketPriority;
  raised_by: string | null;
  requester: OpsItUserRef | null;
  resolution_notes: string;
  resolved_at: string | null;
  satisfaction_rating: number | null;
  site: OpsItTicketSiteRef | null;
  site_id: string | null;
  status: OpsItTicketStatus;
  ticket_ref: string;
  title: string;
  updated_at: string;
};

export type OpsItTicketComment = {
  author: OpsItUserRef | null;
  author_id: string | null;
  body: string;
  created_at: string;
  id: string;
  is_internal: boolean;
};

export type OpsItTicketStats = {
  awaiting_user: number;
  in_progress: number;
  open: number;
  unassigned: number;
  urgent_open: number;
};

const OPEN_STATUSES: OpsItTicketStatus[] = [
  "open",
  "in_progress",
  "on_hold",
  "awaiting_user",
];

type RawRelation<T> = T | T[] | null;

type RawItTicket = Omit<OpsItTicketSummary, "assignee" | "requester" | "site"> & {
  assignee: RawRelation<OpsItUserRef>;
  requester: RawRelation<OpsItUserRef>;
  site: RawRelation<OpsItTicketSiteRef>;
};

const TICKET_SELECT =
  "id, ticket_ref, title, description, category, priority, status, raised_by, assigned_to, site_id, asset_id, first_response_at, resolved_at, closed_at, resolution_notes, satisfaction_rating, archived_at, created_at, updated_at, " +
  "requester:users!it_tickets_raised_by_fkey(id, full_name, role), " +
  "assignee:users!it_tickets_assigned_to_fkey(id, full_name, role), " +
  "site:sites!it_tickets_site_id_fkey(id, name, code)";

function firstRelation<T>(value: RawRelation<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function normalizeTicket(raw: RawItTicket): OpsItTicketSummary {
  return {
    ...raw,
    assignee: firstRelation(raw.assignee),
    requester: firstRelation(raw.requester),
    site: firstRelation(raw.site),
  };
}

export type FetchOpsItTicketsOptions = {
  openOnly?: boolean;
  raisedBy?: string;
  status?: OpsItTicketStatus;
};

export async function fetchOpsItTickets(
  options: FetchOpsItTicketsOptions = {},
): Promise<OpsItTicketSummary[]> {
  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("it_tickets")
    .select(TICKET_SELECT)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (options.raisedBy) {
    query = query.eq("raised_by", options.raisedBy);
  }
  if (options.status) {
    query = query.eq("status", options.status);
  } else if (options.openOnly) {
    query = query.in("status", OPEN_STATUSES);
  }

  const { data, error } = await query.returns<RawItTicket[]>();
  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeTicket);
}

export async function fetchOpsItTicketStats(): Promise<OpsItTicketStats> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_tickets")
    .select("status, priority, assigned_to")
    .is("archived_at", null)
    .returns<
      { assigned_to: string | null; priority: OpsItTicketPriority; status: OpsItTicketStatus }[]
    >();

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const isOpen = (status: OpsItTicketStatus) => OPEN_STATUSES.includes(status);

  return {
    awaiting_user: rows.filter((row) => row.status === "awaiting_user").length,
    in_progress: rows.filter((row) => row.status === "in_progress").length,
    open: rows.filter((row) => row.status === "open").length,
    unassigned: rows.filter((row) => isOpen(row.status) && row.assigned_to === null).length,
    urgent_open: rows.filter((row) => isOpen(row.status) && row.priority === "urgent").length,
  };
}

export type OpsItTicketWeeklyPoint = {
  /** Short chart label — start of week, e.g. "23 Jun". */
  label: string;
  raised: number;
  resolved: number;
};

export type OpsItTicketAnalytics = {
  weeks: number;
  points: OpsItTicketWeeklyPoint[];
  openByPriority: Array<{ priority: OpsItTicketPriority; count: number }>;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const WEEK_LABEL_FORMAT = new Intl.DateTimeFormat("en-ZM", {
  day: "numeric",
  month: "short",
  timeZone: "Africa/Lusaka",
});

/**
 * Weekly inflow vs resolution plus the open-priority mix for the helpdesk
 * dashboard charts. Resolutions are counted in the week they were resolved,
 * so old tickets closed this week still show as this week's throughput.
 */
export async function fetchOpsItTicketAnalytics(weeks = 8): Promise<OpsItTicketAnalytics> {
  const supabase = getOpsSupabaseServiceClient();
  const windowStart = new Date(Date.now() - weeks * WEEK_MS);

  const [recentResult, openResult] = await Promise.all([
    supabase
      .from("it_tickets")
      .select("created_at, resolved_at")
      .is("archived_at", null)
      .or(`created_at.gte.${windowStart.toISOString()},resolved_at.gte.${windowStart.toISOString()}`),
    supabase
      .from("it_tickets")
      .select("priority")
      .is("archived_at", null)
      .in("status", OPEN_STATUSES),
  ]);

  if (recentResult.error || openResult.error) {
    return { weeks, points: [], openByPriority: [] };
  }

  // Bucket by trailing week, oldest first; bucket 0 starts `weeks` weeks ago.
  const bucketFor = (iso: string | null) => {
    if (!iso) return -1;
    const elapsed = new Date(iso).getTime() - windowStart.getTime();
    if (elapsed < 0) return -1;
    return Math.min(Math.floor(elapsed / WEEK_MS), weeks - 1);
  };

  const points: OpsItTicketWeeklyPoint[] = Array.from({ length: weeks }, (_, index) => ({
    label: WEEK_LABEL_FORMAT.format(new Date(windowStart.getTime() + index * WEEK_MS)),
    raised: 0,
    resolved: 0,
  }));

  const rows = (recentResult.data ?? []) as Array<{
    created_at: string;
    resolved_at: string | null;
  }>;
  for (const row of rows) {
    const raisedBucket = bucketFor(row.created_at);
    if (raisedBucket >= 0) points[raisedBucket].raised += 1;
    const resolvedBucket = bucketFor(row.resolved_at);
    if (resolvedBucket >= 0) points[resolvedBucket].resolved += 1;
  }

  const PRIORITY_ORDER: OpsItTicketPriority[] = ["urgent", "high", "normal", "low"];
  const openRows = (openResult.data ?? []) as Array<{ priority: OpsItTicketPriority }>;
  const openByPriority = PRIORITY_ORDER.map((priority) => ({
    priority,
    count: openRows.filter((row) => row.priority === priority).length,
  })).filter((entry) => entry.count > 0);

  return { weeks, points, openByPriority };
}

export async function fetchOpsItTicket(
  ticketId: string,
): Promise<OpsItTicketSummary | null> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_tickets")
    .select(TICKET_SELECT)
    .eq("id", ticketId)
    .maybeSingle<RawItTicket>();

  if (error) {
    throw error;
  }

  return data ? normalizeTicket(data) : null;
}

export async function fetchOpsItTicketComments(
  ticketId: string,
  { includeInternal }: { includeInternal: boolean },
): Promise<OpsItTicketComment[]> {
  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("it_ticket_comments")
    .select(
      "id, author_id, body, is_internal, created_at, author:users!it_ticket_comments_author_id_fkey(id, full_name, role)",
    )
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (!includeInternal) {
    query = query.eq("is_internal", false);
  }

  const { data, error } = await query.returns<
    (Omit<OpsItTicketComment, "author"> & { author: RawRelation<OpsItUserRef> })[]
  >();

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({ ...row, author: firstRelation(row.author) }));
}
