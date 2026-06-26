import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsItLicenseBilling, OpsItLicenseStatus } from "@/lib/ops/types";

export type OpsItLicenseSummary = {
  archived_at: string | null;
  billing: OpsItLicenseBilling;
  created_at: string;
  id: string;
  name: string;
  notes: string;
  renewal_date: string | null;
  seats_total: number | null;
  seats_used: number;
  status: OpsItLicenseStatus;
  unit_cost: number | null;
  vendor: string;
};

export type OpsItLicenseStats = {
  active: number;
  expired: number;
  expiring_soon: number;
  total: number;
};

type RawLicense = Omit<OpsItLicenseSummary, "unit_cost"> & {
  unit_cost: number | string | null;
};

export async function fetchOpsItLicenses(): Promise<OpsItLicenseSummary[]> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_software_licenses")
    .select(
      "id, name, vendor, billing, status, seats_total, seats_used, unit_cost, renewal_date, notes, archived_at, created_at",
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .returns<RawLicense[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    ...row,
    unit_cost: row.unit_cost === null || row.unit_cost === "" ? null : Number(row.unit_cost),
  }));
}

export async function fetchOpsItLicenseStats(): Promise<OpsItLicenseStats> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_software_licenses")
    .select("status, renewal_date")
    .is("archived_at", null)
    .returns<{ renewal_date: string | null; status: OpsItLicenseStatus }[]>();

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  const soonIso = soon.toISOString().slice(0, 10);

  return {
    active: rows.filter((row) => row.status === "active").length,
    expired: rows.filter(
      (row) => row.status === "active" && row.renewal_date !== null && row.renewal_date < today,
    ).length,
    expiring_soon: rows.filter(
      (row) =>
        row.status === "active" &&
        row.renewal_date !== null &&
        row.renewal_date >= today &&
        row.renewal_date <= soonIso,
    ).length,
    total: rows.length,
  };
}
