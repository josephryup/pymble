import { requireOpsUser } from "@/lib/ops/auth";
import {
  canViewOpsContractSubject,
  canViewOpsContracts,
  canViewOpsPersonalContracts,
} from "@/lib/ops/contract-permissions";
import {
  toClientOpsContractSignature,
  type OpsContractSignableContent,
  type OpsContractSignatureRow,
} from "@/lib/ops/contract-signatures";
import type {
  OpsContract,
  OpsContractRemuneration,
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
import { resolveOpsContractRemuneration } from "@/lib/ops/contract-remuneration";
import { logOpsServerError } from "@/lib/ops/log";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Reads for the contracts module.
 *
 * Everything here goes through the service-role client, which bypasses RLS —
 * the house pattern, but it means the subject gate (a contract with a person
 * exposes pay) is enforced in this file rather than left to the database policy.
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
  "requires_legal_review",
  "legal_reviewed_at",
  "legal_review_note",
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
  "job_title",
  "place_of_work",
  "probation_months",
  "notice_period_days",
  "annual_leave_days",
  "hours_per_week",
  "employee_contract_id",
  "statutory_contributions_apply",
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
  "template:contract_templates!contracts_template_id_fkey(id, name, requires_legal_review)",
  "subcontractor:subcontractors!contracts_subcontractor_id_fkey(id, company_name)",
  "employee:employees!contracts_employee_id_fkey(id, full_name)",
].join(", ");

type RawContract = Omit<
  OpsContract,
  "site" | "counterparty_name" | "template_requires_legal_review" | "template_name"
> & {
  site: Relation<NonNullable<OpsContract["site"]>>;
  template: Relation<{ id: string; name: string; requires_legal_review: boolean }>;
  subcontractor: Relation<{ id: string; company_name: string }>;
  employee: Relation<{ id: string; full_name: string }>;
};

/**
 * Read just the frozen schedule, by id.
 *
 * Separate from CONTRACT_SELECT so the list query cannot pick it up: a column
 * that is never selected on the list path is a column no list read can leak.
 */
async function fetchRemunerationSnapshot(
  supabase: ReturnType<typeof getOpsSupabaseServiceClient>,
  contractId: string,
) {
  const { data } = await supabase
    .from("contracts")
    .select("remuneration_snapshot")
    .eq("id", contractId)
    .maybeSingle<{ remuneration_snapshot: unknown }>();

  return data?.remuneration_snapshot ?? {};
}

function mapContract(row: RawContract): OpsContract {
  const subcontractor = pickRel(row.subcontractor);
  const employee = pickRel(row.employee);
  const template = pickRel(row.template);

  // Snapshot first: an issued contract must show the name as it was written on
  // the document, not whatever the register says today.
  const snapshotName = row.counterparty_snapshot?.name?.trim() ?? "";

  return {
    ...row,
    counterparty_snapshot: row.counterparty_snapshot ?? {},
    site: pickRel(row.site),
    template_name: template?.name ?? "",
    template_requires_legal_review: Boolean(template?.requires_legal_review),
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

  // The personal-contract gate, applied in the query rather than after it, so a
  // role that cannot see pay never has those rows in memory to begin with — and
  // the register's counts stay consistent with what the list shows.
  //
  // BOTH columns are filtered. Filtering only on kind was the leak: a
  // subcontract-kind row pointing at an employee slipped straight through.
  if (!canViewOpsPersonalContracts(profile.role)) {
    query = query.neq("kind", "employment").neq("counterparty_type", "employee");
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
  if (!canViewOpsContractSubject(profile.role, contract)) return null;

  // Only now — past the gate — does anything read pay. The snapshot column is
  // absent from CONTRACT_SELECT on purpose, so the LIST shape has nowhere to
  // put a salary even by accident; it is fetched here, for one contract, after
  // the caller has been cleared to see it.
  const remuneration =
    contract.kind === "employment"
      ? await resolveOpsContractRemuneration({
          id: contract.id,
          kind: contract.kind,
          status: contract.status,
          employee_id: contract.employee_id,
          employee_contract_id: contract.employee_contract_id,
          statutory_contributions_apply: contract.statutory_contributions_apply,
          remuneration_snapshot: await fetchRemunerationSnapshot(supabase, id),
          approved_at: contract.approved_at,
        })
      : null;

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
    remuneration,
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
  /** Split out because value and retention only apply to the subcontract kind. */
  active_subcontracts: number;
  active_employment: number;
  active_value: number;
  retention_held: number;
};

export async function fetchOpsContractStats(): Promise<OpsContractStats> {
  const contracts = await fetchOpsContracts({ limit: 500 });

  const active = contracts.filter((c) =>
    ["active", "signed"].includes(c.status),
  );

  // Value and retention are subcontract concepts. An employment contract has
  // total_value 0 and retention_percent 0, so including it did not change the
  // sums — but it DID inflate the "live contracts" count that sits beneath the
  // active-value tile, so the tile read as an average nobody could reconcile.
  const activeSubcontracts = active.filter((c) => c.kind === "subcontract");

  return {
    draft: contracts.filter((c) => c.status === "draft").length,
    awaiting_signature: contracts.filter((c) =>
      ["approved", "issued"].includes(c.status),
    ).length,
    active: active.length,
    active_subcontracts: activeSubcontracts.length,
    active_employment: active.length - activeSubcontracts.length,
    active_value: activeSubcontracts.reduce(
      (sum, c) => sum + Number(c.total_value ?? 0),
      0,
    ),
    retention_held: activeSubcontracts.reduce(
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
    job_title: detail.job_title,
    place_of_work: detail.place_of_work,
    probation_months: detail.probation_months,
    notice_period_days: detail.notice_period_days,
    annual_leave_days: Number(detail.annual_leave_days ?? 0),
    hours_per_week: Number(detail.hours_per_week ?? 0),
    // Only the figures that appear on the document. `frozen`, `computed_at` and
    // the source ids are metadata about the read, not terms of the agreement —
    // hashing them would make a signature go stale for no reason a reader could
    // see on the page.
    remuneration: detail.remuneration
      ? {
          basic: Number(detail.remuneration.basic ?? 0),
          housing: Number(detail.remuneration.housing ?? 0),
          other_allowances: Number(detail.remuneration.other_allowances ?? 0),
          gross: Number(detail.remuneration.gross ?? 0),
          statutory_applies: detail.remuneration.statutory_applies,
          net: Number(detail.remuneration.net ?? 0),
        }
      : null,
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
  /**
   * Only supplied for an employment contract, and only by a caller that has
   * already passed the visibility gate. Absent means the pay tokens render as
   * "—" rather than as a number nobody was cleared to see.
   */
  remuneration?: OpsContractRemuneration | null;
}): Record<string, string | number> {
  const { contract, remuneration } = input;

  const money = (amount: number | null | undefined) =>
    amount === null || amount === undefined
      ? "—"
      : `${contract.currency_code} ${Number(amount).toLocaleString("en-ZM", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;

  return {
    job_title: contract.job_title,
    place_of_work: contract.place_of_work || contract.site?.name || "",
    probation_months: contract.probation_months,
    notice_period_days: contract.notice_period_days,
    annual_leave_days: contract.annual_leave_days,
    hours_per_week: contract.hours_per_week,
    basic_pay: remuneration ? money(remuneration.basic) : "—",
    housing_allowance: remuneration ? money(remuneration.housing) : "—",
    gross_pay: remuneration ? money(remuneration.gross) : "—",
    net_pay: remuneration ? money(remuneration.net) : "—",
    statutory_basis: remuneration
      ? remuneration.statutory_applies
        ? "subject to PAYE, NAPSA and NHIMA in accordance with Zambian law"
        : "paid gross, with the Employee responsible for their own tax and statutory contributions"
      : "—",
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

/**
 * The signed instruments on file for one employee.
 *
 * Deliberately NOT the pay records — those are `employee_contracts` and the HR
 * page already lists them. This is the other half of the pair: the documents
 * that were drawn up FROM those records, so the employee page can show what was
 * actually signed next to what payroll pays.
 *
 * Returns [] rather than throwing for a role that cannot see pay. The employee
 * page is reachable by the Admin/Receptionist, who belongs in HR for the
 * directory and the leave diary but has no business reading salaries — an empty
 * list is the honest answer for them, not an error.
 */
export type OpsEmployeeContractDocument = {
  id: string;
  contract_number: string;
  title: string;
  status: OpsContractStatus;
  job_title: string;
  start_date: string | null;
  end_date: string | null;
  signed_at: string | null;
  issued_at: string | null;
  /** How far through the signature panel it is, without exposing who signed. */
  signatures_total: number;
  signatures_signed: number;
};

export async function fetchOpsEmployeeContractDocuments(
  employeeIds: readonly string[],
): Promise<Map<string, OpsEmployeeContractDocument[]>> {
  const empty = new Map<string, OpsEmployeeContractDocument[]>();
  if (employeeIds.length === 0) return empty;

  const { profile } = await requireOpsUser();
  if (!canViewOpsContracts(profile.role)) return empty;
  if (!canViewOpsPersonalContracts(profile.role)) return empty;

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("contracts")
    .select(
      "id, employee_id, contract_number, title, status, job_title, start_date, end_date, signed_at, issued_at",
    )
    .eq("kind", "employment")
    .in("employee_id", employeeIds as string[])
    .is("archived_at", null)
    .order("start_date", { ascending: false })
    .limit(200);

  if (error) {
    logOpsServerError(error, {
      module: "contracts",
      action: "fetchOpsEmployeeContractDocuments",
    });
    return empty;
  }

  const rows = (data ?? []) as Array<
    Omit<OpsEmployeeContractDocument, "signatures_total" | "signatures_signed"> & {
      employee_id: string;
    }
  >;
  if (rows.length === 0) return empty;

  // Counts only. Who signed and when is on the contract page, behind its own
  // gate; the employee record needs to answer "is this executed yet?" and
  // nothing more.
  const { data: signatureRows } = await supabase
    .from("contract_signatures")
    .select("contract_id, status")
    .in(
      "contract_id",
      rows.map((row) => row.id),
    );

  const tally = new Map<string, { total: number; signed: number }>();
  for (const row of (signatureRows ?? []) as Array<{
    contract_id: string;
    status: string;
  }>) {
    const current = tally.get(row.contract_id) ?? { total: 0, signed: 0 };
    current.total += 1;
    if (row.status === "signed") current.signed += 1;
    tally.set(row.contract_id, current);
  }

  const byEmployee = new Map<string, OpsEmployeeContractDocument[]>();
  for (const row of rows) {
    const counts = tally.get(row.id) ?? { total: 0, signed: 0 };
    const list = byEmployee.get(row.employee_id) ?? [];
    list.push({
      id: row.id,
      contract_number: row.contract_number,
      title: row.title,
      status: row.status,
      job_title: row.job_title,
      start_date: row.start_date,
      end_date: row.end_date,
      signed_at: row.signed_at,
      issued_at: row.issued_at,
      signatures_total: counts.total,
      signatures_signed: counts.signed,
    });
    byEmployee.set(row.employee_id, list);
  }

  return byEmployee;
}
