import { requireOpsUser } from "@/lib/ops/auth";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { canViewOpsSuppliers } from "@/lib/ops/supplier-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsSupplierKind,
  OpsSupplierPerformanceEventType,
  OpsSupplierStatus,
  OpsUserRole,
} from "@/lib/ops/types";

export type OpsSupplierContactSummary = {
  created_at: string;
  email: string;
  full_name: string;
  id: string;
  is_primary: boolean;
  phone: string;
  role_title: string;
  supplier_id: string;
};

export type OpsSupplierPerformanceEventSummary = {
  author: {
    full_name: string;
    id: string;
    role: OpsUserRole;
  } | null;
  created_at: string;
  created_by: string | null;
  description: string;
  event_date: string;
  event_type: OpsSupplierPerformanceEventType;
  id: string;
  rating: number;
  site: {
    code: string;
    id: string;
    name: string;
  } | null;
  site_id: string | null;
  source_id: string | null;
  source_table: string | null;
  supplier_id: string;
  title: string;
  updated_at: string;
};

export type OpsSupplierSummary = {
  address_line: string;
  archived_at: string | null;
  category: string;
  city: string;
  contacts: OpsSupplierContactSummary[];
  country: string;
  created_at: string;
  created_by: string | null;
  email: string;
  id: string;
  legal_name: string;
  notes: string;
  performance_event_average: number | null;
  performance_events: OpsSupplierPerformanceEventSummary[];
  phone: string;
  rating: number | null;
  kind: OpsSupplierKind;
  status: OpsSupplierStatus;
  supplier_code: string;
  tpin: string;
  trading_name: string;
  updated_at: string;
};

export type OpsSupplierOption = {
  id: string;
  label: string;
  supplier_code: string;
};

export type OpsSupplierStats = {
  active: number;
  archived: number;
  on_hold: number;
  total: number;
};

export type FetchOpsSuppliersOptions = {
  kind?: OpsSupplierKind;
  limit?: number;
  query?: string;
  status?: OpsSupplierStatus;
};

export type FetchPaginatedOpsSuppliersOptions = FetchOpsSuppliersOptions & {
  listState: OpsListState;
};

type RawSupplier = Omit<
  OpsSupplierSummary,
  "contacts" | "performance_event_average" | "performance_events" | "rating"
> & {
  rating: number | string | null;
};

type RawSupplierContact = OpsSupplierContactSummary;

type RawRelation<T> = T | T[] | null;

type RawSupplierPerformanceEvent = Omit<
  OpsSupplierPerformanceEventSummary,
  "author" | "rating" | "site"
> & {
  author: RawRelation<OpsSupplierPerformanceEventSummary["author"]>;
  rating: number | string;
  site: RawRelation<OpsSupplierPerformanceEventSummary["site"]>;
};

function normalizeLimit(limit: number | undefined) {
  return Math.min(Math.max(limit ?? 25, 1), 100);
}

function normalizeSupplierRating(value: number | string | null) {
  return value === null ? null : Number(value);
}

function normalizeRelation<T>(value: RawRelation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function groupContactsBySupplierId(contacts: RawSupplierContact[]) {
  const grouped = new Map<string, OpsSupplierContactSummary[]>();

  contacts.forEach((contact) => {
    grouped.set(contact.supplier_id, [...(grouped.get(contact.supplier_id) ?? []), contact]);
  });

  return grouped;
}

function groupPerformanceEventsBySupplierId(events: RawSupplierPerformanceEvent[]) {
  const grouped = new Map<string, OpsSupplierPerformanceEventSummary[]>();

  events.forEach((event) => {
    const normalized = {
      ...event,
      author: normalizeRelation(event.author),
      rating: Number(event.rating),
      site: normalizeRelation(event.site),
    };

    grouped.set(event.supplier_id, [...(grouped.get(event.supplier_id) ?? []), normalized]);
  });

  return grouped;
}

function averagePerformanceRating(events: OpsSupplierPerformanceEventSummary[]) {
  if (events.length === 0) {
    return null;
  }

  const total = events.reduce((sum, event) => sum + event.rating, 0);
  return Math.round((total / events.length) * 10) / 10;
}

async function fetchSupplierContacts(supplierIds: string[]) {
  if (supplierIds.length === 0) {
    return new Map<string, OpsSupplierContactSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("supplier_contacts")
    .select("id, supplier_id, full_name, role_title, email, phone, is_primary, created_at")
    .in("supplier_id", supplierIds)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return groupContactsBySupplierId((data ?? []) as unknown as RawSupplierContact[]);
}

async function fetchSupplierPerformanceEvents(supplierIds: string[]) {
  if (supplierIds.length === 0) {
    return new Map<string, OpsSupplierPerformanceEventSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("supplier_performance_events")
    .select(
      [
        "id",
        "supplier_id",
        "site_id",
        "event_type",
        "rating",
        "title",
        "description",
        "event_date",
        "source_table",
        "source_id",
        "created_by",
        "created_at",
        "updated_at",
        "author:users!supplier_performance_events_created_by_fkey(id, full_name, role)",
        "site:sites!supplier_performance_events_site_id_fkey(id, code, name)",
      ].join(", "),
    )
    .in("supplier_id", supplierIds)
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw error;
  }

  return groupPerformanceEventsBySupplierId(
    (data ?? []) as unknown as RawSupplierPerformanceEvent[],
  );
}

async function fetchOpsSupplierItems(
  options: FetchOpsSuppliersOptions = {},
  listState?: OpsListState,
) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsSuppliers(profile.role)) {
    return {
      count: 0,
      items: [],
    };
  }

  const supabase = getOpsSupabaseServiceClient();
  let supplierQuery = supabase
    .from("suppliers")
    .select(
      [
        "id",
        "supplier_code",
        "legal_name",
        "trading_name",
        "category",
        "kind",
        "status",
        "tpin",
        "email",
        "phone",
        "address_line",
        "city",
        "country",
        "rating",
        "notes",
        "created_by",
        "archived_at",
        "created_at",
        "updated_at",
      ].join(", "),
      listState ? { count: "exact" } : undefined,
    )
    .order("created_at", { ascending: false });

  if (options.status) {
    supplierQuery = supplierQuery.eq("status", options.status);
  }

  if (options.kind) {
    supplierQuery = options.kind === "both"
      ? supplierQuery.eq("kind", "both")
      : supplierQuery.in("kind", [options.kind, "both"]);
  }

  const searchFilter = opsIlikeOrFilter(
    [
      "supplier_code",
      "legal_name",
      "trading_name",
      "category",
      "tpin",
      "email",
      "phone",
      "city",
    ],
    options.query ?? "",
  );

  if (searchFilter) {
    supplierQuery = supplierQuery.or(searchFilter);
  }

  const { data, error, count } = await (listState
    ? supplierQuery.range(listState.from, listState.to)
    : supplierQuery.limit(normalizeLimit(options.limit)));

  if (error) {
    throw error;
  }

  const suppliers = (data ?? []) as unknown as RawSupplier[];
  const supplierIds = suppliers.map((supplier) => supplier.id);
  const [contactsBySupplierId, performanceEventsBySupplierId] = await Promise.all([
    fetchSupplierContacts(supplierIds),
    fetchSupplierPerformanceEvents(supplierIds),
  ]);

  return {
    count,
    items: suppliers.map((supplier) => {
      const performanceEvents = performanceEventsBySupplierId.get(supplier.id) ?? [];

      return {
        ...supplier,
        contacts: contactsBySupplierId.get(supplier.id) ?? [],
        performance_event_average: averagePerformanceRating(performanceEvents),
        performance_events: performanceEvents,
        rating: normalizeSupplierRating(supplier.rating),
      };
    }),
  };
}

async function countSuppliersByStatus(status: OpsSupplierStatus) {
  const supabase = getOpsSupabaseServiceClient();
  const { count, error } = await supabase
    .from("suppliers")
    .select("id", { count: "exact", head: true })
    .eq("status", status);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function fetchOpsSuppliers(options: FetchOpsSuppliersOptions = {}) {
  const result = await fetchOpsSupplierItems(options);
  return result.items;
}

export async function fetchPaginatedOpsSuppliers(
  options: FetchPaginatedOpsSuppliersOptions,
): Promise<OpsPaginatedResult<OpsSupplierSummary>> {
  const result = await fetchOpsSupplierItems(options, options.listState);
  return toOpsPaginatedResult(result.items, result.count, options.listState);
}

export async function fetchOpsSupplierStats(): Promise<OpsSupplierStats> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsSuppliers(profile.role)) {
    return {
      active: 0,
      archived: 0,
      on_hold: 0,
      total: 0,
    };
  }

  const [active, onHold, archived] = await Promise.all([
    countSuppliersByStatus("active"),
    countSuppliersByStatus("on_hold"),
    countSuppliersByStatus("archived"),
  ]);

  return {
    active,
    archived,
    on_hold: onHold,
    total: active + onHold + archived,
  };
}

export async function fetchActiveSupplierOptions(limit = 200): Promise<OpsSupplierOption[]> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsSuppliers(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, supplier_code, legal_name, trading_name")
    .eq("status", "active")
    .order("legal_name", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 500));

  if (error) {
    throw error;
  }

  return (data ?? []).map((supplier) => ({
    id: supplier.id as string,
    label: supplier.trading_name
      ? `${supplier.legal_name} (${supplier.trading_name})`
      : (supplier.legal_name as string),
    supplier_code: supplier.supplier_code as string,
  }));
}
