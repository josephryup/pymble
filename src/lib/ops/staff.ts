import { createOpsServerSessionClient } from "@/lib/ops/auth";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
} from "@/lib/ops/listing";
import type { OpsUserRole } from "@/lib/ops/types";

export type OpsStaffMember = {
  id: string;
  full_name: string;
  role: OpsUserRole;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type FetchOpsStaffOptions = {
  listState: OpsListState;
  role?: string;
  status?: "active" | "inactive" | "";
};

/**
 * The access register, searchable and paged. The full list is still fetched
 * alongside this for the header counts — the users table is small, and keeping
 * the counts describing the whole organisation rather than the current page is
 * worth the second query.
 */
export async function fetchPaginatedOpsStaffMembers({
  listState,
  role,
  status,
}: FetchOpsStaffOptions) {
  const supabase = await createOpsServerSessionClient();
  let query = supabase
    .from("users")
    .select("id, full_name, role, phone, email, is_active, created_at, updated_at", {
      count: "exact",
    })
    .neq("role", "developer");

  const search = opsIlikeOrFilter(["full_name", "email", "phone"], listState.query);
  if (search) query = query.or(search);
  if (role) query = query.eq("role", role);
  if (status === "active") query = query.eq("is_active", true);
  if (status === "inactive") query = query.eq("is_active", false);

  const { count, data, error } = await query
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false })
    .range(listState.from, listState.to);

  if (error) {
    throw error;
  }

  return toOpsPaginatedResult((data ?? []) as OpsStaffMember[], count, listState);
}

export async function fetchOpsStaffMembers() {
  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, role, phone, email, is_active, created_at, updated_at")
    .neq("role", "developer")
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as OpsStaffMember[];
}
