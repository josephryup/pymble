import { NextResponse } from "next/server";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsItAssets } from "@/lib/ops/it-assets";
import { canViewIT } from "@/lib/ops/it-permissions";
import { logOpsServerError } from "@/lib/ops/log";
import { fetchOpsOrganizationProfile } from "@/lib/ops/organization";
import { ItAssetRegisterPdf } from "@/lib/ops/pdf/ItAssetRegisterPdf";
import { pdfResponseHeaders, renderPdfDocument } from "@/lib/ops/pdf/render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { profile } = await requireOpsUser();
    if (!canViewIT(profile.role)) {
      return NextResponse.json(
        { error: "Your role cannot export the IT asset register." },
        { status: 403 },
      );
    }

    const [assets, org] = await Promise.all([
      fetchOpsItAssets(),
      fetchOpsOrganizationProfile().catch(() => null),
    ]);

    const pdf = await renderPdfDocument(
      ItAssetRegisterPdf({
        assets,
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
      }),
    );

    await recordOpsAuditEvent({
      action: "it_asset_register.pdf_downloaded",
      actorUserId: profile.id,
      entityType: "it_asset",
      moduleKey: "it-assets",
      summary: `${profile.full_name} exported the IT asset register (${assets.length} assets)`,
    }).catch(() => null);

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(pdf), {
      headers: pdfResponseHeaders(`it-asset-register-${stamp}.pdf`),
    });
  } catch (error) {
    logOpsServerError(error, { action: "downloadItAssetRegisterPdf", module: "it-assets" });
    return NextResponse.json(
      { error: "The asset register PDF could not be generated." },
      { status: 500 },
    );
  }
}
