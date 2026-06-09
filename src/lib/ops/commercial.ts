import { requireOpsUser } from "@/lib/ops/auth";
import { canViewOpsCommercialControls } from "@/lib/ops/commercial-permissions";
import {
  buildOpsCommercialForecastReport,
  buildOpsCommercialMarginReport,
  type OpsCommercialCashflowForecastSource,
  type OpsCommercialForecastReport,
  type OpsCommercialMarginClaimSource,
  type OpsCommercialMarginContractSource,
  type OpsCommercialMarginCostSource,
  type OpsCommercialMarginReport,
  type OpsCommercialMarginValuationLineSource,
  type OpsCommercialMarginVariationSource,
  type OpsCommercialMilestoneForecastSource,
  type OpsCommercialRetentionReleaseSource,
} from "@/lib/ops/commercial-reporting";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsCommercialClaimStatus,
  OpsCommercialClaimType,
  OpsCommercialCashflowStatus,
  OpsCommercialContractStatus,
  OpsCommercialContractType,
  OpsCommercialForecastConfidence,
  OpsCommercialIpcStatus,
  OpsCommercialMilestoneStatus,
  OpsCommercialRetentionReleaseStatus,
  OpsCommercialRetentionReleaseType,
  OpsCommercialRiskCategory,
  OpsCommercialRiskSeverity,
  OpsCommercialRiskStatus,
  OpsCommercialValuationStatus,
  OpsCommercialVariationStatus,
  OpsUserRole,
} from "@/lib/ops/types";

export type OpsCommercialSiteSummary = {
  code: string;
  id: string;
  name: string;
};

export type OpsCommercialBoqSummary = {
  id: string;
  title: string;
};

export type OpsCommercialInvoiceSummary = {
  id: string;
  invoice_number: string;
  total_amount: number;
};

export type OpsCommercialUserSummary = {
  full_name: string;
  id: string;
  role: OpsUserRole;
};

export type OpsCommercialBoqOption = {
  id: string;
  site_id: string;
  title: string;
};

export type OpsCommercialVariationOption = {
  id: string;
  site_id: string;
  title: string;
  variation_number: string;
};

export type OpsCommercialContractOption = {
  client_name: string;
  contract_number: string;
  id: string;
  site_id: string;
  title: string;
};

export type OpsCommercialValuationOption = {
  id: string;
  site_id: string;
  title: string;
  valuation_number: string;
};

export type OpsCommercialIpcSummary = {
  boq: OpsCommercialBoqSummary | null;
  boq_id: string | null;
  certified_amount: number;
  certified_at: string | null;
  claimed_amount: number;
  client_reference: string;
  contract: Pick<OpsCommercialContractOption, "client_name" | "contract_number" | "id" | "title"> | null;
  contract_id: string | null;
  created_at: string;
  created_by: string | null;
  description: string;
  id: string;
  invoice: OpsCommercialInvoiceSummary | null;
  invoice_id: string | null;
  ipc_number: string;
  notes: string;
  period_end: string | null;
  period_start: string | null;
  rejection_reason: string;
  retention_amount: number;
  site: OpsCommercialSiteSummary | null;
  site_id: string;
  status: OpsCommercialIpcStatus;
  submitted_by: string | null;
  submitted_by_user: OpsCommercialUserSummary | null;
  title: string;
  total_certified_amount: number;
  valuation: Pick<OpsCommercialValuationOption, "id" | "title" | "valuation_number"> | null;
  valuation_id: string | null;
  valuation_date: string;
  vat_amount: number;
};

export type OpsCommercialVariationSummary = {
  approved_amount: number;
  approved_at: string | null;
  boq: OpsCommercialBoqSummary | null;
  boq_id: string | null;
  client_reference: string;
  created_at: string;
  created_by: string | null;
  description: string;
  id: string;
  instruction_reference: string;
  notes: string;
  reason: string;
  rejection_reason: string;
  site: OpsCommercialSiteSummary | null;
  site_id: string;
  status: OpsCommercialVariationStatus;
  submitted_amount: number;
  submitted_by: string | null;
  title: string;
  variation_number: string;
};

export type OpsCommercialClaimSummary = {
  agreed_amount: number;
  claim_number: string;
  claim_type: OpsCommercialClaimType;
  claimed_amount: number;
  client_reference: string;
  created_at: string;
  created_by: string | null;
  description: string;
  due_date: string | null;
  event_date: string | null;
  id: string;
  notes: string;
  rejection_reason: string;
  site: OpsCommercialSiteSummary | null;
  site_id: string;
  status: OpsCommercialClaimStatus;
  submitted_by: string | null;
  title: string;
  variation: Pick<OpsCommercialVariationSummary, "id" | "title" | "variation_number"> | null;
  variation_id: string | null;
};

export type OpsCommercialContractSummary = {
  activated_at: string | null;
  boq: OpsCommercialBoqSummary | null;
  boq_id: string | null;
  client_name: string;
  client_reference: string;
  contract_number: string;
  contract_sum: number;
  contract_type: OpsCommercialContractType;
  created_at: string;
  created_by: string | null;
  description: string;
  end_date: string | null;
  id: string;
  notes: string;
  performance_security_amount: number;
  retention_percent: number;
  site: OpsCommercialSiteSummary | null;
  site_id: string;
  start_date: string | null;
  status: OpsCommercialContractStatus;
  title: string;
};

export type OpsCommercialValuationLineSummary = {
  certified_amount: number;
  certified_quantity: number;
  claimed_amount: number;
  claimed_quantity: number;
  description: string;
  id: string;
  notes: string;
  unit: string;
  unit_rate: number;
};

export type OpsCommercialValuationSummary = {
  boq: OpsCommercialBoqSummary | null;
  boq_id: string | null;
  certified_at: string | null;
  certified_total: number;
  claimed_total: number;
  contract: Pick<OpsCommercialContractOption, "client_name" | "contract_number" | "id" | "title"> | null;
  contract_id: string | null;
  created_at: string;
  created_by: string | null;
  description: string;
  id: string;
  ipc: Pick<OpsCommercialIpcSummary, "id" | "ipc_number" | "title"> | null;
  ipc_id: string | null;
  line_count: number;
  lines: OpsCommercialValuationLineSummary[];
  period_end: string | null;
  period_start: string | null;
  rejection_reason: string;
  site: OpsCommercialSiteSummary | null;
  site_id: string;
  status: OpsCommercialValuationStatus;
  submitted_by: string | null;
  title: string;
  valuation_date: string;
  valuation_number: string;
};

export type OpsCommercialRiskSummary = {
  category: OpsCommercialRiskCategory;
  contract: Pick<OpsCommercialContractOption, "contract_number" | "id" | "title"> | null;
  contract_id: string | null;
  created_at: string;
  created_by: string | null;
  description: string;
  due_date: string | null;
  id: string;
  impact_amount: number;
  mitigation_plan: string;
  risk_number: string;
  severity: OpsCommercialRiskSeverity;
  site: OpsCommercialSiteSummary | null;
  site_id: string;
  status: OpsCommercialRiskStatus;
  title: string;
};

export type OpsCommercialRetentionReleaseSummary = {
  approved_amount: number;
  claimed_amount: number;
  client_reference: string;
  contract: Pick<OpsCommercialContractOption, "client_name" | "contract_number" | "id" | "title"> | null;
  contract_id: string;
  created_at: string;
  created_by: string | null;
  description: string;
  due_date: string | null;
  id: string;
  ipc: Pick<OpsCommercialIpcSummary, "id" | "ipc_number" | "title"> | null;
  ipc_id: string | null;
  notes: string;
  rejection_reason: string;
  release_date: string | null;
  release_number: string;
  release_type: OpsCommercialRetentionReleaseType;
  released_amount: number;
  site: OpsCommercialSiteSummary | null;
  site_id: string;
  status: OpsCommercialRetentionReleaseStatus;
  submitted_by: string | null;
  title: string;
};

export type OpsCommercialCashflowForecastSummary = {
  actual_cost: number;
  actual_net_cash: number;
  actual_revenue: number;
  assumptions: string;
  confidence: OpsCommercialForecastConfidence;
  contract: Pick<OpsCommercialContractOption, "client_name" | "contract_number" | "id" | "title"> | null;
  contract_id: string | null;
  created_at: string;
  created_by: string | null;
  forecast_cost: number;
  forecast_net_cash: number;
  forecast_number: string;
  forecast_retention_release: number;
  forecast_revenue: number;
  id: string;
  period_end: string;
  period_start: string;
  site: OpsCommercialSiteSummary | null;
  site_id: string;
  status: OpsCommercialCashflowStatus;
  title: string;
};

export type OpsCommercialMilestoneSummary = {
  achieved_amount: number;
  billing_weight_percent: number;
  contract: Pick<OpsCommercialContractOption, "client_name" | "contract_number" | "id" | "title"> | null;
  contract_id: string;
  created_at: string;
  created_by: string | null;
  description: string;
  due_date: string | null;
  forecast_date: string | null;
  id: string;
  invoice_trigger: boolean;
  milestone_number: string;
  notes: string;
  owner_id: string | null;
  planned_date: string | null;
  retention_trigger: boolean;
  site: OpsCommercialSiteSummary | null;
  site_id: string | null;
  status: OpsCommercialMilestoneStatus;
  target_amount: number;
  title: string;
};

export type OpsCommercialStats = {
  agreedClaims: number;
  activeContracts: number;
  approvedVariations: number;
  certifiedIpcs: number;
  draftValuations: number;
  openClaims: number;
  openIpcs: number;
  openRisks: number;
  openVariations: number;
  totalCertifiedAmount: number;
  totalExposureAmount: number;
  valuationCertifiedAmount: number;
};

export type FetchPaginatedOpsCommercialIpcsOptions = {
  listState: OpsListState;
  query?: string;
  status?: OpsCommercialIpcStatus;
};

type RawRelation<T> = T | T[] | null;

type RawCommercialIpc = Omit<
  OpsCommercialIpcSummary,
  | "boq"
  | "certified_amount"
  | "claimed_amount"
  | "contract"
  | "invoice"
  | "retention_amount"
  | "site"
  | "submitted_by_user"
  | "total_certified_amount"
  | "valuation"
  | "vat_amount"
> & {
  boq: RawRelation<OpsCommercialBoqSummary>;
  certified_amount: number | string;
  claimed_amount: number | string;
  contract: RawRelation<OpsCommercialIpcSummary["contract"]>;
  invoice: RawRelation<Omit<OpsCommercialInvoiceSummary, "total_amount"> & { total_amount: number | string }>;
  retention_amount: number | string;
  site: RawRelation<OpsCommercialSiteSummary>;
  submitted_by_user: RawRelation<OpsCommercialUserSummary>;
  total_certified_amount: number | string;
  valuation: RawRelation<OpsCommercialIpcSummary["valuation"]>;
  vat_amount: number | string;
};

type RawCommercialVariation = Omit<
  OpsCommercialVariationSummary,
  "approved_amount" | "boq" | "site" | "submitted_amount"
> & {
  approved_amount: number | string;
  boq: RawRelation<OpsCommercialBoqSummary>;
  site: RawRelation<OpsCommercialSiteSummary>;
  submitted_amount: number | string;
};

type RawCommercialClaim = Omit<
  OpsCommercialClaimSummary,
  "agreed_amount" | "claimed_amount" | "site" | "variation"
> & {
  agreed_amount: number | string;
  claimed_amount: number | string;
  site: RawRelation<OpsCommercialSiteSummary>;
  variation: RawRelation<OpsCommercialClaimSummary["variation"]>;
};

type RawCommercialContract = Omit<
  OpsCommercialContractSummary,
  "boq" | "contract_sum" | "performance_security_amount" | "retention_percent" | "site"
> & {
  boq: RawRelation<OpsCommercialBoqSummary>;
  contract_sum: number | string;
  performance_security_amount: number | string;
  retention_percent: number | string;
  site: RawRelation<OpsCommercialSiteSummary>;
};

type RawCommercialValuationLine = Omit<
  OpsCommercialValuationLineSummary,
  "certified_amount" | "certified_quantity" | "claimed_amount" | "claimed_quantity" | "unit_rate"
> & {
  certified_amount: number | string;
  certified_quantity: number | string;
  claimed_amount: number | string;
  claimed_quantity: number | string;
  unit_rate: number | string;
};

type RawCommercialValuation = Omit<
  OpsCommercialValuationSummary,
  "boq" | "certified_total" | "claimed_total" | "contract" | "ipc" | "line_count" | "lines" | "site"
> & {
  boq: RawRelation<OpsCommercialBoqSummary>;
  contract: RawRelation<OpsCommercialValuationSummary["contract"]>;
  ipc: RawRelation<OpsCommercialValuationSummary["ipc"]>;
  lines: RawCommercialValuationLine[] | null;
  site: RawRelation<OpsCommercialSiteSummary>;
};

type RawCommercialRisk = Omit<OpsCommercialRiskSummary, "contract" | "impact_amount" | "site"> & {
  contract: RawRelation<OpsCommercialRiskSummary["contract"]>;
  impact_amount: number | string;
  site: RawRelation<OpsCommercialSiteSummary>;
};

type RawCommercialRetentionRelease = Omit<
  OpsCommercialRetentionReleaseSummary,
  "approved_amount" | "claimed_amount" | "contract" | "ipc" | "released_amount" | "site"
> & {
  approved_amount: number | string;
  claimed_amount: number | string;
  contract: RawRelation<OpsCommercialRetentionReleaseSummary["contract"]>;
  ipc: RawRelation<OpsCommercialRetentionReleaseSummary["ipc"]>;
  released_amount: number | string;
  site: RawRelation<OpsCommercialSiteSummary>;
};

type RawCommercialCashflowForecast = Omit<
  OpsCommercialCashflowForecastSummary,
  | "actual_cost"
  | "actual_net_cash"
  | "actual_revenue"
  | "contract"
  | "forecast_cost"
  | "forecast_net_cash"
  | "forecast_retention_release"
  | "forecast_revenue"
  | "site"
> & {
  actual_cost: number | string;
  actual_net_cash: number | string;
  actual_revenue: number | string;
  contract: RawRelation<OpsCommercialCashflowForecastSummary["contract"]>;
  forecast_cost: number | string;
  forecast_net_cash: number | string;
  forecast_retention_release: number | string;
  forecast_revenue: number | string;
  site: RawRelation<OpsCommercialSiteSummary>;
};

type RawCommercialMilestone = Omit<
  OpsCommercialMilestoneSummary,
  "achieved_amount" | "billing_weight_percent" | "contract" | "site" | "target_amount"
> & {
  achieved_amount: number | string;
  billing_weight_percent: number | string;
  contract: RawRelation<OpsCommercialMilestoneSummary["contract"]>;
  site: RawRelation<OpsCommercialSiteSummary>;
  target_amount: number | string;
};

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function normalizeRelation<T>(value: RawRelation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeLimit(limit: number, max = 250) {
  return Math.min(Math.max(limit, 1), max);
}

function isSchemaCacheMiss(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST200" ||
    error?.code === "PGRST205" ||
    Boolean(error?.message?.includes("schema cache")) ||
    Boolean(
      /commercial_ipcs|commercial_variations|commercial_claims|commercial_contracts|commercial_contract_milestones|commercial_retention_releases|commercial_cashflow_forecasts|commercial_valuations|commercial_valuation_lines|commercial_risks|project_cost_entries|contract_id|valuation_id|release_type|forecast_net_cash|billing_weight_percent/i.test(
        error?.message ?? "",
      ),
    )
  );
}

async function countCommercialTable(
  table:
    | "commercial_claims"
    | "commercial_contracts"
    | "commercial_ipcs"
    | "commercial_risks"
    | "commercial_valuations"
    | "commercial_variations",
  statuses?: string[],
) {
  const supabase = getOpsSupabaseServiceClient();
  let query = supabase.from(table).select("id", { count: "exact", head: true });

  if (statuses && statuses.length > 0) {
    query = query.in("status", statuses);
  }

  const { count, error } = await query;

  if (isSchemaCacheMiss(error)) {
    return 0;
  }

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function fetchCommercialBoqOptions(limit = 200) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsCommercialControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("boq_documents")
    .select("id, site_id, title")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(normalizeLimit(limit, 300));

  if (error) {
    throw error;
  }

  return (data ?? []) as OpsCommercialBoqOption[];
}

export async function fetchCommercialVariationOptions(limit = 200) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsCommercialControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_variations")
    .select("id, variation_number, site_id, title")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 300));

  if (isSchemaCacheMiss(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return (data ?? []) as OpsCommercialVariationOption[];
}

export async function fetchCommercialContractOptions(limit = 200) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsCommercialControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_contracts")
    .select("id, contract_number, site_id, title, client_name")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 300));

  if (isSchemaCacheMiss(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return (data ?? []) as OpsCommercialContractOption[];
}

export async function fetchCommercialValuationOptions(limit = 200) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsCommercialControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_valuations")
    .select("id, valuation_number, site_id, title")
    .neq("status", "cancelled")
    .order("valuation_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 300));

  if (isSchemaCacheMiss(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return (data ?? []) as OpsCommercialValuationOption[];
}

export async function fetchPaginatedOpsCommercialIpcs(
  options: FetchPaginatedOpsCommercialIpcsOptions,
): Promise<OpsPaginatedResult<OpsCommercialIpcSummary>> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsCommercialControls(profile.role)) {
    return toOpsPaginatedResult([], 0, options.listState);
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("commercial_ipcs")
    .select(
      [
        "id",
        "ipc_number",
        "site_id",
        "boq_id",
        "contract_id",
        "valuation_id",
        "invoice_id",
        "status",
        "title",
        "description",
        "valuation_date",
        "period_start",
        "period_end",
        "claimed_amount",
        "certified_amount",
        "retention_amount",
        "vat_amount",
        "total_certified_amount",
        "client_reference",
        "submitted_by",
        "certified_at",
        "rejection_reason",
        "notes",
        "created_by",
        "created_at",
        "site:sites!commercial_ipcs_site_id_fkey(id, code, name)",
        "boq:boq_documents!commercial_ipcs_boq_id_fkey(id, title)",
        "contract:commercial_contracts!commercial_ipcs_contract_id_fkey(id, contract_number, title, client_name)",
        "valuation:commercial_valuations!commercial_ipcs_valuation_id_fkey(id, valuation_number, title)",
        "invoice:invoices!commercial_ipcs_invoice_id_fkey(id, invoice_number, total_amount)",
        "submitted_by_user:users!commercial_ipcs_submitted_by_fkey(id, full_name, role)",
      ].join(", "),
      { count: "exact" },
    )
    .order("valuation_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }

  const searchFilter = opsIlikeOrFilter(
    ["ipc_number", "title", "description", "client_reference"],
    options.query ?? "",
  );

  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await query.range(options.listState.from, options.listState.to);

  if (isSchemaCacheMiss(error)) {
    return toOpsPaginatedResult([], 0, options.listState);
  }

  if (error) {
    throw error;
  }

  return toOpsPaginatedResult(
    ((data ?? []) as unknown as RawCommercialIpc[]).map((ipc) => {
      const invoice = normalizeRelation(ipc.invoice);

      return {
        ...ipc,
        boq: normalizeRelation(ipc.boq),
        certified_amount: normalizeNumber(ipc.certified_amount),
        claimed_amount: normalizeNumber(ipc.claimed_amount),
        contract: normalizeRelation(ipc.contract),
        invoice: invoice
          ? {
              ...invoice,
              total_amount: normalizeNumber(invoice.total_amount),
            }
          : null,
        retention_amount: normalizeNumber(ipc.retention_amount),
        site: normalizeRelation(ipc.site),
        submitted_by_user: normalizeRelation(ipc.submitted_by_user),
        total_certified_amount: normalizeNumber(ipc.total_certified_amount),
        valuation: normalizeRelation(ipc.valuation),
        vat_amount: normalizeNumber(ipc.vat_amount),
      } satisfies OpsCommercialIpcSummary;
    }),
    count,
    options.listState,
  );
}

export async function fetchRecentCommercialVariations(limit = 30) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsCommercialControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_variations")
    .select(
      [
        "id",
        "variation_number",
        "site_id",
        "boq_id",
        "status",
        "title",
        "description",
        "reason",
        "instruction_reference",
        "client_reference",
        "submitted_amount",
        "approved_amount",
        "submitted_by",
        "approved_at",
        "rejection_reason",
        "notes",
        "created_by",
        "created_at",
        "site:sites!commercial_variations_site_id_fkey(id, code, name)",
        "boq:boq_documents!commercial_variations_boq_id_fkey(id, title)",
      ].join(", "),
    )
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isSchemaCacheMiss(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawCommercialVariation[]).map((variation) => ({
    ...variation,
    approved_amount: normalizeNumber(variation.approved_amount),
    boq: normalizeRelation(variation.boq),
    site: normalizeRelation(variation.site),
    submitted_amount: normalizeNumber(variation.submitted_amount),
  }));
}

export async function fetchRecentCommercialClaims(limit = 30) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsCommercialControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_claims")
    .select(
      [
        "id",
        "claim_number",
        "site_id",
        "variation_id",
        "claim_type",
        "status",
        "title",
        "description",
        "event_date",
        "due_date",
        "claimed_amount",
        "agreed_amount",
        "client_reference",
        "submitted_by",
        "rejection_reason",
        "notes",
        "created_by",
        "created_at",
        "site:sites!commercial_claims_site_id_fkey(id, code, name)",
        "variation:commercial_variations!commercial_claims_variation_id_fkey(id, variation_number, title)",
      ].join(", "),
    )
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isSchemaCacheMiss(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawCommercialClaim[]).map((claim) => ({
    ...claim,
    agreed_amount: normalizeNumber(claim.agreed_amount),
    claimed_amount: normalizeNumber(claim.claimed_amount),
    site: normalizeRelation(claim.site),
    variation: normalizeRelation(claim.variation),
  }));
}

export async function fetchRecentCommercialContracts(limit = 20) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsCommercialControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_contracts")
    .select(
      [
        "id",
        "contract_number",
        "site_id",
        "boq_id",
        "status",
        "contract_type",
        "title",
        "client_name",
        "client_reference",
        "description",
        "start_date",
        "end_date",
        "contract_sum",
        "retention_percent",
        "performance_security_amount",
        "activated_at",
        "notes",
        "created_by",
        "created_at",
        "site:sites!commercial_contracts_site_id_fkey(id, code, name)",
        "boq:boq_documents!commercial_contracts_boq_id_fkey(id, title)",
      ].join(", "),
    )
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isSchemaCacheMiss(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawCommercialContract[]).map((contract) => ({
    ...contract,
    boq: normalizeRelation(contract.boq),
    contract_sum: normalizeNumber(contract.contract_sum),
    performance_security_amount: normalizeNumber(contract.performance_security_amount),
    retention_percent: normalizeNumber(contract.retention_percent),
    site: normalizeRelation(contract.site),
  }));
}

export async function fetchRecentCommercialValuations(limit = 20) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsCommercialControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_valuations")
    .select(
      [
        "id",
        "valuation_number",
        "site_id",
        "boq_id",
        "contract_id",
        "ipc_id",
        "status",
        "title",
        "description",
        "valuation_date",
        "period_start",
        "period_end",
        "submitted_by",
        "certified_at",
        "rejection_reason",
        "created_by",
        "created_at",
        "site:sites!commercial_valuations_site_id_fkey(id, code, name)",
        "boq:boq_documents!commercial_valuations_boq_id_fkey(id, title)",
        "contract:commercial_contracts!commercial_valuations_contract_id_fkey(id, contract_number, title, client_name)",
        "ipc:commercial_ipcs!commercial_valuations_ipc_id_fkey(id, ipc_number, title)",
        "lines:commercial_valuation_lines(id, description, unit, claimed_quantity, certified_quantity, unit_rate, claimed_amount, certified_amount, notes)",
      ].join(", "),
    )
    .neq("status", "cancelled")
    .order("valuation_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isSchemaCacheMiss(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawCommercialValuation[]).map((valuation) => {
    const lines = (valuation.lines ?? []).map((line) => ({
      ...line,
      certified_amount: normalizeNumber(line.certified_amount),
      certified_quantity: normalizeNumber(line.certified_quantity),
      claimed_amount: normalizeNumber(line.claimed_amount),
      claimed_quantity: normalizeNumber(line.claimed_quantity),
      unit_rate: normalizeNumber(line.unit_rate),
    }));

    return {
      ...valuation,
      boq: normalizeRelation(valuation.boq),
      certified_total: lines.reduce((sum, line) => sum + line.certified_amount, 0),
      claimed_total: lines.reduce((sum, line) => sum + line.claimed_amount, 0),
      contract: normalizeRelation(valuation.contract),
      ipc: normalizeRelation(valuation.ipc),
      line_count: lines.length,
      lines,
      site: normalizeRelation(valuation.site),
    };
  });
}

export async function fetchRecentCommercialRisks(limit = 20) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsCommercialControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_risks")
    .select(
      [
        "id",
        "risk_number",
        "site_id",
        "contract_id",
        "status",
        "category",
        "severity",
        "title",
        "description",
        "impact_amount",
        "mitigation_plan",
        "due_date",
        "created_by",
        "created_at",
        "site:sites!commercial_risks_site_id_fkey(id, code, name)",
        "contract:commercial_contracts!commercial_risks_contract_id_fkey(id, contract_number, title)",
      ].join(", "),
    )
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isSchemaCacheMiss(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawCommercialRisk[]).map((risk) => ({
    ...risk,
    contract: normalizeRelation(risk.contract),
    impact_amount: normalizeNumber(risk.impact_amount),
    site: normalizeRelation(risk.site),
  }));
}

export async function fetchRecentCommercialRetentionReleases(limit = 20) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsCommercialControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_retention_releases")
    .select(
      [
        "id",
        "release_number",
        "site_id",
        "contract_id",
        "ipc_id",
        "status",
        "release_type",
        "title",
        "description",
        "due_date",
        "release_date",
        "claimed_amount",
        "approved_amount",
        "released_amount",
        "client_reference",
        "submitted_by",
        "rejection_reason",
        "notes",
        "created_by",
        "created_at",
        "site:sites!commercial_retention_releases_site_id_fkey(id, code, name)",
        "contract:commercial_contracts!commercial_retention_releases_contract_id_fkey(id, contract_number, title, client_name)",
        "ipc:commercial_ipcs!commercial_retention_releases_ipc_id_fkey(id, ipc_number, title)",
      ].join(", "),
    )
    .neq("status", "cancelled")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isSchemaCacheMiss(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawCommercialRetentionRelease[]).map((release) => ({
    ...release,
    approved_amount: normalizeNumber(release.approved_amount),
    claimed_amount: normalizeNumber(release.claimed_amount),
    contract: normalizeRelation(release.contract),
    ipc: normalizeRelation(release.ipc),
    released_amount: normalizeNumber(release.released_amount),
    site: normalizeRelation(release.site),
  }));
}

export async function fetchRecentCommercialCashflowForecasts(limit = 20) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsCommercialControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_cashflow_forecasts")
    .select(
      [
        "id",
        "forecast_number",
        "site_id",
        "contract_id",
        "status",
        "confidence",
        "title",
        "period_start",
        "period_end",
        "forecast_revenue",
        "forecast_retention_release",
        "forecast_cost",
        "actual_revenue",
        "actual_cost",
        "forecast_net_cash",
        "actual_net_cash",
        "assumptions",
        "created_by",
        "created_at",
        "site:sites!commercial_cashflow_forecasts_site_id_fkey(id, code, name)",
        "contract:commercial_contracts!commercial_cashflow_forecasts_contract_id_fkey(id, contract_number, title, client_name)",
      ].join(", "),
    )
    .neq("status", "cancelled")
    .order("period_start", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isSchemaCacheMiss(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawCommercialCashflowForecast[]).map((forecast) => ({
    ...forecast,
    actual_cost: normalizeNumber(forecast.actual_cost),
    actual_net_cash: normalizeNumber(forecast.actual_net_cash),
    actual_revenue: normalizeNumber(forecast.actual_revenue),
    contract: normalizeRelation(forecast.contract),
    forecast_cost: normalizeNumber(forecast.forecast_cost),
    forecast_net_cash: normalizeNumber(forecast.forecast_net_cash),
    forecast_retention_release: normalizeNumber(forecast.forecast_retention_release),
    forecast_revenue: normalizeNumber(forecast.forecast_revenue),
    site: normalizeRelation(forecast.site),
  }));
}

export async function fetchRecentCommercialMilestones(limit = 20) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsCommercialControls(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_contract_milestones")
    .select(
      [
        "id",
        "contract_id",
        "site_id",
        "milestone_number",
        "status",
        "title",
        "description",
        "due_date",
        "planned_date",
        "forecast_date",
        "target_amount",
        "achieved_amount",
        "billing_weight_percent",
        "invoice_trigger",
        "retention_trigger",
        "owner_id",
        "notes",
        "created_by",
        "created_at",
        "site:sites!commercial_contract_milestones_site_id_fkey(id, code, name)",
        "contract:commercial_contracts!commercial_contract_milestones_contract_id_fkey(id, contract_number, title, client_name)",
      ].join(", "),
    )
    .neq("status", "cancelled")
    .order("forecast_date", { ascending: true, nullsFirst: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(normalizeLimit(limit, 80));

  if (isSchemaCacheMiss(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawCommercialMilestone[]).map((milestone) => ({
    ...milestone,
    achieved_amount: normalizeNumber(milestone.achieved_amount),
    billing_weight_percent: normalizeNumber(milestone.billing_weight_percent),
    contract: normalizeRelation(milestone.contract),
    site: normalizeRelation(milestone.site),
    target_amount: normalizeNumber(milestone.target_amount),
  }));
}

export async function fetchOpsCommercialStats(): Promise<OpsCommercialStats> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsCommercialControls(profile.role)) {
    return {
      agreedClaims: 0,
      activeContracts: 0,
      approvedVariations: 0,
      certifiedIpcs: 0,
      draftValuations: 0,
      openClaims: 0,
      openIpcs: 0,
      openRisks: 0,
      openVariations: 0,
      totalCertifiedAmount: 0,
      totalExposureAmount: 0,
      valuationCertifiedAmount: 0,
    };
  }

  const supabase = getOpsSupabaseServiceClient();
  const [
    openIpcs,
    certifiedIpcs,
    openVariations,
    approvedVariations,
    openClaims,
    agreedClaims,
    activeContracts,
    draftValuations,
    openRisks,
    { data: certifiedAmounts, error: certifiedAmountsError },
    { data: variationAmounts, error: variationAmountsError },
    { data: claimAmounts, error: claimAmountsError },
    { data: valuationLineAmounts, error: valuationLineAmountsError },
  ] = await Promise.all([
    countCommercialTable("commercial_ipcs", ["submitted", "certified", "invoiced"]),
    countCommercialTable("commercial_ipcs", ["certified", "invoiced", "paid"]),
    countCommercialTable("commercial_variations", ["submitted", "priced", "approved"]),
    countCommercialTable("commercial_variations", ["approved", "closed"]),
    countCommercialTable("commercial_claims", ["submitted", "under_review", "agreed"]),
    countCommercialTable("commercial_claims", ["agreed", "closed"]),
    countCommercialTable("commercial_contracts", ["active", "on_hold"]),
    countCommercialTable("commercial_valuations", ["draft", "submitted"]),
    countCommercialTable("commercial_risks", ["open", "mitigating"]),
    supabase
      .from("commercial_ipcs")
      .select("total_certified_amount")
      .in("status", ["certified", "invoiced", "paid"]),
    supabase
      .from("commercial_variations")
      .select("submitted_amount, approved_amount")
      .in("status", ["submitted", "priced", "approved"]),
    supabase
      .from("commercial_claims")
      .select("claimed_amount, agreed_amount")
      .in("status", ["submitted", "under_review", "agreed"]),
    supabase
      .from("commercial_valuation_lines")
      .select("certified_amount, valuation:commercial_valuations!inner(status)")
      .eq("valuation.status", "certified"),
  ]);

  const blockingError = [
    certifiedAmountsError,
    variationAmountsError,
    claimAmountsError,
    valuationLineAmountsError,
  ].find((error) => error && !isSchemaCacheMiss(error));

  if (blockingError) {
    throw blockingError;
  }

  const totalCertifiedAmount = (certifiedAmountsError ? [] : (certifiedAmounts ?? [])).reduce(
    (sum, row) => sum + normalizeNumber(row.total_certified_amount as number | string),
    0,
  );
  const variationExposure = (variationAmountsError ? [] : (variationAmounts ?? [])).reduce(
    (sum, row) =>
      sum +
      (normalizeNumber(row.approved_amount as number | string) ||
        normalizeNumber(row.submitted_amount as number | string)),
    0,
  );
  const claimExposure = (claimAmountsError ? [] : (claimAmounts ?? [])).reduce(
    (sum, row) =>
      sum +
      (normalizeNumber(row.agreed_amount as number | string) ||
        normalizeNumber(row.claimed_amount as number | string)),
    0,
  );
  const valuationCertifiedAmount = (
    valuationLineAmountsError ? [] : (valuationLineAmounts ?? [])
  ).reduce((sum, row) => sum + normalizeNumber(row.certified_amount as number | string), 0);

  return {
    agreedClaims,
    activeContracts,
    approvedVariations,
    certifiedIpcs,
    draftValuations,
    openClaims,
    openIpcs,
    openRisks,
    openVariations,
    totalCertifiedAmount,
    totalExposureAmount: variationExposure + claimExposure,
    valuationCertifiedAmount,
  };
}

export async function fetchOpsCommercialMarginReport(): Promise<OpsCommercialMarginReport> {
  const emptyReport = buildOpsCommercialMarginReport({
    claims: [],
    contracts: [],
    costs: [],
    valuationLines: [],
    variations: [],
  });
  const { profile } = await requireOpsUser();

  if (!canViewOpsCommercialControls(profile.role)) {
    return emptyReport;
  }

  const supabase = getOpsSupabaseServiceClient();
  const [
    contractsResult,
    variationsResult,
    claimsResult,
    valuationLinesResult,
    costsResult,
  ] = await Promise.all([
    supabase
      .from("commercial_contracts")
      .select("site_id, status, contract_sum, site:sites!commercial_contracts_site_id_fkey(id, code, name)")
      .in("status", ["active", "completed"]),
    supabase
      .from("commercial_variations")
      .select("site_id, status, submitted_amount, approved_amount")
      .in("status", ["approved", "closed"]),
    supabase
      .from("commercial_claims")
      .select("site_id, status, claimed_amount, agreed_amount")
      .in("status", ["agreed", "closed"]),
    supabase
      .from("commercial_valuation_lines")
      .select("certified_amount, valuation:commercial_valuations!inner(site_id, status)")
      .eq("valuation.status", "certified"),
    supabase
      .from("project_cost_entries")
      .select("site_id, status, amount")
      .in("status", ["committed", "posted"]),
  ]);

  const blockingError = [
    contractsResult.error,
    variationsResult.error,
    claimsResult.error,
    valuationLinesResult.error,
    costsResult.error,
  ].find((error) => error && !isSchemaCacheMiss(error));

  if (blockingError) {
    throw blockingError;
  }

  return buildOpsCommercialMarginReport({
    claims: claimsResult.error
      ? []
      : ((claimsResult.data ?? []) as unknown as OpsCommercialMarginClaimSource[]),
    contracts: contractsResult.error
      ? []
      : ((contractsResult.data ?? []) as unknown as OpsCommercialMarginContractSource[]),
    costs: costsResult.error
      ? []
      : ((costsResult.data ?? []) as unknown as OpsCommercialMarginCostSource[]),
    valuationLines: valuationLinesResult.error
      ? []
      : ((valuationLinesResult.data ?? []) as unknown as OpsCommercialMarginValuationLineSource[]),
    variations: variationsResult.error
      ? []
      : ((variationsResult.data ?? []) as unknown as OpsCommercialMarginVariationSource[]),
  });
}

export async function fetchOpsCommercialForecastReport(today: string): Promise<OpsCommercialForecastReport> {
  const emptyReport = buildOpsCommercialForecastReport({
    cashflowForecasts: [],
    milestones: [],
    retentionReleases: [],
    today,
  });
  const { profile } = await requireOpsUser();

  if (!canViewOpsCommercialControls(profile.role)) {
    return emptyReport;
  }

  const supabase = getOpsSupabaseServiceClient();
  const [retentionResult, cashflowResult, milestoneResult] = await Promise.all([
    supabase
      .from("commercial_retention_releases")
      .select("status, due_date, claimed_amount, approved_amount, released_amount")
      .neq("status", "cancelled"),
    supabase
      .from("commercial_cashflow_forecasts")
      .select(
        [
          "status",
          "period_start",
          "forecast_revenue",
          "forecast_retention_release",
          "forecast_cost",
          "forecast_net_cash",
          "actual_net_cash",
        ].join(", "),
      )
      .neq("status", "cancelled"),
    supabase
      .from("commercial_contract_milestones")
      .select("status, due_date, planned_date, forecast_date, target_amount, achieved_amount")
      .neq("status", "cancelled"),
  ]);

  const blockingError = [
    retentionResult.error,
    cashflowResult.error,
    milestoneResult.error,
  ].find((error) => error && !isSchemaCacheMiss(error));

  if (blockingError) {
    throw blockingError;
  }

  return buildOpsCommercialForecastReport({
    cashflowForecasts: cashflowResult.error
      ? []
      : ((cashflowResult.data ?? []) as unknown as OpsCommercialCashflowForecastSource[]),
    milestones: milestoneResult.error
      ? []
      : ((milestoneResult.data ?? []) as unknown as OpsCommercialMilestoneForecastSource[]),
    retentionReleases: retentionResult.error
      ? []
      : ((retentionResult.data ?? []) as unknown as OpsCommercialRetentionReleaseSource[]),
    today,
  });
}
