"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  canApproveOpsContract,
  canCertifyOpsContractMilestone,
  canDraftOpsContractKind,
  canIssueOpsContract,
  canReviewOpsContract,
  canSignOpsContractAs,
  canTerminateOpsContract,
  canViewOpsContractKind,
  OPS_CONTRACT_INTERNAL_SIGNATORIES,
} from "@/lib/ops/contract-permissions";
import {
  cancelOpsContractCommitment,
  postOpsContractCommitment,
  raiseOpsContractMilestonePayable,
} from "@/lib/ops/contract-finance";
import {
  copyOwnSpecimenForSigning,
  generateOpsSignatureVerificationCode,
  hashOpsContractContent,
} from "@/lib/ops/contract-signatures";
import type {
  OpsContractDetail,
  OpsContractSignatoryRole,
  OpsContractStatus,
} from "@/lib/ops/contract-types";
import {
  computeOpsContractTotals,
  fetchOpsContractById,
  fetchOpsContractTemplateClauses,
  opsContractMilestoneAmount,
  roundOpsMoney,
  toOpsContractSignableContent,
} from "@/lib/ops/contracts";
import { requirePublicEnv } from "@/lib/ops/env";
import { logOpsServerError } from "@/lib/ops/log";
import { fetchOpsOrganizationProfile } from "@/lib/ops/organization";
import { fanoutToOpsAudiences } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import {
  linkOpsRecordAttachment,
  verifyOpsUploadedObject,
} from "@/lib/ops/record-attachments";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

const ROUTE = "/ops/contracts";
const MODULE = "contracts";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function contractError(message: string, contractId?: string): never {
  const base = contractId ? `${ROUTE}/${contractId}` : ROUTE;
  redirect(`${base}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function revalidateContract(contractId?: string) {
  revalidatePath(ROUTE);
  if (contractId) revalidatePath(`${ROUTE}/${contractId}`);
}

/**
 * Snapshot the contract before an edit lands.
 *
 * Full clause editing (D2) means free text on a legal instrument, and the
 * signature hash only tells you that something changed, not what it was
 * before. This is the "before" — cheap insurance, and the only way to answer
 * "what did that indemnity clause say last week?".
 *
 * Best-effort by design: failing to write history must never block the edit
 * itself, or a full revisions table would make the module read-only.
 */
async function recordOpsContractRevision(input: {
  changedBy: string;
  contract: OpsContractDetail;
  changeSummary: string;
}) {
  try {
    const supabase = getOpsSupabaseServiceClient();

    const { data: latest } = await supabase
      .from("contract_revisions")
      .select("revision_no")
      .eq("contract_id", input.contract.id)
      .order("revision_no", { ascending: false })
      .limit(1)
      .maybeSingle<{ revision_no: number }>();

    await supabase.from("contract_revisions").insert({
      contract_id: input.contract.id,
      revision_no: (latest?.revision_no ?? 0) + 1,
      snapshot: toOpsContractSignableContent(input.contract),
      change_summary: input.changeSummary,
      changed_by: input.changedBy,
    });
  } catch (error) {
    logOpsServerError(error, {
      module: MODULE,
      action: "recordOpsContractRevision",
      entityId: input.contract.id,
    });
  }
}

function formatContractMoney(amount: number, currency: string) {
  return `${currency || "ZMW"} ${amount.toLocaleString("en-ZM", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ---------------------------------------------------------------------------
// Drafting
// ---------------------------------------------------------------------------

const createSchema = z.object({
  template_id: z.string().uuid("Choose a template."),
  kind: z.enum(["subcontract", "employment"]),
  counterparty_type: z.enum(["subcontractor", "employee"]),
  subcontractor_id: z.string().trim().default(""),
  employee_id: z.string().trim().default(""),
  title: z.string().trim().min(2, "Give the contract a title.").max(200),
  site_id: z.string().trim().default(""),
});

/**
 * Start a draft from a template.
 *
 * The template's clauses are COPIED into contract_clauses rather than
 * referenced, which is the whole of decision D2: HR edits their copy, the
 * master is untouched, and template_body_snapshot preserves what the clause
 * said when it was copied so the approver can diff against it later.
 */
export async function createOpsContractDraftAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = createSchema.safeParse({
    template_id: field(formData, "template_id"),
    kind: field(formData, "kind") || "subcontract",
    counterparty_type: field(formData, "counterparty_type") || "subcontractor",
    subcontractor_id: field(formData, "subcontractor_id"),
    employee_id: field(formData, "employee_id"),
    title: field(formData, "title"),
    site_id: field(formData, "site_id"),
  });

  if (!parsed.success) {
    contractError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  }

  const input = parsed.data;

  if (!canDraftOpsContractKind(profile.role, input.kind)) {
    contractError("Your role cannot draft this kind of contract.");
  }

  if (input.counterparty_type === "subcontractor" && !input.subcontractor_id) {
    contractError("Choose the subcontractor this contract is with.");
  }
  if (input.counterparty_type === "employee" && !input.employee_id) {
    contractError("Choose the employee this contract is with.");
  }

  const supabase = getOpsSupabaseServiceClient();

  const { data: template, error: templateError } = await supabase
    .from("contract_templates")
    .select(
      "id, version, kind, default_vat_percent, default_retention_percent, default_penalty_percent_per_week, default_penalty_cap_percent, default_warranty_months, default_defects_liability_months, default_variation_threshold_percent, default_payment_terms_days",
    )
    .eq("id", input.template_id)
    .maybeSingle();

  if (templateError || !template) {
    contractError("That template could not be found.");
  }

  if (template.kind !== input.kind) {
    contractError("That template is for a different kind of contract.");
  }

  const { data: contract, error } = await supabase
    .from("contracts")
    .insert({
      template_id: template.id,
      template_version: template.version,
      kind: input.kind,
      status: "draft" satisfies OpsContractStatus,
      counterparty_type: input.counterparty_type,
      subcontractor_id:
        input.counterparty_type === "subcontractor" ? input.subcontractor_id : null,
      employee_id: input.counterparty_type === "employee" ? input.employee_id : null,
      site_id: input.site_id || null,
      title: input.title,
      vat_percent: template.default_vat_percent,
      retention_percent: template.default_retention_percent,
      penalty_percent_per_week: template.default_penalty_percent_per_week,
      penalty_cap_percent: template.default_penalty_cap_percent,
      warranty_months: template.default_warranty_months,
      defects_liability_months: template.default_defects_liability_months,
      variation_threshold_percent: template.default_variation_threshold_percent,
      payment_terms_days: template.default_payment_terms_days,
      created_by: profile.id,
    })
    .select("id, contract_number")
    .single();

  if (error || !contract) {
    logOpsServerError(error, { module: MODULE, action: "createOpsContractDraft" });
    contractError(error?.message ?? "The contract could not be created.");
  }

  const templateClauses = await fetchOpsContractTemplateClauses(template.id);

  if (templateClauses.length > 0) {
    const { error: clauseError } = await supabase.from("contract_clauses").insert(
      templateClauses.map((clause) => ({
        contract_id: contract.id,
        section_key: clause.section_key,
        heading: clause.heading,
        body_markdown: clause.body_markdown,
        sort_order: clause.sort_order,
        is_required: clause.is_required,
        is_customised: false,
        template_body_snapshot: clause.body_markdown,
      })),
    );

    if (clauseError) {
      logOpsServerError(clauseError, {
        module: MODULE,
        action: "createOpsContractDraft.clauses",
        entityId: contract.id,
      });
    }
  }

  await recordOpsAuditEvent({
    action: "contract.created",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    metadata: { contract_number: contract.contract_number, kind: input.kind },
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} created contract ${contract.contract_number}`,
  }).catch(() => null);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}`);
}

/**
 * Auth + fetch + "is this actually editable" in one place.
 *
 * Every mutation below needs the same four checks, and repeating them was how
 * the clause editor ended up being the only guarded path in the first pass.
 */
async function loadEditableContract(contractId: string) {
  const { profile } = await requireOpsUser();
  const contract = await fetchOpsContractById(contractId);

  if (!contract) contractError("Contract not found.");
  if (!canDraftOpsContractKind(profile.role, contract.kind)) {
    contractError("Your role cannot edit this contract.", contract.id);
  }
  if (contract.status !== "draft") {
    contractError(
      "Only a draft can be edited. Raise an addendum to change an issued contract.",
      contract.id,
    );
  }

  return { contract, profile };
}

/**
 * Recompute the money after any change to the priced lines.
 *
 * Totals are derived, never typed. The source instrument had a hand-keyed total
 * that did not match its own line amounts, and a VAT row that said 16% next to
 * a blank figure — both are impossible once the arithmetic lives here.
 *
 * Milestone amounts are re-derived at the same time: a milestone is a
 * PERCENTAGE of the contract, so changing a rate has to flow through to the
 * payment plan or the two halves of the document disagree.
 */
async function recomputeOpsContractTotals(contractId: string) {
  const supabase = getOpsSupabaseServiceClient();

  const { data: lines } = await supabase
    .from("contract_lines")
    .select("amount")
    .eq("contract_id", contractId);

  const { data: contract } = await supabase
    .from("contracts")
    .select("vat_applicable, vat_percent")
    .eq("id", contractId)
    .maybeSingle<{ vat_applicable: boolean; vat_percent: number }>();

  const { subtotal, vatAmount, total } = computeOpsContractTotals({
    lineAmounts: (lines ?? []).map((line) => Number(line.amount ?? 0)),
    vatApplicable: Boolean(contract?.vat_applicable),
    vatPercent: Number(contract?.vat_percent ?? 0),
  });

  await supabase
    .from("contracts")
    .update({ subtotal, vat_amount: vatAmount, total_value: total })
    .eq("id", contractId);

  const { data: milestones } = await supabase
    .from("contract_milestones")
    .select("id, percent")
    .eq("contract_id", contractId);

  await Promise.all(
    (milestones ?? []).map((milestone) =>
      supabase
        .from("contract_milestones")
        .update({
          amount: opsContractMilestoneAmount(total, Number(milestone.percent ?? 0)),
        })
        .eq("id", milestone.id),
    ),
  );
}

const termsSchema = z.object({
  title: z.string().trim().min(2, "Give the contract a title.").max(200),
  work_order_number: z.string().trim().max(80).default(""),
  work_order_date: z.string().trim().default(""),
  preamble: z.string().trim().max(4000).default(""),
  scope_summary: z.string().trim().max(4000).default(""),
  site_id: z.string().trim().default(""),
  start_date: z.string().trim().default(""),
  end_date: z.string().trim().default(""),
  expected_start_date: z.string().trim().default(""),
  expected_finish_date: z.string().trim().default(""),
  duration_days: z.coerce.number().int().min(0).max(3650).default(0),
  vat_applicable: z.coerce.boolean().default(false),
  vat_percent: z.coerce.number().min(0).max(100).default(16),
  retention_percent: z.coerce.number().min(0).max(50).default(5),
  penalty_percent_per_week: z.coerce.number().min(0).max(100).default(0.3),
  penalty_cap_percent: z.coerce.number().min(0).max(100).default(3),
  variation_threshold_percent: z.coerce.number().min(0).max(100).default(10),
  warranty_months: z.coerce.number().int().min(0).max(120).default(6),
  defects_liability_months: z.coerce.number().int().min(0).max(120).default(1),
  min_workers: z.coerce.number().int().min(0).max(10000).default(0),
  payment_terms_days: z.coerce.number().int().min(0).max(365).default(14),
  roe_reference: z.string().trim().max(120).default(""),
});

function nullableDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** Edit the commercial terms and programme of a draft. */
export async function updateOpsContractTermsAction(formData: FormData) {
  const contractId = field(formData, "contract_id");
  const { contract, profile } = await loadEditableContract(contractId);

  const parsed = termsSchema.safeParse({
    title: field(formData, "title"),
    work_order_number: field(formData, "work_order_number"),
    work_order_date: field(formData, "work_order_date"),
    preamble: field(formData, "preamble"),
    scope_summary: field(formData, "scope_summary"),
    site_id: field(formData, "site_id"),
    start_date: field(formData, "start_date"),
    end_date: field(formData, "end_date"),
    expected_start_date: field(formData, "expected_start_date"),
    expected_finish_date: field(formData, "expected_finish_date"),
    duration_days: field(formData, "duration_days") || 0,
    vat_applicable: formData.get("vat_applicable") === "on",
    vat_percent: field(formData, "vat_percent") || 16,
    retention_percent: field(formData, "retention_percent") || 5,
    penalty_percent_per_week: field(formData, "penalty_percent_per_week") || 0.3,
    penalty_cap_percent: field(formData, "penalty_cap_percent") || 3,
    variation_threshold_percent: field(formData, "variation_threshold_percent") || 10,
    warranty_months: field(formData, "warranty_months") || 6,
    defects_liability_months: field(formData, "defects_liability_months") || 1,
    min_workers: field(formData, "min_workers") || 0,
    payment_terms_days: field(formData, "payment_terms_days") || 14,
    roe_reference: field(formData, "roe_reference"),
  });

  if (!parsed.success) {
    contractError(
      parsed.error.issues[0]?.message ?? "Check the terms and try again.",
      contract.id,
    );
  }

  const input = parsed.data;
  const startDate = nullableDate(input.start_date);
  const endDate = nullableDate(input.end_date);

  // Caught here rather than by the database CHECK so the user gets a sentence
  // instead of a constraint name.
  if (startDate && endDate && endDate < startDate) {
    contractError("The end date cannot be before the start date.", contract.id);
  }

  await recordOpsContractRevision({
    changedBy: profile.id,
    contract,
    changeSummary: "Updated the commercial terms and programme",
  });

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("contracts")
    .update({
      title: input.title,
      work_order_number: input.work_order_number,
      work_order_date: nullableDate(input.work_order_date),
      preamble: input.preamble,
      scope_summary: input.scope_summary,
      site_id: input.site_id || null,
      start_date: startDate,
      end_date: endDate,
      expected_start_date: nullableDate(input.expected_start_date),
      expected_finish_date: nullableDate(input.expected_finish_date),
      duration_days: input.duration_days,
      vat_applicable: input.vat_applicable,
      vat_percent: input.vat_percent,
      retention_percent: input.retention_percent,
      penalty_percent_per_week: input.penalty_percent_per_week,
      penalty_cap_percent: input.penalty_cap_percent,
      variation_threshold_percent: input.variation_threshold_percent,
      warranty_months: input.warranty_months,
      defects_liability_months: input.defects_liability_months,
      min_workers: input.min_workers,
      payment_terms_days: input.payment_terms_days,
      roe_reference: input.roe_reference,
    })
    .eq("id", contract.id);

  if (error) contractError(error.message, contract.id);

  // VAT applicability may have flipped, which changes the total.
  await recomputeOpsContractTotals(contract.id);

  await recordOpsAuditEvent({
    action: "contract.terms_updated",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} updated the terms of ${contract.contract_number}`,
  }).catch(() => null);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=terms`);
}

// ---------------------------------------------------------------------------
// Scope items
// ---------------------------------------------------------------------------

export async function addOpsContractScopeItemAction(formData: FormData) {
  const contractId = field(formData, "contract_id");
  const { contract } = await loadEditableContract(contractId);

  const heading = field(formData, "heading").trim();
  if (heading.length < 2) {
    contractError("Give the scope item a heading.", contract.id);
  }

  const supabase = getOpsSupabaseServiceClient();
  await supabase.from("contract_scope_items").insert({
    contract_id: contract.id,
    heading,
    detail: field(formData, "detail").trim().slice(0, 4000),
    sort_order: contract.scope_items.length + 1,
  });

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=scope`);
}

export async function updateOpsContractScopeItemAction(formData: FormData) {
  const contractId = field(formData, "contract_id");
  const { contract } = await loadEditableContract(contractId);
  const itemId = field(formData, "item_id");

  const heading = field(formData, "heading").trim();
  if (heading.length < 2) {
    contractError("Give the scope item a heading.", contract.id);
  }

  const supabase = getOpsSupabaseServiceClient();
  await supabase
    .from("contract_scope_items")
    .update({ heading, detail: field(formData, "detail").trim().slice(0, 4000) })
    .eq("id", itemId)
    .eq("contract_id", contract.id);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=scope`);
}

/**
 * Move a row up or down within its contract.
 *
 * Order is meaningful on a contract — scope items are referred to by number and
 * milestones are a sequence of events — so it has to be changeable without
 * deleting and re-adding, which would lose a certified milestone's history.
 *
 * Implemented as a swap of two `sort_order` values rather than a renumber, so
 * two people reordering at once cannot collapse the list into a single index.
 */
async function moveOpsContractRow(input: {
  contractId: string;
  direction: "up" | "down";
  rowId: string;
  table: "contract_scope_items" | "contract_lines" | "contract_milestones";
}) {
  const supabase = getOpsSupabaseServiceClient();

  const { data: rows } = await supabase
    .from(input.table)
    .select("id, sort_order")
    .eq("contract_id", input.contractId)
    .order("sort_order", { ascending: true });

  const ordered = rows ?? [];
  const index = ordered.findIndex((row) => row.id === input.rowId);
  if (index < 0) return;

  const swapWith = input.direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= ordered.length) return;

  const current = ordered[index];
  const neighbour = ordered[swapWith];

  // Equal sort_orders would make the swap a no-op and silently strand the row,
  // so fall back to positional indices when the data has duplicates.
  const currentOrder = Number(current.sort_order ?? index);
  const neighbourOrder = Number(neighbour.sort_order ?? swapWith);
  const [nextCurrent, nextNeighbour] =
    currentOrder === neighbourOrder
      ? [swapWith + 1, index + 1]
      : [neighbourOrder, currentOrder];

  await Promise.all([
    supabase.from(input.table).update({ sort_order: nextCurrent }).eq("id", current.id),
    supabase
      .from(input.table)
      .update({ sort_order: nextNeighbour })
      .eq("id", neighbour.id),
  ]);
}

function moveDirection(formData: FormData): "up" | "down" {
  return field(formData, "direction") === "up" ? "up" : "down";
}

export async function moveOpsContractScopeItemAction(formData: FormData) {
  const contractId = field(formData, "contract_id");
  const { contract } = await loadEditableContract(contractId);

  await moveOpsContractRow({
    contractId: contract.id,
    direction: moveDirection(formData),
    rowId: field(formData, "item_id"),
    table: "contract_scope_items",
  });

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=scope`);
}

export async function deleteOpsContractScopeItemAction(formData: FormData) {
  const contractId = field(formData, "contract_id");
  const { contract } = await loadEditableContract(contractId);
  const itemId = field(formData, "item_id");

  // Scoped by contract_id as well as row id: without it, a crafted form could
  // delete a scope item off a contract the caller cannot edit.
  const supabase = getOpsSupabaseServiceClient();
  await supabase
    .from("contract_scope_items")
    .delete()
    .eq("id", itemId)
    .eq("contract_id", contract.id);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=scope_removed`);
}

// ---------------------------------------------------------------------------
// Priced lines
// ---------------------------------------------------------------------------

const lineSchema = z.object({
  description: z.string().trim().min(2, "Describe the line item.").max(500),
  quantity: z.coerce.number().min(0).max(1_000_000).default(1),
  uom: z.string().trim().max(40).default("Item"),
  rate: z.coerce.number().min(0).max(1_000_000_000).default(0),
  cost_code_id: z.string().trim().default(""),
});

export async function addOpsContractLineAction(formData: FormData) {
  const contractId = field(formData, "contract_id");
  const { contract } = await loadEditableContract(contractId);

  const parsed = lineSchema.safeParse({
    description: field(formData, "description"),
    quantity: field(formData, "quantity") || 1,
    uom: field(formData, "uom") || "Item",
    rate: field(formData, "rate") || 0,
    cost_code_id: field(formData, "cost_code_id"),
  });

  if (!parsed.success) {
    contractError(
      parsed.error.issues[0]?.message ?? "Check the line and try again.",
      contract.id,
    );
  }

  const input = parsed.data;

  const supabase = getOpsSupabaseServiceClient();
  await supabase.from("contract_lines").insert({
    contract_id: contract.id,
    description: input.description,
    quantity: input.quantity,
    uom: input.uom,
    rate: input.rate,
    // Amount is computed, not accepted from the form — a typed amount that
    // disagreed with qty x rate is exactly the defect in the source document.
    amount: roundOpsMoney(input.quantity * input.rate),
    cost_code_id: input.cost_code_id || null,
    sort_order: contract.lines.length + 1,
  });

  await recomputeOpsContractTotals(contract.id);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=line`);
}

export async function updateOpsContractLineAction(formData: FormData) {
  const contractId = field(formData, "contract_id");
  const { contract } = await loadEditableContract(contractId);
  const lineId = field(formData, "line_id");

  const parsed = lineSchema.safeParse({
    description: field(formData, "description"),
    quantity: field(formData, "quantity") || 0,
    uom: field(formData, "uom") || "Item",
    rate: field(formData, "rate") || 0,
    cost_code_id: field(formData, "cost_code_id"),
  });

  if (!parsed.success) {
    contractError(
      parsed.error.issues[0]?.message ?? "Check the line and try again.",
      contract.id,
    );
  }

  const input = parsed.data;

  const supabase = getOpsSupabaseServiceClient();
  await supabase
    .from("contract_lines")
    .update({
      description: input.description,
      quantity: input.quantity,
      uom: input.uom,
      rate: input.rate,
      // Recomputed here too, never taken from the form.
      amount: roundOpsMoney(input.quantity * input.rate),
    })
    .eq("id", lineId)
    .eq("contract_id", contract.id);

  await recomputeOpsContractTotals(contract.id);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=line`);
}

export async function moveOpsContractLineAction(formData: FormData) {
  const contractId = field(formData, "contract_id");
  const { contract } = await loadEditableContract(contractId);

  await moveOpsContractRow({
    contractId: contract.id,
    direction: moveDirection(formData),
    rowId: field(formData, "line_id"),
    table: "contract_lines",
  });

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=line`);
}

export async function deleteOpsContractLineAction(formData: FormData) {
  const contractId = field(formData, "contract_id");
  const { contract } = await loadEditableContract(contractId);

  const supabase = getOpsSupabaseServiceClient();
  await supabase
    .from("contract_lines")
    .delete()
    .eq("id", field(formData, "line_id"))
    .eq("contract_id", contract.id);

  await recomputeOpsContractTotals(contract.id);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=line_removed`);
}

// ---------------------------------------------------------------------------
// Payment milestones
// ---------------------------------------------------------------------------

const milestoneSchema = z.object({
  label: z.string().trim().min(2, "Name the payment stage.").max(200),
  percent: z.coerce.number().min(0).max(100),
  trigger_description: z.string().trim().max(1000).default(""),
  payable_within_days: z.coerce.number().int().min(0).max(365).default(14),
  is_retention: z.boolean().default(false),
});

export async function addOpsContractMilestoneAction(formData: FormData) {
  const contractId = field(formData, "contract_id");
  const { contract } = await loadEditableContract(contractId);

  const parsed = milestoneSchema.safeParse({
    label: field(formData, "label"),
    percent: field(formData, "percent") || 0,
    trigger_description: field(formData, "trigger_description"),
    payable_within_days: field(formData, "payable_within_days") || 14,
    is_retention: formData.get("is_retention") === "on",
  });

  if (!parsed.success) {
    contractError(
      parsed.error.issues[0]?.message ?? "Check the milestone and try again.",
      contract.id,
    );
  }

  const input = parsed.data;

  const runningTotal = contract.milestones.reduce(
    (sum, milestone) => sum + Number(milestone.percent ?? 0),
    0,
  );

  // Blocked at entry rather than only at submission: discovering at the end
  // that the plan adds to 115% means re-editing every stage.
  if (runningTotal + input.percent > 100.01) {
    contractError(
      `That would take the payment plan to ${(runningTotal + input.percent).toFixed(1)}%. ${(100 - runningTotal).toFixed(1)}% is unallocated.`,
      contract.id,
    );
  }

  const supabase = getOpsSupabaseServiceClient();
  await supabase.from("contract_milestones").insert({
    contract_id: contract.id,
    label: input.label,
    percent: input.percent,
    amount: opsContractMilestoneAmount(Number(contract.total_value ?? 0), input.percent),
    trigger_description: input.trigger_description,
    payable_within_days: input.payable_within_days,
    is_retention: input.is_retention,
    sort_order: contract.milestones.length + 1,
  });

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=milestone`);
}

export async function updateOpsContractMilestoneAction(formData: FormData) {
  const contractId = field(formData, "contract_id");
  const { contract } = await loadEditableContract(contractId);
  const milestoneId = field(formData, "milestone_id");

  const existing = contract.milestones.find((row) => row.id === milestoneId);
  if (!existing) contractError("That milestone is not on this contract.", contract.id);

  const parsed = milestoneSchema.safeParse({
    label: field(formData, "label"),
    percent: field(formData, "percent") || 0,
    trigger_description: field(formData, "trigger_description"),
    payable_within_days: field(formData, "payable_within_days") || 14,
    is_retention: formData.get("is_retention") === "on",
  });

  if (!parsed.success) {
    contractError(
      parsed.error.issues[0]?.message ?? "Check the milestone and try again.",
      contract.id,
    );
  }

  const input = parsed.data;

  // The running total excludes this milestone's own current share, or editing
  // 30% to 31% would read as 131% and be refused.
  const othersTotal = contract.milestones
    .filter((row) => row.id !== milestoneId)
    .reduce((sum, row) => sum + Number(row.percent ?? 0), 0);

  if (othersTotal + input.percent > 100.01) {
    contractError(
      `That would take the payment plan to ${(othersTotal + input.percent).toFixed(1)}%. ${(100 - othersTotal).toFixed(1)}% is available for this stage.`,
      contract.id,
    );
  }

  const supabase = getOpsSupabaseServiceClient();
  await supabase
    .from("contract_milestones")
    .update({
      label: input.label,
      percent: input.percent,
      amount: opsContractMilestoneAmount(Number(contract.total_value ?? 0), input.percent),
      trigger_description: input.trigger_description,
      payable_within_days: input.payable_within_days,
      is_retention: input.is_retention,
    })
    .eq("id", milestoneId)
    .eq("contract_id", contract.id);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=milestone`);
}

export async function moveOpsContractMilestoneAction(formData: FormData) {
  const contractId = field(formData, "contract_id");
  const { contract } = await loadEditableContract(contractId);

  await moveOpsContractRow({
    contractId: contract.id,
    direction: moveDirection(formData),
    rowId: field(formData, "milestone_id"),
    table: "contract_milestones",
  });

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=milestone`);
}

export async function deleteOpsContractMilestoneAction(formData: FormData) {
  const contractId = field(formData, "contract_id");
  const { contract } = await loadEditableContract(contractId);

  const supabase = getOpsSupabaseServiceClient();
  await supabase
    .from("contract_milestones")
    .delete()
    .eq("id", field(formData, "milestone_id"))
    .eq("contract_id", contract.id);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=milestone_removed`);
}

const clauseSchema = z.object({
  clause_id: z.string().uuid(),
  contract_id: z.string().uuid(),
  heading: z.string().trim().max(200).default(""),
  body_markdown: z.string().trim().max(20000).default(""),
});

/**
 * Edit one clause on one contract (D2).
 *
 * is_customised is derived by comparing against template_body_snapshot rather
 * than being set blindly, so editing a clause back to the template wording
 * correctly clears the flag — otherwise a reviewer chases a diff that no longer
 * exists.
 */
export async function updateOpsContractClauseAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = clauseSchema.safeParse({
    clause_id: field(formData, "clause_id"),
    contract_id: field(formData, "contract_id"),
    heading: field(formData, "heading"),
    body_markdown: field(formData, "body_markdown"),
  });

  if (!parsed.success) {
    contractError("That clause edit could not be saved.");
  }

  const input = parsed.data;
  const contract = await fetchOpsContractById(input.contract_id);

  if (!contract) contractError("Contract not found.");
  if (!canDraftOpsContractKind(profile.role, contract.kind)) {
    contractError("Your role cannot edit this contract.", contract.id);
  }
  if (contract.status !== "draft") {
    contractError(
      "Only a draft can be edited. Raise an addendum to change an issued contract.",
      contract.id,
    );
  }

  const clause = contract.clauses.find((row) => row.id === input.clause_id);
  if (!clause) contractError("That clause is not on this contract.", contract.id);

  // Snapshot BEFORE the write, so the revision holds the previous wording.
  await recordOpsContractRevision({
    changedBy: profile.id,
    contract,
    changeSummary: `Edited the "${clause.heading || clause.section_key}" clause`,
  });

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("contract_clauses")
    .update({
      heading: input.heading,
      body_markdown: input.body_markdown,
      is_customised: input.body_markdown.trim() !== clause.template_body_snapshot.trim(),
    })
    .eq("id", clause.id);

  if (error) {
    logOpsServerError(error, {
      module: MODULE,
      action: "updateOpsContractClause",
      entityId: contract.id,
    });
    contractError(error.message, contract.id);
  }

  await recordOpsAuditEvent({
    action: "contract.clause_edited",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    metadata: { section_key: clause.section_key },
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} edited the "${clause.heading || clause.section_key}" clause on ${contract.contract_number}`,
  }).catch(() => null);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=clause`);
}

/** Put a clause back to the template wording. */
export async function resetOpsContractClauseAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const clauseId = field(formData, "clause_id");
  const contractId = field(formData, "contract_id");

  const contract = await fetchOpsContractById(contractId);
  if (!contract) contractError("Contract not found.");
  if (!canDraftOpsContractKind(profile.role, contract.kind)) {
    contractError("Your role cannot edit this contract.", contract.id);
  }
  if (contract.status !== "draft") {
    contractError("Only a draft can be edited.", contract.id);
  }

  const clause = contract.clauses.find((row) => row.id === clauseId);
  if (!clause) contractError("That clause is not on this contract.", contract.id);

  const supabase = getOpsSupabaseServiceClient();
  await supabase
    .from("contract_clauses")
    .update({
      body_markdown: clause.template_body_snapshot,
      is_customised: false,
    })
    .eq("id", clause.id);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=clause_reset`);
}

// ---------------------------------------------------------------------------
// Review and approval
// ---------------------------------------------------------------------------

export async function submitOpsContractForReviewAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const contractId = field(formData, "contract_id");

  const contract = await fetchOpsContractById(contractId);
  if (!contract) contractError("Contract not found.");
  if (!canDraftOpsContractKind(profile.role, contract.kind)) {
    contractError("Your role cannot submit this contract.", contract.id);
  }
  if (contract.status !== "draft") {
    contractError("Only a draft can be submitted for review.", contract.id);
  }

  // Milestone percentages are checked here rather than by a database
  // constraint: a milestone set is legitimately incomplete while someone is
  // still typing it, and only submission is the moment it must add up.
  if (contract.milestones.length > 0) {
    const total = contract.milestones.reduce(
      (sum, milestone) => sum + Number(milestone.percent ?? 0),
      0,
    );
    if (Math.abs(total - 100) > 0.01) {
      contractError(
        `The payment milestones total ${total.toFixed(1)}%, not 100%.`,
        contract.id,
      );
    }
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("contracts")
    .update({ status: "in_review" satisfies OpsContractStatus })
    .eq("id", contract.id);

  if (error) contractError(error.message, contract.id);

  const customised = contract.clauses.filter((clause) => clause.is_customised);

  const recipients = await fanoutToOpsAudiences({
    actionNeeded: ["managing_director", "general_manager", "owner"],
    stakeholders: ["operations_manager", "quantity_surveyor"],
    excludeUserIds: [profile.id],
  });

  await Promise.all(
    recipients.map((recipient) =>
      queueOpsNotification({
        actionHref: `${ROUTE}/${contract.id}`,
        body:
          customised.length > 0
            ? `${customised.length} clause(s) were customised and need review.`
            : "Standard template wording, no clauses customised.",
        moduleKey: MODULE,
        recipientId: recipient.id,
        sourceId: contract.id,
        sourceTable: "contracts",
        title: `Contract ${contract.contract_number} needs review`,
      }).catch(() => null),
    ),
  );

  await recordOpsAuditEvent({
    action: "contract.submitted",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    metadata: { customised_clauses: customised.length },
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} submitted ${contract.contract_number} for review`,
  }).catch(() => null);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=submitted`);
}

/**
 * The counterparty's details as at approval, for the "TO" panel on the PDF.
 *
 * Reads whichever register the contract points at. Missing fields are stored as
 * empty strings rather than omitted, so a later reader can tell "we had no TPIN
 * for them" apart from "this snapshot predates the TPIN field".
 */
async function buildCounterpartySnapshot(contract: {
  counterparty_type: string;
  subcontractor_id: string | null;
  employee_id: string | null;
  counterparty_name: string;
}) {
  const supabase = getOpsSupabaseServiceClient();

  if (contract.counterparty_type === "subcontractor" && contract.subcontractor_id) {
    const { data } = await supabase
      .from("subcontractors")
      .select(
        "company_name, contact_name, contact_phone, contact_email, tpin, registration_number",
      )
      .eq("id", contract.subcontractor_id)
      .maybeSingle();

    return {
      name: data?.company_name ?? contract.counterparty_name,
      address: "",
      tpin: data?.tpin ?? "",
      contact_name: data?.contact_name ?? "",
      contact_phone: data?.contact_phone ?? "",
      contact_email: data?.contact_email ?? "",
      registration_number: data?.registration_number ?? "",
    };
  }

  if (contract.employee_id) {
    const { data } = await supabase
      .from("employees")
      .select("full_name, phone, email")
      .eq("id", contract.employee_id)
      .maybeSingle();

    return {
      name: data?.full_name ?? contract.counterparty_name,
      address: "",
      tpin: "",
      contact_name: data?.full_name ?? "",
      contact_phone: data?.phone ?? "",
      contact_email: data?.email ?? "",
      registration_number: "",
    };
  }

  return { name: contract.counterparty_name };
}

/** Our own details as at approval, for the "FROM" panel. */
async function buildOrgSnapshot() {
  const org = await fetchOpsOrganizationProfile().catch(() => null);
  if (!org) return {};

  return {
    legal_name: org.legal_name,
    trading_name: org.trading_name,
    headquarters_address: [org.address_line, org.city, org.country]
      .filter((part) => Boolean(part && String(part).trim()))
      .join(", "),
    tpin: org.tpin,
    email: org.email,
    phone: org.phone_primary,
  };
}

/**
 * Approve, and open the signature slots.
 *
 * The internal panel is HR, the General Manager and the Managing Director, in
 * that order. Rows are created here rather than at draft time so a contract
 * that never gets approved never carries a pending signature nobody owes.
 */
export async function approveOpsContractAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const contractId = field(formData, "contract_id");

  const contract = await fetchOpsContractById(contractId);
  if (!contract) contractError("Contract not found.");
  if (!canApproveOpsContract(profile.role)) {
    contractError("Your role cannot approve contracts.", contract.id);
  }
  if (!canReviewOpsContract(profile.role)) {
    contractError("Your role cannot review contracts.", contract.id);
  }
  if (contract.status !== "in_review") {
    contractError("Only a contract in review can be approved.", contract.id);
  }

  // The hard gate. Approval is the last door before signature, so an
  // unreviewed clause set stops here rather than reaching an employee's desk
  // looking finished. A warning banner would not do — people stop seeing those.
  if (contract.template_requires_legal_review) {
    contractError(
      `The "${contract.template_name}" template has not been reviewed by counsel, so contracts on it cannot be approved. Record the review on the template first.`,
      contract.id,
    );
  }

  const supabase = getOpsSupabaseServiceClient();

  // Freeze the parties at approval.
  //
  // Until this runs the contract renders from live joins, so tidying the
  // subcontractor register or correcting the company address would silently
  // rewrite an executed agreement. Approval is the right moment: it is the last
  // point before signatures attach, and the wording stops moving here anyway.
  const counterpartySnapshot = await buildCounterpartySnapshot(contract);
  const orgSnapshot = await buildOrgSnapshot();

  const { error } = await supabase
    .from("contracts")
    .update({
      status: "approved" satisfies OpsContractStatus,
      approved_at: new Date().toISOString(),
      approved_by: profile.id,
      counterparty_snapshot: counterpartySnapshot,
      org_snapshot: orgSnapshot,
    })
    .eq("id", contract.id);

  if (error) contractError(error.message, contract.id);

  const { error: slotError } = await supabase.from("contract_signatures").upsert(
    OPS_CONTRACT_INTERNAL_SIGNATORIES.map((role, index) => ({
      contract_id: contract.id,
      signatory_role: role,
      sequence: index + 1,
      is_required: true,
    })),
    { onConflict: "contract_id,signatory_role" },
  );

  if (slotError) {
    logOpsServerError(slotError, {
      module: MODULE,
      action: "approveOpsContract.slots",
      entityId: contract.id,
    });
  }

  // Commit the value against the project budget. Best-effort: a contract is a
  // valid agreement whether or not the budget line took the commitment, so a
  // failure here logs and continues rather than blocking approval.
  const commitment = await postOpsContractCommitment({
    actorUserId: profile.id,
    contract,
  });

  const signatories = await fanoutToOpsAudiences({
    actionNeeded: ["human_resource", "hr", "general_manager", "managing_director"],
    extraUserIds: [contract.created_by],
    excludeUserIds: [profile.id],
  });

  await Promise.all(
    signatories.map((recipient) =>
      queueOpsNotification({
        actionHref: `${ROUTE}/${contract.id}`,
        body: "Approved and open for signature. Sign with your own signature from the contract page.",
        moduleKey: MODULE,
        recipientId: recipient.id,
        sourceId: contract.id,
        sourceTable: "contracts",
        title: `${contract.contract_number} is ready to sign`,
      }).catch(() => null),
    ),
  );

  await recordOpsAuditEvent({
    action: "contract.approved",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    metadata: {
      commitment_posted: commitment.ok,
      commitment_skipped_because: commitment.ok ? null : commitment.reason,
    },
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} approved ${contract.contract_number}`,
  }).catch(() => null);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=approved`);
}

/**
 * Record that counsel has reviewed a template's wording, lifting the gate.
 *
 * Leadership only, and it asks for a note naming who reviewed it and when —
 * "approved by someone, at some point" is not a record anybody can rely on
 * later. Lifting the gate affects every future contract on the template, which
 * is why it is a deliberate act on the template rather than a per-contract
 * override somebody could click past.
 */
export async function recordOpsContractTemplateReviewAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const templateId = field(formData, "template_id");
  const note = field(formData, "legal_review_note").trim();

  if (!canApproveOpsContract(profile.role)) {
    contractError("Your role cannot record a legal review.");
  }
  if (note.length < 8) {
    contractError("Say who reviewed the wording and when.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: template, error } = await supabase
    .from("contract_templates")
    .update({
      requires_legal_review: false,
      legal_reviewed_at: new Date().toISOString(),
      legal_reviewed_by: profile.id,
      legal_review_note: note,
    })
    .eq("id", templateId)
    .select("template_code, name")
    .single<{ template_code: string; name: string }>();

  if (error || !template) {
    contractError(error?.message ?? "That template could not be updated.");
  }

  await recordOpsAuditEvent({
    action: "contract_template.legal_reviewed",
    actorUserId: profile.id,
    entityId: templateId,
    entityType: "contract_template",
    metadata: { template_code: template.template_code, note },
    moduleKey: MODULE,
    sourceId: templateId,
    sourceTable: "contract_templates",
    summary: `${profile.full_name} recorded legal review of the ${template.name} template`,
  }).catch(() => null);

  revalidateContract();
  redirect(`${ROUTE}?updated=template_reviewed`);
}

// ---------------------------------------------------------------------------
// Certification and completion
// ---------------------------------------------------------------------------

/**
 * Certify a milestone as complete, which raises the payable.
 *
 * This is the moment a contract becomes money. It does NOT post a journal:
 * certification creates a claim in the payables queue, and the existing Finance
 * approval decides when it becomes an accounting fact. A site engineer
 * certifying work should not be able to move the general ledger.
 */
export async function certifyOpsContractMilestoneAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const contractId = field(formData, "contract_id");
  const milestoneId = field(formData, "milestone_id");

  const contract = await fetchOpsContractById(contractId);
  if (!contract) contractError("Contract not found.");

  if (!canCertifyOpsContractMilestone(profile.role)) {
    contractError("Your role cannot certify contract milestones.", contract.id);
  }
  if (!["active", "signed"].includes(contract.status)) {
    contractError(
      "Only a live contract can have milestones certified. Record the countersigned copy first.",
      contract.id,
    );
  }

  const milestone = contract.milestones.find((row) => row.id === milestoneId);
  if (!milestone) contractError("That milestone is not on this contract.", contract.id);
  if (milestone.status !== "pending") {
    contractError("That milestone has already been certified.", contract.id);
  }

  // Retention is released, not certified — it falls due after the defects
  // liability period, and releasing it early is precisely the mistake the
  // retention exists to prevent.
  if (milestone.is_retention && !contract.completed_at) {
    contractError(
      "Retention is released after completion and the defects liability period, not certified as a stage.",
      contract.id,
    );
  }

  const supabase = getOpsSupabaseServiceClient();

  const { error } = await supabase
    .from("contract_milestones")
    .update({
      status: "certified",
      certified_at: new Date().toISOString(),
      certified_by: profile.id,
    })
    .eq("id", milestone.id)
    .eq("status", "pending");

  if (error) contractError("The milestone could not be certified.", contract.id);

  const payable = await raiseOpsContractMilestonePayable({
    actorUserId: profile.id,
    contract,
    milestone,
  });

  if (payable.ok) {
    await supabase
      .from("contract_milestones")
      .update({ status: "invoiced" })
      .eq("id", milestone.id);
  }

  const recipients = await fanoutToOpsAudiences({
    actionNeeded: ["finance_manager", "accountant"],
    oversight: ["managing_director", "general_manager"],
    excludeUserIds: [profile.id],
  });

  await Promise.all(
    recipients.map((recipient) =>
      queueOpsNotification({
        actionHref: payable.ok ? "/ops/payment-requests?status=submitted" : `${ROUTE}/${contract.id}`,
        body: payable.ok
          ? `${formatContractMoney(Number(milestone.amount ?? 0), contract.currency_code)} is now in the payables queue.`
          : `Certified, but no payable was raised (${payable.reason}). Raise it manually.`,
        moduleKey: MODULE,
        recipientId: recipient.id,
        sourceId: contract.id,
        sourceTable: "contracts",
        title: `${contract.contract_number} — ${milestone.label} certified`,
      }).catch(() => null),
    ),
  );

  await recordOpsAuditEvent({
    action: "contract.milestone_certified",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    metadata: {
      milestone: milestone.label,
      amount: Number(milestone.amount ?? 0),
      payable_raised: payable.ok,
    },
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} certified ${milestone.label} on ${contract.contract_number}`,
  }).catch(() => null);

  revalidateContract(contract.id);
  revalidatePath("/ops/payment-requests");
  redirect(
    `${ROUTE}/${contract.id}?updated=${payable.ok ? "certified" : "certified_no_payable"}`,
  );
}

/**
 * Mark the works complete.
 *
 * This starts two clocks that nothing else starts: the defects liability period
 * after which retention is released, and the warranty. Both are computed here
 * rather than left for someone to remember, because "someone remembers" is
 * exactly how retention goes unclaimed.
 */
export async function completeOpsContractAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const contractId = field(formData, "contract_id");

  const contract = await fetchOpsContractById(contractId);
  if (!contract) contractError("Contract not found.");
  if (!canCertifyOpsContractMilestone(profile.role)) {
    contractError("Your role cannot complete contracts.", contract.id);
  }
  if (contract.status !== "active") {
    contractError("Only an active contract can be completed.", contract.id);
  }

  const completedAt = new Date();
  const releaseDue = new Date(completedAt);
  releaseDue.setMonth(releaseDue.getMonth() + Number(contract.defects_liability_months ?? 0));

  const supabase = getOpsSupabaseServiceClient();

  await supabase
    .from("contracts")
    .update({
      status: "completed" satisfies OpsContractStatus,
      completed_at: completedAt.toISOString(),
    })
    .eq("id", contract.id);

  // Date the retention release so the daily sweep can chase it.
  await supabase
    .from("contract_milestones")
    .update({ release_due_date: releaseDue.toISOString().slice(0, 10) })
    .eq("contract_id", contract.id)
    .eq("is_retention", true)
    .neq("status", "paid");

  await recordOpsAuditEvent({
    action: "contract.completed",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    metadata: { retention_release_due: releaseDue.toISOString().slice(0, 10) },
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} marked ${contract.contract_number} complete`,
  }).catch(() => null);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=completed`);
}

/**
 * Release retention once the defects liability period has run.
 *
 * Deliberately separate from certification: this is the one payment that must
 * not be raised on the same click as the work being signed off.
 */
export async function releaseOpsContractRetentionAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const contractId = field(formData, "contract_id");
  const milestoneId = field(formData, "milestone_id");

  const contract = await fetchOpsContractById(contractId);
  if (!contract) contractError("Contract not found.");
  if (!canCertifyOpsContractMilestone(profile.role)) {
    contractError("Your role cannot release retention.", contract.id);
  }
  if (!contract.completed_at) {
    contractError("Retention is released after the contract is completed.", contract.id);
  }

  const milestone = contract.milestones.find((row) => row.id === milestoneId);
  if (!milestone || !milestone.is_retention) {
    contractError("That is not the retention on this contract.", contract.id);
  }
  if (milestone.status !== "pending") {
    contractError("That retention has already been released.", contract.id);
  }

  const supabase = getOpsSupabaseServiceClient();
  await supabase
    .from("contract_milestones")
    .update({
      status: "certified",
      certified_at: new Date().toISOString(),
      certified_by: profile.id,
    })
    .eq("id", milestone.id)
    .eq("status", "pending");

  const payable = await raiseOpsContractMilestonePayable({
    actorUserId: profile.id,
    contract,
    milestone,
  });

  if (payable.ok) {
    await supabase
      .from("contract_milestones")
      .update({ status: "invoiced" })
      .eq("id", milestone.id);
  }

  await recordOpsAuditEvent({
    action: "contract.retention_released",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    metadata: { amount: Number(milestone.amount ?? 0), payable_raised: payable.ok },
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} released retention on ${contract.contract_number}`,
  }).catch(() => null);

  revalidateContract(contract.id);
  revalidatePath("/ops/payment-requests");
  redirect(`${ROUTE}/${contract.id}?updated=retention_released`);
}

/**
 * Raise an addendum against an issued contract.
 *
 * An issued contract is immutable — that is what makes a signature mean
 * anything. A variation therefore becomes a CHILD contract rather than an edit,
 * which is also how the parent's signatures stay valid: they still attest to
 * the wording they were taken against.
 *
 * The child starts as a draft with the parent's clauses copied in, so an
 * addendum that only changes the price still carries the terms it inherits.
 */
export async function createOpsContractAddendumAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const contractId = field(formData, "contract_id");

  const parent = await fetchOpsContractById(contractId);
  if (!parent) contractError("Contract not found.");
  if (!canDraftOpsContractKind(profile.role, parent.kind)) {
    contractError("Your role cannot raise an addendum.", parent.id);
  }
  if (!["issued", "signed", "active"].includes(parent.status)) {
    contractError(
      "An addendum varies a live contract. Edit the draft directly instead.",
      parent.id,
    );
  }
  if (parent.parent_contract_id) {
    contractError(
      "Raise the addendum against the original contract, not against another addendum.",
      parent.id,
    );
  }

  const supabase = getOpsSupabaseServiceClient();

  const { data: siblings } = await supabase
    .from("contracts")
    .select("addendum_number")
    .eq("parent_contract_id", parent.id)
    .order("addendum_number", { ascending: false })
    .limit(1);

  const nextNumber = Number(siblings?.[0]?.addendum_number ?? 0) + 1;

  const { data: child, error } = await supabase
    .from("contracts")
    .insert({
      template_id: parent.template_id,
      template_version: parent.template_version,
      kind: parent.kind,
      status: "draft" satisfies OpsContractStatus,
      counterparty_type: parent.counterparty_type,
      subcontractor_id: parent.subcontractor_id,
      employee_id: parent.employee_id,
      site_id: parent.site_id,
      cost_code_id: parent.cost_code_id,
      parent_contract_id: parent.id,
      addendum_number: nextNumber,
      title: `Addendum ${nextNumber} to ${parent.contract_number} — ${parent.title}`,
      // Terms are inherited, then edited. Starting from the parent's numbers
      // means an addendum that changes only the price does not silently reset
      // the penalty regime to template defaults.
      currency_code: parent.currency_code,
      vat_applicable: parent.vat_applicable,
      vat_percent: parent.vat_percent,
      retention_percent: parent.retention_percent,
      penalty_percent_per_week: parent.penalty_percent_per_week,
      penalty_cap_percent: parent.penalty_cap_percent,
      variation_threshold_percent: parent.variation_threshold_percent,
      warranty_months: parent.warranty_months,
      defects_liability_months: parent.defects_liability_months,
      min_workers: parent.min_workers,
      payment_terms_days: parent.payment_terms_days,
      created_by: profile.id,
    })
    .select("id, contract_number")
    .single<{ id: string; contract_number: string }>();

  if (error || !child) {
    logOpsServerError(error, { module: MODULE, action: "createOpsContractAddendum" });
    contractError(error?.message ?? "The addendum could not be created.", parent.id);
  }

  if (parent.clauses.length > 0) {
    await supabase.from("contract_clauses").insert(
      parent.clauses.map((clause) => ({
        contract_id: child.id,
        section_key: clause.section_key,
        heading: clause.heading,
        body_markdown: clause.body_markdown,
        sort_order: clause.sort_order,
        is_required: clause.is_required,
        // The parent's wording becomes this addendum's baseline, so the diff
        // shown to an approver is "what changed from the contract being
        // varied" rather than "what changed from the master template".
        is_customised: false,
        template_body_snapshot: clause.body_markdown,
      })),
    );
  }

  await recordOpsAuditEvent({
    action: "contract.addendum_created",
    actorUserId: profile.id,
    entityId: child.id,
    entityType: "contract",
    metadata: { parent: parent.contract_number, addendum_number: nextNumber },
    moduleKey: MODULE,
    sourceId: child.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} raised addendum ${nextNumber} to ${parent.contract_number}`,
  }).catch(() => null);

  revalidateContract(parent.id);
  redirect(`${ROUTE}/${child.id}?updated=addendum`);
}

/** Terminate a live contract and stand down its budget commitment. */
export async function terminateOpsContractAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const contractId = field(formData, "contract_id");
  const reason = field(formData, "termination_reason").trim();

  const contract = await fetchOpsContractById(contractId);
  if (!contract) contractError("Contract not found.");
  if (!canTerminateOpsContract(profile.role)) {
    contractError("Your role cannot terminate contracts.", contract.id);
  }
  if (reason.length < 4) {
    contractError("Give a reason for terminating this contract.", contract.id);
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("contracts")
    .update({
      status: "terminated" satisfies OpsContractStatus,
      terminated_at: new Date().toISOString(),
      termination_reason: reason,
    })
    .eq("id", contract.id);

  if (error) contractError(error.message, contract.id);

  // The promised money is no longer promised. Cancelled, not deleted, so the
  // budget can still answer "what happened to that commitment?".
  await cancelOpsContractCommitment(contract);

  await recordOpsAuditEvent({
    action: "contract.terminated",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    metadata: { reason },
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} terminated ${contract.contract_number}`,
  }).catch(() => null);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=terminated`);
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * Verify the caller's password without touching their session.
 *
 * A throwaway client, not the shared anon singleton: signInWithPassword parks a
 * session on whatever client it is called on, and the singleton is shared
 * across every request this server handles. Built per call and signed out
 * immediately so no session outlives the check.
 */
async function verifyOwnPassword(email: string, password: string) {
  const client = createClient(
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const { error } = await client.auth.signInWithPassword({ email, password });
    return !error;
  } catch {
    return false;
  } finally {
    await client.auth.signOut().catch(() => null);
  }
}

/**
 * Sign a contract with YOUR OWN signature mark.
 *
 * There is no parameter for whose signature to apply — the specimen is read
 * from the session in copyOwnSpecimenForSigning. Signing on someone else's
 * behalf is not blocked here so much as unrepresentable.
 *
 * Three gates before a mark is applied: the slot must be yours (by assignment
 * or by office), you must re-enter your password, and the session must be a
 * real one. A local role-preview session carries a synthetic user id and can
 * never execute an agreement.
 */
export async function signOpsContractAction(formData: FormData) {
  const { profile, isLocalRolePreview } = await requireOpsUser();
  const contractId = field(formData, "contract_id");
  const signatureId = field(formData, "signature_id");
  const password = field(formData, "password");

  if (isLocalRolePreview) {
    contractError("A role-preview session cannot sign contracts.", contractId);
  }

  const contract = await fetchOpsContractById(contractId);
  if (!contract) contractError("Contract not found.");

  if (!canViewOpsContractKind(profile.role, contract.kind)) {
    contractError("Contract not found.");
  }

  if (!["approved", "issued"].includes(contract.status)) {
    contractError("This contract is not open for signature.", contract.id);
  }

  const signature = contract.signatures.find((row) => row.id === signatureId);
  if (!signature) contractError("That signature slot is not on this contract.", contract.id);
  if (signature.status !== "pending") {
    contractError("That signature slot has already been actioned.", contract.id);
  }

  const slotIsMine =
    signature.assigned_user_id === profile.id ||
    (signature.assigned_user_id === null &&
      canSignOpsContractAs(profile.role, signature.signatory_role as OpsContractSignatoryRole));

  if (!slotIsMine) {
    contractError("That signature slot is not yours to sign.", contract.id);
  }

  if (!profile.email) {
    contractError("Your account has no email address, so you cannot be re-verified.", contract.id);
  }
  if (!password) {
    contractError("Enter your password to sign.", contract.id);
  }
  if (!(await verifyOwnPassword(profile.email, password))) {
    contractError("That password was not correct.", contract.id);
  }

  const mark = await copyOwnSpecimenForSigning({
    contractId: contract.id,
    signatureId: signature.id,
    userId: profile.id,
  });

  if (!mark) {
    contractError(
      "You have not uploaded a signature yet. Add one on your profile, then sign.",
      contract.id,
    );
  }

  // The hash is taken over the contract as it stands right now, so this
  // signature is bound to this wording. A later edit makes it visibly stale
  // rather than silently carrying over.
  const documentHash = hashOpsContractContent(toOpsContractSignableContent(contract));

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("contract_signatures")
    .update({
      status: "signed",
      signed_by_user_id: profile.id,
      signed_name: mark.specimenName || profile.full_name,
      signed_title: profile.role,
      signature_r2_key: mark.key,
      signed_at: new Date().toISOString(),
      document_sha256: documentHash,
      verification_code: generateOpsSignatureVerificationCode(),
    })
    .eq("id", signature.id)
    .eq("status", "pending");

  if (error) {
    logOpsServerError(error, {
      module: MODULE,
      action: "signOpsContract",
      entityId: contract.id,
    });
    contractError("The signature could not be recorded.", contract.id);
  }

  // All required internal marks in place moves the contract on to issued.
  const { data: outstanding } = await supabase
    .from("contract_signatures")
    .select("id")
    .eq("contract_id", contract.id)
    .eq("is_required", true)
    .neq("status", "signed")
    .in("signatory_role", OPS_CONTRACT_INTERNAL_SIGNATORIES);

  if ((outstanding ?? []).length === 0 && contract.status !== "issued") {
    await supabase
      .from("contracts")
      .update({
        status: "issued" satisfies OpsContractStatus,
        issued_at: new Date().toISOString(),
        issued_by: profile.id,
      })
      .eq("id", contract.id);
  }

  await recordOpsAuditEvent({
    action: "contract.signed",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    metadata: { signatory_role: signature.signatory_role },
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} signed ${contract.contract_number} as ${signature.signatory_role.replace(/_/g, " ")}`,
  }).catch(() => null);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=signed`);
}

/**
 * Decline to sign, with a reason.
 *
 * A first-class outcome rather than an absence. Without it people simply do not
 * click, and nobody downstream can tell a refusal from a backlog. Declining
 * sends the contract back to draft so the objection can be dealt with.
 */
export async function declineOpsContractSignatureAction(formData: FormData) {
  const { profile, isLocalRolePreview } = await requireOpsUser();
  const contractId = field(formData, "contract_id");
  const signatureId = field(formData, "signature_id");
  const reason = field(formData, "decline_reason").trim();

  if (isLocalRolePreview) {
    contractError("A role-preview session cannot action signatures.", contractId);
  }
  if (reason.length < 4) {
    contractError("Give a reason for declining to sign.", contractId);
  }

  const contract = await fetchOpsContractById(contractId);
  if (!contract) contractError("Contract not found.");

  const signature = contract.signatures.find((row) => row.id === signatureId);
  if (!signature) contractError("That signature slot is not on this contract.", contract.id);
  if (signature.status !== "pending") {
    contractError("That signature slot has already been actioned.", contract.id);
  }

  const slotIsMine =
    signature.assigned_user_id === profile.id ||
    (signature.assigned_user_id === null &&
      canSignOpsContractAs(profile.role, signature.signatory_role as OpsContractSignatoryRole));

  if (!slotIsMine) {
    contractError("That signature slot is not yours to action.", contract.id);
  }

  const supabase = getOpsSupabaseServiceClient();

  const { error } = await supabase
    .from("contract_signatures")
    .update({ status: "declined", decline_reason: reason })
    .eq("id", signature.id)
    .eq("status", "pending");

  if (error) contractError("The decline could not be recorded.", contract.id);

  await supabase
    .from("contracts")
    .update({ status: "draft" satisfies OpsContractStatus })
    .eq("id", contract.id);

  const recipients = await fanoutToOpsAudiences({
    actionNeeded: ["human_resource", "hr"],
    oversight: ["managing_director", "general_manager"],
    extraUserIds: [contract.created_by],
    excludeUserIds: [profile.id],
  });

  await Promise.all(
    recipients.map((recipient) =>
      queueOpsNotification({
        actionHref: `${ROUTE}/${contract.id}`,
        body: reason,
        moduleKey: MODULE,
        recipientId: recipient.id,
        sourceId: contract.id,
        sourceTable: "contracts",
        title: `${profile.full_name} declined to sign ${contract.contract_number}`,
      }).catch(() => null),
    ),
  );

  await recordOpsAuditEvent({
    action: "contract.signature_declined",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    metadata: { signatory_role: signature.signatory_role, reason },
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} declined to sign ${contract.contract_number}`,
  }).catch(() => null);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=declined`);
}

/**
 * Record the countersigned copy and make the contract live.
 *
 * The counterparty signs on paper; this is where that scan lands. Internal
 * marks alone never reach 'signed' — an agreement only one side has executed is
 * not an agreement.
 */
export async function recordOpsContractCountersignatureAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const contractId = field(formData, "contract_id");

  const contract = await fetchOpsContractById(contractId);
  if (!contract) contractError("Contract not found.");
  if (!canIssueOpsContract(profile.role)) {
    contractError("Your role cannot record a countersignature.", contract.id);
  }
  if (contract.status !== "issued") {
    contractError("Only an issued contract can be countersigned.", contract.id);
  }

  // The bytes went straight to R2 from the browser; the action only ever
  // carries the key. A Server Action body is capped at 4.5 MB on Vercel, and a
  // scanned contract is routinely larger than that.
  const key = field(formData, "r2_key").trim();
  const fileName = field(formData, "file_name").trim();

  if (!key) {
    contractError("Attach the signed copy before recording it.", contract.id);
  }

  const verified = await verifyOpsUploadedObject(key, fileName);
  if (!verified.ok) {
    contractError("That upload could not be verified. Try again.", contract.id);
  }

  const linked = await linkOpsRecordAttachment({
    category: "contract",
    checksum: verified.upload.checksum,
    contentType: verified.upload.contentType,
    fileName: verified.upload.fileName,
    key: verified.upload.key,
    label: contract.contract_number,
    moduleKey: MODULE,
    siteId: contract.site_id,
    size: verified.upload.size,
    sourceId: contract.id,
    sourceTable: "contracts",
    title: `${contract.contract_number} — signed copy`,
    uploadedBy: profile.id,
    // The executed agreement is commercially sensitive: it carries rates. It
    // follows the same tier as the contract record rather than the workspace
    // default, which is deliberately wider.
    visibility: "management",
  });

  if (!linked.ok) {
    contractError(linked.message, contract.id);
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("contracts")
    .update({
      status: "active" satisfies OpsContractStatus,
      signed_at: new Date().toISOString(),
      signed_document_id: linked.documentId,
    })
    .eq("id", contract.id);

  if (error) contractError(error.message, contract.id);

  await recordOpsAuditEvent({
    action: "contract.countersigned",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} recorded the countersigned copy of ${contract.contract_number}`,
  }).catch(() => null);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=countersigned`);
}
