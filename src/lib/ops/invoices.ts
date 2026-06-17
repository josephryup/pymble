import { createOpsServerSessionClient } from "@/lib/ops/auth";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import type { OpsInvoiceStatus } from "@/lib/ops/types";

export type OpsInvoiceSite = {
  id: string;
  code: string;
  name: string;
};

export type OpsInvoiceBoq = {
  id: string;
  title: string;
};

export type OpsInvoice = {
  id: string;
  site_id: string;
  boq_id: string | null;
  invoice_number: string;
  client_name: string;
  tpin: string | null;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  status: OpsInvoiceStatus;
  issued_at: string;
  sent_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  site: OpsInvoiceSite | null;
  boq: OpsInvoiceBoq | null;
};

type Relation<T> = T | T[] | null;

type RawInvoice = Omit<OpsInvoice, "boq" | "site" | "subtotal" | "total_amount" | "vat_amount"> & {
  boq: Relation<OpsInvoiceBoq>;
  site: Relation<OpsInvoiceSite>;
  subtotal: number | string;
  total_amount: number | string;
  vat_amount: number | string;
};

export type FetchOpsInvoicesOptions = {
  query?: string;
  status?: OpsInvoiceStatus;
};

export type FetchPaginatedOpsInvoicesOptions = FetchOpsInvoicesOptions & {
  listState: OpsListState;
};

export type OpsInvoiceStatusCounts = Record<OpsInvoiceStatus | "total", number>;

function normalizeMoney(value: number | string | null) {
  return Number(value ?? 0);
}

function normalizeRelation<T>(value: Relation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function fetchOpsInvoiceItems(options: FetchOpsInvoicesOptions = {}, listState?: OpsListState) {
  const supabase = await createOpsServerSessionClient();
  let query = supabase
    .from("invoices")
    .select(
      `
        id,
        site_id,
        boq_id,
        invoice_number,
        client_name,
        tpin,
        subtotal,
        vat_amount,
        total_amount,
        status,
        issued_at,
        sent_at,
        paid_at,
        cancelled_at,
        archived_at,
        deleted_at,
        created_at,
        site:sites!invoices_site_id_fkey(id, code, name),
        boq:boq_documents!invoices_boq_id_fkey(id, title)
      `,
      listState ? { count: "exact" } : undefined,
    )
    .is("deleted_at", null)
    .is("archived_at", null)
    .is("cancelled_at", null)
    .order("issued_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }

  const searchFilter = opsIlikeOrFilter(
    ["invoice_number", "client_name", "tpin"],
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

  const items = ((data ?? []) as unknown as RawInvoice[]).map((invoice) => ({
    ...invoice,
    boq: normalizeRelation(invoice.boq),
    site: normalizeRelation(invoice.site),
    subtotal: normalizeMoney(invoice.subtotal),
    total_amount: normalizeMoney(invoice.total_amount),
    vat_amount: normalizeMoney(invoice.vat_amount),
  }));

  return {
    count,
    items,
  };
}

export async function fetchOpsInvoices(options: FetchOpsInvoicesOptions = {}) {
  const result = await fetchOpsInvoiceItems(options);
  return result.items;
}

export async function fetchPaginatedOpsInvoices(
  options: FetchPaginatedOpsInvoicesOptions,
): Promise<OpsPaginatedResult<OpsInvoice>> {
  const result = await fetchOpsInvoiceItems(options, options.listState);
  return toOpsPaginatedResult(result.items, result.count, options.listState);
}

export async function fetchOpsInvoiceStatusCounts(): Promise<OpsInvoiceStatusCounts> {
  const supabase = await createOpsServerSessionClient();
  const [totalResult, draftResult, sentResult, paidResult] = await Promise.all([
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft")
      .is("deleted_at", null),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .is("deleted_at", null),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("status", "paid")
      .is("deleted_at", null),
  ]);

  const firstError =
    totalResult.error ?? draftResult.error ?? sentResult.error ?? paidResult.error;

  if (firstError) {
    throw firstError;
  }

  return {
    draft: draftResult.count ?? 0,
    paid: paidResult.count ?? 0,
    sent: sentResult.count ?? 0,
    total: totalResult.count ?? 0,
  };
}
