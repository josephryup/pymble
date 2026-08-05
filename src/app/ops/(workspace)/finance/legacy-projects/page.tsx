import { Archive, FolderClock, Plus, RotateCcw } from "lucide-react";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsSubmitButton } from "@/components/ops/OpsSubmitButton";
import { requireOpsUser } from "@/lib/ops/auth";
import { canManageOpsProjectBudget } from "@/lib/ops/finance-permissions";
import {
  createOpsLegacyProjectAction,
  setOpsLegacyProjectActiveAction,
} from "@/lib/ops/legacy-project-actions";
import { fetchOpsLegacyProjects } from "@/lib/ops/legacy-projects";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { formatOpsCostTreatment } from "@/lib/ops/payables-core";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  noticeFromParams,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  OPS_TABLE_SCROLL_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<OpsSearchParams> };

function money(amount: number) {
  return `ZMW ${amount.toLocaleString("en-ZM", { minimumFractionDigits: 2 })}`;
}

export default async function OpsLegacyProjectsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const { profile } = await requireOpsUser();

  if (
    !canAccessOpsHref(profile.role, "/ops/finance", await fetchOpsModuleAccessOverrides())
  ) {
    notFound();
  }

  const projects = await fetchOpsLegacyProjects();
  const canManage = canManageOpsProjectBudget(profile.role);
  const notice = noticeFromParams(params, "legacy_project", "Completed project saved.");

  const totalOutstanding = projects.reduce(
    (sum, project) => sum + project.outstanding_amount,
    0,
  );

  return (
    <div className="space-y-6">
      <OpsPageHeader
        description="Projects that finished before this system, kept only so their unpaid balances can be recorded and reported. These are not sites — they carry no budget, programme or team."
        eyebrow="Finance"
        title="Completed projects"
      />

      {notice ? (
        <p
          className={
            notice.tone === "error"
              ? "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              : "rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          }
          role="status"
        >
          {notice.message}
        </p>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Outstanding on completed projects
        </p>
        <p className="mt-2 font-heading text-3xl font-bold text-foreground">
          {money(totalOutstanding)}
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Payables raised against completed projects and not yet paid. These carry no
          budget — a finished project has none — so they simply sit here as money still
          owed. Where a project is set to{" "}
          <strong className="text-foreground">recognise the cost now</strong>, clearing
          this backlog will show up as cost in the current year, because that is the first
          time the cost has been recognised at all.
        </p>
      </section>

      {canManage ? (
        <details className="rounded-lg border border-border bg-card shadow-sm" id="register">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden">
            <Plus className="size-4" aria-hidden="true" />
            Register a completed project
          </summary>

          <form action={createOpsLegacyProjectAction} className="grid gap-4 border-t border-border p-5 md:grid-cols-2">
            <label className={OPS_LABEL_CLASS}>
              Reference code
              <input
                className={OPS_INPUT_CLASS}
                maxLength={40}
                name="code"
                placeholder="CHL-2024"
                required
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Project name
              <input
                className={OPS_INPUT_CLASS}
                maxLength={180}
                name="name"
                placeholder="Chalala Phase 2"
                required
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Client
              <input className={OPS_INPUT_CLASS} maxLength={160} name="client_name" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Completed on
              <input className={OPS_INPUT_CLASS} name="completed_on" type="date" />
            </label>

            <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
              How should its costs be treated?
              <select className={OPS_INPUT_CLASS} defaultValue="current_period" name="cost_treatment">
                <option value="current_period">
                  Recognise the cost now — it was never booked anywhere
                </option>
                <option value="opening_balance">
                  Already booked in closed accounts — bring on the liability only
                </option>
              </select>
              <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
                Asked once here because it is answerable once. If the cost was never
                recognised, it has to be recognised somewhere — so it posts as a normal
                cost and will reduce this year&apos;s profit. Only pick the second option
                where the expense genuinely already sits in accounts you have closed;
                using it otherwise would put the debt on the balance sheet while the cost
                never appears in any profit and loss account, in any year.
              </span>
            </label>

            <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
              Notes
              <textarea className={OPS_INPUT_CLASS} maxLength={1000} name="notes" rows={2} />
            </label>

            <div className="md:col-span-2">
              <OpsSubmitButton className={OPS_PRIMARY_BUTTON_CLASS} pendingLabel="Saving...">
                <Plus className="size-4" aria-hidden="true" />
                Register project
              </OpsSubmitButton>
            </div>
          </form>
        </details>
      ) : null}

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border p-5">
          <h2 className="text-lg font-bold text-foreground">Register</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Closing a project stops new payables being charged to it. Nothing is deleted —
            the balances and their journal entries stay on record.
          </p>
        </div>

        {projects.length === 0 ? (
          <OpsEmptyState
            actions={canManage ? [{ href: "#register", label: "Register a completed project" }] : []}
            description="Completed projects are recorded here so their unpaid supplier and subcontractor balances can enter the system without the project becoming a live site."
            icon={FolderClock}
            title="No completed projects registered"
            tip={
              canManage
                ? undefined
                : "Completed projects are registered by Finance or leadership."
            }
          />
        ) : (
          <div className={OPS_TABLE_SCROLL_CLASS}>
            <table className="min-w-[880px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  <th className="px-5 py-3" scope="col">Project</th>
                  <th className="px-5 py-3" scope="col">Treatment</th>
                  <th className="px-5 py-3 text-right" scope="col">Outstanding</th>
                  <th className="px-5 py-3 text-right" scope="col">Paid</th>
                  <th className="px-5 py-3" scope="col">Status</th>
                  {canManage ? <th className="px-5 py-3" scope="col">Action</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-foreground">
                        {project.code} — {project.name}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {project.client_name || "No client recorded"}
                        {project.completed_on ? ` · completed ${project.completed_on}` : ""}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatOpsCostTreatment(project.cost_treatment)}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-foreground">
                      {money(project.outstanding_amount)}
                      {project.outstanding_count > 0 ? (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {project.outstanding_count} payable
                          {project.outstanding_count === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-right text-muted-foreground">
                      {money(project.paid_amount)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={
                          project.is_active
                            ? "rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-700"
                            : "rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                        }
                      >
                        {project.is_active ? "Open" : "Closed"}
                      </span>
                    </td>
                    {canManage ? (
                      <td className="px-5 py-3">
                        <form action={setOpsLegacyProjectActiveAction}>
                          <input name="legacy_project_id" type="hidden" value={project.id} />
                          <input
                            name="is_active"
                            type="hidden"
                            value={String(!project.is_active)}
                          />
                          <OpsSubmitButton
                            className={OPS_SECONDARY_BUTTON_CLASS}
                            pendingLabel="Saving..."
                          >
                            {project.is_active ? (
                              <>
                                <Archive className="size-4" aria-hidden="true" />
                                Close
                              </>
                            ) : (
                              <>
                                <RotateCcw className="size-4" aria-hidden="true" />
                                Reopen
                              </>
                            )}
                          </OpsSubmitButton>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
