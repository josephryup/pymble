"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { notifyOpsWorkflowEvent } from "@/lib/ops/workflow-notifications";
import {
  canAgreeOpsCommercialClaim,
  canActivateOpsCommercialContract,
  canApproveOpsCommercialVariation,
  canAchieveOpsCommercialMilestone,
  canApproveOpsCommercialCashflowForecast,
  canApproveOpsCommercialRetentionRelease,
  canArchiveOpsCommercialCashflowForecast,
  canCancelOpsCommercialClaim,
  canCancelOpsCommercialCashflowForecast,
  canCancelOpsCommercialContract,
  canCancelOpsCommercialIpc,
  canCancelOpsCommercialMilestone,
  canCancelOpsCommercialRetentionRelease,
  canCancelOpsCommercialRisk,
  canCancelOpsCommercialValuation,
  canCancelOpsCommercialVariation,
  canCertifyOpsCommercialIpc,
  canCertifyOpsCommercialMilestone,
  canCertifyOpsCommercialValuation,
  canCloseOpsCommercialClaim,
  canCloseOpsCommercialRisk,
  canCloseOpsCommercialVariation,
  canCompleteOpsCommercialContract,
  canCreateOpsCommercialInvoiceFromIpc,
  canCreateOpsCommercialRecord,
  canDelayOpsCommercialMilestone,
  canEditOpsCommercialValuationLines,
  canLockOpsCommercialCashflowForecast,
  canMarkOpsCommercialMilestoneDue,
  canMoveOpsCommercialRiskToMitigation,
  canMarkOpsCommercialIpcInvoiced,
  canMarkOpsCommercialIpcPaid,
  canPriceOpsCommercialVariation,
  canRejectOpsCommercialClaim,
  canRejectOpsCommercialIpc,
  canRejectOpsCommercialRetentionRelease,
  canRejectOpsCommercialValuation,
  canRejectOpsCommercialVariation,
  canReleaseOpsCommercialRetentionRelease,
  canReviewOpsCommercialClaim,
  canSubmitOpsCommercialClaim,
  canSubmitOpsCommercialIpc,
  canSubmitOpsCommercialRetentionRelease,
  canSubmitOpsCommercialValuation,
  canSubmitOpsCommercialVariation,
} from "@/lib/ops/commercial-permissions";
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
} from "@/lib/ops/types";

const COMMERCIAL_ROUTE = "/ops/commercial";

const claimTypes = [
  "extension_of_time",
  "loss_expense",
  "acceleration",
  "disruption",
  "prolongation",
  "variation_dispute",
  "other",
] as const satisfies readonly OpsCommercialClaimType[];

const contractTypes = [
  "main_contract",
  "subcontract",
  "professional_service",
  "supply",
  "other",
] as const satisfies readonly OpsCommercialContractType[];

const riskCategories = [
  "client",
  "contract",
  "scope",
  "cost",
  "programme",
  "payment",
  "dispute",
  "other",
] as const satisfies readonly OpsCommercialRiskCategory[];

const riskSeverities = [
  "low",
  "medium",
  "high",
  "critical",
] as const satisfies readonly OpsCommercialRiskSeverity[];

const retentionReleaseTypes = [
  "interim",
  "practical_completion",
  "defects_liability",
  "final_account",
  "other",
] as const satisfies readonly OpsCommercialRetentionReleaseType[];

const forecastConfidences = [
  "low",
  "medium",
  "high",
] as const satisfies readonly OpsCommercialForecastConfidence[];

const ipcSchema = z.object({
  boq_id: z.string().trim().default(""),
  claimed_amount: z.coerce.number().min(0, "Claimed amount cannot be negative.").default(0),
  client_reference: z.string().trim().max(120).default(""),
  contract_id: z.string().trim().default(""),
  description: z.string().trim().max(1200).default(""),
  notes: z.string().trim().max(900).default(""),
  period_end: z.string().trim().default(""),
  period_start: z.string().trim().default(""),
  site_id: z.string().uuid("Select a site."),
  title: z.string().trim().min(2, "IPC title is required.").max(180),
  valuation_id: z.string().trim().default(""),
  valuation_date: z.string().trim().default(""),
});

const variationSchema = z.object({
  boq_id: z.string().trim().default(""),
  client_reference: z.string().trim().max(120).default(""),
  description: z.string().trim().max(1200).default(""),
  instruction_reference: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(900).default(""),
  reason: z.string().trim().max(900).default(""),
  site_id: z.string().uuid("Select a site."),
  submitted_amount: z.coerce.number().min(0, "Submitted amount cannot be negative.").default(0),
  title: z.string().trim().min(2, "Variation title is required.").max(180),
});

const claimSchema = z.object({
  claim_type: z.enum(claimTypes).default("other"),
  claimed_amount: z.coerce.number().min(0, "Claimed amount cannot be negative.").default(0),
  client_reference: z.string().trim().max(120).default(""),
  description: z.string().trim().max(1200).default(""),
  due_date: z.string().trim().default(""),
  event_date: z.string().trim().default(""),
  notes: z.string().trim().max(900).default(""),
  site_id: z.string().uuid("Select a site."),
  title: z.string().trim().min(2, "Claim title is required.").max(180),
  variation_id: z.string().trim().default(""),
});

const ipcIdSchema = z.object({
  ipc_id: z.string().uuid("Select an IPC."),
});

const certifyIpcSchema = ipcIdSchema.extend({
  certified_amount: z.coerce.number().min(0, "Certified amount cannot be negative.").default(0),
  notes: z.string().trim().max(900).default(""),
  retention_amount: z.coerce.number().min(0, "Retention cannot be negative.").default(0),
  vat_amount: z.coerce.number().min(0, "VAT cannot be negative.").default(0),
});

const rejectIpcSchema = ipcIdSchema.extend({
  rejection_reason: z.string().trim().min(2, "Rejection reason is required.").max(500),
});

const variationIdSchema = z.object({
  variation_id: z.string().uuid("Select a variation."),
});

const priceVariationSchema = variationIdSchema.extend({
  notes: z.string().trim().max(900).default(""),
  submitted_amount: z.coerce.number().min(0, "Submitted amount cannot be negative.").default(0),
});

const approveVariationSchema = variationIdSchema.extend({
  approved_amount: z.coerce.number().min(0, "Approved amount cannot be negative.").default(0),
  notes: z.string().trim().max(900).default(""),
});

const rejectVariationSchema = variationIdSchema.extend({
  rejection_reason: z.string().trim().min(2, "Rejection reason is required.").max(500),
});

const claimIdSchema = z.object({
  claim_id: z.string().uuid("Select a claim."),
});

const agreeClaimSchema = claimIdSchema.extend({
  agreed_amount: z.coerce.number().min(0, "Agreed amount cannot be negative.").default(0),
  notes: z.string().trim().max(900).default(""),
});

const rejectClaimSchema = claimIdSchema.extend({
  rejection_reason: z.string().trim().min(2, "Rejection reason is required.").max(500),
});

const contractSchema = z.object({
  boq_id: z.string().trim().default(""),
  client_name: z.string().trim().min(2, "Client name is required.").max(180),
  client_reference: z.string().trim().max(120).default(""),
  contract_sum: z.coerce.number().min(0, "Contract sum cannot be negative.").default(0),
  contract_type: z.enum(contractTypes).default("main_contract"),
  description: z.string().trim().max(1200).default(""),
  end_date: z.string().trim().default(""),
  notes: z.string().trim().max(900).default(""),
  performance_security_amount: z.coerce
    .number()
    .min(0, "Security amount cannot be negative.")
    .default(0),
  retention_percent: z.coerce
    .number()
    .min(0, "Retention cannot be negative.")
    .max(100, "Retention cannot exceed 100%.")
    .default(0),
  site_id: z.string().uuid("Select a site."),
  start_date: z.string().trim().default(""),
  title: z.string().trim().min(2, "Contract title is required.").max(180),
});

const contractIdSchema = z.object({
  contract_id: z.string().uuid("Select a contract."),
});

const valuationSchema = z.object({
  boq_id: z.string().trim().default(""),
  certified_quantity: z.coerce.number().min(0, "Certified quantity cannot be negative.").default(0),
  claimed_quantity: z.coerce.number().min(0, "Claimed quantity cannot be negative.").default(0),
  contract_id: z.string().trim().default(""),
  description: z.string().trim().max(1200).default(""),
  ipc_id: z.string().trim().default(""),
  line_description: z.string().trim().min(2, "Valuation line description is required.").max(300),
  notes: z.string().trim().max(900).default(""),
  period_end: z.string().trim().default(""),
  period_start: z.string().trim().default(""),
  site_id: z.string().uuid("Select a site."),
  title: z.string().trim().min(2, "Valuation title is required.").max(180),
  unit: z.string().trim().max(40).default(""),
  unit_rate: z.coerce.number().min(0, "Unit rate cannot be negative.").default(0),
  valuation_date: z.string().trim().default(""),
});

const valuationIdSchema = z.object({
  valuation_id: z.string().uuid("Select a valuation."),
});

const rejectValuationSchema = valuationIdSchema.extend({
  rejection_reason: z.string().trim().min(2, "Rejection reason is required.").max(500),
});

const valuationLineSchema = z.object({
  certified_quantity: z.coerce.number().min(0, "Certified quantity cannot be negative.").default(0),
  claimed_quantity: z.coerce.number().min(0, "Claimed quantity cannot be negative.").default(0),
  line_description: z.string().trim().min(2, "Valuation line description is required.").max(300),
  notes: z.string().trim().max(900).default(""),
  unit: z.string().trim().max(40).default(""),
  unit_rate: z.coerce.number().min(0, "Unit rate cannot be negative.").default(0),
  valuation_id: z.string().uuid("Select a valuation."),
});

const valuationLineIdSchema = z.object({
  line_id: z.string().uuid("Select a valuation line."),
});

const updateValuationLineSchema = valuationLineIdSchema.extend(
  valuationLineSchema.omit({ valuation_id: true }).shape,
);

const riskSchema = z.object({
  category: z.enum(riskCategories).default("other"),
  contract_id: z.string().trim().default(""),
  description: z.string().trim().max(1200).default(""),
  due_date: z.string().trim().default(""),
  impact_amount: z.coerce.number().min(0, "Impact amount cannot be negative.").default(0),
  mitigation_plan: z.string().trim().max(1200).default(""),
  severity: z.enum(riskSeverities).default("medium"),
  site_id: z.string().uuid("Select a site."),
  title: z.string().trim().min(2, "Risk title is required.").max(180),
});

const riskIdSchema = z.object({
  risk_id: z.string().uuid("Select a commercial risk."),
});

const retentionReleaseSchema = z.object({
  claimed_amount: z.coerce.number().min(0, "Claimed amount cannot be negative.").default(0),
  client_reference: z.string().trim().max(120).default(""),
  contract_id: z.string().uuid("Select a contract."),
  description: z.string().trim().max(1200).default(""),
  due_date: z.string().trim().default(""),
  ipc_id: z.string().trim().default(""),
  notes: z.string().trim().max(900).default(""),
  release_date: z.string().trim().default(""),
  release_type: z.enum(retentionReleaseTypes).default("interim"),
  title: z.string().trim().min(2, "Retention release title is required.").max(180),
});

const retentionReleaseIdSchema = z.object({
  release_id: z.string().uuid("Select a retention release."),
});

const approveRetentionReleaseSchema = retentionReleaseIdSchema.extend({
  approved_amount: z.coerce.number().min(0, "Approved amount cannot be negative.").default(0),
  notes: z.string().trim().max(900).default(""),
});

const releaseRetentionReleaseSchema = retentionReleaseIdSchema.extend({
  release_date: z.string().trim().default(""),
  released_amount: z.coerce.number().min(0, "Released amount cannot be negative.").default(0),
});

const rejectRetentionReleaseSchema = retentionReleaseIdSchema.extend({
  rejection_reason: z.string().trim().min(2, "Rejection reason is required.").max(500),
});

const cashflowForecastSchema = z.object({
  actual_cost: z.coerce.number().min(0, "Actual cost cannot be negative.").default(0),
  actual_revenue: z.coerce.number().min(0, "Actual revenue cannot be negative.").default(0),
  assumptions: z.string().trim().max(1200).default(""),
  confidence: z.enum(forecastConfidences).default("medium"),
  contract_id: z.string().trim().default(""),
  forecast_cost: z.coerce.number().min(0, "Forecast cost cannot be negative.").default(0),
  forecast_retention_release: z.coerce.number().min(0, "Retention release cannot be negative.").default(0),
  forecast_revenue: z.coerce.number().min(0, "Forecast revenue cannot be negative.").default(0),
  period_end: z.string().trim().default(""),
  period_start: z.string().trim().default(""),
  site_id: z.string().uuid("Select a site."),
  title: z.string().trim().min(2, "Cashflow forecast title is required.").max(180),
});

const cashflowForecastIdSchema = z.object({
  forecast_id: z.string().uuid("Select a cashflow forecast."),
});

const milestoneSchema = z.object({
  achieved_amount: z.coerce.number().min(0, "Achieved amount cannot be negative.").default(0),
  billing_weight_percent: z.coerce
    .number()
    .min(0, "Billing weight cannot be negative.")
    .max(100, "Billing weight cannot exceed 100%.")
    .default(0),
  contract_id: z.string().uuid("Select a contract."),
  description: z.string().trim().max(1200).default(""),
  due_date: z.string().trim().default(""),
  forecast_date: z.string().trim().default(""),
  invoice_trigger: z.string().trim().default(""),
  notes: z.string().trim().max(900).default(""),
  planned_date: z.string().trim().default(""),
  retention_trigger: z.string().trim().default(""),
  target_amount: z.coerce.number().min(0, "Target amount cannot be negative.").default(0),
  title: z.string().trim().min(2, "Milestone title is required.").max(180),
});

const milestoneIdSchema = z.object({
  milestone_id: z.string().uuid("Select a milestone."),
});

const achieveMilestoneSchema = milestoneIdSchema.extend({
  achieved_amount: z.coerce.number().min(0, "Achieved amount cannot be negative.").default(0),
  actual_date: z.string().trim().default(""),
});

const delayMilestoneSchema = milestoneIdSchema.extend({
  forecast_date: z.string().trim().default(""),
});

const createInvoiceFromIpcSchema = ipcIdSchema.extend({
  client_name: z.string().trim().max(180).default(""),
  invoice_number: z.string().trim().max(80).default(""),
  tpin: z.string().trim().max(80).default(""),
});

type SiteForCommercial = {
  id: string;
  is_active: boolean;
};

type BoqForCommercial = {
  id: string;
  site_id: string;
  title: string;
};

type ContractForCommercial = {
  client_name: string;
  contract_number?: string;
  id: string;
  site_id: string;
  status: OpsCommercialContractStatus;
  title: string;
};

type ValuationForCommercial = {
  id: string;
  site_id: string;
  status: OpsCommercialValuationStatus;
  title: string;
  valuation_number: string;
};

type VariationForCommercial = {
  id: string;
  site_id: string;
  status: OpsCommercialVariationStatus;
  title: string;
  variation_number: string;
};

type CommercialIpcForMutation = {
  boq_id: string | null;
  certified_amount: number | string;
  claimed_amount: number | string;
  client_reference: string;
  contract: { client_name: string; title: string } | { client_name: string; title: string }[] | null;
  contract_id: string | null;
  created_by: string | null;
  id: string;
  invoice_id: string | null;
  ipc_number: string;
  retention_amount: number | string;
  site: { name: string } | { name: string }[] | null;
  site_id: string;
  status: OpsCommercialIpcStatus;
  submitted_by: string | null;
  title: string;
  total_certified_amount: number | string;
  valuation_id: string | null;
  vat_amount: number | string;
};

type CommercialVariationForMutation = {
  approved_amount: number | string;
  created_by: string | null;
  id: string;
  site_id: string;
  status: OpsCommercialVariationStatus;
  submitted_amount: number | string;
  submitted_by: string | null;
  title: string;
  variation_number: string;
};

type CommercialClaimForMutation = {
  agreed_amount: number | string;
  claim_number: string;
  claimed_amount: number | string;
  created_by: string | null;
  id: string;
  site_id: string;
  status: OpsCommercialClaimStatus;
  submitted_by: string | null;
  title: string;
};

type CommercialContractForMutation = {
  created_by: string | null;
  id: string;
  status: OpsCommercialContractStatus;
  title: string;
};

type CommercialValuationForMutation = {
  created_by: string | null;
  id: string;
  status: OpsCommercialValuationStatus;
  submitted_by: string | null;
  title: string;
  valuation_number: string;
};

type CommercialValuationLineForMutation = {
  description: string;
  id: string;
  valuation:
    | CommercialValuationForMutation
    | CommercialValuationForMutation[]
    | null;
  valuation_id: string;
};

type CommercialRiskForMutation = {
  created_by: string | null;
  id: string;
  risk_number: string;
  status: OpsCommercialRiskStatus;
  title: string;
};

type CommercialRetentionReleaseForMutation = {
  approved_amount: number | string;
  claimed_amount: number | string;
  created_by: string | null;
  id: string;
  release_number: string;
  status: OpsCommercialRetentionReleaseStatus;
  submitted_by: string | null;
  title: string;
};

type CommercialCashflowForecastForMutation = {
  created_by: string | null;
  forecast_number: string;
  id: string;
  status: OpsCommercialCashflowStatus;
  title: string;
};

type CommercialMilestoneForMutation = {
  created_by: string | null;
  id: string;
  milestone_number: string;
  owner_id: string | null;
  status: OpsCommercialMilestoneStatus;
  target_amount: number | string;
  title: string;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function commercialError(message: string): never {
  redirect(`${COMMERCIAL_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function normalizeRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function normalizeOptionalUuid(value: string) {
  return value || null;
}

function roundToTwo(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function assertValuationLineQuantities(claimedQuantity: number, certifiedQuantity: number) {
  if (certifiedQuantity > claimedQuantity) {
    commercialError("Certified quantity cannot exceed claimed quantity.");
  }
}

function normalizeDateInput(value: string, fallback?: true): string;
function normalizeDateInput(value: string, fallback: false): string | null;
function normalizeDateInput(value: string, fallback = true) {
  if (!value && fallback) {
    return new Date().toISOString().slice(0, 10);
  }

  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    commercialError("Use a valid date.");
  }

  return value;
}

async function nextCommercialInvoiceNumber(prefix: string) {
  const supabase = getOpsSupabaseServiceClient();
  const year = new Date().getFullYear();
  const { count, error } = await supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .gte("issued_at", `${year}-01-01`)
    .lte("issued_at", `${year}-12-31`);

  if (error) {
    throw error;
  }

  return `${prefix}-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

async function assertActiveSite(siteId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("sites")
    .select("id, is_active")
    .eq("id", siteId)
    .maybeSingle<SiteForCommercial>();

  if (error) {
    throw error;
  }

  if (!data || !data.is_active) {
    commercialError("Select an active site.");
  }

  return data;
}

async function fetchBoqForCommercial(boqId: string | null, siteId: string) {
  if (!boqId) {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("boq_documents")
    .select("id, site_id, title")
    .eq("id", boqId)
    .is("deleted_at", null)
    .maybeSingle<BoqForCommercial>();

  if (error) {
    throw error;
  }

  if (!data || data.site_id !== siteId) {
    commercialError("Select a BOQ that belongs to the selected site.");
  }

  return data;
}

async function fetchContractForCommercial(contractId: string | null, siteId: string) {
  if (!contractId) {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_contracts")
    .select("id, contract_number, site_id, status, title, client_name")
    .eq("id", contractId)
    .neq("status", "cancelled")
    .maybeSingle<ContractForCommercial>();

  if (error) {
    throw error;
  }

  if (!data || data.site_id !== siteId) {
    commercialError("Select a contract that belongs to the selected site.");
  }

  return data;
}

async function fetchValuationForCommercial(valuationId: string | null, siteId: string) {
  if (!valuationId) {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_valuations")
    .select("id, valuation_number, site_id, status, title")
    .eq("id", valuationId)
    .neq("status", "cancelled")
    .maybeSingle<ValuationForCommercial>();

  if (error) {
    throw error;
  }

  if (!data || data.site_id !== siteId) {
    commercialError("Select a valuation that belongs to the selected site.");
  }

  return data;
}

async function fetchVariationForCommercial(variationId: string | null, siteId: string) {
  if (!variationId) {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_variations")
    .select("id, variation_number, site_id, status, title")
    .eq("id", variationId)
    .neq("status", "cancelled")
    .maybeSingle<VariationForCommercial>();

  if (error) {
    throw error;
  }

  if (!data || data.site_id !== siteId) {
    commercialError("Select a variation that belongs to the selected site.");
  }

  return data;
}

async function fetchIpcForMutation(ipcId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
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
        "client_reference",
        "claimed_amount",
        "certified_amount",
        "retention_amount",
        "vat_amount",
        "total_certified_amount",
        "created_by",
        "submitted_by",
        "site:sites!commercial_ipcs_site_id_fkey(name)",
        "contract:commercial_contracts!commercial_ipcs_contract_id_fkey(title, client_name)",
      ].join(", "),
    )
    .eq("id", ipcId)
    .maybeSingle<CommercialIpcForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchContractForMutation(contractId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_contracts")
    .select("id, status, title, created_by")
    .eq("id", contractId)
    .maybeSingle<CommercialContractForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchValuationForMutation(valuationId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_valuations")
    .select("id, valuation_number, status, title, created_by, submitted_by")
    .eq("id", valuationId)
    .maybeSingle<CommercialValuationForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchValuationLineForMutation(lineId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_valuation_lines")
    .select(
      [
        "id",
        "valuation_id",
        "description",
        "valuation:commercial_valuations!commercial_valuation_lines_valuation_id_fkey(id, valuation_number, status, title, created_by, submitted_by)",
      ].join(", "),
    )
    .eq("id", lineId)
    .maybeSingle<CommercialValuationLineForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchRiskForMutation(riskId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_risks")
    .select("id, risk_number, status, title, created_by")
    .eq("id", riskId)
    .maybeSingle<CommercialRiskForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchVariationForMutation(variationId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_variations")
    .select("id, variation_number, site_id, status, title, submitted_amount, approved_amount, created_by, submitted_by")
    .eq("id", variationId)
    .maybeSingle<CommercialVariationForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchClaimForMutation(claimId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_claims")
    .select("id, claim_number, site_id, status, title, claimed_amount, agreed_amount, created_by, submitted_by")
    .eq("id", claimId)
    .maybeSingle<CommercialClaimForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchContractForPlanning(contractId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_contracts")
    .select("id, contract_number, site_id, status, title, client_name")
    .eq("id", contractId)
    .neq("status", "cancelled")
    .maybeSingle<ContractForCommercial>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchRetentionReleaseForMutation(releaseId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_retention_releases")
    .select("id, release_number, status, title, claimed_amount, approved_amount, created_by, submitted_by")
    .eq("id", releaseId)
    .maybeSingle<CommercialRetentionReleaseForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchCashflowForecastForMutation(forecastId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_cashflow_forecasts")
    .select("id, forecast_number, status, title, created_by")
    .eq("id", forecastId)
    .maybeSingle<CommercialCashflowForecastForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchMilestoneForMutation(milestoneId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_contract_milestones")
    .select("id, milestone_number, status, title, target_amount, owner_id, created_by")
    .eq("id", milestoneId)
    .maybeSingle<CommercialMilestoneForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

export async function createCommercialIpcAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsCommercialRecord(profile.role)) {
    commercialError("Your role cannot create IPC records.");
  }

  const parsed = ipcSchema.safeParse({
    boq_id: field(formData, "boq_id"),
    claimed_amount: field(formData, "claimed_amount") || "0",
    client_reference: field(formData, "client_reference"),
    contract_id: field(formData, "contract_id"),
    description: field(formData, "description"),
    notes: field(formData, "notes"),
    period_end: field(formData, "period_end"),
    period_start: field(formData, "period_start"),
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
    valuation_id: field(formData, "valuation_id"),
    valuation_date: field(formData, "valuation_date"),
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check the IPC details.");
  }

  await assertActiveSite(parsed.data.site_id);
  const boqId = normalizeOptionalUuid(parsed.data.boq_id);
  const contractId = normalizeOptionalUuid(parsed.data.contract_id);
  const valuationId = normalizeOptionalUuid(parsed.data.valuation_id);
  await fetchBoqForCommercial(boqId, parsed.data.site_id);
  await fetchContractForCommercial(contractId, parsed.data.site_id);
  await fetchValuationForCommercial(valuationId, parsed.data.site_id);

  const valuationDate = normalizeDateInput(parsed.data.valuation_date);
  const periodStart = normalizeDateInput(parsed.data.period_start, false);
  const periodEnd = normalizeDateInput(parsed.data.period_end, false);

  if (periodStart && periodEnd && periodEnd < periodStart) {
    commercialError("IPC period end cannot be before the period start.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_ipcs")
    .insert({
      boq_id: boqId,
      claimed_amount: parsed.data.claimed_amount,
      client_reference: parsed.data.client_reference,
      contract_id: contractId,
      created_by: profile.id,
      description: parsed.data.description,
      notes: parsed.data.notes,
      period_end: periodEnd,
      period_start: periodStart,
      site_id: parsed.data.site_id,
      status: "draft",
      title: parsed.data.title,
      valuation_id: valuationId,
      valuation_date: valuationDate,
    })
    .select("id, ipc_number")
    .single<{ id: string; ipc_number: string }>();

  if (error || !data) {
    commercialError(error?.message ?? "Could not create IPC.");
  }

  await recordOpsAuditEvent({
    action: "commercial_ipc.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "commercial_ipc",
    metadata: {
      claimed_amount: parsed.data.claimed_amount,
      contract_id: contractId,
      site_id: parsed.data.site_id,
      valuation_id: valuationId,
      valuation_date: valuationDate,
    },
    moduleKey: "commercial",
    sourceId: data.id,
    sourceTable: "commercial_ipcs",
    summary: `Created IPC ${data.ipc_number}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?created=ipc`);
}

export async function submitCommercialIpcAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = ipcIdSchema.safeParse({ ipc_id: field(formData, "ipc_id") });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Select an IPC.");
  }

  const ipc = await fetchIpcForMutation(parsed.data.ipc_id);

  if (!ipc) {
    commercialError("IPC was not found.");
  }

  if (!canSubmitOpsCommercialIpc(profile.id, profile.role, ipc)) {
    commercialError("Your role cannot submit this IPC.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_ipcs")
    .update({ status: "submitted", submitted_at: now, submitted_by: profile.id })
    .eq("id", ipc.id)
    .in("status", ["draft", "rejected"]);

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_ipc.submitted",
    actorUserId: profile.id,
    entityId: ipc.id,
    entityType: "commercial_ipc",
    metadata: { submitted_at: now },
    moduleKey: "commercial",
    sourceId: ipc.id,
    sourceTable: "commercial_ipcs",
    summary: `Submitted IPC ${ipc.ipc_number}`,
  }).catch(() => null);

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    actionNeededRoles: ["quantity_surveyor", "projects_manager", "finance_manager"],
    title: `Certify IPC: ${ipc.ipc_number}`,
    body: `${profile.full_name} submitted ${ipc.ipc_number} — ${ipc.title}. Your decision is needed.`,
    actionHref: COMMERCIAL_ROUTE,
    moduleKey: "commercial",
    sourceTable: "commercial_ipcs",
    sourceId: ipc.id,
    eventKey: "submitted",
  });

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=ipc_submitted`);
}

export async function certifyCommercialIpcAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = certifyIpcSchema.safeParse({
    certified_amount: field(formData, "certified_amount") || "0",
    ipc_id: field(formData, "ipc_id"),
    notes: field(formData, "notes"),
    retention_amount: field(formData, "retention_amount") || "0",
    vat_amount: field(formData, "vat_amount") || "0",
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check the certification details.");
  }

  const ipc = await fetchIpcForMutation(parsed.data.ipc_id);

  if (!ipc) {
    commercialError("IPC was not found.");
  }

  if (!canCertifyOpsCommercialIpc(profile.role, ipc)) {
    commercialError("Your role cannot certify this IPC.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_ipcs")
    .update({
      certified_amount: parsed.data.certified_amount,
      certified_at: now,
      certified_by: profile.id,
      notes: parsed.data.notes,
      retention_amount: parsed.data.retention_amount,
      status: "certified",
      vat_amount: parsed.data.vat_amount,
    })
    .eq("id", ipc.id)
    .eq("status", "submitted");

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_ipc.certified",
    actorUserId: profile.id,
    entityId: ipc.id,
    entityType: "commercial_ipc",
    metadata: {
      certified_amount: parsed.data.certified_amount,
      retention_amount: parsed.data.retention_amount,
      vat_amount: parsed.data.vat_amount,
    },
    moduleKey: "commercial",
    sourceId: ipc.id,
    sourceTable: "commercial_ipcs",
    summary: `Certified IPC ${ipc.ipc_number}`,
  }).catch(() => null);

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    stakeholderIds: [ipc.submitted_by, ipc.created_by],
    title: `IPC certified: ${ipc.ipc_number}`,
    body: `${profile.full_name} marked ${ipc.ipc_number} — ${ipc.title} as certified.`,
    actionHref: COMMERCIAL_ROUTE,
    moduleKey: "commercial",
    sourceTable: "commercial_ipcs",
    sourceId: ipc.id,
    eventKey: "certified",
    category: "info",
  });

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=ipc_certified`);
}

export async function rejectCommercialIpcAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = rejectIpcSchema.safeParse({
    ipc_id: field(formData, "ipc_id"),
    rejection_reason: field(formData, "rejection_reason"),
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check the rejection.");
  }

  const ipc = await fetchIpcForMutation(parsed.data.ipc_id);

  if (!ipc) {
    commercialError("IPC was not found.");
  }

  if (!canRejectOpsCommercialIpc(profile.role, ipc)) {
    commercialError("Your role cannot reject this IPC.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_ipcs")
    .update({
      rejected_at: now,
      rejected_by: profile.id,
      rejection_reason: parsed.data.rejection_reason,
      status: "rejected",
    })
    .eq("id", ipc.id)
    .eq("status", "submitted");

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_ipc.rejected",
    actorUserId: profile.id,
    entityId: ipc.id,
    entityType: "commercial_ipc",
    metadata: { rejection_reason: parsed.data.rejection_reason },
    moduleKey: "commercial",
    sourceId: ipc.id,
    sourceTable: "commercial_ipcs",
    summary: `Rejected IPC ${ipc.ipc_number}`,
  }).catch(() => null);

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    stakeholderIds: [ipc.submitted_by, ipc.created_by],
    title: `IPC rejected: ${ipc.ipc_number}`,
    body: `${profile.full_name} marked ${ipc.ipc_number} — ${ipc.title} as rejected.`,
    actionHref: COMMERCIAL_ROUTE,
    moduleKey: "commercial",
    sourceTable: "commercial_ipcs",
    sourceId: ipc.id,
    eventKey: "rejected",
    category: "info",
  });

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=ipc_rejected`);
}

export async function markCommercialIpcInvoicedAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = ipcIdSchema.safeParse({ ipc_id: field(formData, "ipc_id") });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Select an IPC.");
  }

  const ipc = await fetchIpcForMutation(parsed.data.ipc_id);

  if (!ipc) {
    commercialError("IPC was not found.");
  }

  if (!canMarkOpsCommercialIpcInvoiced(profile.role, ipc)) {
    commercialError("Your role cannot mark this IPC as invoiced.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_ipcs")
    .update({ invoiced_at: now, invoiced_by: profile.id, status: "invoiced" })
    .eq("id", ipc.id)
    .eq("status", "certified");

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_ipc.invoiced",
    actorUserId: profile.id,
    entityId: ipc.id,
    entityType: "commercial_ipc",
    metadata: { invoiced_at: now },
    moduleKey: "commercial",
    sourceId: ipc.id,
    sourceTable: "commercial_ipcs",
    summary: `Marked IPC ${ipc.ipc_number} as invoiced`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  revalidatePath("/ops/invoices");
  redirect(`${COMMERCIAL_ROUTE}?updated=ipc_invoiced`);
}

export async function markCommercialIpcPaidAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = ipcIdSchema.safeParse({ ipc_id: field(formData, "ipc_id") });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Select an IPC.");
  }

  const ipc = await fetchIpcForMutation(parsed.data.ipc_id);

  if (!ipc) {
    commercialError("IPC was not found.");
  }

  if (!canMarkOpsCommercialIpcPaid(profile.role, ipc)) {
    commercialError("Your role cannot mark this IPC as paid.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_ipcs")
    .update({ paid_at: now, paid_by: profile.id, status: "paid" })
    .eq("id", ipc.id)
    .eq("status", "invoiced");

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_ipc.paid",
    actorUserId: profile.id,
    entityId: ipc.id,
    entityType: "commercial_ipc",
    metadata: { paid_at: now },
    moduleKey: "commercial",
    sourceId: ipc.id,
    sourceTable: "commercial_ipcs",
    summary: `Marked IPC ${ipc.ipc_number} as paid`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=ipc_paid`);
}

export async function cancelCommercialIpcAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = ipcIdSchema.safeParse({ ipc_id: field(formData, "ipc_id") });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Select an IPC.");
  }

  const ipc = await fetchIpcForMutation(parsed.data.ipc_id);

  if (!ipc) {
    commercialError("IPC was not found.");
  }

  if (!canCancelOpsCommercialIpc(profile.id, profile.role, ipc)) {
    commercialError("Your role cannot cancel this IPC.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_ipcs")
    .update({ cancelled_at: now, cancelled_by: profile.id, status: "cancelled" })
    .eq("id", ipc.id)
    .in("status", ["draft", "submitted", "certified"]);

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_ipc.cancelled",
    actorUserId: profile.id,
    entityId: ipc.id,
    entityType: "commercial_ipc",
    metadata: { cancelled_at: now },
    moduleKey: "commercial",
    sourceId: ipc.id,
    sourceTable: "commercial_ipcs",
    summary: `Cancelled IPC ${ipc.ipc_number}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=ipc_cancelled`);
}

export async function createCommercialVariationAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsCommercialRecord(profile.role)) {
    commercialError("Your role cannot create variations.");
  }

  const parsed = variationSchema.safeParse({
    boq_id: field(formData, "boq_id"),
    client_reference: field(formData, "client_reference"),
    description: field(formData, "description"),
    instruction_reference: field(formData, "instruction_reference"),
    notes: field(formData, "notes"),
    reason: field(formData, "reason"),
    site_id: field(formData, "site_id"),
    submitted_amount: field(formData, "submitted_amount") || "0",
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check the variation.");
  }

  await assertActiveSite(parsed.data.site_id);
  const boqId = normalizeOptionalUuid(parsed.data.boq_id);
  await fetchBoqForCommercial(boqId, parsed.data.site_id);

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_variations")
    .insert({
      boq_id: boqId,
      client_reference: parsed.data.client_reference,
      created_by: profile.id,
      description: parsed.data.description,
      instruction_reference: parsed.data.instruction_reference,
      notes: parsed.data.notes,
      reason: parsed.data.reason,
      site_id: parsed.data.site_id,
      status: "draft",
      submitted_amount: parsed.data.submitted_amount,
      title: parsed.data.title,
    })
    .select("id, variation_number")
    .single<{ id: string; variation_number: string }>();

  if (error || !data) {
    commercialError(error?.message ?? "Could not create variation.");
  }

  await recordOpsAuditEvent({
    action: "commercial_variation.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "commercial_variation",
    metadata: {
      site_id: parsed.data.site_id,
      submitted_amount: parsed.data.submitted_amount,
    },
    moduleKey: "commercial",
    sourceId: data.id,
    sourceTable: "commercial_variations",
    summary: `Created variation ${data.variation_number}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?created=variation`);
}

export async function submitCommercialVariationAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = variationIdSchema.safeParse({ variation_id: field(formData, "variation_id") });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Select a variation.");
  }

  const variation = await fetchVariationForMutation(parsed.data.variation_id);

  if (!variation) {
    commercialError("Variation was not found.");
  }

  if (!canSubmitOpsCommercialVariation(profile.id, profile.role, variation)) {
    commercialError("Your role cannot submit this variation.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_variations")
    .update({ status: "submitted", submitted_at: now, submitted_by: profile.id })
    .eq("id", variation.id)
    .in("status", ["draft", "rejected"]);

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_variation.submitted",
    actorUserId: profile.id,
    entityId: variation.id,
    entityType: "commercial_variation",
    metadata: { submitted_at: now },
    moduleKey: "commercial",
    sourceId: variation.id,
    sourceTable: "commercial_variations",
    summary: `Submitted variation ${variation.variation_number}`,
  }).catch(() => null);

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    actionNeededRoles: ["quantity_surveyor", "projects_manager", "finance_manager"],
    title: `Review variation: ${variation.variation_number}`,
    body: `${profile.full_name} submitted ${variation.variation_number} — ${variation.title}. Your decision is needed.`,
    actionHref: COMMERCIAL_ROUTE,
    moduleKey: "commercial",
    sourceTable: "commercial_variations",
    sourceId: variation.id,
    eventKey: "submitted",
  });

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=variation_submitted`);
}

export async function priceCommercialVariationAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = priceVariationSchema.safeParse({
    notes: field(formData, "notes"),
    submitted_amount: field(formData, "submitted_amount") || "0",
    variation_id: field(formData, "variation_id"),
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check variation pricing.");
  }

  const variation = await fetchVariationForMutation(parsed.data.variation_id);

  if (!variation) {
    commercialError("Variation was not found.");
  }

  if (!canPriceOpsCommercialVariation(profile.role, variation)) {
    commercialError("Your role cannot price this variation.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_variations")
    .update({
      notes: parsed.data.notes,
      priced_at: now,
      priced_by: profile.id,
      status: "priced",
      submitted_amount: parsed.data.submitted_amount || normalizeNumber(variation.submitted_amount),
    })
    .eq("id", variation.id)
    .eq("status", "submitted");

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_variation.priced",
    actorUserId: profile.id,
    entityId: variation.id,
    entityType: "commercial_variation",
    metadata: { priced_at: now, submitted_amount: parsed.data.submitted_amount },
    moduleKey: "commercial",
    sourceId: variation.id,
    sourceTable: "commercial_variations",
    summary: `Priced variation ${variation.variation_number}`,
  }).catch(() => null);

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    actionNeededRoles: ["quantity_surveyor", "projects_manager", "finance_manager"],
    title: `Approve priced variation: ${variation.variation_number}`,
    body: `${profile.full_name} priced ${variation.variation_number} — ${variation.title}. Your decision is needed.`,
    actionHref: COMMERCIAL_ROUTE,
    moduleKey: "commercial",
    sourceTable: "commercial_variations",
    sourceId: variation.id,
    eventKey: "priced",
  });

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=variation_priced`);
}

export async function approveCommercialVariationAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = approveVariationSchema.safeParse({
    approved_amount: field(formData, "approved_amount") || "0",
    notes: field(formData, "notes"),
    variation_id: field(formData, "variation_id"),
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check variation approval.");
  }

  const variation = await fetchVariationForMutation(parsed.data.variation_id);

  if (!variation) {
    commercialError("Variation was not found.");
  }

  if (!canApproveOpsCommercialVariation(profile.role, variation)) {
    commercialError("Your role cannot approve this variation.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_variations")
    .update({
      approved_amount: parsed.data.approved_amount || normalizeNumber(variation.submitted_amount),
      approved_at: now,
      approved_by: profile.id,
      notes: parsed.data.notes,
      status: "approved",
    })
    .eq("id", variation.id)
    .eq("status", "priced");

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_variation.approved",
    actorUserId: profile.id,
    entityId: variation.id,
    entityType: "commercial_variation",
    metadata: { approved_amount: parsed.data.approved_amount, approved_at: now },
    moduleKey: "commercial",
    sourceId: variation.id,
    sourceTable: "commercial_variations",
    summary: `Approved variation ${variation.variation_number}`,
  }).catch(() => null);

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    stakeholderIds: [variation.submitted_by, variation.created_by],
    title: `Variation approved: ${variation.variation_number}`,
    body: `${profile.full_name} marked ${variation.variation_number} — ${variation.title} as approved.`,
    actionHref: COMMERCIAL_ROUTE,
    moduleKey: "commercial",
    sourceTable: "commercial_variations",
    sourceId: variation.id,
    eventKey: "approved",
    category: "info",
  });

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=variation_approved`);
}

export async function rejectCommercialVariationAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = rejectVariationSchema.safeParse({
    rejection_reason: field(formData, "rejection_reason"),
    variation_id: field(formData, "variation_id"),
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check the rejection.");
  }

  const variation = await fetchVariationForMutation(parsed.data.variation_id);

  if (!variation) {
    commercialError("Variation was not found.");
  }

  if (!canRejectOpsCommercialVariation(profile.role, variation)) {
    commercialError("Your role cannot reject this variation.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_variations")
    .update({
      rejected_at: now,
      rejected_by: profile.id,
      rejection_reason: parsed.data.rejection_reason,
      status: "rejected",
    })
    .eq("id", variation.id)
    .in("status", ["submitted", "priced"]);

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_variation.rejected",
    actorUserId: profile.id,
    entityId: variation.id,
    entityType: "commercial_variation",
    metadata: { rejection_reason: parsed.data.rejection_reason },
    moduleKey: "commercial",
    sourceId: variation.id,
    sourceTable: "commercial_variations",
    summary: `Rejected variation ${variation.variation_number}`,
  }).catch(() => null);

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    stakeholderIds: [variation.submitted_by, variation.created_by],
    title: `Variation rejected: ${variation.variation_number}`,
    body: `${profile.full_name} marked ${variation.variation_number} — ${variation.title} as rejected.`,
    actionHref: COMMERCIAL_ROUTE,
    moduleKey: "commercial",
    sourceTable: "commercial_variations",
    sourceId: variation.id,
    eventKey: "rejected",
    category: "info",
  });

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=variation_rejected`);
}

export async function closeCommercialVariationAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = variationIdSchema.safeParse({ variation_id: field(formData, "variation_id") });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Select a variation.");
  }

  const variation = await fetchVariationForMutation(parsed.data.variation_id);

  if (!variation) {
    commercialError("Variation was not found.");
  }

  if (!canCloseOpsCommercialVariation(profile.role, variation)) {
    commercialError("Your role cannot close this variation.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_variations")
    .update({ closed_at: now, closed_by: profile.id, status: "closed" })
    .eq("id", variation.id)
    .eq("status", "approved");

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_variation.closed",
    actorUserId: profile.id,
    entityId: variation.id,
    entityType: "commercial_variation",
    metadata: { closed_at: now },
    moduleKey: "commercial",
    sourceId: variation.id,
    sourceTable: "commercial_variations",
    summary: `Closed variation ${variation.variation_number}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=variation_closed`);
}

export async function cancelCommercialVariationAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = variationIdSchema.safeParse({ variation_id: field(formData, "variation_id") });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Select a variation.");
  }

  const variation = await fetchVariationForMutation(parsed.data.variation_id);

  if (!variation) {
    commercialError("Variation was not found.");
  }

  if (!canCancelOpsCommercialVariation(profile.id, profile.role, variation)) {
    commercialError("Your role cannot cancel this variation.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_variations")
    .update({ cancelled_at: now, cancelled_by: profile.id, status: "cancelled" })
    .eq("id", variation.id)
    .in("status", ["draft", "submitted", "priced", "approved"]);

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_variation.cancelled",
    actorUserId: profile.id,
    entityId: variation.id,
    entityType: "commercial_variation",
    metadata: { cancelled_at: now },
    moduleKey: "commercial",
    sourceId: variation.id,
    sourceTable: "commercial_variations",
    summary: `Cancelled variation ${variation.variation_number}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=variation_cancelled`);
}

export async function createCommercialClaimAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsCommercialRecord(profile.role)) {
    commercialError("Your role cannot create commercial claims.");
  }

  const parsed = claimSchema.safeParse({
    claim_type: field(formData, "claim_type") || "other",
    claimed_amount: field(formData, "claimed_amount") || "0",
    client_reference: field(formData, "client_reference"),
    description: field(formData, "description"),
    due_date: field(formData, "due_date"),
    event_date: field(formData, "event_date"),
    notes: field(formData, "notes"),
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
    variation_id: field(formData, "variation_id"),
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check the claim.");
  }

  await assertActiveSite(parsed.data.site_id);
  const variationId = normalizeOptionalUuid(parsed.data.variation_id);
  await fetchVariationForCommercial(variationId, parsed.data.site_id);
  const eventDate = normalizeDateInput(parsed.data.event_date, false);
  const dueDate = normalizeDateInput(parsed.data.due_date, false);

  if (eventDate && dueDate && dueDate < eventDate) {
    commercialError("Claim due date cannot be before the event date.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_claims")
    .insert({
      claim_type: parsed.data.claim_type,
      claimed_amount: parsed.data.claimed_amount,
      client_reference: parsed.data.client_reference,
      created_by: profile.id,
      description: parsed.data.description,
      due_date: dueDate,
      event_date: eventDate,
      notes: parsed.data.notes,
      site_id: parsed.data.site_id,
      status: "draft",
      title: parsed.data.title,
      variation_id: variationId,
    })
    .select("id, claim_number")
    .single<{ claim_number: string; id: string }>();

  if (error || !data) {
    commercialError(error?.message ?? "Could not create commercial claim.");
  }

  await recordOpsAuditEvent({
    action: "commercial_claim.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "commercial_claim",
    metadata: {
      claim_type: parsed.data.claim_type,
      claimed_amount: parsed.data.claimed_amount,
      site_id: parsed.data.site_id,
    },
    moduleKey: "commercial",
    sourceId: data.id,
    sourceTable: "commercial_claims",
    summary: `Created claim ${data.claim_number}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?created=claim`);
}

export async function submitCommercialClaimAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = claimIdSchema.safeParse({ claim_id: field(formData, "claim_id") });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Select a claim.");
  }

  const claim = await fetchClaimForMutation(parsed.data.claim_id);

  if (!claim) {
    commercialError("Claim was not found.");
  }

  if (!canSubmitOpsCommercialClaim(profile.id, profile.role, claim)) {
    commercialError("Your role cannot submit this claim.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_claims")
    .update({ status: "submitted", submitted_at: now, submitted_by: profile.id })
    .eq("id", claim.id)
    .in("status", ["draft", "rejected"]);

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_claim.submitted",
    actorUserId: profile.id,
    entityId: claim.id,
    entityType: "commercial_claim",
    metadata: { submitted_at: now },
    moduleKey: "commercial",
    sourceId: claim.id,
    sourceTable: "commercial_claims",
    summary: `Submitted claim ${claim.claim_number}`,
  }).catch(() => null);

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    actionNeededRoles: ["quantity_surveyor", "projects_manager", "finance_manager"],
    title: `Review claim: ${claim.claim_number}`,
    body: `${profile.full_name} submitted ${claim.claim_number} — ${claim.title}. Your decision is needed.`,
    actionHref: COMMERCIAL_ROUTE,
    moduleKey: "commercial",
    sourceTable: "commercial_claims",
    sourceId: claim.id,
    eventKey: "submitted",
  });

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=claim_submitted`);
}

export async function reviewCommercialClaimAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = claimIdSchema.safeParse({ claim_id: field(formData, "claim_id") });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Select a claim.");
  }

  const claim = await fetchClaimForMutation(parsed.data.claim_id);

  if (!claim) {
    commercialError("Claim was not found.");
  }

  if (!canReviewOpsCommercialClaim(profile.role, claim)) {
    commercialError("Your role cannot review this claim.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_claims")
    .update({ reviewed_at: now, reviewed_by: profile.id, status: "under_review" })
    .eq("id", claim.id)
    .eq("status", "submitted");

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_claim.under_review",
    actorUserId: profile.id,
    entityId: claim.id,
    entityType: "commercial_claim",
    metadata: { reviewed_at: now },
    moduleKey: "commercial",
    sourceId: claim.id,
    sourceTable: "commercial_claims",
    summary: `Moved claim ${claim.claim_number} to review`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=claim_review`);
}

export async function agreeCommercialClaimAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = agreeClaimSchema.safeParse({
    agreed_amount: field(formData, "agreed_amount") || "0",
    claim_id: field(formData, "claim_id"),
    notes: field(formData, "notes"),
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check claim agreement.");
  }

  const claim = await fetchClaimForMutation(parsed.data.claim_id);

  if (!claim) {
    commercialError("Claim was not found.");
  }

  if (!canAgreeOpsCommercialClaim(profile.role, claim)) {
    commercialError("Your role cannot agree this claim.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_claims")
    .update({
      agreed_amount: parsed.data.agreed_amount || normalizeNumber(claim.claimed_amount),
      agreed_at: now,
      agreed_by: profile.id,
      notes: parsed.data.notes,
      status: "agreed",
    })
    .eq("id", claim.id)
    .eq("status", "under_review");

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_claim.agreed",
    actorUserId: profile.id,
    entityId: claim.id,
    entityType: "commercial_claim",
    metadata: { agreed_amount: parsed.data.agreed_amount, agreed_at: now },
    moduleKey: "commercial",
    sourceId: claim.id,
    sourceTable: "commercial_claims",
    summary: `Agreed claim ${claim.claim_number}`,
  }).catch(() => null);

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    stakeholderIds: [claim.submitted_by, claim.created_by],
    title: `Claim agreed: ${claim.claim_number}`,
    body: `${profile.full_name} marked ${claim.claim_number} — ${claim.title} as agreed.`,
    actionHref: COMMERCIAL_ROUTE,
    moduleKey: "commercial",
    sourceTable: "commercial_claims",
    sourceId: claim.id,
    eventKey: "agreed",
    category: "info",
  });

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=claim_agreed`);
}

export async function rejectCommercialClaimAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = rejectClaimSchema.safeParse({
    claim_id: field(formData, "claim_id"),
    rejection_reason: field(formData, "rejection_reason"),
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check the rejection.");
  }

  const claim = await fetchClaimForMutation(parsed.data.claim_id);

  if (!claim) {
    commercialError("Claim was not found.");
  }

  if (!canRejectOpsCommercialClaim(profile.role, claim)) {
    commercialError("Your role cannot reject this claim.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_claims")
    .update({
      rejected_at: now,
      rejected_by: profile.id,
      rejection_reason: parsed.data.rejection_reason,
      status: "rejected",
    })
    .eq("id", claim.id)
    .in("status", ["submitted", "under_review"]);

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_claim.rejected",
    actorUserId: profile.id,
    entityId: claim.id,
    entityType: "commercial_claim",
    metadata: { rejection_reason: parsed.data.rejection_reason },
    moduleKey: "commercial",
    sourceId: claim.id,
    sourceTable: "commercial_claims",
    summary: `Rejected claim ${claim.claim_number}`,
  }).catch(() => null);

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    stakeholderIds: [claim.submitted_by, claim.created_by],
    title: `Claim rejected: ${claim.claim_number}`,
    body: `${profile.full_name} marked ${claim.claim_number} — ${claim.title} as rejected.`,
    actionHref: COMMERCIAL_ROUTE,
    moduleKey: "commercial",
    sourceTable: "commercial_claims",
    sourceId: claim.id,
    eventKey: "rejected",
    category: "info",
  });

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=claim_rejected`);
}

export async function closeCommercialClaimAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = claimIdSchema.safeParse({ claim_id: field(formData, "claim_id") });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Select a claim.");
  }

  const claim = await fetchClaimForMutation(parsed.data.claim_id);

  if (!claim) {
    commercialError("Claim was not found.");
  }

  if (!canCloseOpsCommercialClaim(profile.role, claim)) {
    commercialError("Your role cannot close this claim.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_claims")
    .update({ closed_at: now, closed_by: profile.id, status: "closed" })
    .eq("id", claim.id)
    .eq("status", "agreed");

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_claim.closed",
    actorUserId: profile.id,
    entityId: claim.id,
    entityType: "commercial_claim",
    metadata: { closed_at: now },
    moduleKey: "commercial",
    sourceId: claim.id,
    sourceTable: "commercial_claims",
    summary: `Closed claim ${claim.claim_number}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=claim_closed`);
}

export async function cancelCommercialClaimAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = claimIdSchema.safeParse({ claim_id: field(formData, "claim_id") });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Select a claim.");
  }

  const claim = await fetchClaimForMutation(parsed.data.claim_id);

  if (!claim) {
    commercialError("Claim was not found.");
  }

  if (!canCancelOpsCommercialClaim(profile.id, profile.role, claim)) {
    commercialError("Your role cannot cancel this claim.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_claims")
    .update({ cancelled_at: now, cancelled_by: profile.id, status: "cancelled" })
    .eq("id", claim.id)
    .in("status", ["draft", "submitted", "under_review", "agreed"]);

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_claim.cancelled",
    actorUserId: profile.id,
    entityId: claim.id,
    entityType: "commercial_claim",
    metadata: { cancelled_at: now },
    moduleKey: "commercial",
    sourceId: claim.id,
    sourceTable: "commercial_claims",
    summary: `Cancelled claim ${claim.claim_number}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=claim_cancelled`);
}

export async function createCommercialContractAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsCommercialRecord(profile.role)) {
    commercialError("Your role cannot create commercial contracts.");
  }

  const parsed = contractSchema.safeParse({
    boq_id: field(formData, "boq_id"),
    client_name: field(formData, "client_name"),
    client_reference: field(formData, "client_reference"),
    contract_sum: field(formData, "contract_sum") || "0",
    contract_type: field(formData, "contract_type") || "main_contract",
    description: field(formData, "description"),
    end_date: field(formData, "end_date"),
    notes: field(formData, "notes"),
    performance_security_amount: field(formData, "performance_security_amount") || "0",
    retention_percent: field(formData, "retention_percent") || "0",
    site_id: field(formData, "site_id"),
    start_date: field(formData, "start_date"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check the contract details.");
  }

  await assertActiveSite(parsed.data.site_id);
  const boqId = normalizeOptionalUuid(parsed.data.boq_id);
  await fetchBoqForCommercial(boqId, parsed.data.site_id);
  const startDate = normalizeDateInput(parsed.data.start_date, false);
  const endDate = normalizeDateInput(parsed.data.end_date, false);

  if (startDate && endDate && endDate < startDate) {
    commercialError("Contract end date cannot be before the start date.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_contracts")
    .insert({
      boq_id: boqId,
      client_name: parsed.data.client_name,
      client_reference: parsed.data.client_reference,
      contract_sum: parsed.data.contract_sum,
      contract_type: parsed.data.contract_type,
      created_by: profile.id,
      description: parsed.data.description,
      end_date: endDate,
      notes: parsed.data.notes,
      performance_security_amount: parsed.data.performance_security_amount,
      retention_percent: parsed.data.retention_percent,
      site_id: parsed.data.site_id,
      start_date: startDate,
      status: "draft",
      title: parsed.data.title,
    })
    .select("id, contract_number")
    .single<{ contract_number: string; id: string }>();

  if (error || !data) {
    commercialError(error?.message ?? "Could not create commercial contract.");
  }

  await recordOpsAuditEvent({
    action: "commercial_contract.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "commercial_contract",
    metadata: {
      contract_sum: parsed.data.contract_sum,
      site_id: parsed.data.site_id,
    },
    moduleKey: "commercial",
    sourceId: data.id,
    sourceTable: "commercial_contracts",
    summary: `Created contract ${data.contract_number}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?created=contract`);
}

async function updateCommercialContractStatus(
  formData: FormData,
  status: "active" | "cancelled" | "completed",
) {
  const { profile } = await requireOpsUser();
  const parsed = contractIdSchema.safeParse({ contract_id: field(formData, "contract_id") });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Select a contract.");
  }

  const contract = await fetchContractForMutation(parsed.data.contract_id);

  if (!contract) {
    commercialError("Contract was not found.");
  }

  if (
    (status === "active" && !canActivateOpsCommercialContract(profile.role, contract)) ||
    (status === "completed" && !canCompleteOpsCommercialContract(profile.role, contract)) ||
    (status === "cancelled" && !canCancelOpsCommercialContract(profile.id, profile.role, contract))
  ) {
    commercialError("Your role cannot update this contract.");
  }

  const now = new Date().toISOString();
  const update =
    status === "active"
      ? { activated_at: now, activated_by: profile.id, status }
      : status === "completed"
        ? { completed_at: now, completed_by: profile.id, status }
        : { cancelled_at: now, cancelled_by: profile.id, status };

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_contracts")
    .update(update)
    .eq("id", contract.id)
    .in("status", status === "active" ? ["draft"] : ["draft", "active", "on_hold"]);

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: `commercial_contract.${status}`,
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "commercial_contract",
    metadata: { status, updated_at: now },
    moduleKey: "commercial",
    sourceId: contract.id,
    sourceTable: "commercial_contracts",
    summary: `Updated contract ${contract.title} to ${status}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=contract_${status}`);
}

export async function activateCommercialContractAction(formData: FormData) {
  await updateCommercialContractStatus(formData, "active");
}

export async function completeCommercialContractAction(formData: FormData) {
  await updateCommercialContractStatus(formData, "completed");
}

export async function cancelCommercialContractAction(formData: FormData) {
  await updateCommercialContractStatus(formData, "cancelled");
}

export async function createCommercialValuationAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsCommercialRecord(profile.role)) {
    commercialError("Your role cannot create commercial valuations.");
  }

  const parsed = valuationSchema.safeParse({
    boq_id: field(formData, "boq_id"),
    certified_quantity: field(formData, "certified_quantity") || "0",
    claimed_quantity: field(formData, "claimed_quantity") || "0",
    contract_id: field(formData, "contract_id"),
    description: field(formData, "description"),
    ipc_id: field(formData, "ipc_id"),
    line_description: field(formData, "line_description"),
    notes: field(formData, "notes"),
    period_end: field(formData, "period_end"),
    period_start: field(formData, "period_start"),
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
    unit: field(formData, "unit"),
    unit_rate: field(formData, "unit_rate") || "0",
    valuation_date: field(formData, "valuation_date"),
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check the valuation details.");
  }

  await assertActiveSite(parsed.data.site_id);
  const boqId = normalizeOptionalUuid(parsed.data.boq_id);
  const contractId = normalizeOptionalUuid(parsed.data.contract_id);
  const ipcId = normalizeOptionalUuid(parsed.data.ipc_id);
  await fetchBoqForCommercial(boqId, parsed.data.site_id);
  await fetchContractForCommercial(contractId, parsed.data.site_id);

  if (ipcId) {
    const ipc = await fetchIpcForMutation(ipcId);

    if (!ipc || ipc.site_id !== parsed.data.site_id || ipc.status === "cancelled") {
      commercialError("Select an IPC that belongs to the selected site.");
    }
  }

  const valuationDate = normalizeDateInput(parsed.data.valuation_date);
  const periodStart = normalizeDateInput(parsed.data.period_start, false);
  const periodEnd = normalizeDateInput(parsed.data.period_end, false);

  if (periodStart && periodEnd && periodEnd < periodStart) {
    commercialError("Valuation period end cannot be before the period start.");
  }

  assertValuationLineQuantities(parsed.data.claimed_quantity, parsed.data.certified_quantity);

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_valuations")
    .insert({
      boq_id: boqId,
      contract_id: contractId,
      created_by: profile.id,
      description: parsed.data.description,
      ipc_id: ipcId,
      notes: parsed.data.notes,
      period_end: periodEnd,
      period_start: periodStart,
      site_id: parsed.data.site_id,
      status: "draft",
      title: parsed.data.title,
      valuation_date: valuationDate,
    })
    .select("id, valuation_number")
    .single<{ id: string; valuation_number: string }>();

  if (error || !data) {
    commercialError(error?.message ?? "Could not create valuation.");
  }

  const { error: lineError } = await supabase.from("commercial_valuation_lines").insert({
    certified_quantity: parsed.data.certified_quantity,
    claimed_quantity: parsed.data.claimed_quantity,
    description: parsed.data.line_description,
    unit: parsed.data.unit,
    unit_rate: parsed.data.unit_rate,
    valuation_id: data.id,
  });

  if (lineError) {
    await supabase
      .from("commercial_valuations")
      .update({
        cancelled_at: new Date().toISOString(),
        cancelled_by: profile.id,
        status: "cancelled",
      })
      .eq("id", data.id)
      .then(() => null);
    commercialError(lineError.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_valuation.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "commercial_valuation",
    metadata: {
      claimed_quantity: parsed.data.claimed_quantity,
      contract_id: contractId,
      site_id: parsed.data.site_id,
      unit_rate: parsed.data.unit_rate,
    },
    moduleKey: "commercial",
    sourceId: data.id,
    sourceTable: "commercial_valuations",
    summary: `Created valuation ${data.valuation_number}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?created=valuation`);
}

export async function addCommercialValuationLineAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = valuationLineSchema.safeParse({
    certified_quantity: field(formData, "certified_quantity") || "0",
    claimed_quantity: field(formData, "claimed_quantity") || "0",
    line_description: field(formData, "line_description"),
    notes: field(formData, "notes"),
    unit: field(formData, "unit"),
    unit_rate: field(formData, "unit_rate") || "0",
    valuation_id: field(formData, "valuation_id"),
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check the valuation line.");
  }

  assertValuationLineQuantities(parsed.data.claimed_quantity, parsed.data.certified_quantity);

  const valuation = await fetchValuationForMutation(parsed.data.valuation_id);

  if (!valuation) {
    commercialError("Valuation was not found.");
  }

  if (!canEditOpsCommercialValuationLines(profile.id, profile.role, valuation)) {
    commercialError("Your role cannot edit valuation lines.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_valuation_lines")
    .insert({
      certified_quantity: parsed.data.certified_quantity,
      claimed_quantity: parsed.data.claimed_quantity,
      description: parsed.data.line_description,
      notes: parsed.data.notes,
      unit: parsed.data.unit,
      unit_rate: parsed.data.unit_rate,
      valuation_id: valuation.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    commercialError(error?.message ?? "Could not add valuation line.");
  }

  await recordOpsAuditEvent({
    action: "commercial_valuation_line.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "commercial_valuation_line",
    metadata: {
      certified_quantity: parsed.data.certified_quantity,
      claimed_quantity: parsed.data.claimed_quantity,
      unit_rate: parsed.data.unit_rate,
      valuation_id: valuation.id,
    },
    moduleKey: "commercial",
    sourceId: valuation.id,
    sourceTable: "commercial_valuations",
    summary: `Added valuation line to ${valuation.valuation_number}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=valuation_line_added#valuation-panel`);
}

export async function updateCommercialValuationLineAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = updateValuationLineSchema.safeParse({
    certified_quantity: field(formData, "certified_quantity") || "0",
    claimed_quantity: field(formData, "claimed_quantity") || "0",
    line_description: field(formData, "line_description"),
    line_id: field(formData, "line_id"),
    notes: field(formData, "notes"),
    unit: field(formData, "unit"),
    unit_rate: field(formData, "unit_rate") || "0",
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check the valuation line.");
  }

  assertValuationLineQuantities(parsed.data.claimed_quantity, parsed.data.certified_quantity);

  const line = await fetchValuationLineForMutation(parsed.data.line_id);

  if (!line) {
    commercialError("Valuation line was not found.");
  }

  const valuation = normalizeRelation(line.valuation);

  if (!valuation) {
    commercialError("Parent valuation was not found.");
  }

  if (!canEditOpsCommercialValuationLines(profile.id, profile.role, valuation)) {
    commercialError("Your role cannot edit valuation lines.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_valuation_lines")
    .update({
      certified_quantity: parsed.data.certified_quantity,
      claimed_quantity: parsed.data.claimed_quantity,
      description: parsed.data.line_description,
      notes: parsed.data.notes,
      unit: parsed.data.unit,
      unit_rate: parsed.data.unit_rate,
    })
    .eq("id", line.id);

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_valuation_line.updated",
    actorUserId: profile.id,
    entityId: line.id,
    entityType: "commercial_valuation_line",
    metadata: {
      certified_quantity: parsed.data.certified_quantity,
      claimed_quantity: parsed.data.claimed_quantity,
      unit_rate: parsed.data.unit_rate,
      valuation_id: valuation.id,
    },
    moduleKey: "commercial",
    sourceId: valuation.id,
    sourceTable: "commercial_valuations",
    summary: `Updated valuation line on ${valuation.valuation_number}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=valuation_line_updated#valuation-panel`);
}

export async function deleteCommercialValuationLineAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = valuationLineIdSchema.safeParse({
    line_id: field(formData, "line_id"),
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Select a valuation line.");
  }

  const line = await fetchValuationLineForMutation(parsed.data.line_id);

  if (!line) {
    commercialError("Valuation line was not found.");
  }

  const valuation = normalizeRelation(line.valuation);

  if (!valuation) {
    commercialError("Parent valuation was not found.");
  }

  if (!canEditOpsCommercialValuationLines(profile.id, profile.role, valuation)) {
    commercialError("Your role cannot delete valuation lines.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { count, error: countError } = await supabase
    .from("commercial_valuation_lines")
    .select("id", { count: "exact", head: true })
    .eq("valuation_id", line.valuation_id);

  if (countError) {
    commercialError(countError.message);
  }

  if ((count ?? 0) <= 1) {
    commercialError("Keep at least one valuation line.");
  }

  const { error } = await supabase
    .from("commercial_valuation_lines")
    .delete()
    .eq("id", line.id);

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: "commercial_valuation_line.deleted",
    actorUserId: profile.id,
    entityId: line.id,
    entityType: "commercial_valuation_line",
    metadata: { description: line.description, valuation_id: valuation.id },
    moduleKey: "commercial",
    sourceId: valuation.id,
    sourceTable: "commercial_valuations",
    summary: `Deleted valuation line from ${valuation.valuation_number}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=valuation_line_deleted#valuation-panel`);
}

async function updateCommercialValuationStatus(
  formData: FormData,
  status: "cancelled" | "certified" | "rejected" | "submitted",
) {
  const { profile } = await requireOpsUser();
  const parsed =
    status === "rejected"
      ? rejectValuationSchema.safeParse({
          rejection_reason: field(formData, "rejection_reason"),
          valuation_id: field(formData, "valuation_id"),
        })
      : valuationIdSchema.safeParse({ valuation_id: field(formData, "valuation_id") });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Select a valuation.");
  }

  const valuation = await fetchValuationForMutation(parsed.data.valuation_id);

  if (!valuation) {
    commercialError("Valuation was not found.");
  }

  if (
    (status === "submitted" && !canSubmitOpsCommercialValuation(profile.id, profile.role, valuation)) ||
    (status === "certified" && !canCertifyOpsCommercialValuation(profile.role, valuation)) ||
    (status === "rejected" && !canRejectOpsCommercialValuation(profile.role, valuation)) ||
    (status === "cancelled" && !canCancelOpsCommercialValuation(profile.id, profile.role, valuation))
  ) {
    commercialError("Your role cannot update this valuation.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();

  if (status === "submitted") {
    const { count, error: lineCountError } = await supabase
      .from("commercial_valuation_lines")
      .select("id", { count: "exact", head: true })
      .eq("valuation_id", valuation.id);

    if (lineCountError) {
      commercialError(lineCountError.message);
    }

    if ((count ?? 0) < 1) {
      commercialError("Add at least one valuation line before submission.");
    }
  }

  const rejectionReason =
    status === "rejected" && "rejection_reason" in parsed.data
      ? parsed.data.rejection_reason
      : "";
  const update =
    status === "submitted"
      ? { status, submitted_at: now, submitted_by: profile.id }
      : status === "certified"
        ? { certified_at: now, certified_by: profile.id, status }
        : status === "rejected"
          ? { rejected_at: now, rejected_by: profile.id, rejection_reason: rejectionReason, status }
          : { cancelled_at: now, cancelled_by: profile.id, status };

  const { error } = await supabase
    .from("commercial_valuations")
    .update(update)
    .eq("id", valuation.id)
    .in(
      "status",
      status === "submitted"
        ? ["draft", "rejected"]
        : status === "certified" || status === "rejected"
          ? ["submitted"]
          : ["draft", "submitted"],
    );

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: `commercial_valuation.${status}`,
    actorUserId: profile.id,
    entityId: valuation.id,
    entityType: "commercial_valuation",
    metadata: { rejection_reason: rejectionReason, status, updated_at: now },
    moduleKey: "commercial",
    sourceId: valuation.id,
    sourceTable: "commercial_valuations",
    summary: `Updated valuation ${valuation.valuation_number} to ${status}`,
  }).catch(() => null);

  if (status === "submitted") {
    await notifyOpsWorkflowEvent({
      actorId: profile.id,
      actionNeededRoles: ["quantity_surveyor", "projects_manager", "finance_manager"],
      title: `Certify valuation: ${valuation.valuation_number}`,
      body: `${profile.full_name} submitted valuation ${valuation.valuation_number} — ${valuation.title} for certification.`,
      actionHref: COMMERCIAL_ROUTE,
      moduleKey: "commercial",
      sourceTable: "commercial_valuations",
      sourceId: valuation.id,
      eventKey: status,
    });
  } else if (status === "certified" || status === "rejected") {
    await notifyOpsWorkflowEvent({
      actorId: profile.id,
      stakeholderIds: [valuation.submitted_by, valuation.created_by],
      title: `Valuation ${status}: ${valuation.valuation_number}`,
      body: `${profile.full_name} marked valuation ${valuation.valuation_number} — ${valuation.title} as ${status}.`,
      actionHref: COMMERCIAL_ROUTE,
      moduleKey: "commercial",
      sourceTable: "commercial_valuations",
      sourceId: valuation.id,
      eventKey: status,
      category: "info",
    });
  }

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=valuation_${status}`);
}

export async function submitCommercialValuationAction(formData: FormData) {
  await updateCommercialValuationStatus(formData, "submitted");
}

export async function certifyCommercialValuationAction(formData: FormData) {
  await updateCommercialValuationStatus(formData, "certified");
}

export async function rejectCommercialValuationAction(formData: FormData) {
  await updateCommercialValuationStatus(formData, "rejected");
}

export async function cancelCommercialValuationAction(formData: FormData) {
  await updateCommercialValuationStatus(formData, "cancelled");
}

export async function createCommercialRiskAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsCommercialRecord(profile.role)) {
    commercialError("Your role cannot create commercial risks.");
  }

  const parsed = riskSchema.safeParse({
    category: field(formData, "category") || "other",
    contract_id: field(formData, "contract_id"),
    description: field(formData, "description"),
    due_date: field(formData, "due_date"),
    impact_amount: field(formData, "impact_amount") || "0",
    mitigation_plan: field(formData, "mitigation_plan"),
    severity: field(formData, "severity") || "medium",
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check the risk details.");
  }

  await assertActiveSite(parsed.data.site_id);
  const contractId = normalizeOptionalUuid(parsed.data.contract_id);
  await fetchContractForCommercial(contractId, parsed.data.site_id);
  const dueDate = normalizeDateInput(parsed.data.due_date, false);

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_risks")
    .insert({
      category: parsed.data.category,
      contract_id: contractId,
      created_by: profile.id,
      description: parsed.data.description,
      due_date: dueDate,
      impact_amount: parsed.data.impact_amount,
      mitigation_plan: parsed.data.mitigation_plan,
      severity: parsed.data.severity,
      site_id: parsed.data.site_id,
      status: "open",
      title: parsed.data.title,
    })
    .select("id, risk_number")
    .single<{ id: string; risk_number: string }>();

  if (error || !data) {
    commercialError(error?.message ?? "Could not create commercial risk.");
  }

  await recordOpsAuditEvent({
    action: "commercial_risk.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "commercial_risk",
    metadata: {
      category: parsed.data.category,
      impact_amount: parsed.data.impact_amount,
      severity: parsed.data.severity,
      site_id: parsed.data.site_id,
    },
    moduleKey: "commercial",
    sourceId: data.id,
    sourceTable: "commercial_risks",
    summary: `Created commercial risk ${data.risk_number}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?created=risk`);
}

async function updateCommercialRiskStatus(
  formData: FormData,
  status: "cancelled" | "closed" | "mitigating",
) {
  const { profile } = await requireOpsUser();
  const parsed = riskIdSchema.safeParse({ risk_id: field(formData, "risk_id") });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Select a commercial risk.");
  }

  const risk = await fetchRiskForMutation(parsed.data.risk_id);

  if (!risk) {
    commercialError("Commercial risk was not found.");
  }

  if (
    (status === "mitigating" && !canMoveOpsCommercialRiskToMitigation(profile.role, risk)) ||
    (status === "closed" && !canCloseOpsCommercialRisk(profile.role, risk)) ||
    (status === "cancelled" && !canCancelOpsCommercialRisk(profile.id, profile.role, risk))
  ) {
    commercialError("Your role cannot update this risk.");
  }

  const now = new Date().toISOString();
  const update =
    status === "closed"
      ? { closed_at: now, closed_by: profile.id, status }
      : status === "cancelled"
        ? { cancelled_at: now, cancelled_by: profile.id, status }
        : { status };

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_risks")
    .update(update)
    .eq("id", risk.id)
    .in("status", status === "mitigating" ? ["open"] : ["open", "mitigating"]);

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: `commercial_risk.${status}`,
    actorUserId: profile.id,
    entityId: risk.id,
    entityType: "commercial_risk",
    metadata: { status, updated_at: now },
    moduleKey: "commercial",
    sourceId: risk.id,
    sourceTable: "commercial_risks",
    summary: `Updated commercial risk ${risk.risk_number} to ${status}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=risk_${status}`);
}

export async function mitigateCommercialRiskAction(formData: FormData) {
  await updateCommercialRiskStatus(formData, "mitigating");
}

export async function closeCommercialRiskAction(formData: FormData) {
  await updateCommercialRiskStatus(formData, "closed");
}

export async function cancelCommercialRiskAction(formData: FormData) {
  await updateCommercialRiskStatus(formData, "cancelled");
}

export async function createCommercialRetentionReleaseAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsCommercialRecord(profile.role)) {
    commercialError("Your role cannot create retention releases.");
  }

  const parsed = retentionReleaseSchema.safeParse({
    claimed_amount: field(formData, "claimed_amount") || "0",
    client_reference: field(formData, "client_reference"),
    contract_id: field(formData, "contract_id"),
    description: field(formData, "description"),
    due_date: field(formData, "due_date"),
    ipc_id: field(formData, "ipc_id"),
    notes: field(formData, "notes"),
    release_date: field(formData, "release_date"),
    release_type: field(formData, "release_type") || "interim",
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check the retention release details.");
  }

  const contract = await fetchContractForPlanning(parsed.data.contract_id);

  if (!contract) {
    commercialError("Select an active commercial contract.");
  }

  const ipcId = normalizeOptionalUuid(parsed.data.ipc_id);

  if (ipcId) {
    const ipc = await fetchIpcForMutation(ipcId);

    if (!ipc || ipc.site_id !== contract.site_id || ipc.contract_id !== contract.id || ipc.status === "cancelled") {
      commercialError("Select an IPC that belongs to the selected contract.");
    }
  }

  const dueDate = normalizeDateInput(parsed.data.due_date, false);
  const releaseDate = normalizeDateInput(parsed.data.release_date, false);

  if (dueDate && releaseDate && releaseDate < dueDate) {
    commercialError("Release date cannot be before the due date.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_retention_releases")
    .insert({
      claimed_amount: parsed.data.claimed_amount,
      client_reference: parsed.data.client_reference,
      contract_id: contract.id,
      created_by: profile.id,
      description: parsed.data.description,
      due_date: dueDate,
      ipc_id: ipcId,
      notes: parsed.data.notes,
      release_date: releaseDate,
      release_type: parsed.data.release_type,
      site_id: contract.site_id,
      status: "draft",
      title: parsed.data.title,
    })
    .select("id, release_number")
    .single<{ id: string; release_number: string }>();

  if (error || !data) {
    commercialError(error?.message ?? "Could not create retention release.");
  }

  await recordOpsAuditEvent({
    action: "commercial_retention_release.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "commercial_retention_release",
    metadata: {
      claimed_amount: parsed.data.claimed_amount,
      contract_id: contract.id,
      release_type: parsed.data.release_type,
      site_id: contract.site_id,
    },
    moduleKey: "commercial",
    sourceId: data.id,
    sourceTable: "commercial_retention_releases",
    summary: `Created retention release ${data.release_number}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?created=retention_release#retention-panel`);
}

async function updateCommercialRetentionReleaseStatus(
  formData: FormData,
  status: "approved" | "cancelled" | "rejected" | "released" | "submitted",
) {
  const { profile } = await requireOpsUser();
  const parsed =
    status === "approved"
      ? approveRetentionReleaseSchema.safeParse({
          approved_amount: field(formData, "approved_amount") || "0",
          notes: field(formData, "notes"),
          release_id: field(formData, "release_id"),
        })
      : status === "released"
        ? releaseRetentionReleaseSchema.safeParse({
            release_date: field(formData, "release_date"),
            release_id: field(formData, "release_id"),
            released_amount: field(formData, "released_amount") || "0",
          })
        : status === "rejected"
          ? rejectRetentionReleaseSchema.safeParse({
              rejection_reason: field(formData, "rejection_reason"),
              release_id: field(formData, "release_id"),
            })
          : retentionReleaseIdSchema.safeParse({ release_id: field(formData, "release_id") });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Select a retention release.");
  }

  const release = await fetchRetentionReleaseForMutation(parsed.data.release_id);

  if (!release) {
    commercialError("Retention release was not found.");
  }

  if (
    (status === "submitted" &&
      !canSubmitOpsCommercialRetentionRelease(profile.id, profile.role, release)) ||
    (status === "approved" && !canApproveOpsCommercialRetentionRelease(profile.role, release)) ||
    (status === "released" && !canReleaseOpsCommercialRetentionRelease(profile.role, release)) ||
    (status === "rejected" && !canRejectOpsCommercialRetentionRelease(profile.role, release)) ||
    (status === "cancelled" &&
      !canCancelOpsCommercialRetentionRelease(profile.id, profile.role, release))
  ) {
    commercialError("Your role cannot update this retention release.");
  }

  const now = new Date().toISOString();
  const claimedAmount = normalizeNumber(release.claimed_amount);
  const currentApprovedAmount = normalizeNumber(release.approved_amount);
  const approveInput =
    status === "approved" ? (parsed.data as z.infer<typeof approveRetentionReleaseSchema>) : null;
  const releaseInput =
    status === "released" ? (parsed.data as z.infer<typeof releaseRetentionReleaseSchema>) : null;
  const rejectionInput =
    status === "rejected" ? (parsed.data as z.infer<typeof rejectRetentionReleaseSchema>) : null;
  const approvedAmount =
    approveInput ? approveInput.approved_amount : currentApprovedAmount;

  if (status === "approved" && approvedAmount > claimedAmount) {
    commercialError("Approved amount cannot exceed claimed amount.");
  }

  const releasedAmount = releaseInput ? releaseInput.released_amount : 0;

  if (status === "released" && releasedAmount > currentApprovedAmount) {
    commercialError("Released amount cannot exceed approved amount.");
  }

  const releaseDate = releaseInput ? normalizeDateInput(releaseInput.release_date) : null;
  const rejectionReason = rejectionInput ? rejectionInput.rejection_reason : "";
  const update =
    status === "submitted"
      ? { status, submitted_at: now, submitted_by: profile.id }
      : status === "approved"
        ? {
            approved_amount: approvedAmount,
            approved_at: now,
            approved_by: profile.id,
            notes: approveInput?.notes ?? "",
            status,
          }
        : status === "released"
          ? {
              release_date: releaseDate,
              released_amount: releasedAmount,
              released_at: now,
              released_by: profile.id,
              status,
            }
          : status === "rejected"
            ? { rejected_at: now, rejected_by: profile.id, rejection_reason: rejectionReason, status }
            : { cancelled_at: now, cancelled_by: profile.id, status };

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_retention_releases")
    .update(update)
    .eq("id", release.id)
    .in(
      "status",
      status === "submitted"
        ? ["draft", "rejected"]
        : status === "approved" || status === "rejected"
          ? ["submitted"]
          : status === "released"
            ? ["approved"]
            : ["draft", "submitted", "approved"],
    );

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: `commercial_retention_release.${status}`,
    actorUserId: profile.id,
    entityId: release.id,
    entityType: "commercial_retention_release",
    metadata: { approved_amount: approvedAmount, released_amount: releasedAmount, status, updated_at: now },
    moduleKey: "commercial",
    sourceId: release.id,
    sourceTable: "commercial_retention_releases",
    summary: `Updated retention release ${release.release_number} to ${status}`,
  }).catch(() => null);

  if (status === "submitted") {
    await notifyOpsWorkflowEvent({
      actorId: profile.id,
      actionNeededRoles: ["finance_manager", "quantity_surveyor"],
      title: `Approve retention release: ${release.release_number}`,
      body: `${profile.full_name} submitted retention release ${release.release_number} — ${release.title} for approval.`,
      actionHref: COMMERCIAL_ROUTE,
      moduleKey: "commercial",
      sourceTable: "commercial_retention_releases",
      sourceId: release.id,
      eventKey: status,
    });
  } else if (status === "approved" || status === "released" || status === "rejected") {
    await notifyOpsWorkflowEvent({
      actorId: profile.id,
      stakeholderIds: [release.submitted_by, release.created_by],
      title: `Retention release ${status}: ${release.release_number}`,
      body: `${profile.full_name} marked retention release ${release.release_number} — ${release.title} as ${status}.`,
      actionHref: COMMERCIAL_ROUTE,
      moduleKey: "commercial",
      sourceTable: "commercial_retention_releases",
      sourceId: release.id,
      eventKey: status,
      category: "info",
    });
  }

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=retention_${status}#retention-panel`);
}

export async function submitCommercialRetentionReleaseAction(formData: FormData) {
  await updateCommercialRetentionReleaseStatus(formData, "submitted");
}

export async function approveCommercialRetentionReleaseAction(formData: FormData) {
  await updateCommercialRetentionReleaseStatus(formData, "approved");
}

export async function releaseCommercialRetentionReleaseAction(formData: FormData) {
  await updateCommercialRetentionReleaseStatus(formData, "released");
}

export async function rejectCommercialRetentionReleaseAction(formData: FormData) {
  await updateCommercialRetentionReleaseStatus(formData, "rejected");
}

export async function cancelCommercialRetentionReleaseAction(formData: FormData) {
  await updateCommercialRetentionReleaseStatus(formData, "cancelled");
}

export async function createCommercialCashflowForecastAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsCommercialRecord(profile.role)) {
    commercialError("Your role cannot create cashflow forecasts.");
  }

  const parsed = cashflowForecastSchema.safeParse({
    actual_cost: field(formData, "actual_cost") || "0",
    actual_revenue: field(formData, "actual_revenue") || "0",
    assumptions: field(formData, "assumptions"),
    confidence: field(formData, "confidence") || "medium",
    contract_id: field(formData, "contract_id"),
    forecast_cost: field(formData, "forecast_cost") || "0",
    forecast_retention_release: field(formData, "forecast_retention_release") || "0",
    forecast_revenue: field(formData, "forecast_revenue") || "0",
    period_end: field(formData, "period_end"),
    period_start: field(formData, "period_start"),
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check the cashflow forecast details.");
  }

  await assertActiveSite(parsed.data.site_id);
  const contractId = normalizeOptionalUuid(parsed.data.contract_id);
  await fetchContractForCommercial(contractId, parsed.data.site_id);
  const periodStart = normalizeDateInput(parsed.data.period_start);
  const periodEnd = normalizeDateInput(parsed.data.period_end);

  if (periodEnd < periodStart) {
    commercialError("Cashflow period end cannot be before the period start.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_cashflow_forecasts")
    .insert({
      actual_cost: parsed.data.actual_cost,
      actual_revenue: parsed.data.actual_revenue,
      assumptions: parsed.data.assumptions,
      confidence: parsed.data.confidence,
      contract_id: contractId,
      created_by: profile.id,
      forecast_cost: parsed.data.forecast_cost,
      forecast_retention_release: parsed.data.forecast_retention_release,
      forecast_revenue: parsed.data.forecast_revenue,
      period_end: periodEnd,
      period_start: periodStart,
      site_id: parsed.data.site_id,
      status: "draft",
      title: parsed.data.title,
    })
    .select("id, forecast_number")
    .single<{ forecast_number: string; id: string }>();

  if (error || !data) {
    commercialError(error?.message ?? "Could not create cashflow forecast.");
  }

  await recordOpsAuditEvent({
    action: "commercial_cashflow_forecast.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "commercial_cashflow_forecast",
    metadata: {
      contract_id: contractId,
      forecast_cost: parsed.data.forecast_cost,
      forecast_revenue: parsed.data.forecast_revenue,
      site_id: parsed.data.site_id,
    },
    moduleKey: "commercial",
    sourceId: data.id,
    sourceTable: "commercial_cashflow_forecasts",
    summary: `Created cashflow forecast ${data.forecast_number}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?created=cashflow_forecast#cashflow-panel`);
}

async function updateCommercialCashflowForecastStatus(
  formData: FormData,
  status: "approved" | "archived" | "cancelled" | "locked",
) {
  const { profile } = await requireOpsUser();
  const parsed = cashflowForecastIdSchema.safeParse({ forecast_id: field(formData, "forecast_id") });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Select a cashflow forecast.");
  }

  const forecast = await fetchCashflowForecastForMutation(parsed.data.forecast_id);

  if (!forecast) {
    commercialError("Cashflow forecast was not found.");
  }

  if (
    (status === "approved" && !canApproveOpsCommercialCashflowForecast(profile.role, forecast)) ||
    (status === "locked" && !canLockOpsCommercialCashflowForecast(profile.role, forecast)) ||
    (status === "archived" && !canArchiveOpsCommercialCashflowForecast(profile.role, forecast)) ||
    (status === "cancelled" &&
      !canCancelOpsCommercialCashflowForecast(profile.id, profile.role, forecast))
  ) {
    commercialError("Your role cannot update this cashflow forecast.");
  }

  const now = new Date().toISOString();
  const update =
    status === "approved"
      ? { approved_at: now, approved_by: profile.id, status }
      : status === "locked"
        ? { locked_at: now, locked_by: profile.id, status }
        : status === "archived"
          ? { archived_at: now, archived_by: profile.id, status }
          : { cancelled_at: now, cancelled_by: profile.id, status };

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_cashflow_forecasts")
    .update(update)
    .eq("id", forecast.id)
    .in(
      "status",
      status === "approved"
        ? ["draft"]
        : status === "locked"
          ? ["approved"]
          : status === "archived"
            ? ["approved", "locked"]
            : ["draft", "approved"],
    );

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: `commercial_cashflow_forecast.${status}`,
    actorUserId: profile.id,
    entityId: forecast.id,
    entityType: "commercial_cashflow_forecast",
    metadata: { status, updated_at: now },
    moduleKey: "commercial",
    sourceId: forecast.id,
    sourceTable: "commercial_cashflow_forecasts",
    summary: `Updated cashflow forecast ${forecast.forecast_number} to ${status}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=cashflow_${status}#cashflow-panel`);
}

export async function approveCommercialCashflowForecastAction(formData: FormData) {
  await updateCommercialCashflowForecastStatus(formData, "approved");
}

export async function lockCommercialCashflowForecastAction(formData: FormData) {
  await updateCommercialCashflowForecastStatus(formData, "locked");
}

export async function archiveCommercialCashflowForecastAction(formData: FormData) {
  await updateCommercialCashflowForecastStatus(formData, "archived");
}

export async function cancelCommercialCashflowForecastAction(formData: FormData) {
  await updateCommercialCashflowForecastStatus(formData, "cancelled");
}

export async function createCommercialMilestoneAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsCommercialRecord(profile.role)) {
    commercialError("Your role cannot create commercial milestones.");
  }

  const parsed = milestoneSchema.safeParse({
    achieved_amount: field(formData, "achieved_amount") || "0",
    billing_weight_percent: field(formData, "billing_weight_percent") || "0",
    contract_id: field(formData, "contract_id"),
    description: field(formData, "description"),
    due_date: field(formData, "due_date"),
    forecast_date: field(formData, "forecast_date"),
    invoice_trigger: field(formData, "invoice_trigger"),
    notes: field(formData, "notes"),
    planned_date: field(formData, "planned_date"),
    retention_trigger: field(formData, "retention_trigger"),
    target_amount: field(formData, "target_amount") || "0",
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check the milestone details.");
  }

  const contract = await fetchContractForPlanning(parsed.data.contract_id);

  if (!contract) {
    commercialError("Select an active commercial contract.");
  }

  const plannedDate = normalizeDateInput(parsed.data.planned_date, false);
  const dueDate = normalizeDateInput(parsed.data.due_date, false);
  const forecastDate = normalizeDateInput(parsed.data.forecast_date, false);

  if (plannedDate && forecastDate && forecastDate < plannedDate) {
    commercialError("Forecast date cannot be before the planned date.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("commercial_contract_milestones")
    .insert({
      achieved_amount: parsed.data.achieved_amount,
      billing_weight_percent: parsed.data.billing_weight_percent,
      contract_id: contract.id,
      created_by: profile.id,
      description: parsed.data.description,
      due_date: dueDate,
      forecast_date: forecastDate,
      invoice_trigger: parsed.data.invoice_trigger === "on",
      notes: parsed.data.notes,
      owner_id: profile.id,
      planned_date: plannedDate,
      retention_trigger: parsed.data.retention_trigger === "on",
      site_id: contract.site_id,
      status: "planned",
      target_amount: parsed.data.target_amount,
      title: parsed.data.title,
    })
    .select("id, milestone_number")
    .single<{ id: string; milestone_number: string }>();

  if (error || !data) {
    commercialError(error?.message ?? "Could not create commercial milestone.");
  }

  await recordOpsAuditEvent({
    action: "commercial_contract_milestone.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "commercial_contract_milestone",
    metadata: {
      contract_id: contract.id,
      site_id: contract.site_id,
      target_amount: parsed.data.target_amount,
    },
    moduleKey: "commercial",
    sourceId: data.id,
    sourceTable: "commercial_contract_milestones",
    summary: `Created milestone ${data.milestone_number}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?created=milestone#milestone-panel`);
}

async function updateCommercialMilestoneStatus(
  formData: FormData,
  status: "achieved" | "cancelled" | "certified" | "delayed" | "due",
) {
  const { profile } = await requireOpsUser();
  const parsed =
    status === "achieved"
      ? achieveMilestoneSchema.safeParse({
          achieved_amount: field(formData, "achieved_amount") || "0",
          actual_date: field(formData, "actual_date"),
          milestone_id: field(formData, "milestone_id"),
        })
      : status === "delayed"
        ? delayMilestoneSchema.safeParse({
            forecast_date: field(formData, "forecast_date"),
            milestone_id: field(formData, "milestone_id"),
          })
        : milestoneIdSchema.safeParse({ milestone_id: field(formData, "milestone_id") });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Select a milestone.");
  }

  const milestone = await fetchMilestoneForMutation(parsed.data.milestone_id);

  if (!milestone) {
    commercialError("Milestone was not found.");
  }

  if (
    (status === "due" && !canMarkOpsCommercialMilestoneDue(profile.id, profile.role, milestone)) ||
    (status === "achieved" && !canAchieveOpsCommercialMilestone(profile.id, profile.role, milestone)) ||
    (status === "certified" && !canCertifyOpsCommercialMilestone(profile.role, milestone)) ||
    (status === "delayed" && !canDelayOpsCommercialMilestone(profile.id, profile.role, milestone)) ||
    (status === "cancelled" && !canCancelOpsCommercialMilestone(profile.id, profile.role, milestone))
  ) {
    commercialError("Your role cannot update this milestone.");
  }

  const now = new Date().toISOString();
  const achieveInput =
    status === "achieved" ? (parsed.data as z.infer<typeof achieveMilestoneSchema>) : null;
  const delayInput =
    status === "delayed" ? (parsed.data as z.infer<typeof delayMilestoneSchema>) : null;
  const achievedAmount =
    achieveInput ? achieveInput.achieved_amount : normalizeNumber(milestone.target_amount);
  const actualDate = achieveInput ? normalizeDateInput(achieveInput.actual_date) : null;
  const forecastDate = delayInput ? normalizeDateInput(delayInput.forecast_date) : null;
  const update =
    status === "due"
      ? { status }
      : status === "achieved"
        ? {
            achieved_amount: achievedAmount,
            achieved_by: profile.id,
            actual_date: actualDate,
            completed_at: now,
            is_complete: true,
            status,
          }
        : status === "certified"
          ? { certified_at: now, certified_by: profile.id, status }
          : status === "delayed"
            ? { forecast_date: forecastDate, status }
            : { cancelled_at: now, cancelled_by: profile.id, status };

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("commercial_contract_milestones")
    .update(update)
    .eq("id", milestone.id)
    .in(
      "status",
      status === "due"
        ? ["planned", "delayed"]
        : status === "achieved"
          ? ["planned", "due", "delayed"]
          : status === "certified"
            ? ["achieved"]
            : status === "delayed"
              ? ["planned", "due"]
              : ["planned", "due", "achieved", "delayed"],
    );

  if (error) {
    commercialError(error.message);
  }

  await recordOpsAuditEvent({
    action: `commercial_contract_milestone.${status}`,
    actorUserId: profile.id,
    entityId: milestone.id,
    entityType: "commercial_contract_milestone",
    metadata: { achieved_amount: achievedAmount, status, updated_at: now },
    moduleKey: "commercial",
    sourceId: milestone.id,
    sourceTable: "commercial_contract_milestones",
    summary: `Updated milestone ${milestone.milestone_number} to ${status}`,
  }).catch(() => null);

  revalidatePath(COMMERCIAL_ROUTE);
  redirect(`${COMMERCIAL_ROUTE}?updated=milestone_${status}#milestone-panel`);
}

export async function markCommercialMilestoneDueAction(formData: FormData) {
  await updateCommercialMilestoneStatus(formData, "due");
}

export async function achieveCommercialMilestoneAction(formData: FormData) {
  await updateCommercialMilestoneStatus(formData, "achieved");
}

export async function certifyCommercialMilestoneAction(formData: FormData) {
  await updateCommercialMilestoneStatus(formData, "certified");
}

export async function delayCommercialMilestoneAction(formData: FormData) {
  await updateCommercialMilestoneStatus(formData, "delayed");
}

export async function cancelCommercialMilestoneAction(formData: FormData) {
  await updateCommercialMilestoneStatus(formData, "cancelled");
}

export async function createInvoiceFromCommercialIpcAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = createInvoiceFromIpcSchema.safeParse({
    client_name: field(formData, "client_name"),
    invoice_number: field(formData, "invoice_number"),
    ipc_id: field(formData, "ipc_id"),
    tpin: field(formData, "tpin"),
  });

  if (!parsed.success) {
    commercialError(parsed.error.issues[0]?.message ?? "Check the invoice handoff details.");
  }

  const ipc = await fetchIpcForMutation(parsed.data.ipc_id);

  if (!ipc) {
    commercialError("IPC was not found.");
  }

  if (!canCreateOpsCommercialInvoiceFromIpc(profile.role, ipc)) {
    commercialError("Your role cannot generate an invoice from this IPC.");
  }

  const subtotal = roundToTwo(Math.max(normalizeNumber(ipc.certified_amount) - normalizeNumber(ipc.retention_amount), 0));
  const vatAmount = roundToTwo(normalizeNumber(ipc.vat_amount));
  const totalAmount = roundToTwo(subtotal + vatAmount);

  if (totalAmount <= 0) {
    commercialError("Certify a value before creating an invoice.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: organization, error: organizationError } = await supabase
    .from("organization_profile")
    .select("invoice_prefix")
    .eq("id", 1)
    .single<{ invoice_prefix: string }>();

  if (organizationError || !organization) {
    commercialError(organizationError?.message ?? "Pymble organization profile was not found.");
  }

  const contract = normalizeRelation(ipc.contract);
  const site = normalizeRelation(ipc.site);
  const invoiceNumber =
    parsed.data.invoice_number || (await nextCommercialInvoiceNumber(organization.invoice_prefix));
  const clientName =
    parsed.data.client_name ||
    contract?.client_name ||
    ipc.client_reference ||
    site?.name ||
    "Pymble client";

  const { data: invoice, error: invoiceErrorResult } = await supabase
    .from("invoices")
    .insert({
      boq_id: ipc.boq_id,
      client_name: clientName,
      created_by: profile.id,
      invoice_number: invoiceNumber,
      issued_at: new Date().toISOString().slice(0, 10),
      site_id: ipc.site_id,
      status: "draft",
      subtotal,
      total_amount: totalAmount,
      tpin: parsed.data.tpin || null,
      vat_amount: vatAmount,
    })
    .select("id")
    .single<{ id: string }>();

  if (invoiceErrorResult || !invoice) {
    commercialError(
      invoiceErrorResult
        ? invoiceErrorResult.code === "23505"
          ? "That invoice number already exists."
          : invoiceErrorResult.message
        : "The invoice could not be created.",
    );
  }

  const now = new Date().toISOString();
  const { error: ipcUpdateError } = await supabase
    .from("commercial_ipcs")
    .update({
      invoice_id: invoice.id,
      invoiced_at: now,
      invoiced_by: profile.id,
      status: "invoiced",
    })
    .eq("id", ipc.id)
    .eq("status", "certified")
    .is("invoice_id", null);

  if (ipcUpdateError) {
    await supabase
      .from("invoices")
      .update({ deleted_at: now })
      .eq("id", invoice.id)
      .then(() => null);
    commercialError(ipcUpdateError.message);
  }

  await Promise.all([
    recordOpsAuditEvent({
      action: "commercial_ipc.invoice_created",
      actorUserId: profile.id,
      entityId: ipc.id,
      entityType: "commercial_ipc",
      metadata: {
        invoice_id: invoice.id,
        invoice_number: invoiceNumber,
        total_amount: totalAmount,
      },
      moduleKey: "commercial",
      sourceId: ipc.id,
      sourceTable: "commercial_ipcs",
      summary: `Created invoice ${invoiceNumber} from IPC ${ipc.ipc_number}`,
    }).catch(() => null),
    recordOpsAuditEvent({
      action: "invoice.created_from_ipc",
      actorUserId: profile.id,
      entityId: invoice.id,
      entityType: "invoice",
      metadata: {
        ipc_id: ipc.id,
        ipc_number: ipc.ipc_number,
        total_amount: totalAmount,
      },
      moduleKey: "invoices",
      sourceId: invoice.id,
      sourceTable: "invoices",
      summary: `Created invoice ${invoiceNumber} from IPC ${ipc.ipc_number}`,
    }).catch(() => null),
  ]);

  revalidatePath(COMMERCIAL_ROUTE);
  revalidatePath("/ops/invoices");
  redirect(`${COMMERCIAL_ROUTE}?updated=ipc_invoice_created`);
}
