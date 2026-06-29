import { NextResponse } from "next/server";
import { logOpsServerError } from "@/lib/ops/log";
import { timingSafeEqualString } from "@/lib/ops/secure-compare";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Monthly leave accrual job. For every active employee with an active contract,
 * bump that employee's annual leave_balance.accrued_days by their
 * contract.leave_rate_per_month (e.g. 2.5 days/month). Idempotent within the
 * same month — if an accrual line for this month already exists in the notes
 * trail it is skipped.
 *
 * Scheduled by Vercel cron (configure in `vercel.json`) and called with the
 * shared CRON_SECRET bearer token.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EmployeeForAccrual = {
  id: string;
  status: string;
  contract:
    | { leave_rate_per_month: number | string; status: string }
    | Array<{ leave_rate_per_month: number | string; status: string }>
    | null;
};

function pickRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "Scheduled job is not configured.", ok: false },
      { status: 503 },
    );
  }
  if (!timingSafeEqualString(request.headers.get("authorization") ?? "", `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized", ok: false }, { status: 401 });
  }

  const supabase = getOpsSupabaseServiceClient();
  const now = new Date();
  const year = now.getUTCFullYear();
  const monthKey = `${year}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const accruedFlag = `[accrued:${monthKey}]`;

  let accruedCount = 0;
  let skippedCount = 0;
  const issues: string[] = [];

  try {
    const { data: employeesData, error: employeesError } = await supabase
      .from("employees")
      .select(
        [
          "id",
          "status",
          "contract:employee_contracts!employee_contracts_employee_id_fkey(leave_rate_per_month, status)",
        ].join(", "),
      )
      .eq("status", "active");

    if (employeesError) throw employeesError;

    const employees = ((employeesData ?? []) as unknown as EmployeeForAccrual[])
      .map((employee) => ({
        id: employee.id,
        contract: pickRelation(employee.contract),
      }))
      .filter((row) => row.contract && row.contract.status === "active");

    for (const { id: employeeId, contract } of employees) {
      if (!contract) continue;
      const rate = Number(contract.leave_rate_per_month);
      if (!Number.isFinite(rate) || rate <= 0) continue;

      // Read current annual balance for this year.
      const { data: existing, error: readError } = await supabase
        .from("leave_balances")
        .select("id, accrued_days, notes")
        .eq("employee_id", employeeId)
        .eq("leave_type", "annual")
        .eq("balance_year", year)
        .maybeSingle<{ id: string; accrued_days: number | string; notes: string }>();

      if (readError && readError.code !== "PGRST116") {
        issues.push(`read ${employeeId}: ${readError.message}`);
        continue;
      }

      if (existing && existing.notes?.includes(accruedFlag)) {
        skippedCount += 1;
        continue;
      }

      if (existing) {
        const newAccrued = Number(existing.accrued_days) + rate;
        const newNotes = `${existing.notes ? `${existing.notes} ` : ""}${accruedFlag}`.trim();
        const { error: updateError } = await supabase
          .from("leave_balances")
          .update({ accrued_days: newAccrued, notes: newNotes })
          .eq("id", existing.id);
        if (updateError) {
          issues.push(`update ${employeeId}: ${updateError.message}`);
          continue;
        }
      } else {
        const { error: insertError } = await supabase.from("leave_balances").insert({
          employee_id: employeeId,
          leave_type: "annual",
          balance_year: year,
          accrued_days: rate,
          notes: accruedFlag,
        });
        if (insertError) {
          issues.push(`insert ${employeeId}: ${insertError.message}`);
          continue;
        }
      }
      accruedCount += 1;
    }
  } catch (error) {
    logOpsServerError(error, { module: "hr", action: "leave_accrual_cron" });
    issues.push(error instanceof Error ? error.message : String(error));
  }

  return NextResponse.json({
    ok: issues.length === 0,
    year,
    monthKey,
    accruedCount,
    skippedCount,
    issues,
  });
}
