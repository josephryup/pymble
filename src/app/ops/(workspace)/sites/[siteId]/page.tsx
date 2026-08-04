import {
  Banknote,
  Briefcase,
  CalendarClock,
  Camera,
  ClipboardList,
  Flag,
  HardHat,
  Landmark,
  MapPin,
  ReceiptText,
  ShieldAlert,
  Target,
  TrendingDown,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsInlineEmpty } from "@/components/ops/OpsInlineEmpty";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { fetchOpsSite360 } from "@/lib/ops/site-360";
import {
  formatZmw,
  OPS_FOCUS_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ siteId: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function StatRow({ href, label, value, tone }: { href: string; label: string; value: string; tone?: "warn" | "good" }) {
  return (
    <Link
      className={`flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground/68 transition hover:border-primary-blue hover:text-primary-blue ${OPS_FOCUS_CLASS}`}
      href={href}
    >
      <span>{label}</span>
      <span
        className={`font-heading text-base font-bold ${
          tone === "warn" ? "text-red-700" : tone === "good" ? "text-emerald-700" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </Link>
  );
}

function BudgetBar({ label, amount, share, colorClass }: { label: string; amount: string; share: number; colorClass: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-muted-foreground">{label}</span>
        <span className="font-bold tabular-nums text-foreground">{amount}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/40">
        <div
          className={`h-full rounded-full ${colorClass}`}
          style={{ width: `${Math.min(100, Math.max(share > 0 ? 2 : 0, share))}%` }}
        />
      </div>
    </div>
  );
}

export default async function OpsSite360Page({ params }: PageProps) {
  const { siteId } = await params;
  if (!UUID_PATTERN.test(siteId)) notFound();

  const { profile } = await requireOpsUser();
  if (!canAccessOpsHref(profile.role, "/ops/sites")) {
    notFound();
  }

  const data = await fetchOpsSite360(siteId);
  if (!data) notFound();
  const { site, budget, commercial, procurement, delivery, hse, photos } = data;

  const budgetShare = (amount: number) =>
    budget.budgetedTotal > 0 ? Math.round((amount / budget.budgetedTotal) * 100) : 0;
  const progress = Math.max(0, Math.min(100, Math.round(site.progress_percent ?? 0)));

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh
        tables={["project_cost_entries", "commercial_ipcs", "material_requests", "daily_site_reports"]}
      />
      <OpsPageHeader
        eyebrow={`Project 360 · ${site.code}`}
        title={site.name}
        description={[
          site.client_name ? `Client: ${site.client_name}` : null,
          site.location ? `Location: ${site.location}` : null,
          site.supervisor_name ? `Supervisor: ${site.supervisor_name}` : null,
          site.target_completion_date ? `Target completion: ${site.target_completion_date}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href={`/ops/project-schedule/${site.id}`}>
              <CalendarClock className="size-4" aria-hidden="true" />
              Schedule
            </Link>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/sites">
              <MapPin className="size-4" aria-hidden="true" />
              All sites
            </Link>
          </>
        }
      />

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-primary-blue/30 bg-primary-blue/5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-primary-blue">
              {site.status}
            </span>
            {site.stage ? (
              <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                {site.stage.replace(/_/g, " ")}
              </span>
            ) : null}
          </div>
          <p className="text-sm font-semibold text-muted-foreground">
            Overall progress <span className="font-heading text-lg font-bold text-foreground">{progress}%</span>
          </p>
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted/40">
          <div className="h-full rounded-full bg-primary-blue" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OpsKpiCard
          href="/ops/commercial#contract-panel"
          icon={Briefcase}
          label="Contract value"
          hint={`${commercial.contracts} active contract${commercial.contracts === 1 ? "" : "s"}`}
          value={formatZmw(commercial.contractSum || site.contract_value || 0)}
        />
        <OpsKpiCard
          href="/ops/commercial#ipc-register"
          icon={ReceiptText}
          label="Certified to date"
          tone="good"
          hint={`${formatZmw(commercial.retentionHeld)} retention held`}
          value={formatZmw(commercial.ipcsCertifiedAmount)}
        />
        <OpsKpiCard
          href="/ops/project-budgets"
          icon={Target}
          label="Cost exposure"
          hint={budget.activeBudgetNumber ? `Budget ${budget.activeBudgetNumber}` : "No active budget"}
          value={formatZmw(budget.exposure)}
        />
        <OpsKpiCard
          href="/ops/project-budgets"
          icon={TrendingDown}
          label="Budget remaining"
          tone={budget.remaining < 0 ? "critical" : "good"}
          trend={budget.remaining < 0 ? "Over budget" : "Within budget"}
          value={formatZmw(budget.remaining)}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <OpsDashboardPanel
          actions={
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/project-budgets">
              <Landmark className="size-4" aria-hidden="true" />
              Budgets
            </Link>
          }
          eyebrow="Finance"
          title="Budget vs actual"
        >
          {budget.budgetedTotal > 0 ? (
            <div className="space-y-3">
              <BudgetBar
                label="Budgeted"
                amount={formatZmw(budget.budgetedTotal)}
                share={100}
                colorClass="bg-primary-blue/30"
              />
              <BudgetBar
                label="Committed"
                amount={formatZmw(budget.committed)}
                share={budgetShare(budget.committed)}
                colorClass="bg-orange-400"
              />
              <BudgetBar
                label="Posted (actual)"
                amount={formatZmw(budget.posted)}
                share={budgetShare(budget.posted)}
                colorClass="bg-red-500"
              />
              <BudgetBar
                label="Total exposure"
                amount={formatZmw(budget.exposure)}
                share={budgetShare(budget.exposure)}
                colorClass={budget.remaining < 0 ? "bg-red-600" : "bg-emerald-500"}
              />
            </div>
          ) : (
            <OpsInlineEmpty>No active budget for this site yet.</OpsInlineEmpty>
          )}
        </OpsDashboardPanel>

        <OpsDashboardPanel
          actions={
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/commercial">
              <ReceiptText className="size-4" aria-hidden="true" />
              Commercial
            </Link>
          }
          eyebrow="Commercial"
          title="Valuations, changes, and claims"
        >
          <div className="grid gap-2 min-[520px]:grid-cols-2">
            <StatRow
              href="/ops/commercial#ipc-register"
              label="Open IPCs"
              tone={commercial.ipcsOpen > 0 ? "warn" : undefined}
              value={String(commercial.ipcsOpen)}
            />
            <StatRow
              href="/ops/commercial#variation-panel"
              label="Open variations"
              tone={commercial.variationsOpen > 0 ? "warn" : undefined}
              value={String(commercial.variationsOpen)}
            />
            <StatRow
              href="/ops/commercial#variation-panel"
              label="Approved variations"
              value={formatZmw(commercial.variationsApprovedAmount)}
            />
            <StatRow
              href="/ops/commercial#claim-panel"
              label="Open claims"
              tone={commercial.claimsOpen > 0 ? "warn" : undefined}
              value={String(commercial.claimsOpen)}
            />
            <StatRow
              href="/ops/commercial#claim-panel"
              label="Claim value"
              value={formatZmw(commercial.claimsClaimedAmount)}
            />
            <StatRow
              href="/ops/commercial#retention-panel"
              label="Retention held"
              value={formatZmw(commercial.retentionHeld)}
            />
          </div>
        </OpsDashboardPanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <OpsDashboardPanel
          actions={
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/material-requests">
              <ClipboardList className="size-4" aria-hidden="true" />
              Requests
            </Link>
          }
          eyebrow="Procurement"
          title="Buying activity"
        >
          <div className="grid gap-2">
            <StatRow
              href="/ops/material-requests"
              label="Open material requests"
              tone={procurement.openMaterialRequests > 0 ? "warn" : undefined}
              value={String(procurement.openMaterialRequests)}
            />
            <StatRow
              href="/ops/rfq-po"
              label="Open purchase orders"
              value={String(procurement.openPurchaseOrders)}
            />
            <StatRow
              href="/ops/rfq-po"
              label="Open PO value"
              value={formatZmw(procurement.openPoValue)}
            />
          </div>
        </OpsDashboardPanel>

        <OpsDashboardPanel
          actions={
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href={`/ops/project-schedule/${site.id}`}>
              <Flag className="size-4" aria-hidden="true" />
              Programme
            </Link>
          }
          eyebrow="Delivery"
          title="Programme and reporting"
        >
          <div className="grid gap-2">
            <StatRow
              href={`/ops/project-schedule/${site.id}`}
              label="Overdue milestones"
              tone={delivery.milestonesOverdue > 0 ? "warn" : "good"}
              value={`${delivery.milestonesOverdue} / ${delivery.milestonesOpen}`}
            />
            <StatRow
              href="/ops/daily-site-reports"
              label="Site reports (30 days)"
              value={String(delivery.reportsLast30)}
            />
            <StatRow
              href="/ops/daily-site-reports"
              label="Last site report"
              value={delivery.lastReportDate ?? "—"}
            />
          </div>
        </OpsDashboardPanel>

        <OpsDashboardPanel
          actions={
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/hse">
              <HardHat className="size-4" aria-hidden="true" />
              HSE
            </Link>
          }
          eyebrow="HSE & Media"
          title="Safety and site photos"
        >
          <div className="grid gap-2">
            <StatRow
              href="/ops/hse"
              label="Open incidents"
              tone={hse.openIncidents > 0 ? "warn" : "good"}
              value={String(hse.openIncidents)}
            />
            <StatRow
              href="/ops/hse"
              label="Incidents (90 days)"
              value={String(hse.incidents90d)}
            />
            <StatRow
              href="/ops/photos"
              label="Site photos"
              value={String(photos.count)}
            />
          </div>
        </OpsDashboardPanel>
      </div>

      <section className="flex flex-wrap gap-2">
        {[
          { href: "/ops/payment-requests", icon: Banknote, label: "Payment requests" },
          { href: "/ops/photos", icon: Camera, label: "Site photos" },
          { href: "/ops/hse", icon: ShieldAlert, label: "HSE incidents" },
          { href: "/ops/attendance", icon: HardHat, label: "Attendance" },
        ].map((shortcut) => (
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href={shortcut.href} key={shortcut.href}>
            <shortcut.icon className="size-4" aria-hidden="true" />
            {shortcut.label}
          </Link>
        ))}
      </section>
    </div>
  );
}
