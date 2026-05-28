import { createOpsServerSessionClient } from "@/lib/ops/auth";
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

function normalizeMoney(value: number | string | null) {
  return Number(value ?? 0);
}

function normalizeRelation<T>(value: Relation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function fetchOpsInvoices() {
  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
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
        created_at,
        site:sites!invoices_site_id_fkey(id, code, name),
        boq:boq_documents!invoices_boq_id_fkey(id, title)
      `,
    )
    .is("deleted_at", null)
    .order("issued_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawInvoice[]).map((invoice) => ({
    ...invoice,
    boq: normalizeRelation(invoice.boq),
    site: normalizeRelation(invoice.site),
    subtotal: normalizeMoney(invoice.subtotal),
    total_amount: normalizeMoney(invoice.total_amount),
    vat_amount: normalizeMoney(invoice.vat_amount),
  }));
}
