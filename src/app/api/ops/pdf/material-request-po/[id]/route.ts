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
import {
  MaterialRequestPurchaseOrderPdf,
  type MaterialRequestPoLine,
} from "@/lib/ops/pdf/MaterialRequestPurchaseOrderPdf";
import { renderPdfDocument, pdfResponseHeaders } from "@/lib/ops/pdf/render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// A purchase order is only meaningful once Finance has approved the cost, so the
// document is available from `approved` onward (approved → ordered → closed).
const PO_READY_STATUSES = new Set(["approved", "ordered", "closed"]);

function num(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function derivePoNumber(requestNumber: string) {
  const swapped = requestNumber.replace(/^MR[-_]?/i, "PO-");
  return swapped === requestNumber ? `PO-${requestNumber}` : swapped;
}

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

    if (!PO_READY_STATUSES.has(request.status)) {
      return NextResponse.json(
        {
          error:
            "A purchase order is available only after Finance has approved the material request.",
        },
        { status: 409 },
      );
    }

    const lines: MaterialRequestPoLine[] = request.items.map((item) => {
      const unitCost = num(item.actual_unit_cost) || num(item.estimated_unit_cost);
      const lineTotal =
        num(item.actual_total) ||
        num(item.estimated_total) ||
        unitCost * num(item.quantity);
      return {
        item_name: item.item_name,
        specification: item.specification ?? "",
        unit: item.unit,
        quantity: num(item.quantity),
        unit_cost: unitCost,
        line_total: lineTotal,
        supplier_name: item.supplier_name,
      };
    });

    const suppliers = Array.from(
      new Set(
        request.items
          .map((item) => item.supplier_name)
          .filter((name): name is string => Boolean(name && name.trim())),
      ),
    );

    const org = (await fetchOpsOrganizationProfile().catch(() => null)) ?? null;
    const poNumber = derivePoNumber(request.request_number);

    const pdf = await renderPdfDocument(
      MaterialRequestPurchaseOrderPdf({
        po: {
          po_number: poNumber,
          request_number: request.request_number,
          title: request.title,
          description: request.description ?? "",
          status: request.status,
          priority: request.priority,
          needed_by: request.needed_by,
          priced_at: request.priced_at,
          approved_at: request.approved_at,
          created_at: request.created_at,
          site: request.site
            ? { code: request.site.code, name: request.site.name }
            : null,
          currency_code: "ZMW",
        },
        lines,
        suppliers,
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
      action: "material_request.purchase_order_downloaded",
      actorUserId: profile.id,
      entityId: request.id,
      entityType: "material_request",
      metadata: { request_number: request.request_number, po_number: poNumber },
      moduleKey: "material_requests",
      sourceId: request.id,
      sourceTable: "material_requests",
      summary: `${profile.full_name} downloaded purchase order ${poNumber}`,
    }).catch(() => null);

    return new NextResponse(new Uint8Array(pdf), {
      headers: pdfResponseHeaders(`${poNumber}.pdf`),
    });
  } catch (error) {
    logOpsServerError(error, {
      module: "material_requests",
      action: "downloadMaterialRequestPurchaseOrderPdf",
      entityId: id,
    });
    return NextResponse.json(
      { error: "The purchase order PDF could not be generated." },
      { status: 500 },
    );
  }
}
