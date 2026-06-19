import { NextResponse } from "next/server";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { logOpsServerError } from "@/lib/ops/log";
import { fetchOpsOrganizationProfile } from "@/lib/ops/organization";
import {
  PurchaseOrderPdf,
  type PurchaseOrderPdfLine,
} from "@/lib/ops/pdf/PurchaseOrderPdf";
import { renderPdfDocument, pdfResponseHeaders } from "@/lib/ops/pdf/render";
import { canCreateOpsMaterialRequest } from "@/lib/ops/material-request-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type RawPoItem = {
  item_name: string;
  specification: string;
  unit: string;
  quantity: number | string;
  unit_cost: number | string;
  line_total: number | string | null;
  supplier_name_freeform: string | null;
};

type RawSupplier = {
  legal_name: string;
  supplier_code: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  address_line?: string | null;
};

type RawPo = {
  id: string;
  po_number: string;
  title: string;
  description: string;
  status: string;
  issued_at: string | null;
  created_at: string;
  currency_code: string;
  total_amount: number | string;
  site: { code: string; name: string } | { code: string; name: string }[] | null;
  supplier: RawSupplier | RawSupplier[] | null;
};

function normalizeRel<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function num(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  try {
    const { profile } = await requireOpsUser();

    // Reuse the create-MR role gate as the procurement gate — same audience
    // (procurement, ops, leadership) already controls who can see PO data.
    if (!canCreateOpsMaterialRequest(profile.role)) {
      return NextResponse.json(
        { error: "Your role cannot download purchase orders." },
        { status: 403 },
      );
    }

    const supabase = getOpsSupabaseServiceClient();
    const [poRes, itemsRes, orgRes] = await Promise.all([
      supabase
        .from("purchase_orders")
        .select(
          "id, po_number, title, description, status, issued_at, created_at, currency_code, total_amount, site:sites!purchase_orders_site_id_fkey(code, name), supplier:suppliers!purchase_orders_supplier_id_fkey(legal_name, supplier_code, contact_email, contact_phone, address_line)",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("purchase_order_items")
        .select(
          "item_name, specification, unit, quantity, unit_cost, line_total, supplier_name_freeform",
        )
        .eq("purchase_order_id", id)
        .order("line_number"),
      fetchOpsOrganizationProfile().catch(() => null),
    ]);

    if (poRes.error || !poRes.data) {
      return NextResponse.json(
        { error: poRes.error?.message ?? "Purchase order not found." },
        { status: 404 },
      );
    }

    const raw = poRes.data as unknown as RawPo;
    const supplier = normalizeRel(raw.supplier);
    if (!supplier) {
      return NextResponse.json(
        { error: "Purchase order has no supplier set." },
        { status: 422 },
      );
    }

    const items = (itemsRes.data ?? []) as RawPoItem[];
    const lines: PurchaseOrderPdfLine[] = items.map((item) => {
      const lineTotal = num(item.line_total) || num(item.unit_cost) * num(item.quantity);
      return {
        item_name: item.item_name,
        specification: item.specification ?? "",
        unit: item.unit,
        quantity: num(item.quantity),
        unit_cost: num(item.unit_cost),
        line_total: lineTotal,
        supplier_name: item.supplier_name_freeform ?? null,
      };
    });

    const pdf = await renderPdfDocument(
      PurchaseOrderPdf({
        po: {
          id: raw.id,
          po_number: raw.po_number,
          title: raw.title,
          description: raw.description ?? "",
          status: raw.status,
          issued_at: raw.issued_at,
          created_at: raw.created_at,
          site: normalizeRel(raw.site),
          supplier: {
            legal_name: supplier.legal_name,
            supplier_code: supplier.supplier_code,
            contact_email: supplier.contact_email ?? null,
            contact_phone: supplier.contact_phone ?? null,
            address: supplier.address_line ?? null,
          },
          total_amount: num(raw.total_amount),
          currency_code: raw.currency_code || "ZMW",
        },
        lines,
        org: orgRes
          ? {
              legal_name: orgRes.legal_name,
              trading_name: orgRes.trading_name,
              headquarters_address: orgRes.address_line ?? null,
              tpin: orgRes.tpin,
            }
          : {},
        generatedBy: profile.full_name,
      }),
    );

    await recordOpsAuditEvent({
      action: "purchase_order.pdf_downloaded",
      actorUserId: profile.id,
      entityId: raw.id,
      entityType: "purchase_order",
      metadata: { po_number: raw.po_number },
      moduleKey: "rfq_po",
      sourceId: raw.id,
      sourceTable: "purchase_orders",
      summary: `${profile.full_name} downloaded ${raw.po_number} as PDF`,
    }).catch(() => null);

    return new NextResponse(new Uint8Array(pdf), {
      headers: pdfResponseHeaders(`${raw.po_number}.pdf`),
    });
  } catch (error) {
    logOpsServerError(error, {
      module: "rfq_po",
      action: "downloadPurchaseOrderPdf",
      entityId: id,
    });
    return NextResponse.json(
      { error: "The purchase order PDF could not be generated." },
      { status: 500 },
    );
  }
}
