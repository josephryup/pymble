import { fetchActiveOpsAssignedSiteIds } from "@/lib/ops/site-assignments";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsPriority, OpsSiteInstructionStatus, OpsUserRole } from "@/lib/ops/types";

type Relation<T> = T | T[] | null;

type SiteRelation = {
  code: string;
  id: string;
  name: string;
  supervisor_user_id: string | null;
};

type UserRelation = {
  full_name: string;
  id: string;
  role: OpsUserRole;
};

function normalizeRelation<T>(value: Relation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type EngineeringInternInstruction = {
  id: string;
  instruction_number: string;
  title: string;
  instruction_type: string;
  priority: OpsPriority;
  required_by: string | null;
  site: Pick<SiteRelation, "code" | "id" | "name"> | null;
  status: OpsSiteInstructionStatus;
};

export type EngineeringInternDeliveredMaterial = {
  delivered_at: string | null;
  delivery_notes: string;
  id: string;
  request_number: string;
  requester: UserRelation | null;
  site: Pick<SiteRelation, "code" | "id" | "name"> | null;
  status: string;
  title: string;
};

export async function fetchEngineeringInternInstructions(userId: string, limit = 8) {
  const siteIds = await fetchActiveOpsAssignedSiteIds(userId);
  if (siteIds.length === 0) return [];

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("site_instructions")
    .select(
      [
        "id",
        "instruction_number",
        "site_id",
        "instruction_type",
        "status",
        "priority",
        "title",
        "required_by",
        "site:sites!site_instructions_site_id_fkey(id, code, name)",
      ].join(", "),
    )
    .in("site_id", siteIds)
    .in("status", ["issued", "acknowledged"])
    .order("instruction_date", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return ((data ?? []) as unknown as Array<
    Omit<EngineeringInternInstruction, "site"> & { site: Relation<SiteRelation> }
  >)
    .map((instruction) => ({
      ...instruction,
      site: normalizeRelation(instruction.site),
    }));
}

export async function fetchEngineeringInternDeliveredMaterials(userId: string, limit = 8) {
  const siteIds = await fetchActiveOpsAssignedSiteIds(userId);
  if (siteIds.length === 0) return [];

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("material_requests")
    .select(
      [
        "id",
        "request_number",
        "title",
        "status",
        "requested_by",
        "delivered_at",
        "delivery_notes",
        "site:sites(id, code, name, supervisor_user_id)",
        "requester:users!material_requests_requested_by_fkey(id, full_name, role)",
      ].join(", "),
    )
    .in("site_id", siteIds)
    .in("status", ["delivered", "closed"])
    .not("delivered_at", "is", null)
    .order("delivered_at", { ascending: false })
    .limit(limit * 2);

  if (error) throw error;

  return ((data ?? []) as unknown as Array<
    Omit<EngineeringInternDeliveredMaterial, "requester" | "site"> & {
      requested_by: string | null;
      requester: Relation<UserRelation>;
      site: Relation<SiteRelation>;
    }
  >)
    .map((request) => ({
      ...request,
      requester: normalizeRelation(request.requester),
      site: normalizeRelation(request.site),
    }))
    .filter((request) => request.site?.supervisor_user_id === request.requested_by)
    .slice(0, limit);
}
