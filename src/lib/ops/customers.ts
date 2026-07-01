import { requireOpsUser } from "@/lib/ops/auth";
import { canViewOpsCustomers } from "@/lib/ops/customer-permissions";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsCustomerStatus } from "@/lib/ops/types";

export type OpsCustomerSummary = {
  address_line: string;
  archived_at: string | null;
  city: string;
  country: string;
  created_at: string;
  created_by: string | null;
  customer_code: string;
  email: string;
  id: string;
  legal_name: string;
  notes: string;
  phone: string;
  status: OpsCustomerStatus;
  tpin: string;
  trading_name: string;
  updated_at: string;
};

export type OpsCustomerOption = {
  customer_code: string;
  id: string;
  label: string;
};

export type OpsCustomerStats = {
  active: number;
  archived: number;
  total: number;
};

export type FetchOpsCustomersOptions = {
  limit?: number;
  query?: string;
  status?: OpsCustomerStatus;
};

export type FetchPaginatedOpsCustomersOptions = FetchOpsCustomersOptions & {
  listState: OpsListState;
};

function normalizeLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? 25, 1), 100);
}

const CUSTOMER_COLUMNS = [
  "id",
  "customer_code",
  "legal_name",
  "trading_name",
  "status",
  "tpin",
  "email",
  "phone",
  "address_line",
  "city",
  "country",
  "notes",
  "created_by",
  "archived_at",
  "created_at",
  "updated_at",
].join(", ");

async function fetchOpsCustomerItems(
  options: FetchOpsCustomersOptions = {},
  listState?: OpsListState,
) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsCustomers(profile.role)) {
    return { count: 0, items: [] };
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("customers")
    .select(CUSTOMER_COLUMNS, listState ? { count: "exact" } : undefined)
    .order("created_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }

  const searchFilter = opsIlikeOrFilter(
    ["customer_code", "legal_name", "trading_name", "tpin", "email", "phone", "city"],
    options.query ?? "",
  );

  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await (listState
    ? query.range(listState.from, listState.to)
    : query.limit(normalizeLimit(options.limit)));

  if (error) {
    throw error;
  }

  return {
    count,
    items: (data ?? []) as unknown as OpsCustomerSummary[],
  };
}

export async function fetchOpsCustomers(options: FetchOpsCustomersOptions = {}) {
  const result = await fetchOpsCustomerItems(options);
  return result.items;
}

export async function fetchPaginatedOpsCustomers(
  options: FetchPaginatedOpsCustomersOptions,
): Promise<OpsPaginatedResult<OpsCustomerSummary>> {
  const result = await fetchOpsCustomerItems(options, options.listState);
  return toOpsPaginatedResult(result.items, result.count, options.listState);
}

async function countCustomersByStatus(status: OpsCustomerStatus) {
  const supabase = getOpsSupabaseServiceClient();
  const { count, error } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("status", status);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function fetchOpsCustomerStats(): Promise<OpsCustomerStats> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsCustomers(profile.role)) {
    return { active: 0, archived: 0, total: 0 };
  }

  const [active, archived] = await Promise.all([
    countCustomersByStatus("active"),
    countCustomersByStatus("archived"),
  ]);

  return { active, archived, total: active + archived };
}

export async function fetchActiveCustomerOptions(limit = 200): Promise<OpsCustomerOption[]> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsCustomers(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, customer_code, legal_name, trading_name")
    .eq("status", "active")
    .order("legal_name", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 500));

  if (error) {
    throw error;
  }

  return (data ?? []).map((customer) => ({
    id: customer.id as string,
    customer_code: customer.customer_code as string,
    label: customer.trading_name
      ? `${customer.legal_name} (${customer.trading_name})`
      : (customer.legal_name as string),
  }));
}
