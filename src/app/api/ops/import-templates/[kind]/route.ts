import { NextResponse } from "next/server";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  buildOpsImportTemplateCsv,
  buildOpsImportTemplateXlsx,
  isOpsImportTemplateKind,
  OPS_IMPORT_TEMPLATES,
} from "@/lib/ops/import-templates";
import { logOpsServerError } from "@/lib/ops/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ kind: string }>;
};

/**
 * Download an editable import template (CSV or XLSX) for a section that accepts
 * document imports. The file's header row matches what the importer recognises,
 * so it can be edited and re-uploaded directly.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const { kind } = await params;
  try {
    // Any signed-in ops user may download a (non-sensitive) blank template; the
    // import action itself enforces who can actually import.
    await requireOpsUser();

    if (!isOpsImportTemplateKind(kind)) {
      return NextResponse.json({ error: "Unknown template." }, { status: 404 });
    }

    const format = new URL(request.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
    const template = OPS_IMPORT_TEMPLATES[kind];

    if (format === "xlsx") {
      const buffer = buildOpsImportTemplateXlsx(kind);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${template.filename}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const csv = buildOpsImportTemplateCsv(kind);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${template.filename}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logOpsServerError(error, {
      module: "import_templates",
      action: "downloadImportTemplate",
      entityId: kind,
    });
    return NextResponse.json(
      { error: "The template could not be generated." },
      { status: 500 },
    );
  }
}
