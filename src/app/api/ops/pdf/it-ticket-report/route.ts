import { NextResponse } from "next/server";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { canManageItTickets } from "@/lib/ops/it-permissions";
import { fetchOpsItTickets } from "@/lib/ops/it-tickets";
import { logOpsServerError } from "@/lib/ops/log";
import { fetchOpsOrganizationProfile } from "@/lib/ops/organization";
import { ItTicketReportPdf } from "@/lib/ops/pdf/ItTicketReportPdf";
import { pdfResponseHeaders, renderPdfDocument } from "@/lib/ops/pdf/render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { profile } = await requireOpsUser();
    if (!canManageItTickets(profile.role)) {
      return NextResponse.json(
        { error: "Your role cannot export the help-desk queue." },
        { status: 403 },
      );
    }

    const [tickets, org] = await Promise.all([
      fetchOpsItTickets({ openOnly: true }),
      fetchOpsOrganizationProfile().catch(() => null),
    ]);

    const pdf = await renderPdfDocument(
      ItTicketReportPdf({
        generatedBy: profile.full_name,
        org: org
          ? {
              legal_name: org.legal_name,
              trading_name: org.trading_name,
              headquarters_address: org.address_line ?? null,
              tpin: org.tpin,
              email: org.email,
              phone: org.phone_primary,
            }
          : {},
        tickets,
      }),
    );

    await recordOpsAuditEvent({
      action: "it_ticket_report.pdf_downloaded",
      actorUserId: profile.id,
      entityType: "it_ticket",
      moduleKey: "it-helpdesk",
      summary: `${profile.full_name} exported the IT help-desk report (${tickets.length} open)`,
    }).catch(() => null);

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(pdf), {
      headers: pdfResponseHeaders(`it-helpdesk-report-${stamp}.pdf`),
    });
  } catch (error) {
    logOpsServerError(error, { action: "downloadItTicketReportPdf", module: "it-helpdesk" });
    return NextResponse.json(
      { error: "The help-desk report PDF could not be generated." },
      { status: 500 },
    );
  }
}
