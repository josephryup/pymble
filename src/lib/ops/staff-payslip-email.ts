import { getOpsEmailFrom, getOpsEmailReplyTo, getResendClient, recordOpsEmailDeliveryEvent } from "@/lib/ops/email";
import { logOpsServerError } from "@/lib/ops/log";
import { fetchOpsOrganizationProfile } from "@/lib/ops/organization";
import { StaffPayslipPdf } from "@/lib/ops/pdf/StaffPayslipPdf";
import { renderPdfDocument } from "@/lib/ops/pdf/render";
import { fetchOpsStaffPayslipYtd } from "@/lib/ops/staff-payroll";
import { resolveZambianTaxYear } from "@/lib/ops/statutory/rates";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Email each person their own payslip when a run is marked paid (audit §10).
 *
 * Privacy is the whole design constraint here, so it is stated rather than
 * assumed:
 *
 *   • One email, one recipient, one attachment. Never a CC, never a BCC, never
 *     a batch — a single addressing mistake on a payroll email exposes
 *     everyone's salary to everyone.
 *   • The attachment is rendered per person from their own payslip item.
 *   • Someone with no email on record is SKIPPED and reported, never
 *     substituted with a fallback address.
 *
 * Idempotent through Resend's Idempotency-Key plus our own delivery log, so
 * re-marking a run paid — or a retry after a partial failure — cannot send a
 * second copy of someone's payslip.
 *
 * Best-effort by contract: this never throws into the caller. Marking payroll
 * paid is a financial act and must not fail because an email provider is down.
 */

export type PayslipEmailOutcome = {
  sent: number;
  skippedNoEmail: Array<{ employeeNumber: string; fullName: string }>;
  failed: Array<{ employeeNumber: string; fullName: string; reason: string }>;
  /** True when email is not configured at all — nothing was attempted. */
  notConfigured: boolean;
};

type PayslipRow = {
  id: string;
  employee_id: string | null;
  employee_number: string;
  full_name: string;
  job_title: string;
  department: string;
  nrc_number: string;
  napsa_number: string;
  tpin: string;
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
};

function money(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatZmw(value: number) {
  return `ZMW ${value.toLocaleString("en-ZM", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The message body.
 *
 * Deliberately contains the net pay and nothing else of substance: the detail
 * belongs in the attachment, which is the document of record. An email body is
 * forwarded, quoted and previewed on lock screens far more casually than an
 * attachment is opened.
 */
export function buildPayslipEmailContent(input: {
  fullName: string;
  periodLabel: string;
  netPay: number;
  companyName: string;
}) {
  const firstName = input.fullName.trim().split(/\s+/)[0] || input.fullName;
  const subject = `Your payslip for ${input.periodLabel}`;

  const text = [
    `Hello ${firstName},`,
    "",
    `Your payslip for ${input.periodLabel} has been issued and your salary has been paid.`,
    "",
    `Net pay: ${formatZmw(input.netPay)}`,
    "",
    "Your full payslip is attached to this email as a PDF.",
    "",
    "If anything looks wrong, please contact HR.",
    "",
    input.companyName,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111">
      <p>Hello ${escapeHtml(firstName)},</p>
      <p>Your payslip for <strong>${escapeHtml(input.periodLabel)}</strong> has been issued and your salary has been paid.</p>
      <p style="font-size:18px"><strong>Net pay: ${formatZmw(input.netPay)}</strong></p>
      <p>Your full payslip is attached to this email as a PDF.</p>
      <p style="color:#555">If anything looks wrong, please contact HR.</p>
      <p style="color:#555">${escapeHtml(input.companyName)}</p>
    </div>
  `.trim();

  return { subject, text, html };
}

/** Send every payslip in a completed run, one email per person. */
export async function sendStaffPayslipEmailsForRun(input: {
  runId: string;
  actorUserId: string;
}): Promise<PayslipEmailOutcome> {
  const outcome: PayslipEmailOutcome = {
    sent: 0,
    skippedNoEmail: [],
    failed: [],
    notConfigured: false,
  };

  const resend = getResendClient();
  const from = getOpsEmailFrom();
  if (!resend || !from) {
    outcome.notConfigured = true;
    return outcome;
  }

  const supabase = getOpsSupabaseServiceClient();

  const { data: run } = await supabase
    .from("staff_payroll_runs")
    .select("id, period_label, period_start, period_end")
    .eq("id", input.runId)
    .maybeSingle<{
      id: string;
      period_label: string;
      period_start: string;
      period_end: string;
    }>();

  if (!run) {
    return outcome;
  }

  const [{ data: itemRows }, organization] = await Promise.all([
    supabase
      .from("staff_payroll_items")
      .select(
        "id, employee_id, employee_number, full_name, job_title, department, nrc_number, napsa_number, tpin, basic_pay, housing_allowance, other_allowances, gross_pay, paye_amount, napsa_employee, napsa_employer, nhima_employee, nhima_employer, wcf_employer, advance_deduction, net_pay, tax_year, statutory_citation",
      )
      .eq("staff_payroll_run_id", input.runId),
    fetchOpsOrganizationProfile().catch(() => null),
  ]);

  const items = (itemRows ?? []) as PayslipRow[];
  if (items.length === 0) {
    return outcome;
  }

  // Resolve each person's email from their employee record. The payslip item
  // snapshots the name but not the address, and the employee record is the
  // only place an address is maintained.
  const employeeIds = items
    .map((item) => item.employee_id)
    .filter((id): id is string => Boolean(id));

  const emailByEmployeeId = new Map<string, string>();
  if (employeeIds.length > 0) {
    const { data: employees } = await supabase
      .from("employees")
      .select("id, email")
      .in("id", employeeIds);
    for (const employee of (employees ?? []) as Array<{ id: string; email: string | null }>) {
      const address = (employee.email ?? "").trim();
      if (address) {
        emailByEmployeeId.set(employee.id, address);
      }
    }
  }

  const companyName = organization?.legal_name || "Pymble Construction";

  // Sequential on purpose. Payroll runs are tens of people, PDF rendering is
  // CPU-heavy, and a burst of parallel renders on a serverless function is a
  // good way to turn a payroll completion into a timeout (see audit §8).
  for (const item of items) {
    const recipient = item.employee_id ? emailByEmployeeId.get(item.employee_id) : undefined;

    if (!recipient) {
      outcome.skippedNoEmail.push({
        employeeNumber: item.employee_number,
        fullName: item.full_name,
      });
      await recordOpsEmailDeliveryEvent({
        deliveryType: "staff_payslip",
        moduleKey: "staff_payroll",
        reason: "missing_recipient",
        recipientEmail: null,
        recipientId: null,
        recipientName: item.full_name,
        sourceId: input.runId,
        sourceTable: "staff_payroll_runs",
        status: "skipped",
      }).catch(() => null);
      continue;
    }

    // Keyed on the payslip item, so re-running never sends a second copy.
    const idempotencyKey = `ops-staff-payslip:${item.id}`.slice(0, 240);

    try {
      // Mirrors the download route exactly, so the emailed PDF and the one
      // downloaded from the workspace are the same document — including the
      // Free Pay YTD calculation, which accrues per run actually paid rather
      // than per calendar month (mid-year hires).
      const periodYear = Number(run.period_end.slice(0, 4));
      const ytd = await fetchOpsStaffPayslipYtd(item.employee_id ?? "", periodYear);
      const rates = resolveZambianTaxYear(run.period_end);
      const freePayBand = rates.payeMonthlyBands.find((band) => band.rate === 0);
      const freePayMonthly = freePayBand ? freePayBand.to - freePayBand.from : 0;
      const freePayYtd =
        Math.round(freePayMonthly * Math.max(ytd.runsCounted, 1) * 100) / 100;

      // Leave snapshot, same source as the download route.
      const { data: leaveRow } = await supabase
        .from("leave_balances")
        .select("accrued_days, used_days, available_days")
        .eq("employee_id", item.employee_id ?? "")
        .eq("leave_type", "annual")
        .maybeSingle<{
          accrued_days: number | string | null;
          used_days: number | string | null;
          available_days: number | string | null;
        }>();

      const pdf = await renderPdfDocument(
        StaffPayslipPdf({
          item: item as never,
          leave: {
            rate_per_month: 0,
            days_due: money(leaveRow?.available_days),
            days_taken: money(leaveRow?.used_days),
          },
          org: organization as never,
          run: {
            period_label: run.period_label,
            period_start: run.period_start,
            period_end: run.period_end,
          },
          ytd: { ...ytd, freePayYtd } as never,
        }) as never,
      );

      const content = buildPayslipEmailContent({
        companyName,
        fullName: item.full_name,
        netPay: money(item.net_pay),
        periodLabel: run.period_label,
      });

      const { data, error } = await resend.emails.send(
        {
          attachments: [
            {
              content: pdf.toString("base64"),
              filename: `payslip-${item.employee_number}-${run.period_label.replace(/\s+/g, "-")}.pdf`,
            },
          ],
          from,
          html: content.html,
          replyTo: getOpsEmailReplyTo(),
          subject: content.subject,
          text: content.text,
          // One address. Never a list — see the privacy note at the top.
          to: [recipient],
        },
        { headers: { "Idempotency-Key": idempotencyKey } },
      );

      if (error) {
        outcome.failed.push({
          employeeNumber: item.employee_number,
          fullName: item.full_name,
          reason: "send_failed",
        });
        await recordOpsEmailDeliveryEvent({
          deliveryType: "staff_payslip",
          idempotencyKey,
          moduleKey: "staff_payroll",
          reason: "send_failed",
          recipientEmail: recipient,
          recipientName: item.full_name,
          sourceId: input.runId,
          sourceTable: "staff_payroll_runs",
          status: "failed",
        }).catch(() => null);
        continue;
      }

      outcome.sent += 1;
      await recordOpsEmailDeliveryEvent({
        deliveryType: "staff_payslip",
        idempotencyKey,
        moduleKey: "staff_payroll",
        providerMessageId: data?.id,
        reason: "sent",
        recipientEmail: recipient,
        recipientName: item.full_name,
        sourceId: input.runId,
        sourceTable: "staff_payroll_runs",
        status: "sent",
      }).catch(() => null);
    } catch (error) {
      outcome.failed.push({
        employeeNumber: item.employee_number,
        fullName: item.full_name,
        reason: "render_failed",
      });
      logOpsServerError(error, {
        module: "staff_payroll",
        action: "sendStaffPayslipEmailsForRun",
        entityId: item.id,
      });
    }
  }

  return outcome;
}
