import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  FileText,
  Info,
  ReceiptText,
} from "lucide-react";
import { OPS_BRAND } from "@/lib/ops/constants";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsOverview, type OpsOverviewActivity } from "@/lib/ops/overview";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { formatZmw, OPS_FOCUS_CLASS } from "@/lib/ops/ui";
import { OpsOverviewMapPanel } from "@/components/ops/OpsOverviewMapPanel";

function MetricTile({
  href,
  hint,
  label,
  tone = "default",
  value,
}: {
  href: string;
  hint: string;
  label: string;
  tone?: "default" | "money" | "warn";
  value: string;
}) {
  const toneClass =
    tone === "warn"
      ? "text-orange-700"
      : tone === "money"
        ? "text-emerald-700"
        : "text-primary-dark";

  return (
    <Link
      className={`rounded-lg border border-primary-dark/10 bg-white p-4 transition hover:border-primary-blue hover:shadow-sm ${OPS_FOCUS_CLASS}`}
      href={href}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
        {label}
      </p>
      <p className={`mt-3 font-heading text-2xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-primary-dark/55">{hint}</p>
    </Link>
  );
}

function ActionItem({
  href,
  message,
  tone,
}: {
  href: string;
  message: string;
  tone: "info" | "warn";
}) {
  const Icon = tone === "warn" ? AlertTriangle : Info;

  return (
    <Link
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold transition hover:translate-x-0.5 ${OPS_FOCUS_CLASS} ${
        tone === "warn"
          ? "border-orange-200 bg-orange-50 text-orange-800"
          : "border-sky-200 bg-sky-50 text-sky-800"
      }`}
      href={href}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      <ArrowRight className="size-4 shrink-0 opacity-50" aria-hidden="true" />
    </Link>
  );
}

function Pill({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "good" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warn"
        ? "border-orange-200 bg-orange-50 text-orange-700"
        : "border-primary-dark/10 bg-primary-dark/[0.03] text-primary-dark/70";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${toneClass}`}
    >
      {children}
    </span>
  );
}

function QuickLink({
  caption,
  href,
  label,
}: {
  caption: string;
  href: string;
  label: string;
}) {
  return (
    <Link
      className={`group rounded-lg border border-primary-dark/10 bg-white p-4 transition hover:border-primary-blue hover:shadow-sm ${OPS_FOCUS_CLASS}`}
      href={href}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-heading text-base font-bold text-primary-dark">{label}</p>
        <ArrowRight
          className="size-4 text-primary-dark/35 transition group-hover:translate-x-0.5 group-hover:text-primary-blue"
          aria-hidden="true"
        />
      </div>
      <p className="mt-2 text-sm leading-6 text-primary-dark/60">{caption}</p>
    </Link>
  );
}

function activityClass(tone: OpsOverviewActivity["tone"]) {
  if (tone === "good") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (tone === "warn") {
    return "border-orange-200 bg-orange-50 text-orange-800";
  }

  return "border-sky-200 bg-sky-50 text-sky-800";
}

export default async function OpsHomePage() {
  const auth = await requireOpsUser();

  if (!canAccessOpsHref(auth.profile.role, "/ops")) {
    redirect("/ops/profile");
  }

  const overview = await fetchOpsOverview();
  const metrics = [
    {
      href: "/ops/sites",
      hint: "Sites with current operations and map coordinates.",
      label: "Active sites",
      value: overview.sites.length.toLocaleString("en-ZM"),
    },
    {
      href: "/ops/attendance",
      hint: "Attendance records awaiting supervisor review today.",
      label: "Open approvals",
      tone: "warn" as const,
      value: overview.openApprovals.toLocaleString("en-ZM"),
    },
    {
      href: "/ops/payroll",
      hint: overview.draftPayroll
        ? overview.draftPayroll.period_label
        : "Create a run from approved attendance.",
      label: "Draft payroll",
      tone: "money" as const,
      value: overview.draftPayroll ? formatZmw(overview.draftPayroll.total_net) : "No draft",
    },
    {
      href: "/ops/payroll",
      hint: "MoMo payouts that need correction.",
      label: "Failed payouts",
      tone: overview.failedPayouts > 0 ? ("warn" as const) : undefined,
      value: overview.failedPayouts.toLocaleString("en-ZM"),
    },
  ];
  const actionItems: Array<{ href: string; message: string; tone: "info" | "warn" }> = [];

  if (overview.openApprovals > 0) {
    actionItems.push({
      href: "/ops/attendance",
      message: `${overview.openApprovals} attendance record${
        overview.openApprovals === 1 ? "" : "s"
      } pending approval today`,
      tone: "warn",
    });
  }

  if (overview.draftPayroll) {
    actionItems.push({
      href: "/ops/payroll",
      message: `Draft payroll run for ${overview.draftPayroll.period_label} is ready for review`,
      tone: "info",
    });
  }

  if (overview.failedPayouts > 0) {
    actionItems.push({
      href: "/ops/payroll",
      message: `${overview.failedPayouts} payout${
        overview.failedPayouts === 1 ? "" : "s"
      } failed and need attention`,
      tone: "warn",
    });
  }

  if (overview.draftInvoices > 0) {
    actionItems.push({
      href: "/ops/invoices",
      message: `${overview.draftInvoices} draft invoice${
        overview.draftInvoices === 1 ? "" : "s"
      } not sent yet`,
      tone: "info",
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-lg border border-primary-dark/10 bg-white p-5 md:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
          {OPS_BRAND.shortName}
        </p>
        <div className="mt-3">
          <div>
            <h1 className="font-heading text-3xl font-bold tracking-tight text-primary-dark md:text-4xl">
              Overview
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
              Live summary across sites, labour, payroll, BOQ, invoicing, and site documentation.
            </p>
          </div>
        </div>
      </section>

      {actionItems.length > 0 ? (
        <section className="space-y-2">
          {actionItems.map((item) => (
            <ActionItem
              href={item.href}
              key={item.message}
              message={item.message}
              tone={item.tone}
            />
          ))}
        </section>
      ) : (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          All clear - no pending actions for today.
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <MetricTile
            hint={metric.hint}
            href={metric.href}
            key={metric.label}
            label={metric.label}
            tone={metric.tone}
            value={metric.value}
          />
        ))}
      </section>

      <OpsOverviewMapPanel
        activeDate={overview.activeDate}
        attendancePings={overview.attendancePings}
        headquarters={{
          addressLine: overview.profile.address_line,
          city: overview.profile.city,
          country: overview.profile.country,
          latitude: overview.profile.headquarters_latitude,
          longitude: overview.profile.headquarters_longitude,
          name: overview.profile.trading_name,
        }}
        openCashAdvances={overview.openCashAdvances}
        sitePhotos={overview.sitePhotos}
        sites={overview.sites}
        workers={overview.workers}
      />

      <section className="rounded-lg border border-primary-dark/10 bg-white p-5 lg:hidden">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
            Modules
          </p>
          <h2 className="mt-1 font-heading text-xl font-bold text-primary-dark">Quick routes</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <QuickLink
            caption="GPS, budgets, supervisors, clients, and live site status."
            href="/ops/sites"
            label="Sites and map"
          />
          <QuickLink
            caption="Crew profiles, trades, rates, MoMo details, and site assignment."
            href="/ops/workers"
            label="Workers and MoMo"
          />
          <QuickLink
            caption="Daily timesheets and approval records that feed payroll."
            href="/ops/attendance"
            label="Attendance approvals"
          />
          <QuickLink
            caption="Cash advances, payroll runs, and payout status."
            href="/ops/payroll"
            label="Payroll loop"
          />
          <QuickLink
            caption="Measured line items, planned totals, and actual quantities."
            href="/ops/boq"
            label="BOQ builder"
          />
          <QuickLink
            caption="VAT invoices, client TPIN records, and payment status."
            href="/ops/invoices"
            label="Invoice register"
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border border-primary-dark/10 bg-white p-5">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Commercial
            </p>
            <h2 className="mt-1 font-heading text-xl font-bold text-primary-dark">
              BOQ to invoice
            </h2>
          </div>
          {overview.latestBoq ? (
            <div className="space-y-3">
              <div className="rounded-md border border-primary-dark/10 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <ReceiptText className="size-4 text-primary-blue" aria-hidden="true" />
                      <p className="font-bold text-primary-dark">{overview.latestBoq.title}</p>
                    </div>
                    <p className="mt-2 text-sm text-primary-dark/60">
                      Planned {formatZmw(overview.latestBoq.budgeted_total)} - Actual{" "}
                      {formatZmw(overview.latestBoq.actual_total)}
                    </p>
                  </div>
                  <Pill tone={overview.latestBoq.status === "issued" ? "good" : "warn"}>
                    {overview.latestBoq.status}
                  </Pill>
                </div>
              </div>
              <div className="rounded-md border border-primary-dark/10 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-primary-blue" aria-hidden="true" />
                      <p className="font-bold text-primary-dark">
                        {overview.latestInvoice?.invoice_number ?? "Invoice not created yet"}
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-primary-dark/60">
                      {overview.latestInvoice
                        ? `${overview.latestInvoice.client_name} - ${formatZmw(
                            overview.latestInvoice.total_amount,
                          )}`
                        : "Create an invoice from a BOQ or manual subtotal."}
                    </p>
                  </div>
                  {overview.latestInvoice ? (
                    <Pill tone={overview.latestInvoice.status === "paid" ? "good" : "warn"}>
                      {overview.latestInvoice.status}
                    </Pill>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-primary-dark/15 bg-primary-dark/[0.03] p-6 text-sm leading-6 text-primary-dark/60">
              Create a BOQ and invoice to start the commercial thread.
            </div>
          )}
        </section>

        <section className="rounded-lg border border-primary-dark/10 bg-white p-5">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Audit Trail
            </p>
            <h2 className="mt-1 font-heading text-xl font-bold text-primary-dark">
              Activity stream
            </h2>
          </div>
          {overview.activity.length > 0 ? (
            <div className="space-y-2.5">
              {overview.activity.map((item) => (
                <div
                  className={`rounded-md border px-4 py-3 text-sm font-semibold ${activityClass(
                    item.tone,
                  )}`}
                  key={item.id}
                >
                  {item.message}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-primary-dark/15 bg-primary-dark/[0.03] p-6 text-sm leading-6 text-primary-dark/60">
              Activity will appear here as operations records are created and updated.
            </div>
          )}
        </section>
      </div>

    </div>
  );
}
