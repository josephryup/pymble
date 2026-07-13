import { ClipboardCheck, FileText, LifeBuoy, MapPin, PackageCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  fetchEngineeringInternDeliveredMaterials,
  fetchEngineeringInternInstructions,
} from "@/lib/ops/engineering-intern-dashboard";
import { formatOpsDate as formatDate, formatOpsLabel as formatLabel } from "@/lib/ops/format";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { fetchMyActiveOpsAssignedSites } from "@/lib/ops/site-assignments";
import { OPS_PRIMARY_BUTTON_CLASS, OPS_SECONDARY_BUTTON_CLASS } from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

export default async function OpsMySitesPage() {
  const { profile } = await requireOpsUser();
  if (!canAccessOpsHref(profile.role, "/ops/my-sites")) notFound();
  const [sites, instructions, deliveredMaterials] = await Promise.all([
    fetchMyActiveOpsAssignedSites(profile.id),
    fetchEngineeringInternInstructions(profile.id),
    fetchEngineeringInternDeliveredMaterials(profile.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <OpsPageHeader
        eyebrow="Engineering Intern"
        title="My Sites"
        description="Your assigned field sites and the work you can safely complete for the site supervisor and Projects Manager."
        actions={<><Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/it/helpdesk/mine"><LifeBuoy className="size-4" />Get IT help</Link><Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/it/handbook">IT guides</Link></>}
      />
      {sites.length === 0 ? (
        <OpsEmptyState icon={MapPin} title="No sites assigned" description="Ask your Operations Manager, Projects Manager, or Engineering Manager to assign you to a site." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sites.map((site) => <section className="rounded-lg border border-border bg-card p-5" key={site.id}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-blue">{site.code}</p>
            <h2 className="mt-1 font-heading text-xl font-bold text-foreground">{site.name}</h2>
            <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-4" />{site.location}</p>
            <p className="mt-2 text-sm text-muted-foreground">Site supervisor: {site.supervisor_name || "Not recorded"}</p>
            <div className="mt-5 flex flex-wrap gap-2"><Link className={OPS_PRIMARY_BUTTON_CLASS} href={`/ops/attendance?site_id=${site.id}`}><ClipboardCheck className="size-4" />Attendance</Link><Link className={OPS_SECONDARY_BUTTON_CLASS} href={`/ops/daily-site-reports?site_id=${site.id}`}><FileText className="size-4" />Daily reports</Link></div>
          </section>)}
        </div>
      )}

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-blue">Read only</p>
            <h2 className="mt-1 font-heading text-xl font-bold text-foreground">Site instructions</h2>
          </div>
          <FileText className="size-5 text-primary-blue" aria-hidden="true" />
        </div>
        {instructions.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No open instructions for your assigned sites.</p>
        ) : (
          <div className="mt-4 divide-y divide-border rounded-md border border-border">
            {instructions.map((instruction) => (
              <div className="p-4" key={instruction.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-muted-foreground">{instruction.instruction_number}</span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{formatLabel(instruction.status)}</span>
                </div>
                <p className="mt-2 font-bold text-foreground">{instruction.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {instruction.site ? `${instruction.site.code} - ${instruction.site.name}` : "Assigned site"} / Required {formatDate(instruction.required_by)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-blue">Delivered to site</p>
            <h2 className="mt-1 font-heading text-xl font-bold text-foreground">Supervisor material requests</h2>
          </div>
          <PackageCheck className="size-5 text-primary-blue" aria-hidden="true" />
        </div>
        {deliveredMaterials.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No supervisor-requested material deliveries for your assigned sites yet.</p>
        ) : (
          <div className="mt-4 divide-y divide-border rounded-md border border-border">
            {deliveredMaterials.map((request) => (
              <div className="p-4" key={request.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-muted-foreground">{request.request_number}</span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-700">{formatLabel(request.status)}</span>
                </div>
                <p className="mt-2 font-bold text-foreground">{request.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {request.site ? `${request.site.code} - ${request.site.name}` : "Assigned site"} / Delivered {formatDate(request.delivered_at)}
                </p>
                {request.delivery_notes ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{request.delivery_notes}</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
