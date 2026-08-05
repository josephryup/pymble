import { BookOpen, Layers, Plus, Save } from "lucide-react";
import { notFound } from "next/navigation";
import { OpsDashboardPanel } from "@/components/ops/OpsDashboardPanel";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsSubmitButton } from "@/components/ops/OpsSubmitButton";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsChartOfAccounts } from "@/lib/ops/chart-of-accounts";
import {
  addProjectCostCodeLeafAction,
  createCostCodeLibraryEntryAction,
  createProjectPhaseAction,
  updateCostCodeLibraryEntryAction,
} from "@/lib/ops/cost-code-actions";
import {
  canManageOpsCostCodeLibrary,
  canManageOpsProjectCostCodes,
} from "@/lib/ops/cost-code-permissions";
import {
  fetchOpsCostCodeLibrary,
  fetchOpsSiteCostCodePosition,
  flattenCostCodeTree,
} from "@/lib/ops/cost-codes";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import {
  firstParam,
  formatZmw,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  OPS_TABLE_CLASS,
  OPS_TD_CLASS,
  OPS_TD_NUM_CLASS,
  OPS_TH_CLASS,
  OPS_TH_NUM_CLASS,
  OPS_THEAD_CLASS,
  OPS_TR_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const NOTICES: Record<string, string> = {
  code_added: "Cost code added to the library.",
  code_updated: "Cost code updated.",
  phase_added: "Phase added to the project work breakdown.",
  leaf_added: "Cost code attached to the phase.",
};

const KINDS = [
  "materials",
  "labour",
  "plant",
  "subcontract",
  "transport",
  "preliminaries",
  "other",
] as const;

export default async function OpsCostCodesPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/cost-codes", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const canManageLibrary = canManageOpsCostCodeLibrary(auth.profile.role);
  const canManageWbs = canManageOpsProjectCostCodes(auth.profile.role);

  const [library, siteOptions, accounts] = await Promise.all([
    fetchOpsCostCodeLibrary({ includeInactive: canManageLibrary }),
    fetchActiveSiteOptions(),
    // Only postable expense/asset accounts make sense as a cost-code target.
    fetchOpsChartOfAccounts().catch(() => []),
  ]);

  const selectedSiteId = firstParam(params.site) ?? siteOptions[0]?.id ?? null;
  const position = selectedSiteId
    ? await fetchOpsSiteCostCodePosition(selectedSiteId).catch(() => null)
    : null;
  const rows = position ? flattenCostCodeTree(position.roots) : [];
  const phases = rows.filter((row) => row.isPhase);

  // fetchOpsChartOfAccounts returns groups and is itself gated on the chart-of
  // -accounts permission, so a QS sees an empty list here — which is correct:
  // they assemble the project WBS but never map a code to an account.
  const postableAccounts = accounts
    .flatMap((group) => group.accounts)
    .filter((account) => account.is_postable && account.is_active);
  const unmappedCount = library.filter((entry) => !entry.gl_account_id).length;
  const notice = NOTICES[firstParam(params.updated) ?? ""] ?? null;

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsPageHeader
        eyebrow="Cost control"
        title="Cost codes and work breakdown"
        description="The company cost-code library and each project's work breakdown structure. Every code maps to a general ledger account — that mapping is what lets project cost roll up to the accounts."
      />

      {notice ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          {notice}
        </div>
      ) : null}

      {unmappedCount > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          {unmappedCount} cost code{unmappedCount === 1 ? "" : "s"} have no GL account.
          Cost booked to them posts to Other Direct Costs and shows as unmapped in
          reconciliation.
        </div>
      ) : null}

      {/* ── The company library (Finance + MD) ─────────────────────────── */}
      <OpsDashboardPanel
        eyebrow="Company master"
        title="Cost code library"
        description={
          canManageLibrary
            ? "Finance and the Managing Director own this list. Renaming or remapping a code changes where every future cost on it lands."
            : "Read-only. Finance and the Managing Director maintain this list; ask them to add a code you need."
        }
      >
        <div className="overflow-x-auto">
          <table className={OPS_TABLE_CLASS}>
            <thead className={OPS_THEAD_CLASS}>
              <tr>
                <th className={OPS_TH_CLASS}>Code</th>
                <th className={OPS_TH_CLASS}>Name</th>
                <th className={OPS_TH_CLASS}>Division</th>
                <th className={OPS_TH_CLASS}>Type</th>
                <th className={OPS_TH_CLASS}>GL account</th>
                {canManageLibrary ? <th className={OPS_TH_CLASS}>Maintain</th> : null}
              </tr>
            </thead>
            <tbody>
              {library.map((entry) => (
                <tr className={OPS_TR_CLASS} key={entry.id}>
                  <td className={OPS_TD_CLASS}>
                    <span className="font-mono font-semibold text-foreground">
                      {entry.code}
                    </span>
                    {!entry.is_active ? (
                      <span className="ml-2 text-xs font-semibold text-muted-foreground">
                        inactive
                      </span>
                    ) : null}
                  </td>
                  <td className={OPS_TD_CLASS}>{entry.name}</td>
                  <td className={`${OPS_TD_CLASS} text-xs text-muted-foreground`}>
                    {entry.division || "—"}
                  </td>
                  <td className={`${OPS_TD_CLASS} text-xs`}>{entry.kind}</td>
                  <td className={OPS_TD_CLASS}>
                    {entry.gl_account_code ? (
                      <span className="text-xs">
                        <span className="font-mono font-semibold">
                          {entry.gl_account_code}
                        </span>{" "}
                        {entry.gl_account_name}
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-amber-700">Not mapped</span>
                    )}
                  </td>
                  {canManageLibrary ? (
                    <td className={OPS_TD_CLASS}>
                      <form
                        action={updateCostCodeLibraryEntryAction}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <input name="id" type="hidden" value={entry.id} />
                        <input
                          aria-label={`Name for ${entry.code}`}
                          className={`${OPS_INPUT_CLASS} w-44`}
                          defaultValue={entry.name}
                          name="name"
                          required
                        />
                        <select
                          aria-label={`GL account for ${entry.code}`}
                          className={`${OPS_INPUT_CLASS} w-52`}
                          defaultValue={entry.gl_account_id ?? ""}
                          name="gl_account_id"
                          required
                        >
                          <option disabled value="">
                            Map to an account
                          </option>
                          {postableAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.code} — {account.name}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={`Active state for ${entry.code}`}
                          className={`${OPS_INPUT_CLASS} w-28`}
                          defaultValue={entry.is_active ? "true" : "false"}
                          name="is_active"
                        >
                          <option value="true">Active</option>
                          <option value="false">Inactive</option>
                        </select>
                        <OpsSubmitButton className={OPS_SECONDARY_BUTTON_CLASS}>
                          <Save className="size-4" aria-hidden="true" />
                          Save
                        </OpsSubmitButton>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canManageLibrary ? (
          <details className="mt-4 rounded-md border border-border">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-foreground transition hover:text-primary-blue [&::-webkit-details-marker]:hidden">
              <Plus className="size-4" aria-hidden="true" />
              Add a cost code
            </summary>
            <form
              action={createCostCodeLibraryEntryAction}
              className="grid gap-3 border-t border-border p-3 min-[640px]:grid-cols-3"
            >
              <label className={OPS_LABEL_CLASS}>
                Code
                <input
                  className={OPS_INPUT_CLASS}
                  name="code"
                  placeholder="e.g. 03.60"
                  required
                />
              </label>
              <label className={`${OPS_LABEL_CLASS} min-[640px]:col-span-2`}>
                Name
                <input className={OPS_INPUT_CLASS} name="name" required />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Division
                <input className={OPS_INPUT_CLASS} name="division" placeholder="Concrete" />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Resource type
                <select className={OPS_INPUT_CLASS} defaultValue="materials" name="kind">
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                GL account
                <select className={OPS_INPUT_CLASS} defaultValue="" name="gl_account_id" required>
                  <option disabled value="">
                    Select an account
                  </option>
                  {postableAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} — {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${OPS_LABEL_CLASS} min-[640px]:col-span-3`}>
                Description
                <input className={OPS_INPUT_CLASS} name="description" />
              </label>
              <div className="min-[640px]:col-span-3">
                <OpsSubmitButton className={OPS_SECONDARY_BUTTON_CLASS}>
                  <BookOpen className="size-4" aria-hidden="true" />
                  Add to library
                </OpsSubmitButton>
              </div>
            </form>
          </details>
        ) : null}
      </OpsDashboardPanel>

      {/* ── The per-project WBS ────────────────────────────────────────── */}
      <OpsDashboardPanel
        eyebrow="Project work breakdown"
        title="Phases and cost codes by project"
        description="Two levels: phases hold trade codes drawn from the library. Every planned, committed and actual figure aggregates on these, so a phase total is always the sum of its codes."
        actions={
          siteOptions.length > 0 ? (
            <form className="flex items-end gap-2">
              <label className={OPS_LABEL_CLASS}>
                Project
                <select
                  className={OPS_INPUT_CLASS}
                  defaultValue={selectedSiteId ?? ""}
                  name="site"
                >
                  {siteOptions.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.code} — {site.name}
                    </option>
                  ))}
                </select>
              </label>
              <OpsSubmitButton className={OPS_SECONDARY_BUTTON_CLASS}>
                View
              </OpsSubmitButton>
            </form>
          ) : null
        }
      >
        {rows.length === 0 ? (
          <OpsEmptyState
            description="This project has no work breakdown yet. Add a phase, then attach the trade codes it covers."
            icon={Layers}
            title="No cost codes on this project"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className={OPS_TABLE_CLASS}>
              <thead className={OPS_THEAD_CLASS}>
                <tr>
                  <th className={OPS_TH_CLASS}>Phase / code</th>
                  <th className={OPS_TH_NUM_CLASS}>Budgeted</th>
                  <th className={OPS_TH_NUM_CLASS}>Committed</th>
                  <th className={OPS_TH_NUM_CLASS}>Actual</th>
                  <th className={OPS_TH_NUM_CLASS}>Available</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const available =
                    row.total.budgeted - row.total.committed - row.total.actual;
                  return (
                    <tr className={OPS_TR_CLASS} key={row.id}>
                      <td className={OPS_TD_CLASS}>
                        <span
                          className={
                            row.isPhase
                              ? "font-bold text-foreground"
                              : "pl-6 text-muted-foreground"
                          }
                        >
                          <span className="font-mono">{row.code}</span> {row.name}
                        </span>
                      </td>
                      <td className={OPS_TD_NUM_CLASS}>{formatZmw(row.total.budgeted)}</td>
                      <td className={OPS_TD_NUM_CLASS}>{formatZmw(row.total.committed)}</td>
                      <td className={OPS_TD_NUM_CLASS}>{formatZmw(row.total.actual)}</td>
                      <td className={OPS_TD_NUM_CLASS}>
                        <span className={available < 0 ? "font-bold text-red-700" : ""}>
                          {formatZmw(available)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {canManageWbs && selectedSiteId ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <form
              action={createProjectPhaseAction}
              className="grid gap-3 rounded-md border border-border p-3"
            >
              <input name="site_id" type="hidden" value={selectedSiteId} />
              <p className="text-sm font-bold text-foreground">Add a phase</p>
              <label className={OPS_LABEL_CLASS}>
                Phase code
                <input className={OPS_INPUT_CLASS} name="code" placeholder="P2" required />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Phase name
                <input
                  className={OPS_INPUT_CLASS}
                  name="name"
                  placeholder="Phase 2 — Superstructure"
                  required
                />
              </label>
              <OpsSubmitButton className={OPS_SECONDARY_BUTTON_CLASS}>
                <Plus className="size-4" aria-hidden="true" />
                Add phase
              </OpsSubmitButton>
            </form>

            {phases.length > 0 ? (
              <form
                action={addProjectCostCodeLeafAction}
                className="grid gap-3 rounded-md border border-border p-3"
              >
                <input name="site_id" type="hidden" value={selectedSiteId} />
                <p className="text-sm font-bold text-foreground">
                  Attach a cost code to a phase
                </p>
                <label className={OPS_LABEL_CLASS}>
                  Phase
                  <select className={OPS_INPUT_CLASS} name="parent_id" required>
                    {phases.map((phase) => (
                      <option key={phase.id} value={phase.id}>
                        {phase.code} — {phase.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={OPS_LABEL_CLASS}>
                  Cost code
                  <select className={OPS_INPUT_CLASS} name="library_code_id" required>
                    {library
                      .filter((entry) => entry.is_active)
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.code} — {entry.name}
                        </option>
                      ))}
                  </select>
                </label>
                <OpsSubmitButton className={OPS_SECONDARY_BUTTON_CLASS}>
                  <Layers className="size-4" aria-hidden="true" />
                  Attach code
                </OpsSubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}
      </OpsDashboardPanel>
    </div>
  );
}
