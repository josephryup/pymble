import { CheckCircle2, ClipboardList, ListChecks, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsItChecklistRuns } from "@/lib/ops/it-checklists";
import { createItChecklistRunAction } from "@/lib/ops/it-checklist-actions";
import { canManageIT } from "@/lib/ops/it-permissions";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  noticeFromParams,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<OpsSearchParams> };

export default async function OpsItChecklistsPage({ searchParams }: PageProps) {
  const [params, { profile }] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(profile.role, "/ops/it/checklists")) {
    notFound();
  }

  const canManage = canManageIT(profile.role);
  const runs = await fetchOpsItChecklistRuns();
  const notice = noticeFromParams(params, "checklist", "Checklist created.");
  const inProgress = runs.filter((run) => run.status === "in_progress").length;
  const completed = runs.filter((run) => run.status === "completed").length;

  return (
    <div className="w-full max-w-none space-y-5">
      <OpsRealtimeRefresh tables={["it_checklist_runs", "it_checklist_items"]} />
      <OpsPageHeader
        eyebrow="Information Technology"
        title="Onboarding & Offboarding"
        description="IT runbooks for joining and leaving staff. Each checklist seeds the standard steps; tick them off and mark complete."
        actions={canManage ? (<a className={OPS_PRIMARY_BUTTON_CLASS} href="#checklist-create"><Plus className="size-4" aria-hidden="true" />New checklist</a>) : undefined}
      />

      {notice ? (
        <div className={`rounded-md border px-4 py-3 text-sm font-semibold ${notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.message}
        </div>
      ) : null}

      <section className="grid gap-4 min-[720px]:grid-cols-3">
        <OpsKpiCard href="/ops/it/checklists" icon={ListChecks} label="Total" hint="Runbooks" value={runs.length.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/checklists" icon={ClipboardList} label="In progress" tone={inProgress > 0 ? "warn" : "default"} value={inProgress.toLocaleString("en-ZM")} />
        <OpsKpiCard href="/ops/it/checklists" icon={CheckCircle2} label="Completed" tone="good" value={completed.toLocaleString("en-ZM")} />
      </section>

      {canManage ? (
        <details className="rounded-lg border border-primary-dark/10 bg-white" id="checklist-create">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 font-heading text-base font-bold text-primary-dark [&::-webkit-details-marker]:hidden">
            <ListChecks className="size-5 text-primary-blue" aria-hidden="true" /> New checklist
          </summary>
          <form action={createItChecklistRunAction} className="grid gap-4 border-t border-primary-dark/10 p-5 min-[520px]:grid-cols-2 lg:grid-cols-6">
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>Employee name<input className={OPS_INPUT_CLASS} name="employee_name" required /></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>Type<select className={OPS_INPUT_CLASS} defaultValue="onboarding" name="kind"><option value="onboarding">Onboarding (joining)</option><option value="offboarding">Offboarding (leaving)</option></select></label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-6`}>Notes<input className={OPS_INPUT_CLASS} name="notes" /></label>
            <div className="flex items-end lg:col-span-6 lg:justify-end"><button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full min-[520px]:w-auto`} type="submit"><Plus className="size-4" aria-hidden="true" />Create checklist</button></div>
          </form>
        </details>
      ) : null}

      {runs.length === 0 ? (
        <OpsEmptyState icon={ListChecks} title="No checklists yet" description={canManage ? "Start an onboarding or offboarding checklist for a staff member." : "IT onboarding and offboarding checklists appear here."} actions={canManage ? [{ href: "#checklist-create", label: "New checklist" }] : []} />
      ) : (
        <ul className="space-y-3">
          {runs.map((run) => (
            <li key={run.id} className="rounded-2xl border border-primary-dark/10 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">{run.kind === "onboarding" ? "Onboarding" : "Offboarding"}</p>
                  <h2 className="mt-1 font-heading text-lg font-bold text-primary-dark">
                    <Link className="hover:underline" href={`/ops/it/checklists/${run.id}`}>{run.employee_name}</Link>
                  </h2>
                  <p className="mt-1 text-xs text-primary-dark/55">{run.done_count}/{run.item_count} steps done · started {run.created_at.slice(0, 10)}</p>
                </div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${run.status === "completed" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-sky-200 bg-sky-50 text-sky-700"}`}>
                  {run.status === "completed" ? "Completed" : "In progress"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
