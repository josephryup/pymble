import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { canViewSiteActualBudget, canViewSiteBudget } from "@/lib/ops/permissions";
import { fetchActiveOpsAssignedSiteIds, requiresOpsSiteAssignment } from "@/lib/ops/site-assignments";
import type { OpsSiteStage, OpsSiteStatus } from "@/lib/ops/types";

export type OpsSite = {
  id: string;
  code: string;
  name: string;
  location: string;
  supervisor_name: string;
  client_name: string;
  // Budget + contract figures are commercially sensitive — the data layer
  // returns null for roles that may not see them (see canViewSiteBudget /
  // canViewSiteActualBudget). contract_value is the agreed client contract sum.
  contract_value: number | null;
  budget_zmw: number | null;
  actual_budget_zmw: number | null;
  latitude: number | null;
  longitude: number | null;
  status: OpsSiteStatus;
  stage: OpsSiteStage;
  progress_percent: number;
  is_active: boolean;
  created_at: string;
};

export type OpsSiteOption = {
  id: string;
  code: string;
  name: string;
};

export type FetchOpsSitesOptions = {
  query?: string;
  stage?: OpsSiteStage;
};

export type FetchPaginatedOpsSitesOptions = FetchOpsSitesOptions & {
  listState: OpsListState;
};

function normalizeMoney(value: number | string | null) {
  return Number(value ?? 0);
}

function normalizeCoordinate(value: number | string | null) {
  return value === null ? null : Number(value);
}

async function fetchOpsSiteItems(options: FetchOpsSitesOptions = {}, listState?: OpsListState) {
  const { profile } = await requireOpsUser();
  const showBudget = canViewSiteBudget(profile.role);
  const showActualBudget = canViewSiteActualBudget(profile.role);
  const supabase = await createOpsServerSessionClient();
  let query = supabase
    .from("sites")
    .select(
      "id, code, name, location, supervisor_name, client_name, contract_value, budget_zmw, actual_budget_zmw, latitude, longitude, status, stage, progress_percent, is_active, created_at",
      listState ? { count: "exact" } : undefined,
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (options.stage) {
    query = query.eq("stage", options.stage);
  }

  const searchFilter = opsIlikeOrFilter(
    ["code", "name", "location", "supervisor_name", "client_name"],
    options.query ?? "",
  );

  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await (listState
    ? query.range(listState.from, listState.to)
    : query);

  if (error) {
    throw error;
  }

  const items = (
    (data ?? []) as Array<
      Omit<
        OpsSite,
        "contract_value" | "budget_zmw" | "actual_budget_zmw" | "latitude" | "longitude" | "progress_percent"
      > & {
        contract_value: number | string;
        budget_zmw: number | string;
        actual_budget_zmw: number | string;
        latitude: number | string | null;
        longitude: number | string | null;
        progress_percent: number | string;
      }
    >
  ).map((site) => ({
    ...site,
    // Strip sensitive budget / contract figures for roles that may not see
    // them, so the numbers never reach the client payload.
    contract_value: showBudget ? normalizeMoney(site.contract_value) : null,
    budget_zmw: showBudget ? normalizeMoney(site.budget_zmw) : null,
    actual_budget_zmw: showActualBudget ? normalizeMoney(site.actual_budget_zmw) : null,
    latitude: normalizeCoordinate(site.latitude),
    longitude: normalizeCoordinate(site.longitude),
    progress_percent: normalizeMoney(site.progress_percent),
  }));

  return {
    count,
    items,
  };
}

export async function fetchOpsSites(options: FetchOpsSitesOptions = {}) {
  const result = await fetchOpsSiteItems(options);
  return result.items;
}

export async function fetchPaginatedOpsSites(
  options: FetchPaginatedOpsSitesOptions,
): Promise<OpsPaginatedResult<OpsSite>> {
  const result = await fetchOpsSiteItems(options, options.listState);
  return toOpsPaginatedResult(result.items, result.count, options.listState);
}

export async function fetchActiveSiteOptions() {
  const { profile } = await requireOpsUser();
  const supabase = await createOpsServerSessionClient();
  let query = supabase
    .from("sites")
    .select("id, code, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (requiresOpsSiteAssignment(profile.role)) {
    const siteIds = await fetchActiveOpsAssignedSiteIds(profile.id);
    if (siteIds.length === 0) return [];
    query = query.in("id", siteIds);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as OpsSiteOption[];
}
