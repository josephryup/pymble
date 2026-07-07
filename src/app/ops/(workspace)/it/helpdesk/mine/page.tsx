import { LifeBuoy, Plus } from "lucide-react";
import Link from "next/link";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  IT_TICKET_CATEGORY_LABELS,
  IT_TICKET_STATUS_BADGE,
  IT_TICKET_STATUS_LABELS,
} from "@/lib/ops/it-helpdesk-labels";
import { fetchOpsItTickets } from "@/lib/ops/it-tickets";
import { firstParam, OPS_PRIMARY_BUTTON_CLASS, type OpsSearchParams, OPS_NOTICE_SUCCESS_CLASS } from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

export default async function OpsItMyTicketsPage({ searchParams }: PageProps) {
  const [params, { profile }] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  const tickets = await fetchOpsItTickets({ raisedBy: profile.id });
  const justCreated = firstParam(params.created) === "ticket";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <OpsRealtimeRefresh tables={["it_tickets"]} />
      <OpsPageHeader
        eyebrow="IT Help Desk"
        title="My tickets"
        description="Support requests you've raised with IT. Open a ticket to follow progress and reply."
        actions={
          <Link className={OPS_PRIMARY_BUTTON_CLASS} href="/ops/it/helpdesk/new">
            <Plus className="size-4" aria-hidden="true" />
            Raise a ticket
          </Link>
        }
      />

      {justCreated ? (
        <div className={OPS_NOTICE_SUCCESS_CLASS} role="status">
          Ticket submitted. IT has been notified and will pick it up from the queue.
        </div>
      ) : null}

      {tickets.length === 0 ? (
        <OpsEmptyState
          icon={LifeBuoy}
          title="You haven't raised any tickets"
          description="When you need help from IT, raise a ticket and track it here."
          actions={[{ href: "/ops/it/helpdesk/new", label: "Raise a ticket" }]}
        />
      ) : (
        <ul className="space-y-3">
          {tickets.map((ticket) => (
            <li key={ticket.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {ticket.ticket_ref} · {IT_TICKET_CATEGORY_LABELS[ticket.category]}
                  </p>
                  <h2 className="mt-1 font-heading text-lg font-bold text-foreground">
                    <Link className="hover:underline" href={`/ops/it/helpdesk/${ticket.id}`}>{ticket.title}</Link>
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">Raised {ticket.created_at.slice(0, 10)}</p>
                </div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${IT_TICKET_STATUS_BADGE[ticket.status]}`}>
                  {IT_TICKET_STATUS_LABELS[ticket.status]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
