import { requireOpsUser } from "@/lib/ops/auth";
import {
  canViewOpsContractKind,
  canViewOpsContracts,
} from "@/lib/ops/contract-permissions";
import {
  toClientOpsContractSignature,
  type OpsContractSignableContent,
  type OpsContractSignatureRow,
} from "@/lib/ops/contract-signatures";
import type {
  OpsContract,
  OpsContractClause,
  OpsContractDetail,
  OpsContractKind,
  OpsContractLine,
  OpsContractMilestone,
  OpsContractScopeItem,
  OpsContractStatus,
  OpsContractTemplate,
  OpsContractTemplateClause,
} from "@/lib/ops/contract-types";
import { logOpsServerError } from "@/lib/ops/log";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Reads for the contracts module.
 *
 * Everything here goes through the service-role client, which bypasses RLS —
 * the house pattern, but it means the kind gate (employment contracts expose
 * pay) has to be enforced in this file rather than left to the database policy.
 * Both layers exist; only this one actually runs for app reads.
 */

type Relation<T> = T | T[] | null;

function pickRel<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const TEMPLATE_SELECT = [
  "id",
  "template_code",
  "name",
  "kind",
  "version",
  "is_active",
  "description",
  "default_vat_percent",
  "default_retention_percent",
  "default_penalty_percent_per_week",
  "default_penalty_cap_percent",
  "default_warranty_months",
  "default_defects_liability_months",
  "default_variation_threshold_percent",
  "default_payment_terms_days",
  "created_at",
  "updated_at",
].join(", ");

const CONTRACT_SELECT = [
  "id",
  "contract_number",
  "template_id",
  "template_version",
  "kind",
  "status",
  "counterparty_type",
  "subcontractor_id",
  "employee_id",
  "counterparty_snapshot",
  "work_order_number",
  "work_order_date",
  "site_id",
  "assignment_id",
  "cost_code_id",
  "title",
  "preamble",
  "scope_summary",
  "currency_code",
  "subtotal",
  "vat_applicable",
  "vat_percent",
  "vat_amount",
  "total_value",
  "roe_reference",
  "retention_percent",
  "penalty_percent_per_week",
  "penalty_cap_percent",
  "variation_threshold_percent",
  "warranty_months",
  "defects_liability_months",
  "min_workers",
  "payment_terms_days",
  "start_date",
  "end_date",
  "duration_days",
  "expected_start_date",
  "expected_finish_date",
  "approved_at",
  "approved_by",
  "issued_at",
  "issued_by",
  "signed_at",
  "signed_document_id",
  "terminated_at",
  "termination_reason",
  "completed_at",
  "commitment_cost_entry_id",
  "parent_contract_id",
  "addendum_number",
  "notes",
  "created_by",
  "created_at",
  "updated_at",
  "archived_at",
  "site:sites!contracts_site_id_fkey(id, code, name)",
  "subcontractor:subcontractors!contracts_subcontractor_id_fkey(id, company_name)",
  "employee:employees!contracts_employee_id_fkey(id, full_name)",
].join(", ");

type RawContract = Omit<OpsContract, "site" | "counterparty_name"> & {
  site: Relation<NonNullable<OpsContract["site"]>>;
  subcontractor: Relation<{ id: string; company_name: string }>;
  employee: Relation<{ id: string; full_name: string }>;
};

function mapContract(row: RawContract): OpsContract {
  const subcontractor = pickRel(row.subcontractor);
  const employee = pickRel(row.employee);

  // Snapshot first: an issued contract must show the name as it was written on
  // the document, not whatever the register says today.
  const snapshotName = row.counterparty_snapshot?.name?.trim() ?? "";

  return {
    ...row,
    counterparty_snapshot: row.counterparty_snapshot ?? {},
    site: pickRel(row.site),
    counterparty_name:
      snapshotName ||
      subcontractor?.company_name ||
      employee?.full_name ||
      "—",
  } as OpsContract;
}

export async function fetchOpsContractTemplates(kind?: OpsContractKind) {
  await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();

  let query = supabase
    .from("contract_templates")
    .select(TEMPLATE_SELECT)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (kind) query = query.eq("kind", kind);

  const { data, error } = await query;

  if (error) {
    logOpsServerError(error, {
      module: "contracts",
      action: "fetchOpsContractTemplates",
    });
    throw error;
  }

  return (data ?? []) as unknown as OpsContractTemplate[];
}

export async function fetchOpsContractTemplateClauses(templateId: string) {
  await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();

  const { data, error } = await supabase
    .from("contract_template_clauses")
    .select(
      "id, template_id, section_key, heading, body_markdown, sort_order, is_required, is_editable",
    )
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });

  if (error) {
    logOpsServerError(error, {
      module: "contracts",
      action: "fetchOpsContractTemplateClauses",
      entityId: templateId,
    });
    throw error;
  }

  return (data ?? []) as OpsContractTemplateClause[];
}

export type OpsContractFilters = {
  status?: OpsContractStatus | "all";
  kind?: OpsContractKind | "all";
  siteId?: string | null;
  search?: string;
  limit?: number;
};

export async function fetchOpsContracts(filters: OpsContractFilters = {}) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsContracts(profile.role)) return [] as OpsContract[];

  const supabase = getOpsSupabaseServiceClient();

  let query = supabase
    .from("contracts")
    .select(CONTRACT_SELECT)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.kind && filters.kind !== "all") {
    query = query.eq("kind", filters.kind);
  }
  if (filters.siteId) {
    query = query.eq("site_id", filters.siteId);
  }
  if (filters.search && filters.search.trim().length > 0) {
    const term = `%${filters.search.trim()}%`;
    query = query.or(`contract_number.ilike.${term},title.ilike.${term}`);
  }

  // The kind gate, applied in the query rather than after it, so a role that
  // cannot see pay never has employment rows in memory to begin with — and the
  // register's counts stay consistent with what the list shows.
  if (!canViewOpsContractKind(profile.role, "employment")) {
    query = query.neq("kind", "employment");
  }

  const { data, error } = await query;

  if (error) {
    logOpsServerError(error, {
      module: "contracts",
      action: "fetchOpsContracts",
    });
    throw error;
  }

  return ((data ?? []) as unknown as RawContract[]).map(mapContract);
}

export async function fetchOpsContractById(
  id: string,
): Promise<OpsContractDetail | null> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsContracts(profile.role)) return null;

  const supabase = getOpsSupabaseServiceClient();

  const { data, error } = await supabase
    .from("contracts")
    .select(CONTRACT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logOpsServerError(error, {
      module: "contracts",
      action: "fetchOpsContractById",
      entityId: id,
    });
    throw error;
  }

  if (!data) return null;

  const contract = mapContract(data as unknown as RawContract);

  // Not a 403 with a body — a role that cannot see employment contracts is told
  // the record does not exist, so the register cannot be probed for who is on
  // what package.
  if (!canViewOpsContractKind(profile.role, contract.kind)) return null;

  const [scopeItems, lines, milestones, clauses, signatures] = await Promise.all([
    supabase
      .from("contract_scope_items")
      .select("id, contract_id, sort_order, heading, detail")
      .eq("contract_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("contract_lines")
      .select(
        "id, contract_id, sort_order, description, quantity, uom, rate, amount, cost_code_id",
      )
      .eq("contract_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("contract_milestones")
      .select(
        "id, contract_id, sort_order, label, percent, amount, trigger_description, payable_within_days, is_retention, status, certified_at, certified_by, payment_request_id, subcontractor_payment_id, release_due_date, notes",
      )
      .eq("contract_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("contract_clauses")
      .select(
        "id, contract_id, section_key, heading, body_markdown, sort_order, is_required, is_customised, template_body_snapshot",
      )
      .eq("contract_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("contract_signatures")
      .select(
        "id, contract_id, signatory_role, sequence, is_required, assigned_user_id, status, signed_by_user_id, signed_name, signed_title, signature_r2_key, signed_at, decline_reason, verification_code, document_sha256",
      )
      .eq("contract_id", id)
      .order("sequence", { ascending: true }),
  ]);

  return {
    ...contract,
    scope_items: (scopeItems.data ?? []) as OpsContractScopeItem[],
    lines: (lines.data ?? []) as OpsContractLine[],
    milestones: (milestones.data ?? []) as OpsContractMilestone[],
    clauses: (clauses.data ?? []) as OpsContractClause[],
    // Scrubbed on the way out: R2 keys and document hashes stop here. The
    // freshness comparison needs a re-render, so it is resolved by the PDF
    // route rather than guessed at here — null means "not evaluated".
    signatures: ((signatures.data ?? []) as OpsContractSignatureRow[]).map((row) =>
      toClientOpsContractSignature(row, null),
    ),
  };
}

export type OpsContractStats = {
  draft: number;
  awaiting_signature: number;
  active: number;
  active_value: number;
  retention_held: number;
};

export async function fetchOpsContractStats(): Promise<OpsContractStats> {
  const contracts = await fetchOpsContracts({ limit: 500 });

  const active = contracts.filter((c) =>
    ["active", "signed"].includes(c.status),
  );

  return {
    draft: contracts.filter((c) => c.status === "draft").length,
    awaiting_signature: contracts.filter((c) =>
      ["approved", "issued"].includes(c.status),
    ).length,
    active: active.length,
    active_value: active.reduce((sum, c) => sum + Number(c.total_value ?? 0), 0),
    retention_held: active.reduce(
      (sum, c) =>
        sum + (Number(c.total_value ?? 0) * Number(c.retention_percent ?? 0)) / 100,
      0,
    ),
  };
}

export function roundOpsMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

/**
 * Derive the money from the priced lines.
 *
 * Totals are computed, never typed. The source instrument carried a hand-keyed
 * total that did not agree with its own line amounts, and a "VAT (16%)" row
 * against a blank figure — both are unrepresentable once the arithmetic is
 * here. Pure, so it can be tested without a database.
 */
export function computeOpsContractTotals(input: {
  lineAmounts: number[];
  vatApplicable: boolean;
  vatPercent: number;
}) {
  const subtotal = roundOpsMoney(
    input.lineAmounts.reduce((sum, amount) => sum + Number(amount ?? 0), 0),
  );
  const vatAmount = input.vatApplicable
    ? roundOpsMoney((subtotal * Number(input.vatPercent ?? 0)) / 100)
    : 0;

  return {
    subtotal,
    vatAmount,
    total: roundOpsMoney(subtotal + vatAmount),
  };
}

/**
 * A milestone is a PERCENTAGE of the contract, so its cash amount has to be
 * re-derived whenever the total moves. Storing it without recomputing is how
 * the payment plan ends up disagreeing with the priced schedule on the same
 * page of the same document.
 */
export function opsContractMilestoneAmount(total: number, percent: number) {
  return roundOpsMoney((Number(total ?? 0) * Number(percent ?? 0)) / 100);
}

/**
 * Project a contract down to what a signature actually attests to, for hashing.
 * Presentation (logo, margins, who generated the download) is excluded on
 * purpose — those are not terms.
 */
export function toOpsContractSignableContent(
  detail: OpsContractDetail,
): OpsContractSignableContent {
  return {
    contract_number: detail.contract_number,
    kind: detail.kind,
    counterparty_name: detail.counterparty_name,
    title: detail.title,
    preamble: detail.preamble,
    scope_summary: detail.scope_summary,
    currency_code: detail.currency_code,
    subtotal: Number(detail.subtotal ?? 0),
    vat_applicable: detail.vat_applicable,
    vat_percent: Number(detail.vat_percent ?? 0),
    vat_amount: Number(detail.vat_amount ?? 0),
    total_value: Number(detail.total_value ?? 0),
    retention_percent: Number(detail.retention_percent ?? 0),
    penalty_percent_per_week: Number(detail.penalty_percent_per_week ?? 0),
    penalty_cap_percent: Number(detail.penalty_cap_percent ?? 0),
    warranty_months: detail.warranty_months,
    defects_liability_months: detail.defects_liability_months,
    duration_days: detail.duration_days,
    payment_terms_days: detail.payment_terms_days,
    start_date: detail.start_date,
    end_date: detail.end_date,
    scope_items: detail.scope_items.map((item) => ({
      sort_order: item.sort_order,
      heading: item.heading,
      detail: item.detail,
    })),
    lines: detail.lines.map((line) => ({
      sort_order: line.sort_order,
      description: line.description,
      quantity: Number(line.quantity ?? 0),
      uom: line.uom,
      rate: Number(line.rate ?? 0),
      amount: Number(line.amount ?? 0),
    })),
    milestones: detail.milestones.map((milestone) => ({
      sort_order: milestone.sort_order,
      label: milestone.label,
      percent: Number(milestone.percent ?? 0),
      amount: Number(milestone.amount ?? 0),
      trigger_description: milestone.trigger_description,
      payable_within_days: milestone.payable_within_days,
      is_retention: milestone.is_retention,
    })),
    clauses: detail.clauses.map((clause) => ({
      sort_order: clause.sort_order,
      section_key: clause.section_key,
      heading: clause.heading,
      body_markdown: clause.body_markdown,
    })),
  };
}

/**
 * Resolve {{merge_tokens}} in a clause body.
 *
 * Unknown tokens are left untouched rather than blanked: a clause reading
 * "{{notice_period}}" is obviously unfinished, whereas one reading "a period of
 *  days" looks finished and is not. Loud beats silent on a legal document.
 */
export function renderOpsContractClauseBody(
  body: string,
  values: Record<string, string | number | null | undefined>,
) {
  return body.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi, (match, token: string) => {
    const value = values[token];
    if (value === null || value === undefined || value === "") return match;
    return String(value);
  });
}

export function buildOpsContractMergeValues(input: {
  contract: OpsContract;
  orgLegalName: string;
  siteName?: string | null;
}): Record<string, string | number> {
  const { contract } = input;

  return {
    org_legal_name: input.orgLegalName,
    counterparty_name: contract.counterparty_name,
    contract_total: `${contract.currency_code} ${Number(
      contract.total_value ?? 0,
    ).toLocaleString("en-ZM", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
    duration_days: contract.duration_days,
    warranty_months: contract.warranty_months,
    penalty_percent_per_week: contract.penalty_percent_per_week,
    penalty_cap_percent: contract.penalty_cap_percent,
    variation_threshold_percent: contract.variation_threshold_percent,
    min_workers: contract.min_workers,
    payment_terms_days: contract.payment_terms_days,
    retention_percent: contract.retention_percent,
    defects_liability_months: contract.defects_liability_months,
    site_name: input.siteName ?? contract.site?.name ?? "",
  };
}
