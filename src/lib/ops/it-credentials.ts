import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

export type OpsItCredentialOwnerRef = { full_name: string; id: string };

export type OpsItCredential = {
  account_identifier: string;
  archived_at: string | null;
  created_at: string;
  id: string;
  last_rotated_at: string | null;
  name: string;
  notes: string;
  owner: OpsItCredentialOwnerRef | null;
  owner_user_id: string | null;
  rotation_due_date: string | null;
  system_name: string;
  vault_location: string;
};

export type OpsItCredentialStats = {
  rotation_due: number;
  total: number;
};

type RawRelation<T> = T | T[] | null;
type RawCredential = Omit<OpsItCredential, "owner"> & {
  owner: RawRelation<OpsItCredentialOwnerRef>;
};

function firstRelation<T>(value: RawRelation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function fetchOpsItCredentials(): Promise<OpsItCredential[]> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_credentials")
    .select(
      "id, name, system_name, account_identifier, owner_user_id, vault_location, rotation_due_date, last_rotated_at, notes, archived_at, created_at, owner:users!it_credentials_owner_user_id_fkey(id, full_name)",
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .returns<RawCredential[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({ ...row, owner: firstRelation(row.owner) }));
}

export async function fetchOpsItCredentialStats(): Promise<OpsItCredentialStats> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_credentials")
    .select("rotation_due_date")
    .is("archived_at", null)
    .returns<{ rotation_due_date: string | null }[]>();

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  return {
    rotation_due: rows.filter(
      (row) => row.rotation_due_date !== null && row.rotation_due_date <= today,
    ).length,
    total: rows.length,
  };
}
