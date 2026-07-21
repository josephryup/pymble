import { NextResponse } from "next/server";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { logOpsServerError } from "@/lib/ops/log";
import { buildStaffPayrollExportXlsx, staffPayrollExportFilename } from "@/lib/ops/staff-payroll-export";
import { canViewOpsStaffPayroll, type OpsStaffPayrollItem } from "@/lib/ops/staff-payroll";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ runId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { runId } = await params;
  try {
    const { profile } = await requireOpsUser();
    if (!canViewOpsStaffPayroll(profile.role)) {
      return NextResponse.json({ error: "Your role cannot export staff payroll." }, { status: 403 });
    }

    const supabase = getOpsSupabaseServiceClient();
    const { data: run, error: runError } = await supabase
      .from("staff_payroll_runs")
      .select("id, period_label, period_start, period_end, status")
      .eq("id", runId)
      .is("archived_at", null)
      .maybeSingle();
    if (runError || !run) {
      return NextResponse.json({ error: runError?.message ?? "Payroll run not found." }, { status: 404 });
    }

    const { data: items, error: itemsError } = await supabase
      .from("staff_payroll_items")
      .select("*")
      .eq("staff_payroll_run_id", runId)
      .order("full_name", { ascending: true });
    if (itemsError) throw itemsError;

    const workbook = buildStaffPayrollExportXlsx(
      run,
      (items ?? []) as unknown as OpsStaffPayrollItem[],
    );
    await recordOpsAuditEvent({
      action: "staff_payroll_run.excel_exported",
      actorUserId: profile.id,
      entityId: runId,
      entityType: "staff_payroll_run",
      metadata: { period_label: run.period_label, employees: items?.length ?? 0 },
      moduleKey: "staff_payroll",
      sourceId: runId,
      sourceTable: "staff_payroll_runs",
      summary: `${profile.full_name} exported staff payroll ${run.period_label} to Excel`,
    }).catch(() => null);

    return new NextResponse(new Uint8Array(workbook), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${staffPayrollExportFilename(run.period_label)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logOpsServerError(error, { module: "staff_payroll", action: "exportStaffPayrollExcel", entityId: runId });
    return NextResponse.json({ error: "The payroll Excel file could not be generated." }, { status: 500 });
  }
}
