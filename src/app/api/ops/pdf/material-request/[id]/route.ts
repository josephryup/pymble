import { NextResponse } from "next/server";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { logOpsServerError } from "@/lib/ops/log";
import { fetchOpsMaterialRequestById } from "@/lib/ops/material-requests";
import {
  canManageOpsMaterialRequest,
  canViewAllOpsMaterialRequests,
} from "@/lib/ops/material-request-permissions";
import { fetchOpsOrganizationProfile } from "@/lib/ops/organization";
import { MaterialRequestPdf } from "@/lib/ops/pdf/MaterialRequestPdf";
import { renderPdfDocument, pdfResponseHeaders } from "@/lib/ops/pdf/render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  try {
    const { profile } = await requireOpsUser();

    const request = await fetchOpsMaterialRequestById(id);
    if (!request) {
      return NextResponse.json(
        { error: "Material request not found." },
        { status: 404 },
      );
    }

    // Anyone who can view-all, manage, or owns the request can download it.
    const canView =
      canViewAllOpsMaterialRequests(profile.role) ||
      canManageOpsMaterialRequest(profile.role) ||
      request.requested_by === profile.id;
    if (!canView) {
      return NextResponse.json(
        { error: "Your role cannot view this material request." },
        { status: 403 },
      );
    }

    const org = (await fetchOpsOrganizationProfile().catch(() => null)) ?? null;

    const pdf = await renderPdfDocument(
      MaterialRequestPdf({
        request,
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
        requestedBy: request.requester
          ? {
              full_name: request.requester.full_name,
              role: request.requester.role ?? null,
            }
          : null,
        generatedBy: profile.full_name,
      }),
    );

    await recordOpsAuditEvent({
      action: "material_request.pdf_downloaded",
      actorUserId: profile.id,
      entityId: request.id,
      entityType: "material_request",
      metadata: { request_number: request.request_number },
      moduleKey: "material_requests",
      sourceId: request.id,
      sourceTable: "material_requests",
      summary: `${profile.full_name} downloaded ${request.request_number} as PDF`,
    }).catch(() => null);

    return new NextResponse(new Uint8Array(pdf), {
      headers: pdfResponseHeaders(`${request.request_number}.pdf`),
    });
  } catch (error) {
    logOpsServerError(error, {
      module: "material_requests",
      action: "downloadMaterialRequestPdf",
      entityId: id,
    });
    return NextResponse.json(
      { error: "The material request PDF could not be generated." },
      { status: 500 },
    );
  }
}
