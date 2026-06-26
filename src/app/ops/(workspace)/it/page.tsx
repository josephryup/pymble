import { AlertTriangle, Laptop, LifeBuoy, MonitorCog, ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsItAssetStats } from "@/lib/ops/it-assets";
import { fetchOpsItTicketStats } from "@/lib/ops/it-tickets";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { OPS_SECONDARY_BUTTON_CLASS } from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

export default async function OpsItOverviewPage() {
  const { profile } = await requireOpsUser();

  if (!canAccessOpsHref(profile.role, "/ops/it")) {
    notFound();
  }

  const [ticketStats, assetStats] = await Promise.all([
    fetchOpsItTicketStats(),
    fetchOpsItAssetStats(),
  ]);

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh tables={["it_tickets", "it_assets"]} />
      <OpsPageHeader
        eyebrow="Information Technology"
        title="IT Overview"
        description="Live picture of the internal help desk and the company IT asset base. Restricted to IT and the Managing Director."
        actions={
          <>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/it/helpdesk">
              <LifeBuoy className="size-4" aria-hidden="true" />
              Help desk
            </Link>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/it/assets">
              <Laptop className="size-4" aria-hidden="true" />
              Assets
            </Link>
          </>
        }
      />

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-[0.14em] text-primary-dark/55">
          <LifeBuoy className="size-4" aria-hidden="true" />
          Help desk
        </h2>
        <div className="grid gap-4 min-[720px]:grid-cols-4">
          <OpsKpiCard
            href="/ops/it/helpdesk?status=open"
            icon={LifeBuoy}
            label="Open tickets"
            tone={ticketStats.open > 0 ? "warn" : "good"}
            trend={ticketStats.open > 0 ? "Needs triage" : "Clear"}
            value={ticketStats.open.toLocaleString("en-ZM")}
          />
          <OpsKpiCard
            href="/ops/it/helpdesk?status=in_progress"
            icon={MonitorCog}
            label="In progress"
            value={ticketStats.in_progress.toLocaleString("en-ZM")}
          />
          <OpsKpiCard
            href="/ops/it/helpdesk"
            icon={AlertTriangle}
            label="Urgent & open"
            tone={ticketStats.urgent_open > 0 ? "warn" : "default"}
            trend={ticketStats.urgent_open > 0 ? "Escalate" : undefined}
            value={ticketStats.urgent_open.toLocaleString("en-ZM")}
          />
          <OpsKpiCard
            href="/ops/it/helpdesk"
            icon={AlertTriangle}
            label="Unassigned"
            tone={ticketStats.unassigned > 0 ? "warn" : "default"}
            value={ticketStats.unassigned.toLocaleString("en-ZM")}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-[0.14em] text-primary-dark/55">
          <Laptop className="size-4" aria-hidden="true" />
          Assets
        </h2>
        <div className="grid gap-4 min-[720px]:grid-cols-4">
          <OpsKpiCard
            href="/ops/it/assets"
            icon={Laptop}
            label="Total assets"
            trend="Register"
            value={assetStats.total.toLocaleString("en-ZM")}
          />
          <OpsKpiCard
            href="/ops/it/assets?status=in_use"
            icon={ShieldCheck}
            label="In use"
            tone="good"
            value={assetStats.in_use.toLocaleString("en-ZM")}
          />
          <OpsKpiCard
            href="/ops/it/assets?status=repair"
            icon={Wrench}
            label="Under repair"
            tone={assetStats.in_repair > 0 ? "warn" : "default"}
            value={assetStats.in_repair.toLocaleString("en-ZM")}
          />
          <OpsKpiCard
            href="/ops/it/assets"
            icon={AlertTriangle}
            label="Warranty < 60 days"
            tone={assetStats.warranty_expiring_soon > 0 ? "warn" : "default"}
            trend={assetStats.warranty_expiring_soon > 0 ? "Review" : undefined}
            value={assetStats.warranty_expiring_soon.toLocaleString("en-ZM")}
          />
        </div>
      </section>
    </div>
  );
}
