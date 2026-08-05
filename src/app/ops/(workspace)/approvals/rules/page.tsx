import { ArrowRight, ScrollText, TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsInlineEmpty } from "@/components/ops/OpsInlineEmpty";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { fetchOpsApprovalWorkflowSettings } from "@/lib/ops/approval-settings";
import { requireOpsUser } from "@/lib/ops/auth";
import { materialRequestApprovalSteps } from "@/lib/ops/material-request-permissions";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { formatOpsRole } from "@/lib/ops/roles";
import { OPS_TABLE_SCROLL_CLASS } from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

function money(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("en-ZM", { minimumFractionDigits: 0 })}`;
}

/**
 * Read-only view of the approval rules.
 *
 * Deliberately read-only. The routing itself lives in code, where segregation
 * of duties is guaranteed by tests — the thing people actually need is to
 * *know* who approves what, not to change it. The one genuinely variable part,
 * the value threshold, is shown here with where it is edited.
 */
export default async function OpsApprovalRulesPage() {
  const { profile } = await requireOpsUser();

  if (!canAccessOpsHref(profile.role, "/ops/approvals", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const workflows = await fetchOpsApprovalWorkflowSettings();
  const materialRequest = workflows.find((item) => item.workflow_key === "material_request");

  // Rendered from the same function the submit action uses, so this page cannot
  // drift from the chain people actually get.
  const chains = materialRequest
    ? ([
        {
          label: "Site material request",
          below: materialRequestApprovalSteps("normal", 0, "site", materialRequest),
          above: materialRequestApprovalSteps(
            "normal",
            materialRequest.threshold_amount,
            "site",
            materialRequest,
          ),
        },
        {
          label: "IT / general material request",
          below: materialRequestApprovalSteps("normal", 0, "it", materialRequest),
          above: materialRequestApprovalSteps(
            "normal",
            materialRequest.threshold_amount,
            "it",
            materialRequest,
          ),
        },
      ] as const)
    : [];

  return (
    <div className="space-y-6">
      <OpsPageHeader
        description="Who signs off what, and at what value. These rules are set in code so they cannot be changed by mistake — only the value thresholds below are configurable."
        eyebrow="Approvals"
        title="Approval rules"
      />

      {materialRequest ? (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border p-5">
            <h2 className="text-lg font-bold text-foreground">Material requests</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every request goes through the chain for its scope. Requests worth{" "}
              <strong className="text-foreground">
                {money(materialRequest.threshold_amount, materialRequest.currency_code)}
              </strong>{" "}
              or more pick up an extra approver.
            </p>
          </div>

          <div className="divide-y divide-border">
            {chains.map((chain) => (
              <div className="p-5" key={chain.label}>
                <h3 className="font-semibold text-foreground">{chain.label}</h3>

                <dl className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-md border border-border p-3">
                    <dt className="text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                      Under {money(materialRequest.threshold_amount, materialRequest.currency_code)}
                    </dt>
                    <dd className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      {chain.below.map((step, index) => (
                        <span className="flex items-center gap-2" key={step.approverRole}>
                          {index > 0 ? (
                            <ArrowRight
                              className="size-3.5 text-muted-foreground"
                              aria-hidden="true"
                            />
                          ) : null}
                          <span className="rounded-full border border-border px-2.5 py-1 font-semibold text-foreground">
                            {formatOpsRole(step.approverRole)}
                          </span>
                        </span>
                      ))}
                    </dd>
                  </div>

                  <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3">
                    <dt className="text-xs font-bold uppercase tracking-[0.1em] text-amber-800">
                      {money(materialRequest.threshold_amount, materialRequest.currency_code)} and
                      above
                    </dt>
                    <dd className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      {chain.above.map((step, index) => (
                        <span className="flex items-center gap-2" key={step.approverRole}>
                          {index > 0 ? (
                            <ArrowRight className="size-3.5 text-amber-700" aria-hidden="true" />
                          ) : null}
                          <span
                            className={
                              chain.below.some((b) => b.approverRole === step.approverRole)
                                ? "rounded-full border border-border bg-card px-2.5 py-1 font-semibold text-foreground"
                                : "rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 font-bold text-amber-900"
                            }
                          >
                            {formatOpsRole(step.approverRole)}
                          </span>
                        </span>
                      ))}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border p-5">
          <h2 className="text-lg font-bold text-foreground">Configured thresholds</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The value at which each workflow adds a further approver. Edited in Settings by
            leadership.
          </p>
        </div>

        {workflows.length === 0 ? (
          <OpsEmptyState
            description="No approval workflows are configured, so every chain is running on its built-in defaults."
            icon={ScrollText}
            title="No configured thresholds"
          />
        ) : (
          <div className={OPS_TABLE_SCROLL_CLASS}>
            <table className="min-w-[720px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  <th className="px-5 py-3" scope="col">Workflow</th>
                  <th className="px-5 py-3" scope="col">Base chain</th>
                  <th className="px-5 py-3" scope="col">Threshold</th>
                  <th className="px-5 py-3" scope="col">Extra approver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {workflows.map((workflow) => (
                  <tr key={workflow.workflow_key}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-foreground">{workflow.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{workflow.description}</p>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {[workflow.first_step_role, workflow.second_step_role]
                        .filter(Boolean)
                        .map((role) => formatOpsRole(role as string))
                        .join(" → ")}
                    </td>
                    <td className="px-5 py-3 font-semibold text-foreground">
                      {workflow.threshold_enabled
                        ? money(workflow.threshold_amount, workflow.currency_code)
                        : "Not applied"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {workflow.threshold_enabled && workflow.threshold_step_role
                        ? formatOpsRole(workflow.threshold_step_role)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="space-y-2 text-sm leading-6 text-muted-foreground">
            <p>
              <strong className="text-foreground">Who approves is fixed in code.</strong> Two
              controls depend on it and are enforced by tests: the person who authorised a
              spend cannot also commit it to a supplier, and IT cannot grant itself financial
              authority. Making the chain editable would move those from guaranteed to
              merely intended.
            </p>
            <p>
              If the chain here is genuinely wrong for how a department works, that is worth
              changing — as a code change with a test, not a setting.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <OpsInlineEmpty>
            Thresholds are edited under Settings; the chain is changed by the development team.
          </OpsInlineEmpty>
        </div>
      </section>
    </div>
  );
}
