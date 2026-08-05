import { Check, Minus, ShieldCheck, X } from "lucide-react";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsSubmitButton } from "@/components/ops/OpsSubmitButton";
import { requireOpsUser } from "@/lib/ops/auth";
import { OPS_MODULE_GROUPS } from "@/lib/ops/constants";
import { fetchOpsModuleAccessOverrides, fetchOpsModuleAccessRows } from "@/lib/ops/module-access";
import { setOpsModuleAccessAction } from "@/lib/ops/module-access-actions";
import {
  canEditOpsModuleAccess,
  canViewOpsModuleAccess,
  opsModuleAccessMatrix,
} from "@/lib/ops/module-access-core";
import { OPS_PRODUCTION_ROLE_POLICY } from "@/lib/ops/role-policy";
import type { OpsUserRole } from "@/lib/ops/types";
import {
  noticeFromParams,
  OPS_TABLE_SCROLL_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<OpsSearchParams> };

/** Roles worth showing as columns: everything assignable, minus the Developer. */
const COLUMN_ROLES = OPS_PRODUCTION_ROLE_POLICY.filter(
  ({ role }) => role !== "developer",
);

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function OpsModuleAccessPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const { profile } = await requireOpsUser();

  if (!canViewOpsModuleAccess(profile.role)) {
    notFound();
  }

  const [overrides, rows] = await Promise.all([
    fetchOpsModuleAccessOverrides(),
    fetchOpsModuleAccessRows(),
  ]);

  const notice = noticeFromParams(params, "module_access", "Module access updated.");

  // One matrix row per module; the per-role cells are computed below so the
  // resolution logic stays in module-access-core rather than in the view.
  const byRole = new Map<OpsUserRole, ReturnType<typeof opsModuleAccessMatrix>>(
    COLUMN_ROLES.map(({ role }) => [role, opsModuleAccessMatrix(role, overrides)]),
  );

  const groups = OPS_MODULE_GROUPS.map((group) => ({
    group,
    modules: (byRole.get(COLUMN_ROLES[0].role) ?? [])
      .filter((entry) => entry.module.group === group.id)
      .map((entry) => entry.module),
  })).filter((entry) => entry.modules.length > 0);

  return (
    <div className="space-y-6">
      <OpsPageHeader
        description="Decide which roles reach which modules, without a code change. A ticked box means that role can open the module; an outlined box means it is following the built-in default."
        eyebrow="Information Technology"
        title="Module access"
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
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary-blue" aria-hidden="true" />
          <div className="space-y-2 text-sm leading-6 text-muted-foreground">
            <p>
              Changes apply to <strong>every user holding that role</strong> and take
              effect on their next page load. The Developer role is not listed — it is
              the maintenance backstop and always reaches everything.
            </p>
            <p>
              IT can adjust operational modules. Finance, HR, commercial and executive
              modules can only be widened by the Managing Director, so that
              administering the system never becomes a way to grant authority over
              money.
            </p>
          </div>
        </div>
      </section>

      {groups.length === 0 ? (
        <OpsEmptyState
          description="No modules are registered, which should not happen — the module registry is defined in code."
          icon={ShieldCheck}
          title="No modules to configure"
        />
      ) : (
        groups.map(({ group, modules }) => (
          <section
            className="rounded-lg border border-border bg-card shadow-sm"
            key={group.id}
          >
            <div className="border-b border-border p-5">
              <h2 className="text-lg font-bold text-foreground">{group.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
            </div>

            <div className={OPS_TABLE_SCROLL_CLASS}>
              <table className="min-w-[900px] w-full text-left text-sm">
                <caption className="sr-only">
                  {group.title} modules and which roles may access each one.
                </caption>
                <thead>
                  <tr className="border-b border-border">
                    <th className="sticky left-0 z-10 bg-card px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground" scope="col">
                      Module
                    </th>
                    {COLUMN_ROLES.map(({ label, role }) => (
                      <th
                        className="px-2 py-3 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                        key={role}
                        scope="col"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {modules.map((opsModule) => (
                    <tr key={opsModule.id}>
                      <th
                        className="sticky left-0 z-10 bg-card px-5 py-3 font-semibold text-foreground"
                        scope="row"
                      >
                        {opsModule.title}
                        {opsModule.status === "planned" ? (
                          <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                            Planned
                          </span>
                        ) : null}
                      </th>

                      {COLUMN_ROLES.map(({ label, role }) => {
                        const entry = (byRole.get(role) ?? []).find(
                          (item) => item.module.id === opsModule.id,
                        );

                        if (!entry) {
                          return <td key={role} />;
                        }

                        const next = !entry.allowed;
                        const decision = canEditOpsModuleAccess({
                          actorRole: profile.role,
                          module: opsModule,
                          next,
                          targetRole: role,
                        });

                        const stateLabel = entry.allowed ? "can access" : "cannot access";
                        const action = entry.allowed ? "Remove" : "Grant";

                        return (
                          <td className="px-2 py-2 text-center" key={role}>
                            {decision.allowed ? (
                              <form action={setOpsModuleAccessAction} className="inline">
                                <input name="module_key" type="hidden" value={opsModule.id} />
                                <input name="role" type="hidden" value={role} />
                                <input name="next" type="hidden" value={String(next)} />
                                <OpsSubmitButton
                                  aria-label={`${action} ${label} access to ${opsModule.title}. Currently ${stateLabel}${entry.isDefault ? " by default" : " by override"}.`}
                                  className={`inline-flex size-7 items-center justify-center rounded-md border transition ${
                                    entry.allowed
                                      ? entry.isDefault
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : "border-emerald-500 bg-emerald-500 text-white"
                                      : entry.isDefault
                                        ? "border-border bg-muted/40 text-muted-foreground"
                                        : "border-red-300 bg-red-50 text-red-700"
                                  }`}
                                  pendingLabel="Saving"
                                  title={
                                    entry.isDefault
                                      ? `Default: ${stateLabel}`
                                      : `Overridden: ${stateLabel} (code default is ${entry.codeDefault ? "access" : "no access"})`
                                  }
                                >
                                  {entry.allowed ? (
                                    <Check className="size-4" aria-hidden="true" />
                                  ) : entry.isDefault ? (
                                    <Minus className="size-3" aria-hidden="true" />
                                  ) : (
                                    <X className="size-4" aria-hidden="true" />
                                  )}
                                </OpsSubmitButton>
                              </form>
                            ) : (
                              <span
                                aria-label={`${label} ${stateLabel} ${opsModule.title}. Locked: ${decision.reason}`}
                                className="inline-flex size-7 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground/60"
                                title={decision.reason}
                              >
                                {entry.allowed ? (
                                  <Check className="size-4" aria-hidden="true" />
                                ) : (
                                  <Minus className="size-3" aria-hidden="true" />
                                )}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border p-5">
          <h2 className="text-lg font-bold text-foreground">Active overrides</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every pair that differs from the built-in default, and who changed it.
            Clearing an override returns that pair to the code default.
          </p>
        </div>

        {rows.length === 0 ? (
          <OpsEmptyState
            description="Nothing has been overridden, so every module is following the access defined in code. Any change you make above will be listed here."
            icon={ShieldCheck}
            title="No overrides in effect"
          />
        ) : (
          <div className={OPS_TABLE_SCROLL_CLASS}>
            <table className="min-w-[720px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  <th className="px-5 py-3" scope="col">Module</th>
                  <th className="px-5 py-3" scope="col">Role</th>
                  <th className="px-5 py-3" scope="col">Effect</th>
                  <th className="px-5 py-3" scope="col">Changed by</th>
                  <th className="px-5 py-3" scope="col">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={`${row.module_key}::${row.role}`}>
                    <td className="px-5 py-3 font-semibold text-foreground">{row.module_key}</td>
                    <td className="px-5 py-3 text-muted-foreground">{row.role}</td>
                    <td className="px-5 py-3">
                      <span
                        className={
                          row.can_access
                            ? "rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-700"
                            : "rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-red-700"
                        }
                      >
                        {row.can_access ? "Granted" : "Removed"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {row.updated_by_name ?? "Unknown"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {formatWhen(row.updated_at)}
                    </td>
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
