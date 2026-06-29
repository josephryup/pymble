import { Bell } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OpsMyQueue } from "@/components/ops/OpsMyQueue";
import { OpsRoleOverviewDashboard } from "@/components/ops/OpsRoleOverviewDashboard";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsHseExecutiveSafetyRollup } from "@/lib/ops/hse-executive";
import { fetchOpsNotifications } from "@/lib/ops/notifications";
import { fetchOpsOverview } from "@/lib/ops/overview";
import { fetchOpsMyQueue } from "@/lib/ops/overview-queue";
import { fetchOpsOverviewRoleMetrics } from "@/lib/ops/overview-role-metrics";
import { canAccessOpsHref } from "@/lib/ops/permissions";

export default async function OpsHomePage() {
  const auth = await requireOpsUser();

  if (!canAccessOpsHref(auth.profile.role, "/ops")) {
    redirect("/ops/profile");
  }

  const canViewHseSafety = canAccessOpsHref(auth.profile.role, "/ops/hse");
  const [overview, metrics, hseSafetyRollup, queue, unreadAlerts] = await Promise.all([
    fetchOpsOverview(),
    fetchOpsOverviewRoleMetrics(),
    canViewHseSafety
      ? fetchOpsHseExecutiveSafetyRollup({ enforceAccess: false })
      : Promise.resolve(null),
    fetchOpsMyQueue(auth.profile.role, auth.profile.id).catch(() => []),
    fetchOpsNotifications({ status: "unread", limit: 4 }).catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      {unreadAlerts.length > 0 ? (
        <section className="rounded-lg border border-primary-blue/30 bg-primary-blue/[0.04] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
                <Bell className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="font-heading text-base font-bold text-primary-dark">
                  {unreadAlerts.length} alert{unreadAlerts.length === 1 ? "" : "s"} need your attention
                </p>
                <p className="mt-0.5 truncate text-sm text-primary-dark/65">
                  {unreadAlerts.map((alert) => alert.title).join(" · ")}
                </p>
              </div>
            </div>
            <Link
              href="/ops/notifications"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary-blue px-4 py-2 text-sm font-bold text-white transition hover:bg-primary-dark"
            >
              Review
            </Link>
          </div>
        </section>
      ) : null}
      <OpsMyQueue items={queue} />
      <OpsRoleOverviewDashboard
        hseSafetyRollup={hseSafetyRollup}
        metrics={metrics}
        overview={overview}
        profile={auth.profile}
      />
    </div>
  );
}
