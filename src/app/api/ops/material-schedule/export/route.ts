import { NextResponse } from "next/server";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsBoqDocuments } from "@/lib/ops/boq";
import {
  buildMaterialScheduleXlsx,
  materialScheduleExportFilename,
} from "@/lib/ops/material-schedule-export";
import { logOpsServerError } from "@/lib/ops/log";
import { canAccessOpsHref } from "@/lib/ops/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Material schedule export (audit W1). Exports one schedule by id, or every
 * live schedule when no id is given.
 */
export async function GET(request: Request) {
  try {
    const { profile } = await requireOpsUser();

    if (!canAccessOpsHref(profile.role, "/ops/material-schedule", await fetchOpsModuleAccessOverrides())) {
      return NextResponse.json(
        { error: "Your role cannot export the material schedule." },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const boqId = url.searchParams.get("boq_id");
    const documents = await fetchOpsBoqDocuments();
    const selected = boqId
      ? documents.filter((document) => document.id === boqId)
      : documents;

    if (selected.length === 0) {
      return NextResponse.json(
        { error: "No material schedule matched that request." },
        { status: 404 },
      );
    }

    const label = boqId ? selected[0].title : "all-schedules";
    const workbook = await buildMaterialScheduleXlsx(selected, {
      generatedBy: profile.full_name,
    });

    await recordOpsAuditEvent({
      action: "boq.excel_exported",
      actorUserId: profile.id,
      entityId: boqId ?? null,
      entityType: "boq_document",
      metadata: { schedules: selected.length },
      moduleKey: "boq",
      sourceId: boqId ?? null,
      sourceTable: "boq_documents",
      summary: `${profile.full_name} exported ${selected.length} material schedule(s) to Excel`,
    }).catch(() => null);

    return new NextResponse(new Uint8Array(workbook), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${materialScheduleExportFilename(label)}"`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    logOpsServerError(error, { module: "boq", action: "exportMaterialScheduleExcel" });
    return NextResponse.json(
      { error: "The material schedule Excel file could not be generated." },
      { status: 500 },
    );
  }
}
