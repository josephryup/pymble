import { createOpsServerSessionClient } from "@/lib/ops/auth";
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
