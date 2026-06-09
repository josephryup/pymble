import { redirect } from "next/navigation";
import { OpsRoleOverviewDashboard } from "@/components/ops/OpsRoleOverviewDashboard";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsHseExecutiveSafetyRollup } from "@/lib/ops/hse-executive";
import { fetchOpsOverview } from "@/lib/ops/overview";
import { fetchOpsOverviewRoleMetrics } from "@/lib/ops/overview-role-metrics";
import { canAccessOpsHref } from "@/lib/ops/permissions";

export default async function OpsHomePage() {
  const auth = await requireOpsUser();

  if (!canAccessOpsHref(auth.profile.role, "/ops")) {
    redirect("/ops/profile");
  }

  const canViewHseSafety = canAccessOpsHref(auth.profile.role, "/ops/hse");
  const [overview, metrics, hseSafetyRollup] = await Promise.all([
    fetchOpsOverview(),
    fetchOpsOverviewRoleMetrics(),
    canViewHseSafety
      ? fetchOpsHseExecutiveSafetyRollup({ enforceAccess: false })
      : Promise.resolve(null),
  ]);

  return (
    <OpsRoleOverviewDashboard
      hseSafetyRollup={hseSafetyRollup}
      metrics={metrics}
      overview={overview}
      profile={auth.profile}
    />
  );
}
