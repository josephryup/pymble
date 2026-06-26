import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsItNetworkDeviceType, OpsItNetworkStatus } from "@/lib/ops/types";

export type OpsItNetworkSiteRef = { code: string; id: string; name: string };

export type OpsItNetworkDevice = {
  archived_at: string | null;
  created_at: string;
  device_type: OpsItNetworkDeviceType;
  id: string;
  ip_address: string;
  isp_provider: string;
  last_checked_at: string | null;
  location: string;
  name: string;
  notes: string;
  site: OpsItNetworkSiteRef | null;
  site_id: string | null;
  status: OpsItNetworkStatus;
};

export type OpsItNetworkStats = {
  maintenance: number;
  offline: number;
  online: number;
  total: number;
};

type RawRelation<T> = T | T[] | null;
type RawDevice = Omit<OpsItNetworkDevice, "site"> & { site: RawRelation<OpsItNetworkSiteRef> };

function firstRelation<T>(value: RawRelation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function fetchOpsItNetworkDevices(): Promise<OpsItNetworkDevice[]> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_network_devices")
    .select(
      "id, name, device_type, status, site_id, ip_address, location, isp_provider, last_checked_at, notes, archived_at, created_at, site:sites!it_network_devices_site_id_fkey(id, name, code)",
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .returns<RawDevice[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({ ...row, site: firstRelation(row.site) }));
}

export async function fetchOpsItNetworkStats(): Promise<OpsItNetworkStats> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_network_devices")
    .select("status")
    .is("archived_at", null)
    .returns<{ status: OpsItNetworkStatus }[]>();

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  return {
    maintenance: rows.filter((row) => row.status === "maintenance").length,
    offline: rows.filter((row) => row.status === "offline").length,
    online: rows.filter((row) => row.status === "online").length,
    total: rows.length,
  };
}
