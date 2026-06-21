import { NextResponse } from "next/server";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { logOpsServerError } from "@/lib/ops/log";
import { fetchOpsOrganizationProfile } from "@/lib/ops/organization";
import { isLeadershipRole, isHumanResourceRole } from "@/lib/ops/roles";
import { PayslipPdf } from "@/lib/ops/pdf/PayslipPdf";
import { renderPdfDocument, pdfResponseHeaders } from "@/lib/ops/pdf/render";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Download a payslip for a single payroll line item.
 *
 * Access policy:
 *   * Leadership (Developer, Managing Director, General Manager, Owner)
 *   * Human Resources
 *   * Finance Manager + Accountant
 *
 * Workers do not have ops accounts yet, so worker self-download is not
 * supported in this sprint. When worker accounts are introduced, extend the
 * permission check to allow the worker linked to this row.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ itemId: string }>;
};

type RawItem = {
  id: string;
  payroll_run_id: string;
  gross_pay: number | string;
  advance_deduction: number | string;
  net_pay: number | string;
  paye_amount: number | string;
  napsa_employee: number | string;
  napsa_employer: number | string;
  wcf_employer: number | string;
  tax_year: number | null;
  statutory_citation: string | null;
  worker: {
    worker_code: string;
    full_name: string;
    trade: string;
    phone: string | null;
    momo_provider: string | null;
    momo_number: string | null;
  } | null;
  payroll_run: {
    id: string;
    period_label: string;
    period_start: string;
    period_end: string;
  } | null;
};

function num(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { itemId } = await params;
  try {
    const { profile } = await requireOpsUser();

    const canDownload =
      isLeadershipRole(profile.role) ||
      isHumanResourceRole(profile.role) ||
      profile.role === "finance_manager" ||
      profile.role === "accountant";

    if (!canDownload) {
      return NextResponse.json(
        { error: "Your role cannot download payslips." },
        { status: 403 },
      );
    }

    const supabase = getOpsSupabaseServiceClient();
    const [itemRes, orgRes] = await Promise.all([
      supabase
        .from("payroll_run_items")
        .select(
          "id, payroll_run_id, gross_pay, advance_deduction, net_pay, paye_amount, napsa_employee, napsa_employer, wcf_employer, tax_year, statutory_citation, worker:workers!payroll_run_items_worker_id_fkey(worker_code, full_name, trade, phone, momo_provider, momo_number), payroll_run:payroll_runs!payroll_run_items_payroll_run_id_fkey(id, period_label, period_start, period_end)",
        )
        .eq("id", itemId)
        .maybeSingle(),
      fetchOpsOrganizationProfile().catch(() => null),
    ]);

    if (itemRes.error || !itemRes.data) {
      return NextResponse.json(
        { error: itemRes.error?.message ?? "Payslip not found." },
        { status: 404 },
      );
    }

    const raw = itemRes.data as unknown as RawItem;
    const worker = Array.isArray(raw.worker) ? raw.worker[0] : raw.worker;
    const run = Array.isArray(raw.payroll_run) ? raw.payroll_run[0] : raw.payroll_run;
    if (!worker || !run) {
      return NextResponse.json(
        { error: "Payslip is missing worker or run reference." },
        { status: 500 },
      );
    }

    const pdf = await renderPdfDocument(
      PayslipPdf({
        run,
        item: {
          id: raw.id,
          gross_pay: num(raw.gross_pay),
          advance_deduction: num(raw.advance_deduction),
          net_pay: num(raw.net_pay),
          paye_amount: num(raw.paye_amount),
          napsa_employee: num(raw.napsa_employee),
          napsa_employer: num(raw.napsa_employer),
          wcf_employer: num(raw.wcf_employer),
          tax_year: raw.tax_year,
          statutory_citation: raw.statutory_citation,
        },
        worker,
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
      action: "payslip.pdf_downloaded",
      actorUserId: profile.id,
      entityId: raw.id,
      entityType: "payroll_run_item",
      metadata: { worker_code: worker.worker_code, period: run.period_label },
      moduleKey: "payroll",
      sourceId: raw.id,
      sourceTable: "payroll_run_items",
      summary: `${profile.full_name} downloaded payslip for ${worker.worker_code} (${run.period_label})`,
    }).catch(() => null);

    return new NextResponse(new Uint8Array(pdf), {
      headers: pdfResponseHeaders(
        `payslip-${worker.worker_code}-${run.period_label.replace(/\s+/g, "-")}.pdf`,
      ),
    });
  } catch (error) {
    logOpsServerError(error, {
      module: "payroll",
      action: "downloadPayslipPdf",
      entityId: itemId,
    });
    return NextResponse.json(
      { error: "The payslip PDF could not be generated." },
      { status: 500 },
    );
  }
}
