import { NextResponse } from "next/server";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { logOpsServerError } from "@/lib/ops/log";
import { fetchOpsOrganizationProfile } from "@/lib/ops/organization";
import { StaffPayslipPdf } from "@/lib/ops/pdf/StaffPayslipPdf";
import { renderPdfDocument, pdfResponseHeaders } from "@/lib/ops/pdf/render";
import { canViewOpsStaffPayroll, fetchOpsStaffPayslipYtd } from "@/lib/ops/staff-payroll";
import { resolveZambianTaxYear } from "@/lib/ops/statutory/rates";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Download a staff payslip for a single staff payroll item.
 *
 * Access policy:
 *   * Leadership + HR + Finance/Accountant (back-office viewers), OR
 *   * The employee themselves (via employees.user_id = auth.uid()).
 *
 * Everyone else gets a clear 403. The audit event distinguishes self-service
 * downloads from back-office ones.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ itemId: string }>;
};

type RawItem = {
  id: string;
  staff_payroll_run_id: string;
  employee_id: string;
  employee_number: string;
  full_name: string;
  job_title: string;
  department: string;
  nrc_number: string;
  napsa_number: string;
  basic_pay: number | string;
  housing_allowance: number | string;
  other_allowances: number | string;
  gross_pay: number | string;
  paye_amount: number | string;
  napsa_employee: number | string;
  napsa_employer: number | string;
  nhima_employee: number | string;
  nhima_employer: number | string;
  wcf_employer: number | string;
  advance_deduction: number | string;
  net_pay: number | string;
  tax_year: number | null;
  statutory_citation: string | null;
  payroll_run:
    | {
        id: string;
        period_label: string;
        period_start: string;
        period_end: string;
      }
    | Array<{
        id: string;
        period_label: string;
        period_start: string;
        period_end: string;
      }>
    | null;
  employee:
    | {
        user_id: string | null;
      }
    | Array<{ user_id: string | null }>
    | null;
};

function num(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function pickRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { itemId } = await params;
  try {
    const { profile } = await requireOpsUser();

    const supabase = getOpsSupabaseServiceClient();
    const [itemRes, orgRes] = await Promise.all([
      supabase
        .from("staff_payroll_items")
        .select(
          [
            "id",
            "staff_payroll_run_id",
            "employee_id",
            "employee_number",
            "full_name",
            "job_title",
            "department",
            "nrc_number",
            "napsa_number",
            "basic_pay",
            "housing_allowance",
            "other_allowances",
            "gross_pay",
            "paye_amount",
            "napsa_employee",
            "napsa_employer",
            "nhima_employee",
            "nhima_employer",
            "wcf_employer",
            "advance_deduction",
            "net_pay",
            "tax_year",
            "statutory_citation",
            "payroll_run:staff_payroll_runs!staff_payroll_items_staff_payroll_run_id_fkey(id, period_label, period_start, period_end)",
            "employee:employees!staff_payroll_items_employee_id_fkey(user_id)",
          ].join(", "),
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
    const run = pickRelation(raw.payroll_run);
    const employee = pickRelation(raw.employee);
    if (!run) {
      return NextResponse.json(
        { error: "Payslip is missing a payroll run reference." },
        { status: 500 },
      );
    }

    // Three-way gate: back-office role, or the employee themselves.
    const isBackOffice = canViewOpsStaffPayroll(profile.role);
    const isOwner = employee?.user_id === profile.id;

    if (!isBackOffice && !isOwner) {
      return NextResponse.json(
        { error: "Your role cannot download this payslip." },
        { status: 403 },
      );
    }

    // YTD + leave snapshot — read against the period end's calendar year.
    const periodYear = Number(run.period_end.slice(0, 4));
    const ytd = await fetchOpsStaffPayslipYtd(raw.employee_id, periodYear);
    const rates = resolveZambianTaxYear(run.period_end);
    const freePayBand = rates.payeMonthlyBands.find((band) => band.rate === 0);
    const freePayMonthly = freePayBand ? freePayBand.to - freePayBand.from : 0;
    // Free Pay YTD = ZRA tax-free band × number of YTD runs this employee
    // actually has. Mid-year hires accrue free pay only for months they
    // were paid, not calendar months.
    const freePayYtd =
      Math.round(freePayMonthly * Math.max(ytd.runsCounted, 1) * 100) / 100;

    // Leave snapshot — query the current year's annual leave balance.
    const { data: leaveRow } = await supabase
      .from("leave_balances")
      .select("opening_balance, accrued_days, used_days, adjustment_days, available_days")
      .eq("employee_id", raw.employee_id)
      .eq("leave_type", "annual")
      .eq("balance_year", periodYear)
      .maybeSingle();

    // Leave rate is taken from the active contract.
    const { data: contractRow } = await supabase
      .from("employee_contracts")
      .select("leave_rate_per_month")
      .eq("employee_id", raw.employee_id)
      .eq("status", "active")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const leave = {
      rate_per_month: Number((contractRow as { leave_rate_per_month?: number | string } | null)?.leave_rate_per_month ?? 2.5),
      days_due: Number((leaveRow as { available_days?: number | string } | null)?.available_days ?? 0),
      days_taken: Number((leaveRow as { used_days?: number | string } | null)?.used_days ?? 0),
    };

    const pdf = await renderPdfDocument(
      StaffPayslipPdf({
        run: {
          period_label: run.period_label,
          period_start: run.period_start,
          period_end: run.period_end,
        },
        item: {
          id: raw.id,
          employee_number: raw.employee_number,
          full_name: raw.full_name,
          job_title: raw.job_title,
          department: raw.department,
          nrc_number: raw.nrc_number,
          napsa_number: raw.napsa_number,
          basic_pay: num(raw.basic_pay),
          housing_allowance: num(raw.housing_allowance),
          other_allowances: num(raw.other_allowances),
          gross_pay: num(raw.gross_pay),
          paye_amount: num(raw.paye_amount),
          napsa_employee: num(raw.napsa_employee),
          napsa_employer: num(raw.napsa_employer),
          nhima_employee: num(raw.nhima_employee),
          nhima_employer: num(raw.nhima_employer),
          wcf_employer: num(raw.wcf_employer),
          advance_deduction: num(raw.advance_deduction),
          net_pay: num(raw.net_pay),
          // Derive tax year from the period end at render time so the slip
          // always reflects the period's calendar year, even if rates were
          // re-cited later. The stored field stays for traceability.
          tax_year: rates.year,
          statutory_citation: rates.citation,
        },
        ytd: { ...ytd, freePayYtd },
        leave,
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
      action: "staff_payslip.pdf_downloaded",
      actorUserId: profile.id,
      entityId: raw.id,
      entityType: "staff_payroll_item",
      metadata: {
        employee_number: raw.employee_number,
        period: run.period_label,
        self_service: isOwner && !isBackOffice,
      },
      moduleKey: "staff_payroll",
      sourceId: raw.id,
      sourceTable: "staff_payroll_items",
      summary: `${profile.full_name} downloaded staff payslip ${raw.employee_number} (${run.period_label})`,
    }).catch(() => null);

    return new NextResponse(new Uint8Array(pdf), {
      headers: pdfResponseHeaders(
        `payslip-${raw.employee_number}-${run.period_label.replace(/\s+/g, "-")}.pdf`,
      ),
    });
  } catch (error) {
    logOpsServerError(error, {
      module: "staff_payroll",
      action: "downloadStaffPayslipPdf",
      entityId: itemId,
    });
    return NextResponse.json(
      { error: "The payslip PDF could not be generated." },
      { status: 500 },
    );
  }
}
