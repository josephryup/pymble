import { NextResponse } from "next/server";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsOrganizationProfile } from "@/lib/ops/organization";
import { canCreateInvoice } from "@/lib/ops/invoice-permissions";
import { logOpsServerError } from "@/lib/ops/log";
import { InvoicePdf, type InvoicePdfLine } from "@/lib/ops/pdf/InvoicePdf";
import { renderPdfDocument, pdfResponseHeaders } from "@/lib/ops/pdf/render";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  try {
    const { profile } = await requireOpsUser();

    // Same scope as creating an invoice: Finance + Quantity Surveyor +
    // leadership. Other roles get a 403 instead of a silent file.
    if (!canCreateInvoice(profile.role)) {
      return NextResponse.json(
        { error: "Your role cannot download invoices." },
        { status: 403 },
      );
    }

    const supabase = getOpsSupabaseServiceClient();
    const [invoiceRes, orgRes] = await Promise.all([
      supabase
        .from("invoices")
        .select(
          "id, site_id, boq_id, invoice_number, client_name, tpin, subtotal, vat_amount, total_amount, status, issued_at, sent_at, paid_at, cancelled_at, archived_at, deleted_at, created_at, site:sites!invoices_site_id_fkey(id, code, name), boq:boq_documents!invoices_boq_id_fkey(id, title)",
        )
        .eq("id", id)
        .maybeSingle(),
      fetchOpsOrganizationProfile().catch(() => null),
    ]);

    if (invoiceRes.error || !invoiceRes.data) {
      return NextResponse.json(
        { error: invoiceRes.error?.message ?? "Invoice not found." },
        { status: 404 },
      );
    }

    const rawInvoice = invoiceRes.data as unknown as {
      [key: string]: unknown;
      site: unknown;
      boq: unknown;
      subtotal: number | string;
      vat_amount: number | string;
      total_amount: number | string;
    };
    const normalizeRel = <T,>(value: T | T[] | null) =>
      Array.isArray(value) ? (value[0] ?? null) : value;
    const num = (value: number | string | null | undefined) => Number(value ?? 0);

    const invoice = {
      ...(rawInvoice as Record<string, unknown>),
      site: normalizeRel(rawInvoice.site) as { id: string; code: string; name: string } | null,
      boq: normalizeRel(rawInvoice.boq) as { id: string; title: string } | null,
      subtotal: num(rawInvoice.subtotal),
      vat_amount: num(rawInvoice.vat_amount),
      total_amount: num(rawInvoice.total_amount),
    } as Parameters<typeof InvoicePdf>[0]["invoice"];

    // Synthesise a single summary line because Pymble invoices don't have
    // per-line items in the schema yet.
    const lines: InvoicePdfLine[] = [
      {
        description: invoice.boq
          ? `Construction work delivered against ${invoice.boq.title}`
          : `Construction services delivered to ${invoice.client_name}`,
        quantity: 1,
        unit: "lot",
        unit_rate: invoice.subtotal,
        total: invoice.subtotal,
      },
    ];

    const org = orgRes
      ? {
          legal_name: orgRes.legal_name,
          trading_name: orgRes.trading_name,
          headquarters_address: orgRes.address_line ?? null,
          tpin: orgRes.tpin,
          email: orgRes.email,
          phone: orgRes.phone_primary,
        }
      : {};

    const pdf = await renderPdfDocument(
      InvoicePdf({
        invoice,
        lines,
        org,
        generatedBy: profile.full_name,
      }),
    );

    await recordOpsAuditEvent({
      action: "invoice.pdf_downloaded",
      actorUserId: profile.id,
      entityId: invoice.id,
      entityType: "invoice",
      metadata: { invoice_number: invoice.invoice_number },
      moduleKey: "invoices",
      sourceId: invoice.id,
      sourceTable: "invoices",
      summary: `${profile.full_name} downloaded ${invoice.invoice_number} as PDF`,
    }).catch(() => null);

    return new NextResponse(new Uint8Array(pdf), {
      headers: pdfResponseHeaders(`${invoice.invoice_number}.pdf`),
    });
  } catch (error) {
    logOpsServerError(error, {
      module: "invoices",
      action: "downloadInvoicePdf",
      entityId: id,
    });
    return NextResponse.json(
      { error: "The invoice PDF could not be generated." },
      { status: 500 },
    );
  }
}
