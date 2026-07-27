import { NextResponse } from "next/server";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { logOpsServerError } from "@/lib/ops/log";
import { fetchOpsOrganizationProfile } from "@/lib/ops/organization";
import { QuotationPdf } from "@/lib/ops/pdf/QuotationPdf";
import { renderPdfDocument, pdfResponseHeaders } from "@/lib/ops/pdf/render";
import { canViewOpsQuotations } from "@/lib/ops/quotation-permissions";
import { fetchOpsQuotationById } from "@/lib/ops/quotations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  try {
    const { profile } = await requireOpsUser();

    if (!canViewOpsQuotations(profile.role)) {
      return NextResponse.json(
        { error: "Your role cannot download quotations." },
        { status: 403 },
      );
    }

    const [quotation, orgProfile] = await Promise.all([
      fetchOpsQuotationById(id),
      fetchOpsOrganizationProfile().catch(() => null),
    ]);

    if (!quotation) {
      return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    }

    const org = orgProfile
      ? {
          legal_name: orgProfile.legal_name,
          trading_name: orgProfile.trading_name,
          headquarters_address: [orgProfile.address_line, orgProfile.city, orgProfile.country]
            .filter((part) => Boolean(part && String(part).trim()))
            .join(", "),
          tpin: orgProfile.tpin,
          email: orgProfile.email,
          phone: orgProfile.phone_primary,
        }
      : {};

    const pdf = await renderPdfDocument(
      QuotationPdf({ quotation, org, generatedBy: profile.full_name }),
    );

    await recordOpsAuditEvent({
      action: "quotation.pdf_downloaded",
      actorUserId: profile.id,
      entityId: quotation.id,
      entityType: "quotation",
      metadata: { quotation_number: quotation.quotation_number },
      moduleKey: "quotations",
      sourceId: quotation.id,
      sourceTable: "quotations",
      summary: `${profile.full_name} downloaded ${quotation.quotation_number} as PDF`,
    }).catch(() => null);

    return new NextResponse(new Uint8Array(pdf), {
      headers: pdfResponseHeaders(`${quotation.quotation_number}.pdf`),
    });
  } catch (error) {
    logOpsServerError(error, { module: "quotations", action: "downloadQuotationPdf", entityId: id });
    return NextResponse.json(
      { error: "The quotation PDF could not be generated." },
      { status: 500 },
    );
  }
}
