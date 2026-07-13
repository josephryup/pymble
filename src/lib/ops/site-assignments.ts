import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsUserRole } from "@/lib/ops/types";

const SITE_ASSIGNMENT_MANAGER_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "operations_manager",
  "projects_manager",
  "engineering_manager",
];

export function canManageOpsSiteAssignments(role: OpsUserRole) {
  return SITE_ASSIGNMENT_MANAGER_ROLES.includes(role);
}

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

export type OpsAssignedSiteSummary = {
  id: string;
  code: string;
  name: string;
  location: string;
  supervisor_name: string;
};

export type OpsSiteAssignmentSummary = {
  id: string;
  assigned_at: string;
  site: OpsAssignedSiteSummary | null;
  user: {
    id: string;
    full_name: string;
    role: OpsUserRole;
  } | null;
};

export async function fetchMyActiveOpsAssignedSites(userId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("user_site_assignments")
    .select("site:sites!user_site_assignments_site_id_fkey(id, code, name, location, supervisor_name)")
    .eq("user_id", userId)
    .is("unassigned_at", null);
  if (error) throw error;
  return (data ?? [])
    .map((row) => row.site as OpsAssignedSiteSummary | OpsAssignedSiteSummary[] | null)
    .map((site) => Array.isArray(site) ? site[0] ?? null : site)
    .filter((site): site is OpsAssignedSiteSummary => Boolean(site));
}

export async function fetchActiveEngineeringInternSiteAssignments() {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("user_site_assignments")
    .select(
      [
        "id",
        "assigned_at",
        "site:sites!user_site_assignments_site_id_fkey(id, code, name, location, supervisor_name)",
        "user:users!user_site_assignments_user_id_fkey(id, full_name, role)",
      ].join(", "),
    )
    .is("unassigned_at", null)
    .order("assigned_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    assigned_at: string;
    id: string;
    site: OpsAssignedSiteSummary | OpsAssignedSiteSummary[] | null;
    user: OpsSiteAssignmentSummary["user"] | OpsSiteAssignmentSummary["user"][] | null;
  }>).map((row) => {
    const site = row.site as OpsAssignedSiteSummary | OpsAssignedSiteSummary[] | null;
    const user = row.user as OpsSiteAssignmentSummary["user"] | OpsSiteAssignmentSummary["user"][] | null;
    return {
      id: row.id as string,
      assigned_at: row.assigned_at as string,
      site: Array.isArray(site) ? site[0] ?? null : site,
      user: Array.isArray(user) ? user[0] ?? null : user,
    } satisfies OpsSiteAssignmentSummary;
  }).filter((assignment) => assignment.user?.role === "engineering_intern");
}
