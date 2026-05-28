import { createOpsServerSessionClient } from "@/lib/ops/auth";
import type { OpsSiteStatus } from "@/lib/ops/types";

export type OpsSite = {
  id: string;
  code: string;
  name: string;
  location: string;
  supervisor_name: string;
  client_name: string;
  budget_zmw: number;
  latitude: number | null;
  longitude: number | null;
  status: OpsSiteStatus;
  is_active: boolean;
  created_at: string;
};

export type OpsSiteOption = {
  id: string;
  code: string;
  name: string;
};

function normalizeMoney(value: number | string | null) {
  return Number(value ?? 0);
}

function normalizeCoordinate(value: number | string | null) {
  return value === null ? null : Number(value);
}

export async function fetchOpsSites() {
  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("sites")
    .select(
      "id, code, name, location, supervisor_name, client_name, budget_zmw, latitude, longitude, status, is_active, created_at",
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (
    (data ?? []) as Array<
      Omit<OpsSite, "budget_zmw" | "latitude" | "longitude"> & {
        budget_zmw: number | string;
        latitude: number | string | null;
        longitude: number | string | null;
      }
    >
  ).map((site) => ({
    ...site,
    budget_zmw: normalizeMoney(site.budget_zmw),
    latitude: normalizeCoordinate(site.latitude),
    longitude: normalizeCoordinate(site.longitude),
  }));
}

export async function fetchActiveSiteOptions() {
  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("sites")
    .select("id, code, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as OpsSiteOption[];
}
