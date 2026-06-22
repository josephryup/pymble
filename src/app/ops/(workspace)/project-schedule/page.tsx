import { ClipboardList, MapPin } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsPageHeader } from "@/components/ops/OpsPageHeader";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { canViewProjectTasks } from "@/lib/ops/project-task-permissions";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import {
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
} from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

export default async function OpsProjectSchedulePage() {
  const { profile } = await requireOpsUser();

  if (!canAccessOpsHref(profile.role, "/ops/project-schedule")) {
    notFound();
  }

  if (!canViewProjectTasks(profile.role)) {
    notFound();
  }

  const sites = await fetchActiveSiteOptions();

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh tables={["project_tasks", "sites"]} />
      <OpsPageHeader
        eyebrow="Engineering field control"
        title="Project schedule"
        description="Per-site task list with planned dates and assigned engineer. Engineers mark progress; the system computes site completion and flags overdue tasks."
        actions={
          <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/ops/sites">
            <MapPin className="size-4" aria-hidden="true" />
            Manage sites
          </Link>
        }
      />

      {sites.length === 0 ? (
        <OpsEmptyState
          icon={ClipboardList}
          title="No project sites yet"
          description="Add a project site first, then build its schedule of tasks."
          actions={[{ href: "/ops/sites", label: "Open Sites" }]}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((site) => (
            <li
              key={site.id}
              className="rounded-2xl border border-primary-dark/10 bg-white p-4 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                {site.code}
              </p>
              <h2 className="mt-1 font-heading text-lg font-bold text-primary-dark">
                {site.name}
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  className={OPS_PRIMARY_BUTTON_CLASS}
                  href={`/ops/project-schedule/${site.id}`}
                >
                  <ClipboardList className="size-4" aria-hidden="true" />
                  Open schedule
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
