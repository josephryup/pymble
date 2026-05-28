import { createOpsServerSessionClient } from "@/lib/ops/auth";

export type OrganizationProfile = {
  id: number;
  legal_name: string;
  trading_name: string;
  tpin: string | null;
  email: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  address_line: string | null;
  city: string | null;
  country: string;
  headquarters_latitude: number | null;
  headquarters_longitude: number | null;
  logo_r2_key: string | null;
  invoice_prefix: string;
  currency_code: string;
  vat_rate: number;
  created_at: string;
  updated_at: string;
};

type RawOrganizationProfile = Omit<
  OrganizationProfile,
  "headquarters_latitude" | "headquarters_longitude" | "vat_rate"
> & {
  headquarters_latitude: number | string | null;
  headquarters_longitude: number | string | null;
  vat_rate: number | string;
};

function normalizeNumber(value: number | string | null) {
  return Number(value ?? 0);
}

function normalizeCoordinate(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeOrganizationProfile(profile: RawOrganizationProfile): OrganizationProfile {
  return {
    ...profile,
    headquarters_latitude: normalizeCoordinate(profile.headquarters_latitude),
    headquarters_longitude: normalizeCoordinate(profile.headquarters_longitude),
    vat_rate: normalizeNumber(profile.vat_rate),
  };
}

export async function fetchOpsOrganizationProfile() {
  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("organization_profile")
    .select("*")
    .eq("id", 1)
    .single<RawOrganizationProfile>();

  if (error) {
    throw error;
  }

  return normalizeOrganizationProfile(data);
}
