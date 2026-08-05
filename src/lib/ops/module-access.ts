import { cache } from "react";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  buildOpsModuleAccessMap,
  OPS_NO_MODULE_OVERRIDES,
  type OpsModuleAccessMap,
  type OpsModuleAccessOverride,
} from "@/lib/ops/module-access-core";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Database side of the role → module matrix. Policy lives in
 * module-access-core.ts; this file only loads and writes rows.
 */

/**
 * The override map for the current request.
 *
 * `cache()` means one query per request no matter how many permission checks
 * run — and there are 138 call sites, so that matters. The table holds only
 * pairs that differ from the code default, so it stays small by construction.
 *
 * Fails OPEN to the code defaults. If this query errors, the workspace falls
 * back to exactly the behaviour it had before the matrix existed, which is a
 * known-good state. Failing closed would lock everyone out of everything on a
 * transient database blip.
 */
export const fetchOpsModuleAccessOverrides = cache(
  async (): Promise<OpsModuleAccessMap> => {
    const supabase = getOpsSupabaseServiceClient();
    const { data, error } = await supabase
      .from("ops_module_role_access")
      .select("module_key, role, can_access");

    if (error || !data) {
      return OPS_NO_MODULE_OVERRIDES;
    }

    return buildOpsModuleAccessMap(data as OpsModuleAccessOverride[]);
  },
);

export type OpsModuleAccessRow = OpsModuleAccessOverride & {
  reason: string;
  updated_at: string;
  updated_by: string | null;
  updated_by_name: string | null;
};

/** Full override list with who changed what, for the audit strip in the editor. */
export async function fetchOpsModuleAccessRows(): Promise<OpsModuleAccessRow[]> {
  await requireOpsUser();

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("ops_module_role_access")
    .select("module_key, role, can_access, reason, updated_at, updated_by, users:updated_by(full_name)")
    .order("updated_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as unknown as (OpsModuleAccessOverride & {
    reason: string;
    updated_at: string;
    updated_by: string | null;
    users: { full_name: string } | null;
  })[]).map((row) => ({
    can_access: row.can_access,
    module_key: row.module_key,
    reason: row.reason,
    role: row.role,
    updated_at: row.updated_at,
    updated_by: row.updated_by,
    updated_by_name: row.users?.full_name ?? null,
  }));
}
