import { ArrowRight, CheckCircle2, Clock3, Layers3 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchOpsModuleAccessOverrides } from "@/lib/ops/module-access";
import { requireOpsUser } from "@/lib/ops/auth";
import { OPS_MODULE_GROUPS } from "@/lib/ops/constants";
import {
  canAccessOpsHref,
  visibleOpsModuleRegistry,
  visibleOpsModules,
} from "@/lib/ops/permissions";
import { OPS_SECONDARY_BUTTON_CLASS, opsStatusBadgeClass } from "@/lib/ops/ui";
import type { OpsModule, OpsModuleStatus } from "@/lib/ops/types";

const WORKSPACE_GROUP_IDS = ["operations", "commercial", "records"] as const;

function statusLabel(status: OpsModuleStatus) {
  return status === "ready" ? "Live" : "Planned";
}

function ModuleCard({ module }: { module: OpsModule }) {
  const isReady = module.status === "ready";

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 min-[520px]:flex-row min-[520px]:items-start min-[520px]:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-lg font-bold text-foreground">{module.title}</h3>
            <span
              className={opsStatusBadgeClass(module.status)}
            >
              {statusLabel(module.status)}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{module.description}</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {module.phase}
          </p>
        </div>
        {isReady ? (
          <Link
            className={`${OPS_SECONDARY_BUTTON_CLASS} shrink-0`}
            href={module.href}
          >
            Open module
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <span
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-border px-4 py-3 text-sm font-bold text-muted-foreground"
            aria-label={`${module.title} is planned`}
          >
            <Clock3 className="size-4" aria-hidden="true" />
            Planned
          </span>
        )}
      </div>
    </article>
  );
}

export default async function OpsModulesPage() {
  const { profile } = await requireOpsUser();

  if (!canAccessOpsHref(profile.role, "/ops/modules", await fetchOpsModuleAccessOverrides())) {
    notFound();
  }

  const workspaceModules = visibleOpsModules(profile.role);
  const roadmapModules = visibleOpsModuleRegistry(profile.role).filter(
    (module) => module.status === "planned",
  );
  const totalCount = workspaceModules.length + roadmapModules.length;

  return (
    <div className="w-full max-w-none space-y-6">
      <section className="rounded-lg border border-border bg-card p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              System Registry
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">
              Modules
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-foreground/68">
              A role-aware view of your live workspace modules and the planned ERP modules that
              connect into the shared approval, document, notification, and audit foundation.
            </p>
          </div>
          <div className="grid gap-3 min-[520px]:grid-cols-3">
            <div className="rounded-md border border-border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Total
                </p>
                <Layers3 className="size-4 text-primary-blue" aria-hidden="true" />
              </div>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {totalCount}
              </p>
            </div>
            <div className="rounded-md border border-border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Live
                </p>
                <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
              </div>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {workspaceModules.length}
              </p>
            </div>
            <div className="rounded-md border border-border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Planned
                </p>
                <Clock3 className="size-4 text-orange-600" aria-hidden="true" />
              </div>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {roadmapModules.length}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold leading-6 text-sky-800">
        Sidebar navigation only shows live modules relevant to your role. This registry is a
        planning surface, so it is available from direct links and system pages rather than the
        daily sidebar.
      </section>

      <div className="space-y-5">
        <section className="space-y-4">
          <div>
            <h2 className="font-heading text-xl font-bold text-foreground">Your workspace</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              These are the live modules that should appear in the sidebar for your current role.
            </p>
          </div>
          {OPS_MODULE_GROUPS.filter((group) =>
            WORKSPACE_GROUP_IDS.some((groupId) => groupId === group.id),
          ).map((group) => {
            const groupModules = workspaceModules.filter((module) => module.group === group.id);

            if (groupModules.length === 0) {
              return null;
            }

            return (
              <div className="space-y-3" key={group.id}>
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="font-heading text-lg font-bold text-foreground">
                      {group.title}
                    </h3>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {group.description}
                    </p>
                  </div>
                  <span className="inline-flex min-h-9 w-fit items-center rounded-md border border-border bg-card px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    {groupModules.length} module{groupModules.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="grid gap-3 xl:grid-cols-2">
                  {groupModules.map((module) => (
                    <ModuleCard key={module.id} module={module} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        {roadmapModules.length > 0 ? (
          <section className="space-y-4">
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">
                Role roadmap
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                Planned modules shown here are relevant to your role. Developer, Managing Director,
                and General Manager roles can see the full company roadmap.
              </p>
            </div>
            {OPS_MODULE_GROUPS.map((group) => {
              const groupModules = roadmapModules.filter((module) => module.group === group.id);

              if (groupModules.length === 0) {
                return null;
              }

              return (
                <div className="space-y-3" key={group.id}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                      <h3 className="font-heading text-lg font-bold text-foreground">
                        {group.title}
                      </h3>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                        {group.description}
                      </p>
                    </div>
                    <span className="inline-flex min-h-9 w-fit items-center rounded-md border border-border bg-card px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {groupModules.length} module{groupModules.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="grid gap-3 xl:grid-cols-2">
                    {groupModules.map((module) => (
                      <ModuleCard key={module.id} module={module} />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        ) : (
          <section className="rounded-lg border border-border bg-card p-5 text-sm font-semibold text-muted-foreground">
            There are no planned modules assigned to this role yet.
          </section>
        )}
      </div>
    </div>
  );
}
