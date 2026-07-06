import { AlertTriangle, Download, LifeBuoy, MonitorCog, Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  IT_TICKET_CATEGORY_LABELS,
  IT_TICKET_PRIORITY_BADGE,
  IT_TICKET_PRIORITY_LABELS,
  IT_TICKET_STATUS_BADGE,
  IT_TICKET_STATUS_LABELS,
} from "@/lib/ops/it-helpdesk-labels";
import {
  fetchOpsItTicketAnalytics,
  fetchOpsItTickets,
  fetchOpsItTicketStats,
} from "@/lib/ops/it-tickets";
import {
  OPS_CHART_COLORS,
  OpsStatusDonut,
  OpsTrendChart,
} from "@/components/ops/OpsAnalyticsCharts";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import type { OpsItTicketStatus } from "@/lib/ops/types";
import { firstParam, OPS_PRIMARY_BUTTON_CLASS, OPS_SECONDARY_BUTTON_CLASS, type OpsSearchParams } from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

function ticketStatusFromParam(value: string | undefined): OpsItTicketStatus | undefined {
  if (value && value in IT_TICKET_STATUS_LABELS) {
    return value as OpsItTicketStatus;
  }
  return undefined;
}

export default async function OpsItHelpdeskPage({ searchParams }: PageProps) {
  const [params, { profile }] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(profile.role, "/ops/it/helpdesk")) {
    notFound();
  }

  const statusFilter = ticketStatusFromParam(firstParam(params.status));
  const [tickets, stats, analytics] = await Promise.all([
    fetchOpsItTickets(statusFilter ? { status: statusFilter } : { openOnly: true }),
    fetchOpsItTicketStats(),
    fetchOpsItTicketAnalytics(8),
  ]);

  return (
    <div className="w-full max-w-none space-y-5">
      <OpsRealtimeRefresh tables={["it_tickets"]} />
      <OpsPageHeader
        eyebrow="Information Technology"
        title="Help Desk"
        description="The internal IT support queue. Triage, assign, and resolve tickets raised by staff across the company."
        actions={
          <>
            <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/it/helpdesk?status=open">
              <LifeBuoy className="size-4" aria-hidden="true" />
              Open only
            </Link>
            <a className={OPS_SECONDARY_BUTTON_CLASS} href="/api/ops/pdf/it-ticket-report">
              <Download className="size-4" aria-hidden="true" />
              Export PDF
            </a>
            <Link className={OPS_PRIMARY_BUTTON_CLASS} href="/ops/it/helpdesk/new">
              <Plus className="size-4" aria-hidden="true" />
              Raise a ticket
            </Link>
          </>
        }
      />

      <section className="grid gap-4 min-[720px]:grid-cols-4">
        <OpsKpiCard href="/ops/it/helpdesk?status=open" icon={LifeBuoy} label="Open" tone={stats.open > 0 ? "warn" : "good"} value={stats.open.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/helpdesk?status=in_progress" icon={MonitorCog} label="In progress" value={stats.in_progress.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/helpdesk" icon={AlertTriangle} label="Urgent & open" tone={stats.urgent_open > 0 ? "warn" : "default"} value={stats.urgent_open.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/helpdesk" icon={UserPlus} label="Unassigned" tone={stats.unassigned > 0 ? "warn" : "default"} value={stats.unassigned.toLocaleString("en-ZM")} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-primary-dark/10 bg-white p-5 shadow-sm">
          <h2 className="font-heading text-lg font-bold text-primary-dark">
            Raised vs resolved — last {analytics.weeks} weeks
          </h2>
          <p className="mt-1 text-sm text-primary-dark/55">
            Whether the queue is trending up or being worked down.
          </p>
          <div className="mt-4">
            <OpsTrendChart
              ariaLabel={`Tickets raised versus resolved per week over the last ${analytics.weeks} weeks`}
              emptyMessage="No ticket activity in this window"
              points={analytics.points.map((point) => ({
                label: point.label,
                raised: point.raised,
                resolved: point.resolved,
              }))}
              series={[
                { key: "raised", label: "Raised", color: OPS_CHART_COLORS.blue, kind: "bar" },
                { key: "resolved", label: "Resolved", color: OPS_CHART_COLORS.emerald, kind: "line" },
              ]}
            />
          </div>
        </div>
        <div className="rounded-2xl border border-primary-dark/10 bg-white p-5 shadow-sm">
          <h2 className="font-heading text-lg font-bold text-primary-dark">Open by priority</h2>
          <p className="mt-1 text-sm text-primary-dark/55">
            Everything currently open, on hold or awaiting a user.
          </p>
          <div className="mt-4">
            <OpsStatusDonut
              ariaLabel="Open tickets by priority"
              emptyMessage="No open tickets"
              items={analytics.openByPriority.map((entry) => ({
                label: IT_TICKET_PRIORITY_LABELS[entry.priority],
                value: entry.count,
                color:
                  entry.priority === "urgent"
                    ? OPS_CHART_COLORS.red
                    : entry.priority === "high"
                      ? OPS_CHART_COLORS.orange
                      : entry.priority === "normal"
                        ? OPS_CHART_COLORS.amber
                        : OPS_CHART_COLORS.slate,
              }))}
            />
          </div>
        </div>
      </section>

      {tickets.length === 0 ? (
        <OpsEmptyState
          icon={LifeBuoy}
          title={statusFilter ? "No tickets in this status" : "The queue is clear"}
          description="New support tickets raised by staff land here for triage. You're caught up."
          actions={[{ href: "/ops/it/helpdesk/new", label: "Raise a ticket" }]}
        />
      ) : (
        <ul className="space-y-3">
          {tickets.map((ticket) => (
            <li key={ticket.id} className="rounded-2xl border border-primary-dark/10 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                    {ticket.ticket_ref} · {IT_TICKET_CATEGORY_LABELS[ticket.category]}
                  </p>
                  <h2 className="mt-1 font-heading text-lg font-bold text-primary-dark">
                    <Link className="hover:underline" href={`/ops/it/helpdesk/${ticket.id}`}>{ticket.title}</Link>
                  </h2>
                  <p className="mt-1 text-xs text-primary-dark/55">
                    {ticket.requester ? `Raised by ${ticket.requester.full_name}` : "Raised by unknown"}
                    {ticket.assignee ? ` · Assigned to ${ticket.assignee.full_name}` : " · Unassigned"}
                    {ticket.site ? ` · ${ticket.site.code}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${IT_TICKET_PRIORITY_BADGE[ticket.priority]}`}>
                    {IT_TICKET_PRIORITY_LABELS[ticket.priority]}
                  </span>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${IT_TICKET_STATUS_BADGE[ticket.status]}`}>
                    {IT_TICKET_STATUS_LABELS[ticket.status]}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
