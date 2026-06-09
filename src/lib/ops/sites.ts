import { createOpsServerSessionClient } from "@/lib/ops/auth";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import type { OpsSiteStatus } from "@/lib/ops/types";

export type OpsSite = {
  id: string;
  code: string;
  name: string;
  location: string;
  supervisor_name: string;
  client_name: string;
  budget_zmw: number;
  latitude: number | null;
  longitude: number | null;
  status: OpsSiteStatus;
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
  status?: OpsSiteStatus;
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
  const supabase = await createOpsServerSessionClient();
  let query = supabase
    .from("sites")
    .select(
      "id, code, name, location, supervisor_name, client_name, budget_zmw, latitude, longitude, status, is_active, created_at",
      listState ? { count: "exact" } : undefined,
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
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
      Omit<OpsSite, "budget_zmw" | "latitude" | "longitude"> & {
        budget_zmw: number | string;
        latitude: number | string | null;
        longitude: number | string | null;
      }
    >
  ).map((site) => ({
    ...site,
    budget_zmw: normalizeMoney(site.budget_zmw),
    latitude: normalizeCoordinate(site.latitude),
    longitude: normalizeCoordinate(site.longitude),
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
  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("sites")
    .select("id, code, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as OpsSiteOption[];
}
