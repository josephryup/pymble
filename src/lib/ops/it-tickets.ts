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
