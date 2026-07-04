import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsItAssetStatus, OpsItAssetType } from "@/lib/ops/types";

export type OpsItAssetUserRef = {
  full_name: string;
  id: string;
};

export type OpsItAssetSiteRef = {
  code: string;
  id: string;
  name: string;
};

export type OpsItAssetSummary = {
  archived_at: string | null;
  asset_tag: string;
  asset_type: OpsItAssetType;
  assigned_to: string | null;
  assignee: OpsItAssetUserRef | null;
  created_at: string;
  hostname: string;
  id: string;
  location: string;
  manufacturer: string;
  model: string;
  name: string;
  notes: string;
  operating_system: string;
  processor: string;
  purchase_cost: number | null;
  purchase_date: string | null;
  ram: string;
  serial_number: string;
  site: OpsItAssetSiteRef | null;
  site_id: string | null;
  status: OpsItAssetStatus;
  storage: string;
  warranty_expiry: string | null;
};

export type OpsItAssetStats = {
  in_repair: number;
  in_use: number;
  spare: number;
  total: number;
  warranty_expiring_soon: number;
};

type RawRelation<T> = T | T[] | null;

type RawItAsset = Omit<OpsItAssetSummary, "assignee" | "purchase_cost" | "site"> & {
  assignee: RawRelation<OpsItAssetUserRef>;
  purchase_cost: number | string | null;
  site: RawRelation<OpsItAssetSiteRef>;
};

const ASSET_SELECT =
  "id, asset_tag, asset_type, name, manufacturer, model, serial_number, status, assigned_to, site_id, location, purchase_date, warranty_expiry, purchase_cost, notes, " +
  "operating_system, processor, ram, storage, hostname, archived_at, created_at, " +
  "assignee:users!it_assets_assigned_to_fkey(id, full_name), " +
  "site:sites!it_assets_site_id_fkey(id, name, code)";

function firstRelation<T>(value: RawRelation<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function normalizeAsset(raw: RawItAsset): OpsItAssetSummary {
  return {
    ...raw,
    assignee: firstRelation(raw.assignee),
    purchase_cost:
      raw.purchase_cost === null || raw.purchase_cost === ""
        ? null
        : Number(raw.purchase_cost),
    site: firstRelation(raw.site),
  };
}

export type FetchOpsItAssetsOptions = {
  includeArchived?: boolean;
  limit?: number;
  status?: OpsItAssetStatus;
};

export async function fetchOpsItAssets(
  options: FetchOpsItAssetsOptions = {},
): Promise<OpsItAssetSummary[]> {
  const supabase = getOpsSupabaseServiceClient();
  let query = supabase.from("it_assets").select(ASSET_SELECT).order("created_at", { ascending: false });

  if (!options.includeArchived) {
    query = query.is("archived_at", null);
  }
  if (options.status) {
    query = query.eq("status", options.status);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query.returns<RawItAsset[]>();
  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeAsset);
}

export async function fetchOpsItAssetStats(): Promise<OpsItAssetStats> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_assets")
    .select("status, warranty_expiry")
    .is("archived_at", null)
    .returns<{ status: OpsItAssetStatus; warranty_expiry: string | null }[]>();

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const soon = new Date();
  soon.setDate(soon.getDate() + 60);
  const soonIso = soon.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  return {
    in_repair: rows.filter((row) => row.status === "repair").length,
    in_use: rows.filter((row) => row.status === "in_use").length,
    spare: rows.filter((row) => row.status === "spare").length,
    total: rows.length,
    warranty_expiring_soon: rows.filter(
      (row) =>
        row.warranty_expiry !== null &&
        row.warranty_expiry >= today &&
        row.warranty_expiry <= soonIso,
    ).length,
  };
}
