import { requireOpsUser } from "@/lib/ops/auth";
import { opsIlikePattern, toOpsPaginatedResult, type OpsListState } from "@/lib/ops/listing";
import { canViewOpsQuotations } from "@/lib/ops/quotation-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsQuotationStatus } from "@/lib/ops/types";

export type OpsQuotationItem = {
  id: string;
  quotation_id: string;
  line_number: number;
  description: string;
  specification: string;
  unit: string;
  quantity: number;
  unit_rate: number;
  line_total: number;
};

export type OpsQuotation = {
  id: string;
  quotation_number: string;
  title: string;
  client_name: string;
  client_contact: string;
  client_email: string;
  client_phone: string;
  client_address: string;
  client_tpin: string;
  status: OpsQuotationStatus;
  currency_code: string;
  vat_rate: number;
  issued_on: string;
  valid_until: string | null;
  scope_summary: string;
  terms: string;
  notes: string;
  sent_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  archived_at: string | null;
  /** The project this quotation was converted into, once won (audit D10). */
  site_id: string | null;
  customer_id: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
  items: OpsQuotationItem[];
  /** Sum of line totals. */
  subtotal: number;
  /** subtotal × vat_rate%. */
  vat_amount: number;
  /** subtotal + vat_amount. */
  total_amount: number;
};

function normalizeMoney(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Totals are derived from the lines rather than stored on the quotation, so a
 * line edit can never leave a stale header figure behind.
 */
export function computeQuotationTotals(
  items: Array<Pick<OpsQuotationItem, "line_total">>,
  vatRate: number,
) {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.line_total, 0));
  const vatAmount = roundMoney((subtotal * vatRate) / 100);
  return {
    subtotal,
    vat_amount: vatAmount,
    total_amount: roundMoney(subtotal + vatAmount),
  };
}

export type OpsQuotationFilters = {
  listState: OpsListState;
  status?: OpsQuotationStatus | null;
  includeArchived?: boolean;
};

const QUOTATION_COLUMNS =
  "id, quotation_number, title, client_name, client_contact, client_email, client_phone, client_address, client_tpin, status, currency_code, vat_rate, issued_on, valid_until, scope_summary, terms, notes, sent_at, accepted_at, declined_at, archived_at, site_id, customer_id, converted_at, created_at, updated_at";

const ITEM_COLUMNS =
  "id, quotation_id, line_number, description, specification, unit, quantity, unit_rate, line_total";

function normalizeItem(row: Record<string, unknown>): OpsQuotationItem {
  return {
    id: String(row.id),
    quotation_id: String(row.quotation_id),
    line_number: Number(row.line_number ?? 0),
    description: String(row.description ?? ""),
    specification: String(row.specification ?? ""),
    unit: String(row.unit ?? ""),
    quantity: normalizeMoney(row.quantity as number | string),
    unit_rate: normalizeMoney(row.unit_rate as number | string),
    line_total: normalizeMoney(row.line_total as number | string),
  };
}

function attachTotals(
  quotation: Record<string, unknown>,
  items: OpsQuotationItem[],
): OpsQuotation {
  const vatRate = normalizeMoney(quotation.vat_rate as number | string);
  return {
    ...(quotation as unknown as Omit<
      OpsQuotation,
      "items" | "subtotal" | "vat_amount" | "total_amount" | "vat_rate"
    >),
    vat_rate: vatRate,
    items,
    ...computeQuotationTotals(items, vatRate),
  };
}

export async function fetchPaginatedOpsQuotations(filters: OpsQuotationFilters) {
  const { profile } = await requireOpsUser();
  if (!canViewOpsQuotations(profile.role)) {
    return toOpsPaginatedResult([] as OpsQuotation[], 0, filters.listState);
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("quotations")
    .select(QUOTATION_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false });

  if (!filters.includeArchived) {
    query = query.is("archived_at", null);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const pattern = opsIlikePattern(filters.listState.query);
  if (pattern) {
    query = query.or(
      `title.ilike.${pattern},client_name.ilike.${pattern},quotation_number.ilike.${pattern}`,
    );
  }

  const { data, error, count } = await query.range(
    filters.listState.from,
    filters.listState.to,
  );

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) {
    return toOpsPaginatedResult([] as OpsQuotation[], count ?? 0, filters.listState);
  }

  const { data: itemData, error: itemError } = await supabase
    .from("quotation_items")
    .select(ITEM_COLUMNS)
    .in(
      "quotation_id",
      rows.map((row) => String(row.id)),
    )
    .order("line_number", { ascending: true });

  if (itemError) {
    throw itemError;
  }

  const items = ((itemData ?? []) as Array<Record<string, unknown>>).map(normalizeItem);
  const quotations = rows.map((row) =>
    attachTotals(
      row,
      items.filter((item) => item.quotation_id === String(row.id)),
    ),
  );

  return toOpsPaginatedResult(quotations, count ?? 0, filters.listState);
}

/** Single quotation with its lines — used by the PDF route. */
export async function fetchOpsQuotationById(id: string): Promise<OpsQuotation | null> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("quotations")
    .select(QUOTATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  const { data: itemData, error: itemError } = await supabase
    .from("quotation_items")
    .select(ITEM_COLUMNS)
    .eq("quotation_id", id)
    .order("line_number", { ascending: true });

  if (itemError) {
    throw itemError;
  }

  return attachTotals(
    data as Record<string, unknown>,
    ((itemData ?? []) as Array<Record<string, unknown>>).map(normalizeItem),
  );
}

export type OpsQuotationStats = {
  draft: number;
  sent: number;
  accepted: number;
  acceptedValue: number;
  openValue: number;
};

export async function fetchOpsQuotationStats(): Promise<OpsQuotationStats> {
  const { profile } = await requireOpsUser();
  const empty = { draft: 0, sent: 0, accepted: 0, acceptedValue: 0, openValue: 0 };
  if (!canViewOpsQuotations(profile.role)) {
    return empty;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("quotations")
    .select("id, status, vat_rate")
    .is("archived_at", null);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as Array<{ id: string; status: OpsQuotationStatus; vat_rate: number | string }>;
  if (rows.length === 0) {
    return empty;
  }

  const { data: itemData, error: itemError } = await supabase
    .from("quotation_items")
    .select("quotation_id, line_total")
    .in(
      "quotation_id",
      rows.map((row) => row.id),
    );

  if (itemError) {
    throw itemError;
  }

  const subtotalByQuotation = new Map<string, number>();
  for (const item of (itemData ?? []) as Array<{ quotation_id: string; line_total: number | string }>) {
    subtotalByQuotation.set(
      item.quotation_id,
      (subtotalByQuotation.get(item.quotation_id) ?? 0) + normalizeMoney(item.line_total),
    );
  }

  const stats = { ...empty };
  for (const row of rows) {
    const subtotal = subtotalByQuotation.get(row.id) ?? 0;
    const vatRate = normalizeMoney(row.vat_rate);
    const total = roundMoney(subtotal + (subtotal * vatRate) / 100);

    if (row.status === "draft") stats.draft += 1;
    if (row.status === "sent") {
      stats.sent += 1;
      stats.openValue = roundMoney(stats.openValue + total);
    }
    if (row.status === "accepted") {
      stats.accepted += 1;
      stats.acceptedValue = roundMoney(stats.acceptedValue + total);
    }
  }

  return stats;
}
