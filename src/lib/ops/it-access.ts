import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsItAccessStatus } from "@/lib/ops/types";

export type OpsItAccessUserRef = { full_name: string; id: string };

export type OpsItAccessGrant = {
  account_identifier: string;
  archived_at: string | null;
  access_level: string;
  created_at: string;
  employee: OpsItAccessUserRef | null;
  granted_at: string;
  id: string;
  notes: string;
  revoked_at: string | null;
  status: OpsItAccessStatus;
  system_name: string;
  user_id: string | null;
};

export type OpsItAccessStats = {
  active: number;
  revoked: number;
  total: number;
};

type RawRelation<T> = T | T[] | null;
type RawGrant = Omit<OpsItAccessGrant, "employee"> & { employee: RawRelation<OpsItAccessUserRef> };

function firstRelation<T>(value: RawRelation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function fetchOpsItAccessGrants(): Promise<OpsItAccessGrant[]> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_access_grants")
    .select(
      "id, user_id, system_name, access_level, account_identifier, status, granted_at, revoked_at, notes, archived_at, created_at, employee:users!it_access_grants_user_id_fkey(id, full_name)",
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .returns<RawGrant[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({ ...row, employee: firstRelation(row.employee) }));
}

export async function fetchOpsItAccessStats(): Promise<OpsItAccessStats> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_access_grants")
    .select("status")
    .is("archived_at", null)
    .returns<{ status: OpsItAccessStatus }[]>();

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  return {
    active: rows.filter((row) => row.status === "active").length,
    revoked: rows.filter((row) => row.status === "revoked").length,
    total: rows.length,
  };
}
