import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsUserRole } from "@/lib/ops/types";

export function requiresOpsSiteAssignment(role: OpsUserRole) {
  return role === "engineering_intern";
}

export async function fetchActiveOpsAssignedSiteIds(userId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("user_site_assignments")
    .select("site_id")
    .eq("user_id", userId)
    .is("unassigned_at", null);

  if (error) throw error;
  return Array.from(new Set((data ?? []).map((row) => row.site_id as string)));
}

export async function hasActiveOpsSiteAssignment(userId: string, siteId: string) {
  const ids = await fetchActiveOpsAssignedSiteIds(userId);
  return ids.includes(siteId);
}
