import { FileSignature, PenLine, Plus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { requireOpsUser } from "@/lib/ops/auth";
import { createOpsContractDraftAction } from "@/lib/ops/contract-actions";
import {
  canDraftOpsContractKind,
  canViewOpsContracts,
} from "@/lib/ops/contract-permissions";
import { OPS_CONTRACT_STATUS_LABELS } from "@/lib/ops/contract-types";
import {
  fetchOpsContracts,
  fetchOpsContractStats,
  fetchOpsContractTemplates,
} from "@/lib/ops/contracts";
import { fetchOpsSubcontractors } from "@/lib/ops/subcontractors";
import { fetchActiveEmployeeOptions } from "@/lib/ops/hr";
import { formatOpsDate } from "@/lib/ops/format";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { fetchOpsSites } from "@/lib/ops/sites";
import {
  firstParam,
  formatZmw,
  noticeFromParams,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_NOTICE_ERROR_CLASS,
  OPS_NOTICE_SUCCESS_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_TABLE_CLASS,
  OPS_TABLE_SCROLL_CLASS,
  OPS_TD_CLASS,
  OPS_TD_NUM_CLASS,
  OPS_TH_CLASS,
  OPS_TH_NUM_CLASS,
  OPS_THEAD_CLASS,
  OPS_TR_CLASS,
  opsStatusBadgeClass,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

export default async function OpsContractsPage({ searchParams }: PageProps) {
  const search = (await (searchParams ?? Promise.resolve({} as OpsSearchParams))) ?? {};
  const { profile } = await requireOpsUser();

  if (
    !canAccessOpsHref(profile.role, "/ops/contracts", await fetchOpsModuleAccessOverrides())
  ) {
    notFound();
  }
  if (!canViewOpsContracts(profile.role)) notFound();

  const canDraftSubcontract = canDraftOpsContractKind(profile.role, "subcontract");
  const canDraftEmployment = canDraftOpsContractKind(profile.role, "employment");
  const canDraft = canDraftSubcontract || canDraftEmployment;

  const [contracts, stats, templates, subcontractors, sites, employees] =
    await Promise.all([
      fetchOpsContracts({ limit: 200 }),
      fetchOpsContractStats(),
      canDraft ? fetchOpsContractTemplates() : Promise.resolve([]),
      canDraft ? fetchOpsSubcontractors() : Promise.resolve([]),
      canDraft ? fetchOpsSites() : Promise.resolve([]),
      // Only loaded for someone who can actually draft an employment contract —
      // the staff list is not incidental data to hand to a quantity surveyor.
      canDraftEmployment ? fetchActiveEmployeeOptions() : Promise.resolve([]),
    ]);

  const notice = noticeFromParams(search, "contract", "Contract created.");
  const error = firstParam(search.error);

  const visibleTemplates = templates.filter((template) =>
    template.kind === "employment" ? canDraftEmployment : canDraftSubcontract,
  );

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsPageHeader
        eyebrow="Contracts"
        title="Contract register"
        description="Generate subcontractor works orders and employment contracts from the standard templates, edit clauses per contract, route them for approval, and sign them with your own signature."
      />

      {error ? (
        <div className={OPS_NOTICE_ERROR_CLASS} role="alert">
          {error}
        </div>
      ) : null}
      {notice ? <div className={OPS_NOTICE_SUCCESS_CLASS}>{notice.message}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Drafts
          </p>
          <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-foreground">
            {stats.draft}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Awaiting signature
          </p>
          <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-foreground">
            {stats.awaiting_signature}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Active value
          </p>
          <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-foreground">
            {formatZmw(stats.active_value)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {stats.active} live contract{stats.active === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Retention held
          </p>
          <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-foreground">
            {formatZmw(stats.retention_held)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Computed from contract terms, not yet certified
          </p>
        </div>
      </section>

      {canDraft ? (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-blue/10 text-primary-blue">
              <Plus className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-heading text-lg font-bold text-foreground">
                New contract
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Pick a template to start a draft. The template&apos;s clauses are copied
                onto the contract, so editing them here never changes the master.
              </p>
            </div>
          </div>

          <form action={createOpsContractDraftAction} className="mt-4 grid gap-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="template_id">
                  Template
                </label>
                <select
                  className={OPS_INPUT_CLASS}
                  id="template_id"
                  name="template_id"
                  required
                >
                  {visibleTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} (v{template.version})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="kind">
                  Kind
                </label>
                <select className={OPS_INPUT_CLASS} id="kind" name="kind" required>
                  {canDraftSubcontract ? (
                    <option value="subcontract">Subcontract / works order</option>
                  ) : null}
                  {canDraftEmployment ? (
                    <option value="employment">Employment contract</option>
                  ) : null}
                </select>
              </div>

              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="counterparty_type">
                  Counterparty type
                </label>
                <select
                  className={OPS_INPUT_CLASS}
                  id="counterparty_type"
                  name="counterparty_type"
                  required
                >
                  <option value="subcontractor">Subcontractor</option>
                  {canDraftEmployment ? (
                    <option value="employee">Employee</option>
                  ) : null}
                </select>
              </div>

              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="subcontractor_id">
                  Subcontractor
                </label>
                <select
                  className={OPS_INPUT_CLASS}
                  id="subcontractor_id"
                  name="subcontractor_id"
                >
                  <option value="">—</option>
                  {subcontractors.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.company_name}
                      {sub.kind === "general" ? " (individual)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {canDraftEmployment ? (
                <div>
                  <label className={OPS_LABEL_CLASS} htmlFor="employee_id">
                    Employee
                  </label>
                  <select className={OPS_INPUT_CLASS} id="employee_id" name="employee_id">
                    <option value="">—</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div>
                <label className={OPS_LABEL_CLASS} htmlFor="site_id">
                  Site
                </label>
                <select className={OPS_INPUT_CLASS} id="site_id" name="site_id">
                  <option value="">—</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.code} — {site.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className={OPS_LABEL_CLASS} htmlFor="title">
                  Title
                </label>
                <input
                  className={OPS_INPUT_CLASS}
                  id="title"
                  name="title"
                  maxLength={200}
                  placeholder="e.g. 30 x 78 and 30 x 18 warehouses — structural works to slab level"
                  required
                />
              </div>
            </div>

            <div>
              <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                Create draft
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b border-border p-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-blue/10 text-primary-blue">
            <FileSignature className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">Contracts</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {contracts.length} contract{contracts.length === 1 ? "" : "s"} on the
              register.
            </p>
          </div>
        </div>

        {contracts.length === 0 ? (
          <div className="p-5">
            <OpsEmptyState
              icon={FileSignature}
              title="No contracts yet"
              description="Create a draft from a template above. Nothing is issued until it has been approved and signed."
            />
          </div>
        ) : (
          <div className={OPS_TABLE_SCROLL_CLASS}>
            <table className={OPS_TABLE_CLASS}>
              <thead className={OPS_THEAD_CLASS}>
                <tr>
                  <th className={OPS_TH_CLASS}>Number</th>
                  <th className={OPS_TH_CLASS}>Counterparty</th>
                  <th className={OPS_TH_CLASS}>Title</th>
                  <th className={OPS_TH_CLASS}>Kind</th>
                  <th className={OPS_TH_CLASS}>Site</th>
                  <th className={OPS_TH_NUM_CLASS}>Value</th>
                  <th className={OPS_TH_CLASS}>Status</th>
                  <th className={OPS_TH_CLASS}>Created</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => (
                  <tr className={OPS_TR_CLASS} key={contract.id}>
                    <td className={OPS_TD_CLASS}>
                      <Link
                        className="font-semibold text-primary-blue underline-offset-2 hover:underline"
                        href={`/ops/contracts/${contract.id}`}
                      >
                        {contract.contract_number}
                      </Link>
                    </td>
                    <td className={OPS_TD_CLASS}>{contract.counterparty_name}</td>
                    <td className={OPS_TD_CLASS}>{contract.title || "—"}</td>
                    <td className={OPS_TD_CLASS}>
                      {contract.kind === "employment" ? (
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck className="size-3.5" aria-hidden="true" />
                          Employment
                        </span>
                      ) : (
                        "Subcontract"
                      )}
                    </td>
                    <td className={OPS_TD_CLASS}>{contract.site?.name ?? "—"}</td>
                    <td className={OPS_TD_NUM_CLASS}>
                      {formatZmw(Number(contract.total_value ?? 0))}
                    </td>
                    <td className={OPS_TD_CLASS}>
                      <span className={opsStatusBadgeClass(contract.status)}>
                        {OPS_CONTRACT_STATUS_LABELS[contract.status]}
                      </span>
                    </td>
                    <td className={OPS_TD_CLASS}>{formatOpsDate(contract.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <PenLine className="size-4 shrink-0" aria-hidden="true" />
        You sign contracts with the signature you upload on{" "}
        <Link
          className="font-semibold text-primary-blue underline-offset-2 hover:underline"
          href="/ops/profile"
        >
          your profile
        </Link>
        . Only you can see it.
      </p>
    </div>
  );
}
