import { LifeBuoy, Send } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { requireOpsUser } from "@/lib/ops/auth";
import { IT_TICKET_CATEGORY_LABELS, IT_TICKET_PRIORITY_LABELS } from "@/lib/ops/it-helpdesk-labels";
import { canRaiseItTicket } from "@/lib/ops/it-permissions";
import { raiseItTicketAction } from "@/lib/ops/it-ticket-actions";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import {
  firstParam,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

export default async function OpsItRaiseTicketPage({ searchParams }: PageProps) {
  const [params, { profile }] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  // Raising a ticket is the one IT surface open to every staff member.
  if (!canRaiseItTicket(profile.role)) {
    notFound();
  }

  const siteOptions = await fetchActiveSiteOptions();
  const error = firstParam(params.error);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <OpsPageHeader
        eyebrow="IT Help Desk"
        title="Raise a support ticket"
        description="Tell IT what you need help with. You can track your ticket and reply to IT from “My tickets”."
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/it/helpdesk/mine">
            <LifeBuoy className="size-4" aria-hidden="true" />
            My tickets
          </Link>
        }
      />

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      <form action={raiseItTicketAction} className="grid gap-4 rounded-2xl border border-primary-dark/10 bg-white p-5">
        <label className={OPS_LABEL_CLASS}>
          What is the problem?
          <input className={OPS_INPUT_CLASS} maxLength={160} name="title" placeholder="e.g. My laptop won't connect to Wi-Fi" required />
        </label>
        <div className="grid gap-4 min-[520px]:grid-cols-2">
          <label className={OPS_LABEL_CLASS}>
            Category
            <select className={OPS_INPUT_CLASS} defaultValue="hardware" name="category">
              {Object.entries(IT_TICKET_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            How urgent is it?
            <select className={OPS_INPUT_CLASS} defaultValue="normal" name="priority">
              {Object.entries(IT_TICKET_PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        <label className={OPS_LABEL_CLASS}>
          Which site are you at? (optional)
          <select className={OPS_INPUT_CLASS} defaultValue="" name="site_id">
            <option value="">Head office / not site-specific</option>
            {siteOptions.map((site) => (
              <option key={site.id} value={site.id}>{site.code} — {site.name}</option>
            ))}
          </select>
        </label>
        <label className={OPS_LABEL_CLASS}>
          Details
          <textarea className={`${OPS_INPUT_CLASS} min-h-28`} maxLength={2000} name="description" placeholder="When did it start? What have you tried? Any error messages?" />
        </label>
        <div className="flex justify-end">
          <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
            <Send className="size-4" aria-hidden="true" />
            Submit ticket
          </button>
        </div>
      </form>
    </div>
  );
}
