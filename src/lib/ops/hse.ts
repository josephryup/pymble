import { requireOpsUser } from "@/lib/ops/auth";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { canViewOpsHse } from "@/lib/ops/hse-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsCorrectiveActionStatus,
  OpsHseIncidentSeverity,
  OpsHseIncidentStatus,
  OpsHseIncidentType,
  OpsPriority,
  OpsUserRole,
} from "@/lib/ops/types";

export type OpsHseSiteSummary = {
  code: string;
  id: string;
  name: string;
};

export type OpsHseUserSummary = {
  full_name: string;
  id: string;
  role: OpsUserRole;
};

export type OpsHseUserOption = OpsHseUserSummary;

export type OpsCorrectiveActionSummary = {
  action_number: string;
  completed_at: string | null;
  completion_notes: string;
  created_at: string;
  created_by: string | null;
  description: string;
  due_date: string | null;
  id: string;
  incident_id: string | null;
  owner: OpsHseUserSummary | null;
  owner_id: string | null;
  priority: OpsPriority;
  site_id: string;
  status: OpsCorrectiveActionStatus;
  title: string;
  verification_notes: string;
  verified_at: string | null;
};

export type OpsHseIncidentSummary = {
  actions: OpsCorrectiveActionSummary[];
  assigned_to: string | null;
  assigned_to_user: OpsHseUserSummary | null;
  cancelled_at: string | null;
  closed_at: string | null;
  created_at: string;
  created_by: string | null;
  description: string;
  id: string;
  immediate_action: string;
  incident_number: string;
  incident_type: OpsHseIncidentType;
  investigation_started_at: string | null;
  investigation_summary: string;
  location_detail: string;
  occurred_at: string;
  people_involved: string;
  reported_by: string | null;
  reported_by_user: OpsHseUserSummary | null;
  root_cause: string;
  severity: OpsHseIncidentSeverity;
  site: OpsHseSiteSummary | null;
  site_id: string;
  status: OpsHseIncidentStatus;
  title: string;
  updated_at: string;
};

export type OpsHseStats = {
  actionRequired: number;
  criticalOpen: number;
  investigating: number;
  openActions: number;
  reported: number;
  total: number;
};

export type FetchPaginatedOpsHseIncidentsOptions = {
  listState: OpsListState;
  query?: string;
  severity?: OpsHseIncidentSeverity;
  status?: OpsHseIncidentStatus;
};

type RawRelation<T> = T | T[] | null;

type RawHseIncident = Omit<
  OpsHseIncidentSummary,
  "actions" | "assigned_to_user" | "reported_by_user" | "site"
> & {
  assigned_to_user: RawRelation<OpsHseIncidentSummary["assigned_to_user"]>;
  reported_by_user: RawRelation<OpsHseIncidentSummary["reported_by_user"]>;
  site: RawRelation<OpsHseIncidentSummary["site"]>;
};

type RawCorrectiveAction = Omit<OpsCorrectiveActionSummary, "owner"> & {
  owner: RawRelation<OpsCorrectiveActionSummary["owner"]>;
};

function normalizeRelation<T>(value: RawRelation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isMissingHseTable(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST205" ||
        /hse_incidents|corrective_actions/i.test(error.message ?? "")),
  );
}

async function countByQuery(
  buildQuery: (
    supabase: ReturnType<typeof getOpsSupabaseServiceClient>,
  ) => PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }>,
) {
  const supabase = getOpsSupabaseServiceClient();
  const { count, error } = await buildQuery(supabase);

  if (isMissingHseTable(error)) {
    return 0;
  }

  if (error) {
    throw error;
  }

  return count ?? 0;
}

function groupActions(actions: RawCorrectiveAction[]) {
  const grouped = new Map<string, OpsCorrectiveActionSummary[]>();

  actions.forEach((action) => {
    if (!action.incident_id) {
      return;
    }

    grouped.set(action.incident_id, [
      ...(grouped.get(action.incident_id) ?? []),
      {
        ...action,
        owner: normalizeRelation(action.owner),
      },
    ]);
  });

  return grouped;
}

async function fetchCorrectiveActionsByIncidentIds(incidentIds: string[]) {
  if (incidentIds.length === 0) {
    return new Map<string, OpsCorrectiveActionSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("corrective_actions")
    .select(
      [
        "id",
        "action_number",
        "incident_id",
        "site_id",
        "title",
        "description",
        "status",
        "priority",
        "due_date",
        "owner_id",
        "completed_at",
        "completion_notes",
        "verified_at",
        "verification_notes",
        "created_by",
        "created_at",
        "owner:users!corrective_actions_owner_id_fkey(id, full_name, role)",
      ].join(", "),
    )
    .in("incident_id", incidentIds)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (isMissingHseTable(error)) {
    return new Map<string, OpsCorrectiveActionSummary[]>();
  }

  if (error) {
    throw error;
  }

  return groupActions((data ?? []) as unknown as RawCorrectiveAction[]);
}

export async function fetchPaginatedOpsHseIncidents(
  options: FetchPaginatedOpsHseIncidentsOptions,
): Promise<OpsPaginatedResult<OpsHseIncidentSummary>> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHse(profile.role)) {
    return toOpsPaginatedResult([], 0, options.listState);
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("hse_incidents")
    .select(
      [
        "id",
        "incident_number",
        "site_id",
        "title",
        "description",
        "incident_type",
        "severity",
        "status",
        "occurred_at",
        "location_detail",
        "people_involved",
        "immediate_action",
        "investigation_summary",
        "root_cause",
        "reported_by",
        "assigned_to",
        "investigation_started_at",
        "closed_at",
        "cancelled_at",
        "created_by",
        "created_at",
        "updated_at",
        "site:sites!hse_incidents_site_id_fkey(id, code, name)",
        "reported_by_user:users!hse_incidents_reported_by_fkey(id, full_name, role)",
        "assigned_to_user:users!hse_incidents_assigned_to_fkey(id, full_name, role)",
      ].join(", "),
      { count: "exact" },
    )
    .order("occurred_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }

  if (options.severity) {
    query = query.eq("severity", options.severity);
  }

  const searchFilter = opsIlikeOrFilter(
    ["incident_number", "title", "description", "location_detail", "people_involved"],
    options.query ?? "",
  );

  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await query.range(options.listState.from, options.listState.to);

  if (isMissingHseTable(error)) {
    return toOpsPaginatedResult([], 0, options.listState);
  }

  if (error) {
    throw error;
  }

  const incidents = (data ?? []) as unknown as RawHseIncident[];
  const actionsByIncidentId = await fetchCorrectiveActionsByIncidentIds(
    incidents.map((incident) => incident.id),
  );

  return toOpsPaginatedResult(
    incidents.map((incident) => ({
      ...incident,
      actions: actionsByIncidentId.get(incident.id) ?? [],
      assigned_to_user: normalizeRelation(incident.assigned_to_user),
      reported_by_user: normalizeRelation(incident.reported_by_user),
      site: normalizeRelation(incident.site),
    })),
    count,
    options.listState,
  );
}

export async function fetchHseUserOptions(limit = 200) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHse(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, role")
    .eq("is_active", true)
    .order("full_name", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 300));

  if (error) {
    throw error;
  }

  return (data ?? []) as OpsHseUserOption[];
}

export async function fetchOpsHseStats(): Promise<OpsHseStats> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHse(profile.role)) {
    return {
      actionRequired: 0,
      criticalOpen: 0,
      investigating: 0,
      openActions: 0,
      reported: 0,
      total: 0,
    };
  }

  const [total, reported, investigating, actionRequired, criticalOpen, openActions] =
    await Promise.all([
      countByQuery((supabase) =>
        supabase.from("hse_incidents").select("id", { count: "exact", head: true }),
      ),
      countByQuery((supabase) =>
        supabase
          .from("hse_incidents")
          .select("id", { count: "exact", head: true })
          .eq("status", "reported"),
      ),
      countByQuery((supabase) =>
        supabase
          .from("hse_incidents")
          .select("id", { count: "exact", head: true })
          .eq("status", "investigating"),
      ),
      countByQuery((supabase) =>
        supabase
          .from("hse_incidents")
          .select("id", { count: "exact", head: true })
          .eq("status", "action_required"),
      ),
      countByQuery((supabase) =>
        supabase
          .from("hse_incidents")
          .select("id", { count: "exact", head: true })
          .in("status", ["reported", "investigating", "action_required"])
          .in("severity", ["high", "critical"]),
      ),
      countByQuery((supabase) =>
        supabase
          .from("corrective_actions")
          .select("id", { count: "exact", head: true })
          .in("status", ["open", "in_progress", "completed"]),
      ),
    ]);

  return {
    actionRequired,
    criticalOpen,
    investigating,
    openActions,
    reported,
    total,
  };
}
