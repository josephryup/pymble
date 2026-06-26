import { ArrowLeft, Lock, Send } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { canManageItTickets, canViewItTicket } from "@/lib/ops/it-permissions";
import {
  addItTicketCommentAction,
  assignItTicketAction,
  updateItTicketStatusAction,
} from "@/lib/ops/it-ticket-actions";
import { fetchOpsItTicket, fetchOpsItTicketComments } from "@/lib/ops/it-tickets";
import { fetchOpsActiveUsers } from "@/lib/ops/notification-fanout";
import { formatOpsRole } from "@/lib/ops/roles";
import type { OpsItTicketStatus } from "@/lib/ops/types";
import {
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ ticketId: string }>;
};

const STATUS_OPTIONS: OpsItTicketStatus[] = [
  "open",
  "in_progress",
  "on_hold",
  "awaiting_user",
  "resolved",
  "closed",
  "cancelled",
];

export default async function OpsItTicketDetailPage({ params }: PageProps) {
  const { ticketId } = await params;
  const { profile } = await requireOpsUser();

  const ticket = await fetchOpsItTicket(ticketId);
  if (!ticket) {
    notFound();
  }

  if (!canViewItTicket(profile.role, ticket, profile.id)) {
    notFound();
  }

  const isManager = canManageItTickets(profile.role);
  const [comments, activeUsers] = await Promise.all([
    fetchOpsItTicketComments(ticketId, { includeInternal: isManager }),
    isManager ? fetchOpsActiveUsers() : Promise.resolve([]),
  ]);
  const itStaff = activeUsers
    .filter((user) => canManageItTickets(user.role))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const backHref = isManager ? "/ops/it/helpdesk" : "/ops/it/helpdesk/mine";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <OpsRealtimeRefresh tables={["it_tickets", "it_ticket_comments"]} />
      <OpsPageHeader
        eyebrow={`${ticket.ticket_ref} · ${IT_TICKET_CATEGORY_LABELS[ticket.category]}`}
        title={ticket.title}
        description={ticket.requester ? `Raised by ${ticket.requester.full_name}` : "Raised by unknown"}
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href={backHref}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${IT_TICKET_STATUS_BADGE[ticket.status]}`}>
          {IT_TICKET_STATUS_LABELS[ticket.status]}
        </span>
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${IT_TICKET_PRIORITY_BADGE[ticket.priority]}`}>
          {IT_TICKET_PRIORITY_LABELS[ticket.priority]} priority
        </span>
        {ticket.site ? (
          <span className="inline-flex rounded-full border border-primary-dark/15 bg-primary-dark/[0.04] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-primary-dark/65">
            {ticket.site.code}
          </span>
        ) : null}
        <span className="text-xs text-primary-dark/55">
          {ticket.assignee ? `Assigned to ${ticket.assignee.full_name}` : "Unassigned"}
        </span>
      </div>

      {ticket.description ? (
        <div className="rounded-2xl border border-primary-dark/10 bg-white p-4 text-sm text-primary-dark/80">
          {ticket.description}
        </div>
      ) : null}

      {isManager ? (
        <div className="grid gap-4 rounded-2xl border border-primary-dark/10 bg-white p-4 lg:grid-cols-2">
          <form action={updateItTicketStatusAction} className="space-y-2">
            <input name="ticket_id" type="hidden" value={ticket.id} />
            <label className={OPS_LABEL_CLASS}>
              Status
              <select className={OPS_INPUT_CLASS} defaultValue={ticket.status} name="status">
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{IT_TICKET_STATUS_LABELS[status]}</option>
                ))}
              </select>
            </label>
            <label className={OPS_LABEL_CLASS}>
              Resolution / status note (optional)
              <input className={OPS_INPUT_CLASS} name="resolution_notes" />
            </label>
            <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">Update status</button>
          </form>
          <form action={assignItTicketAction} className="space-y-2">
            <input name="ticket_id" type="hidden" value={ticket.id} />
            <label className={OPS_LABEL_CLASS}>
              Assign to
              <select className={OPS_INPUT_CLASS} defaultValue={ticket.assigned_to ?? ""} name="assigned_to">
                <option value="">Unassigned</option>
                {itStaff.map((user) => (
                  <option key={user.id} value={user.id}>{user.full_name} — {formatOpsRole(user.role)}</option>
                ))}
              </select>
            </label>
            <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">Assign</button>
          </form>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-heading text-sm font-bold uppercase tracking-[0.14em] text-primary-dark/55">Conversation</h2>
        {comments.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-primary-dark/15 bg-white p-4 text-sm text-primary-dark/55">
            No replies yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className={`rounded-2xl border p-4 text-sm ${
                  comment.is_internal
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-primary-dark/10 bg-white text-primary-dark/80"
                }`}
              >
                <p className="mb-1 flex items-center gap-2 text-xs font-semibold text-primary-dark/55">
                  {comment.author ? comment.author.full_name : "Unknown"}
                  <span>· {comment.created_at.slice(0, 16).replace("T", " ")}</span>
                  {comment.is_internal ? (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <Lock className="size-3" aria-hidden="true" /> Internal note
                    </span>
                  ) : null}
                </p>
                {comment.body}
              </li>
            ))}
          </ul>
        )}

        <form action={addItTicketCommentAction} className="space-y-2 rounded-2xl border border-primary-dark/10 bg-white p-4">
          <input name="ticket_id" type="hidden" value={ticket.id} />
          <label className={OPS_LABEL_CLASS}>
            Add a reply
            <textarea className={`${OPS_INPUT_CLASS} min-h-24`} maxLength={2000} name="body" required />
          </label>
          {isManager ? (
            <label className="flex items-center gap-2 text-sm text-primary-dark/70">
              <input name="is_internal" type="checkbox" value="true" />
              Internal note (not visible to the requester)
            </label>
          ) : null}
          <div className="flex justify-end">
            <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
              <Send className="size-4" aria-hidden="true" />
              Send reply
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
