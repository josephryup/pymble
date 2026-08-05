"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  resolveOpsChargeTarget,
  type OpsLegacyCostTreatment,
  type OpsPaymentChargeTarget,
} from "@/lib/ops/payables-core";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { opsReturnTo } from "@/lib/ops/return-paths";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import {
  canActivateOpsProjectBudget,
  canApproveOpsPaymentRequest,
  canArchiveOpsPaymentRequest,
  canArchiveOpsProjectBudget,
  canCancelOpsPaymentRequest,
  canCreateOpsPaymentRequest,
  canCreateOpsProjectBudget,
  canDeleteOpsPaymentRequest,
  canEditOpsProjectBudget,
  canEditOpsPaymentRequest,
  canEditOpsProjectBudgetLine,
  canLockOpsProjectBudget,
  canPayOpsPaymentRequest,
  canRejectOpsPaymentRequest,
  canReviewOpsPaymentRequest,
  canSubmitOpsPaymentRequest,
} from "@/lib/ops/finance-permissions";
import { postPaymentRequestJournalSafe } from "@/lib/ops/gl-posting";
import { upsertProjectCostEntry } from "@/lib/ops/project-cost-entries";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsPaymentRequestStatus,
  OpsPaymentRequestType,
  OpsProjectBudgetStatus,
  OpsSupplierStatus,
} from "@/lib/ops/types";

const PROJECT_BUDGETS_ROUTE = "/ops/project-budgets";
const PAYMENT_REQUESTS_ROUTE = "/ops/payment-requests";

const projectBudgetSchema = z.object({
  contingency_amount: z.coerce.number().min(0, "Contingency cannot be negative.").default(0),
  currency_code: z
    .string()
    .trim()
    .default("ZMW")
    .transform((value) => value.toUpperCase())
    .refine((value) => /^[A-Z]{3}$/.test(value), "Use a valid currency code."),
  description: z.string().trim().max(1000).default(""),
  effective_from: z.string().trim().default(""),
  site_id: z.string().uuid("Select a site."),
  title: z.string().trim().min(2, "Budget title is required.").max(180),
});

const budgetLineSchema = z.object({
  budget_id: z.string().uuid("Select a budget."),
  budgeted_amount: z.coerce.number().min(0, "Budgeted amount cannot be negative."),
  category: z.string().trim().max(80).default("general"),
  cost_code: z.string().trim().max(40).default(""),
  description: z.string().trim().min(2, "Line description is required.").max(180),
  notes: z.string().trim().max(800).default(""),
});

const budgetIdSchema = z.object({
  budget_id: z.string().uuid("Select a budget."),
});

const paymentRequestTypes = [
  "supplier_invoice",
  "expense",
  "subcontractor",
  "payroll",
  "tax",
  "other",
] as const satisfies readonly OpsPaymentRequestType[];

const paymentRequestSchema = z.object({
  budget_line_id: z.string().trim().default(""),
  description: z.string().trim().max(1200).default(""),
  due_date: z.string().trim().default(""),
  invoice_reference: z.string().trim().max(120).default(""),
  payment_type: z.enum(paymentRequestTypes),
  purchase_order_id: z.string().trim().default(""),
  requested_amount: z.coerce.number().positive("Payment amount must be greater than zero."),
  // Attribution is validated by resolveOpsChargeTarget rather than here: the
  // rule is "exactly one of three", which zod can express only clumsily and
  // which must match the database CHECK exactly.
  charge_target: z.string().trim().default("site"),
  cost_centre_id: z.string().trim().default(""),
  cost_treatment: z.string().trim().default(""),
  legacy_project_id: z.string().trim().default(""),
  site_id: z.string().trim().default(""),
  supplier_id: z.string().trim().default(""),
  title: z.string().trim().min(2, "Payment title is required.").max(180),
});

const paymentRequestIdSchema = z.object({
  payment_request_id: z.string().uuid("Select a payment request."),
});

const paymentReferenceSchema = paymentRequestIdSchema.extend({
  payment_reference: z.string().trim().max(120).default(""),
});

type SiteForFinance = {
  id: string;
  is_active: boolean;
};

type SupplierForFinance = {
  id: string;
  status: OpsSupplierStatus;
  supplier_code: string;
};

type ProjectBudgetForMutation = {
  created_by: string | null;
  id: string;
  site_id: string;
  status: OpsProjectBudgetStatus;
  title: string;
};

type BudgetLineForPayment = {
  budget: {
    id: string;
    site_id: string;
    status: OpsProjectBudgetStatus;
  } | null;
  budget_id: string;
  category: string;
  cost_code: string;
  description: string;
  id: string;
};

type PurchaseOrderForPayment = {
  id: string;
  po_number: string;
  site_id: string;
  status: string;
  supplier_id: string;
  title: string;
  total_amount: number | string;
};

type PaymentRequestForMutation = {
  budget_id: string | null;
  budget_line_id: string | null;
  created_by: string | null;
  currency_code: string;
  description: string;
  id: string;
  payment_type: OpsPaymentRequestType;
  purchase_order_id: string | null;
  request_number: string;
  requested_amount: number | string;
  requested_by: string | null;
  site_id: string | null;
  charge_target: OpsPaymentChargeTarget;
  cost_centre_id: string | null;
  cost_treatment: OpsLegacyCostTreatment | null;
  legacy_project_id: string | null;
  status: OpsPaymentRequestStatus;
  supplier_id: string | null;
  title: string;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function budgetError(message: string): never {
  redirect(`${PROJECT_BUDGETS_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function paymentError(message: string): never {
  redirect(`${PAYMENT_REQUESTS_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function normalizeOptionalUuid(value: string) {
  return value || null;
}

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function normalizeCategory(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "general"
  );
}

function normalizeDateInput(
  value: string,
  fallback = true,
  error: (message: string) => never = paymentError,
) {
  if (!value && fallback) {
    return new Date().toISOString().slice(0, 10);
  }

  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    error("Use a valid date.");
  }

  return value;
}

/**
 * A non-site charge target must exist and be open for posting.
 *
 * The foreign key already guarantees the row exists; this adds the part a FK
 * cannot express — that an archived legacy project or a retired cost centre
 * should not accept new payables.
 */
async function assertChargeTargetExists(
  charge: { charge_target: OpsPaymentChargeTarget; cost_centre_id: string | null; legacy_project_id: string | null },
  error: (message: string) => never,
) {
  const supabase = getOpsSupabaseServiceClient();

  if (charge.charge_target === "legacy_project") {
    const { data } = await supabase
      .from("legacy_projects")
      .select("id, is_active")
      .eq("id", charge.legacy_project_id)
      .maybeSingle<{ id: string; is_active: boolean }>();

    if (!data || !data.is_active) {
      error("That completed project is not open for new payables.");
    }
    return;
  }

  const { data } = await supabase
    .from("cost_centres")
    .select("id, is_active")
    .eq("id", charge.cost_centre_id)
    .maybeSingle<{ id: string; is_active: boolean }>();

  if (!data || !data.is_active) {
    error("That cost centre is not active.");
  }
}

async function assertActiveSite(siteId: string, error: (message: string) => never) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error: siteError } = await supabase
    .from("sites")
    .select("id, is_active")
    .eq("id", siteId)
    .maybeSingle<SiteForFinance>();

  if (siteError) {
    throw siteError;
  }

  if (!data || !data.is_active) {
    error("Select an active site.");
  }

  return data;
}

async function fetchSupplierForFinance(supplierId: string) {
  if (!supplierId) {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, supplier_code, status")
    .eq("id", supplierId)
    .maybeSingle<SupplierForFinance>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchProjectBudgetForMutation(budgetId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("project_budgets")
    .select("id, site_id, title, status, created_by")
    .eq("id", budgetId)
    .maybeSingle<ProjectBudgetForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchBudgetLineForPayment(budgetLineId: string) {
  if (!budgetLineId) {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("project_budget_lines")
    .select(
      "id, budget_id, cost_code, category, description, budget:project_budgets!project_budget_lines_budget_id_fkey(id, site_id, status)",
    )
    .eq("id", budgetLineId)
    .maybeSingle<
      Omit<BudgetLineForPayment, "budget"> & {
        budget: BudgetLineForPayment["budget"] | BudgetLineForPayment["budget"][] | null;
      }
    >();

  if (error) {
    throw error;
  }

  return data
    ? {
        ...data,
        budget: Array.isArray(data.budget) ? data.budget[0] ?? null : data.budget,
      }
    : null;
}

async function fetchPurchaseOrderForPayment(purchaseOrderId: string) {
  if (!purchaseOrderId) {
    return null;
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id, po_number, supplier_id, site_id, title, status, total_amount")
    .eq("id", purchaseOrderId)
    .maybeSingle<PurchaseOrderForPayment>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchPaymentRequestForMutation(paymentRequestId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("payment_requests")
    .select(
      "id, request_number, site_id, charge_target, legacy_project_id, cost_centre_id, cost_treatment, supplier_id, purchase_order_id, budget_id, budget_line_id, payment_type, status, title, description, requested_amount, currency_code, requested_by, created_by",
    )
    .eq("id", paymentRequestId)
    .maybeSingle<PaymentRequestForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function nextBudgetLineNumber(budgetId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("project_budget_lines")
    .select("line_number")
    .eq("budget_id", budgetId)
    .order("line_number", { ascending: false })
    .limit(1)
    .maybeSingle<{ line_number: number }>();

  if (error) {
    throw error;
  }

  return (data?.line_number ?? 0) + 1;
}

async function upsertPaymentCostEntry(input: {
  actorUserId: string;
  paymentReference?: string;
  paymentRequest: PaymentRequestForMutation;
  status: "committed" | "posted" | "cancelled";
}) {
  return upsertProjectCostEntry({
    actorUserId: input.actorUserId,
    match: { payment_request_id: input.paymentRequest.id },
    payload: {
      amount: normalizeNumber(input.paymentRequest.requested_amount),
      budget_id: input.paymentRequest.budget_id,
      budget_line_id: input.paymentRequest.budget_line_id,
      cost_type: input.paymentRequest.payment_type,
      currency_code: input.paymentRequest.currency_code,
      description: input.paymentReference
        ? `${input.paymentRequest.title} / ${input.paymentReference}`
        : input.paymentRequest.title,
      payment_request_id: input.paymentRequest.id,
      purchase_order_id: input.paymentRequest.purchase_order_id,
      cost_centre_id: input.paymentRequest.cost_centre_id,
      legacy_project_id: input.paymentRequest.legacy_project_id,
      site_id: input.paymentRequest.site_id,
      source_id: input.paymentRequest.id,
      source_table: "payment_requests",
      supplier_id: input.paymentRequest.supplier_id,
    },
    status: input.status,
  });
}

export async function createProjectBudgetAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsProjectBudget(profile.role)) {
    budgetError("Your role cannot create project budgets.");
  }

  const parsed = projectBudgetSchema.safeParse({
    contingency_amount: field(formData, "contingency_amount") || "0",
    currency_code: field(formData, "currency_code") || "ZMW",
    description: field(formData, "description"),
    effective_from: field(formData, "effective_from"),
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    budgetError(parsed.error.issues[0]?.message ?? "Check the project budget.");
  }

  await assertActiveSite(parsed.data.site_id, budgetError);
  const effectiveFrom =
    normalizeDateInput(parsed.data.effective_from, true, budgetError) ??
    new Date().toISOString().slice(0, 10);
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("project_budgets")
    .insert({
      contingency_amount: parsed.data.contingency_amount,
      created_by: profile.id,
      currency_code: parsed.data.currency_code,
      description: parsed.data.description,
      effective_from: effectiveFrom,
      site_id: parsed.data.site_id,
      status: "draft",
      title: parsed.data.title,
    })
    .select("id, budget_number")
    .single<{ budget_number: string; id: string }>();

  if (error || !data) {
    budgetError(error?.message ?? "Could not create project budget.");
  }

  await recordOpsAuditEvent({
    action: "project_budget.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "project_budget",
    metadata: {
      budget_number: data.budget_number,
      site_id: parsed.data.site_id,
    },
    moduleKey: "project_budgets",
    sourceId: data.id,
    sourceTable: "project_budgets",
    summary: `Created project budget ${data.budget_number}`,
  }).catch(() => null);

  revalidatePath(PROJECT_BUDGETS_ROUTE);
  redirect(`${PROJECT_BUDGETS_ROUTE}?created=budget`);
}

export async function addProjectBudgetLineAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = budgetLineSchema.safeParse({
    budget_id: field(formData, "budget_id"),
    budgeted_amount: field(formData, "budgeted_amount") || "0",
    category: field(formData, "category") || "general",
    cost_code: field(formData, "cost_code"),
    description: field(formData, "description"),
    notes: field(formData, "notes"),
  });

  if (!parsed.success) {
    budgetError(parsed.error.issues[0]?.message ?? "Check the budget line.");
  }

  const budget = await fetchProjectBudgetForMutation(parsed.data.budget_id);

  if (!budget) {
    budgetError("Project budget was not found.");
  }

  if (!canEditOpsProjectBudgetLine(profile.role, budget)) {
    budgetError("Your role cannot add lines to this budget.");
  }

  const lineNumber = await nextBudgetLineNumber(budget.id);
  const category = normalizeCategory(parsed.data.category);
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("project_budget_lines")
    .insert({
      budget_id: budget.id,
      budgeted_amount: parsed.data.budgeted_amount,
      category,
      cost_code: parsed.data.cost_code.toUpperCase(),
      created_by: profile.id,
      description: parsed.data.description,
      line_number: lineNumber,
      notes: parsed.data.notes,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    budgetError(error?.message ?? "Could not add budget line.");
  }

  await recordOpsAuditEvent({
    action: "project_budget.line_added",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "project_budget_line",
    metadata: {
      budget_id: budget.id,
      category,
      line_number: lineNumber,
    },
    moduleKey: "project_budgets",
    sourceId: budget.id,
    sourceTable: "project_budgets",
    summary: `Added line ${lineNumber} to ${budget.title}`,
  }).catch(() => null);

  revalidatePath(PROJECT_BUDGETS_ROUTE);
  redirect(
    opsReturnTo({
      returnTo: field(formData, "return_to"),
      fallback: PROJECT_BUDGETS_ROUTE,
      params: { updated: "line_added" },
    }),
  );
}

/**
 * Fetch a budget line together with its parent budget, for edit/delete.
 * Permission is a property of the BUDGET (its status decides whether lines may
 * change at all), so the line alone is never enough to authorise a mutation.
 */
async function fetchBudgetLineForMutation(lineId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("project_budget_lines")
    .select(
      "id, budget_id, line_number, description, category, cost_code, budgeted_amount, notes, source, budget:project_budgets!project_budget_lines_budget_id_fkey(id, site_id, title, status, created_by)",
    )
    .eq("id", lineId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  const row = data as unknown as {
    id: string;
    budget_id: string;
    line_number: number;
    description: string;
    category: string;
    cost_code: string;
    budgeted_amount: number | string;
    notes: string;
    source: string;
    budget: ProjectBudgetForMutation | ProjectBudgetForMutation[] | null;
  };

  const budget = Array.isArray(row.budget) ? (row.budget[0] ?? null) : row.budget;
  return budget ? { ...row, budget } : null;
}

const budgetLineEditSchema = z.object({
  line_id: z.string().uuid("Select a budget line."),
  budgeted_amount: z.coerce
    .number()
    .min(0, "Budgeted amount cannot be negative.")
    .max(1_000_000_000_000, "That budgeted amount looks unrealistic."),
  category: z.string().trim().max(80).default("general"),
  cost_code: z.string().trim().max(20).default(""),
  description: z.string().trim().min(2, "Describe the budget line.").max(200),
  notes: z.string().trim().max(400).default(""),
});

/**
 * Edit a budget line in place.
 *
 * Deliberately does NOT touch `cost_code_id` — the WBS link is maintained on
 * /ops/cost-codes, where the two-level structure and the GL mapping are
 * visible. Letting it be re-pointed from a free-text form here would reopen
 * exactly the drift the spine exists to close.
 *
 * Schedule-generated lines (`source = 'boq'`) are editable but warned about:
 * the next schedule issue overwrites their amount, so an edit here is
 * temporary unless the schedule is corrected too.
 */
export async function editProjectBudgetLineAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = budgetLineEditSchema.safeParse({
    line_id: field(formData, "line_id"),
    budgeted_amount: field(formData, "budgeted_amount") || "0",
    category: field(formData, "category") || "general",
    cost_code: field(formData, "cost_code"),
    description: field(formData, "description"),
    notes: field(formData, "notes"),
  });
  if (!parsed.success) {
    budgetError(parsed.error.issues[0]?.message ?? "Check the budget line.");
  }

  const line = await fetchBudgetLineForMutation(parsed.data.line_id);
  if (!line) {
    budgetError("Budget line was not found.");
  }
  if (!canEditOpsProjectBudgetLine(profile.role, line.budget)) {
    budgetError("Your role cannot change lines on this budget.");
  }

  const category = normalizeCategory(parsed.data.category);
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("project_budget_lines")
    .update({
      budgeted_amount: parsed.data.budgeted_amount,
      category,
      cost_code: parsed.data.cost_code.toUpperCase(),
      description: parsed.data.description,
      notes: parsed.data.notes,
    })
    .eq("id", line.id);

  if (error) {
    budgetError(error.message);
  }

  // Record the before-and-after amount explicitly: a budget line's value is
  // the thing people later ask questions about, and "it was edited" without
  // the figures answers none of them.
  await recordOpsAuditEvent({
    action: "project_budget.line_edited",
    actorUserId: profile.id,
    entityId: line.id,
    entityType: "project_budget_line",
    metadata: {
      budget_id: line.budget_id,
      line_number: line.line_number,
      amount_from: Number(line.budgeted_amount),
      amount_to: parsed.data.budgeted_amount,
      description_from: line.description,
      description_to: parsed.data.description,
      source: line.source,
    },
    moduleKey: "project_budgets",
    sourceId: line.budget_id,
    sourceTable: "project_budgets",
    summary: `Edited line ${line.line_number} on ${line.budget.title} (${Number(
      line.budgeted_amount,
    ).toLocaleString("en-ZM")} → ${parsed.data.budgeted_amount.toLocaleString("en-ZM")})`,
  }).catch(() => null);

  revalidatePath(PROJECT_BUDGETS_ROUTE);
  revalidatePath("/ops/finance");
  redirect(
    opsReturnTo({
      returnTo: field(formData, "return_to"),
      fallback: PROJECT_BUDGETS_ROUTE,
      params: { updated: "line_edited" },
    }),
  );
}

/**
 * Delete a budget line.
 *
 * Refuses when anything is charged to the line — a cost entry, a material
 * request, or a payment request. Deleting a line that carries spend would
 * orphan real money and silently change every variance figure that ever
 * included it, so the guard reports what is attached rather than cascading.
 *
 * This exists so Finance can resolve a mis-keyed duplicate themselves. A
 * duplicate is the one case where deletion is genuinely right, and it is
 * always a judgement about the business, never one a migration should make.
 */
export async function deleteProjectBudgetLineAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const lineId = field(formData, "line_id");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lineId)) {
    budgetError("Select a budget line to delete.");
  }

  const line = await fetchBudgetLineForMutation(lineId);
  if (!line) {
    budgetError("Budget line was not found.");
  }
  if (!canEditOpsProjectBudgetLine(profile.role, line.budget)) {
    budgetError("Your role cannot delete lines from this budget.");
  }

  const supabase = getOpsSupabaseServiceClient();

  const [costEntries, requests, transportRequests, payments, paymentItems] =
    await Promise.all([
      supabase
        .from("project_cost_entries")
        .select("id", { count: "exact", head: true })
        .eq("budget_line_id", line.id),
      supabase
        .from("material_requests")
        .select("id", { count: "exact", head: true })
        .eq("budget_line_id", line.id),
      supabase
        .from("material_requests")
        .select("id", { count: "exact", head: true })
        .eq("transport_budget_line_id", line.id),
      supabase
        .from("payment_requests")
        .select("id", { count: "exact", head: true })
        .eq("budget_line_id", line.id),
      supabase
        .from("payment_request_items")
        .select("id", { count: "exact", head: true })
        .eq("budget_line_id", line.id),
    ]);

  const attachments: string[] = [];
  if ((costEntries.count ?? 0) > 0) {
    attachments.push(`${costEntries.count} cost ledger entr${costEntries.count === 1 ? "y" : "ies"}`);
  }
  const requestCount = (requests.count ?? 0) + (transportRequests.count ?? 0);
  if (requestCount > 0) {
    attachments.push(`${requestCount} material request${requestCount === 1 ? "" : "s"}`);
  }
  const paymentCount = (payments.count ?? 0) + (paymentItems.count ?? 0);
  if (paymentCount > 0) {
    attachments.push(`${paymentCount} payment request${paymentCount === 1 ? "" : "s"}`);
  }

  if (attachments.length > 0) {
    budgetError(
      `This line cannot be deleted — ${attachments.join(", ")} charge against it. Set its amount to zero instead, which keeps the history and removes it from the budget total.`,
    );
  }

  const { error } = await supabase
    .from("project_budget_lines")
    .delete()
    .eq("id", line.id);

  if (error) {
    budgetError(error.message);
  }

  await recordOpsAuditEvent({
    action: "project_budget.line_deleted",
    actorUserId: profile.id,
    entityId: line.id,
    entityType: "project_budget_line",
    metadata: {
      budget_id: line.budget_id,
      line_number: line.line_number,
      description: line.description,
      category: line.category,
      // The amount is the point of the record: this is how a later reviewer
      // reconstructs why the budget total changed.
      budgeted_amount: Number(line.budgeted_amount),
      source: line.source,
    },
    moduleKey: "project_budgets",
    sourceId: line.budget_id,
    sourceTable: "project_budgets",
    summary: `Deleted line ${line.line_number} "${line.description}" (${Number(
      line.budgeted_amount,
    ).toLocaleString("en-ZM")}) from ${line.budget.title}`,
  }).catch(() => null);

  revalidatePath(PROJECT_BUDGETS_ROUTE);
  revalidatePath("/ops/finance");
  redirect(
    opsReturnTo({
      returnTo: field(formData, "return_to"),
      fallback: PROJECT_BUDGETS_ROUTE,
      params: { updated: "line_deleted" },
    }),
  );
}

export async function activateProjectBudgetAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = budgetIdSchema.safeParse({ budget_id: field(formData, "budget_id") });

  if (!parsed.success) {
    budgetError(parsed.error.issues[0]?.message ?? "Select a budget.");
  }

  const budget = await fetchProjectBudgetForMutation(parsed.data.budget_id);

  if (!budget) {
    budgetError("Project budget was not found.");
  }

  if (!canActivateOpsProjectBudget(profile.role, budget)) {
    budgetError("Your role cannot activate this budget.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();

  // One active budget per site (audit D7) — enforced by a partial unique
  // index, but check first so the user gets an instruction instead of a raw
  // constraint violation. Deliberately not auto-demoting: superseding a live
  // budget is Finance's explicit decision, not a side effect of activation.
  const { data: existingActive, error: existingActiveError } = await supabase
    .from("project_budgets")
    .select("id, budget_number, title")
    .eq("site_id", budget.site_id)
    .eq("status", "active")
    .neq("id", budget.id)
    .maybeSingle<{ id: string; budget_number: string; title: string }>();

  if (existingActiveError) {
    budgetError(existingActiveError.message);
  }
  if (existingActive) {
    budgetError(
      `This site already has an active budget (${existingActive.budget_number} — ${existingActive.title}). Lock or archive it first, then activate this one.`,
    );
  }

  const { error } = await supabase
    .from("project_budgets")
    .update({ active_at: now, active_by: profile.id, status: "active" })
    .eq("id", budget.id)
    .eq("status", "draft");

  if (error) {
    budgetError(error.message);
  }

  await recordOpsAuditEvent({
    action: "project_budget.activated",
    actorUserId: profile.id,
    entityId: budget.id,
    entityType: "project_budget",
    metadata: { activated_at: now },
    moduleKey: "project_budgets",
    sourceId: budget.id,
    sourceTable: "project_budgets",
    summary: `Activated project budget ${budget.title}`,
  }).catch(() => null);

  revalidatePath(PROJECT_BUDGETS_ROUTE);
  redirect(
    opsReturnTo({
      returnTo: field(formData, "return_to"),
      fallback: PROJECT_BUDGETS_ROUTE,
      params: { updated: "activated" },
    }),
  );
}

export async function lockProjectBudgetAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = budgetIdSchema.safeParse({ budget_id: field(formData, "budget_id") });

  if (!parsed.success) {
    budgetError(parsed.error.issues[0]?.message ?? "Select a budget.");
  }

  const budget = await fetchProjectBudgetForMutation(parsed.data.budget_id);

  if (!budget) {
    budgetError("Project budget was not found.");
  }

  if (!canLockOpsProjectBudget(profile.role, budget)) {
    budgetError("Your role cannot lock this budget.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("project_budgets")
    .update({ locked_at: now, locked_by: profile.id, status: "locked" })
    .eq("id", budget.id)
    .eq("status", "active");

  if (error) {
    budgetError(error.message);
  }

  await recordOpsAuditEvent({
    action: "project_budget.locked",
    actorUserId: profile.id,
    entityId: budget.id,
    entityType: "project_budget",
    metadata: { locked_at: now },
    moduleKey: "project_budgets",
    sourceId: budget.id,
    sourceTable: "project_budgets",
    summary: `Locked project budget ${budget.title}`,
  }).catch(() => null);

  revalidatePath(PROJECT_BUDGETS_ROUTE);
  redirect(
    opsReturnTo({
      returnTo: field(formData, "return_to"),
      fallback: PROJECT_BUDGETS_ROUTE,
      params: { updated: "locked" },
    }),
  );
}

export async function archiveProjectBudgetAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = budgetIdSchema.safeParse({ budget_id: field(formData, "budget_id") });

  if (!parsed.success) {
    budgetError(parsed.error.issues[0]?.message ?? "Select a budget.");
  }

  const budget = await fetchProjectBudgetForMutation(parsed.data.budget_id);

  if (!budget) {
    budgetError("Project budget was not found.");
  }

  if (!canArchiveOpsProjectBudget(profile.role, budget)) {
    budgetError("Your role cannot archive this budget.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("project_budgets")
    .update({ archived_at: now, archived_by: profile.id, status: "archived" })
    .eq("id", budget.id)
    .neq("status", "archived");

  if (error) {
    budgetError(error.message);
  }

  await recordOpsAuditEvent({
    action: "project_budget.archived",
    actorUserId: profile.id,
    entityId: budget.id,
    entityType: "project_budget",
    metadata: { archived_at: now },
    moduleKey: "project_budgets",
    sourceId: budget.id,
    sourceTable: "project_budgets",
    summary: `Archived project budget ${budget.title}`,
  }).catch(() => null);

  revalidatePath(PROJECT_BUDGETS_ROUTE);
  redirect(
    opsReturnTo({
      returnTo: field(formData, "return_to"),
      fallback: PROJECT_BUDGETS_ROUTE,
      params: { updated: "archived" },
    }),
  );
}

const editProjectBudgetSchema = budgetIdSchema.extend({
  contingency_amount: z.coerce.number().min(0, "Contingency cannot be negative.").default(0),
  currency_code: z
    .string()
    .trim()
    .default("ZMW")
    .transform((value) => value.toUpperCase())
    .refine((value) => /^[A-Z]{3}$/.test(value), "Use a valid currency code."),
  description: z.string().trim().max(1000).default(""),
  effective_from: z.string().trim().default(""),
  site_id: z.string().uuid("Select a site."),
  title: z.string().trim().min(2, "Budget title is required.").max(180),
});

export async function editProjectBudgetAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = editProjectBudgetSchema.safeParse({
    budget_id: field(formData, "budget_id"),
    contingency_amount: field(formData, "contingency_amount") || "0",
    currency_code: field(formData, "currency_code") || "ZMW",
    description: field(formData, "description"),
    effective_from: field(formData, "effective_from"),
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    budgetError(parsed.error.issues[0]?.message ?? "Check the project budget.");
  }

  const budget = await fetchProjectBudgetForMutation(parsed.data.budget_id);

  if (!budget) {
    budgetError("Project budget was not found.");
  }

  if (!canEditOpsProjectBudget(profile.role, budget)) {
    budgetError("Your role cannot edit this budget. Only draft budgets can be edited.");
  }

  await assertActiveSite(parsed.data.site_id, budgetError);
  const effectiveFrom =
    normalizeDateInput(parsed.data.effective_from, true, budgetError) ??
    new Date().toISOString().slice(0, 10);

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("project_budgets")
    .update({
      contingency_amount: parsed.data.contingency_amount,
      currency_code: parsed.data.currency_code,
      description: parsed.data.description,
      effective_from: effectiveFrom,
      site_id: parsed.data.site_id,
      title: parsed.data.title,
    })
    .eq("id", budget.id)
    .eq("status", "draft");

  if (error) {
    budgetError(error.message);
  }

  await recordOpsAuditEvent({
    action: "project_budget.edited",
    actorUserId: profile.id,
    entityId: budget.id,
    entityType: "project_budget",
    metadata: {
      site_id: parsed.data.site_id,
      title: parsed.data.title,
    },
    moduleKey: "project_budgets",
    sourceId: budget.id,
    sourceTable: "project_budgets",
    summary: `Edited draft project budget ${budget.title}`,
  }).catch(() => null);

  revalidatePath(PROJECT_BUDGETS_ROUTE);
  redirect(
    opsReturnTo({
      returnTo: field(formData, "return_to"),
      fallback: PROJECT_BUDGETS_ROUTE,
      params: { updated: "edited" },
    }),
  );
}

export async function createPaymentRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsPaymentRequest(profile.role)) {
    paymentError("Your role cannot create payment requests.");
  }

  const parsed = paymentRequestSchema.safeParse({
    budget_line_id: field(formData, "budget_line_id"),
    description: field(formData, "description"),
    due_date: field(formData, "due_date"),
    invoice_reference: field(formData, "invoice_reference"),
    payment_type: field(formData, "payment_type") || "supplier_invoice",
    purchase_order_id: field(formData, "purchase_order_id"),
    requested_amount: field(formData, "requested_amount"),
    site_id: field(formData, "site_id"),
    supplier_id: field(formData, "supplier_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    paymentError(parsed.error.issues[0]?.message ?? "Check the payment request.");
  }

  const [purchaseOrder, budgetLine] = await Promise.all([
    fetchPurchaseOrderForPayment(parsed.data.purchase_order_id),
    fetchBudgetLineForPayment(parsed.data.budget_line_id),
  ]);

  if (parsed.data.purchase_order_id && !purchaseOrder) {
    paymentError("Purchase order was not found.");
  }

  if (
    purchaseOrder &&
    !["issued", "partially_received", "closed"].includes(purchaseOrder.status)
  ) {
    paymentError("Select an issued, partially received, or closed purchase order.");
  }

  if (parsed.data.budget_line_id && (!budgetLine || !budgetLine.budget)) {
    paymentError("Budget line was not found.");
  }

  if (
    budgetLine?.budget &&
    budgetLine.budget.status !== "active" &&
    budgetLine.budget.status !== "locked"
  ) {
    paymentError("Payments can only be linked to active or locked budgets.");
  }

  const supplierId = purchaseOrder?.supplier_id ?? parsed.data.supplier_id;

  // A purchase order is always site work, so it pins the attribution — you
  // cannot raise a PO against a completed project.
  const charge = resolveOpsChargeTarget({
    budgetLineId: parsed.data.budget_line_id,
    chargeTarget: purchaseOrder ? "site" : parsed.data.charge_target,
    costCentreId: parsed.data.cost_centre_id,
    costTreatment: parsed.data.cost_treatment,
    legacyProjectId: parsed.data.legacy_project_id,
    siteId: purchaseOrder?.site_id ?? parsed.data.site_id,
  });

  if (!charge.ok) {
    paymentError(charge.message);
  }

  if (charge.value.charge_target === "site") {
    if (budgetLine?.budget && budgetLine.budget.site_id !== charge.value.site_id) {
      paymentError("Selected budget line belongs to a different site.");
    }

    // Only live site work has to point at an ACTIVE site. A completed project
    // deliberately never becomes a site at all, which is the whole reason this
    // charge target exists.
    await assertActiveSite(charge.value.site_id!, paymentError);
  } else {
    await assertChargeTargetExists(charge.value, paymentError);
  }
  const supplier = await fetchSupplierForFinance(supplierId);

  if (supplierId && (!supplier || supplier.status === "archived")) {
    paymentError("Supplier was not found or is archived.");
  }

  const dueDate = normalizeDateInput(parsed.data.due_date, false);
  const supabase = getOpsSupabaseServiceClient();
  const { data: paymentRequest, error } = await supabase
    .from("payment_requests")
    .insert({
      budget_id: budgetLine?.budget_id ?? null,
      budget_line_id: budgetLine?.id ?? null,
      created_by: profile.id,
      description: parsed.data.description,
      due_date: dueDate,
      invoice_reference: parsed.data.invoice_reference,
      payment_type: parsed.data.payment_type,
      purchase_order_id: normalizeOptionalUuid(purchaseOrder?.id ?? ""),
      requested_amount: parsed.data.requested_amount,
      requested_by: profile.id,
      charge_target: charge.value.charge_target,
      cost_centre_id: charge.value.cost_centre_id,
      cost_treatment: charge.value.cost_treatment,
      legacy_project_id: charge.value.legacy_project_id,
      site_id: charge.value.site_id,
      status: "draft",
      supplier_id: normalizeOptionalUuid(supplierId),
      title: parsed.data.title,
    })
    .select("id, request_number")
    .single<{ id: string; request_number: string }>();

  if (error || !paymentRequest) {
    paymentError(error?.message ?? "Could not create payment request.");
  }

  const { error: itemError } = await supabase.from("payment_request_items").insert({
    budget_line_id: budgetLine?.id ?? null,
    description: parsed.data.description || parsed.data.title,
    line_number: 1,
    payment_request_id: paymentRequest.id,
    quantity: 1,
    unit_cost: parsed.data.requested_amount,
  });

  if (itemError) {
    await supabase.from("payment_requests").delete().eq("id", paymentRequest.id);
    paymentError(itemError.message);
  }

  await recordOpsAuditEvent({
    action: "payment_request.created",
    actorUserId: profile.id,
    entityId: paymentRequest.id,
    entityType: "payment_request",
    metadata: {
      amount: parsed.data.requested_amount,
      budget_line_id: budgetLine?.id ?? null,
      purchase_order_id: purchaseOrder?.id ?? null,
      supplier_id: supplierId || null,
    },
    moduleKey: "payment_requests",
    sourceId: paymentRequest.id,
    sourceTable: "payment_requests",
    summary: `Created payment request ${paymentRequest.request_number}`,
  }).catch(() => null);

  revalidatePath(PAYMENT_REQUESTS_ROUTE);
  redirect(`${PAYMENT_REQUESTS_ROUTE}?created=payment_request`);
}

export async function submitPaymentRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = paymentRequestIdSchema.safeParse({
    payment_request_id: field(formData, "payment_request_id"),
  });

  if (!parsed.success) {
    paymentError(parsed.error.issues[0]?.message ?? "Select a payment request.");
  }

  const paymentRequest = await fetchPaymentRequestForMutation(parsed.data.payment_request_id);

  if (!paymentRequest) {
    paymentError("Payment request was not found.");
  }

  if (!canSubmitOpsPaymentRequest(profile.id, profile.role, paymentRequest)) {
    paymentError("Your role cannot submit this payment request.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("payment_requests")
    .update({ status: "submitted", submitted_at: now })
    .eq("id", paymentRequest.id)
    .in("status", ["draft", "rejected"]);

  if (error) {
    paymentError(error.message);
  }

  await recordOpsAuditEvent({
    action: "payment_request.submitted",
    actorUserId: profile.id,
    entityId: paymentRequest.id,
    entityType: "payment_request",
    metadata: { submitted_at: now },
    moduleKey: "payment_requests",
    sourceId: paymentRequest.id,
    sourceTable: "payment_requests",
    summary: `Submitted payment request ${paymentRequest.request_number}`,
  }).catch(() => null);

  revalidatePath(PAYMENT_REQUESTS_ROUTE);
  redirect(`${PAYMENT_REQUESTS_ROUTE}?updated=submitted`);
}

export async function reviewPaymentRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = paymentRequestIdSchema.safeParse({
    payment_request_id: field(formData, "payment_request_id"),
  });

  if (!parsed.success) {
    paymentError(parsed.error.issues[0]?.message ?? "Select a payment request.");
  }

  const paymentRequest = await fetchPaymentRequestForMutation(parsed.data.payment_request_id);

  if (!paymentRequest) {
    paymentError("Payment request was not found.");
  }

  if (!canReviewOpsPaymentRequest(profile.role, paymentRequest)) {
    paymentError("Your role cannot move this request into finance review.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("payment_requests")
    .update({ reviewed_at: now, reviewed_by: profile.id, status: "finance_review" })
    .eq("id", paymentRequest.id)
    .eq("status", "submitted");

  if (error) {
    paymentError(error.message);
  }

  await recordOpsAuditEvent({
    action: "payment_request.finance_review_started",
    actorUserId: profile.id,
    entityId: paymentRequest.id,
    entityType: "payment_request",
    metadata: { reviewed_at: now },
    moduleKey: "payment_requests",
    sourceId: paymentRequest.id,
    sourceTable: "payment_requests",
    summary: `Started finance review for ${paymentRequest.request_number}`,
  }).catch(() => null);

  revalidatePath(PAYMENT_REQUESTS_ROUTE);
  redirect(`${PAYMENT_REQUESTS_ROUTE}?updated=finance_review`);
}

export async function approvePaymentRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = paymentRequestIdSchema.safeParse({
    payment_request_id: field(formData, "payment_request_id"),
  });

  if (!parsed.success) {
    paymentError(parsed.error.issues[0]?.message ?? "Select a payment request.");
  }

  const paymentRequest = await fetchPaymentRequestForMutation(parsed.data.payment_request_id);

  if (!paymentRequest) {
    paymentError("Payment request was not found.");
  }

  if (!canApproveOpsPaymentRequest(profile.role, paymentRequest)) {
    paymentError("Your role cannot approve this payment request.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("payment_requests")
    .update({ approved_at: now, approved_by: profile.id, status: "approved" })
    .eq("id", paymentRequest.id)
    .eq("status", "finance_review");

  if (error) {
    paymentError(error.message);
  }

  await upsertPaymentCostEntry({
    actorUserId: profile.id,
    paymentRequest,
    status: "committed",
  }).catch((error: unknown) =>
    recordOpsAuditEvent({
      action: "payment_request.cost_entry_sync_failed",
      actorUserId: profile.id,
      entityId: paymentRequest.id,
      entityType: "payment_request",
      metadata: {
        error: error instanceof Error ? error.message : "Unknown cost-entry sync error",
      },
      moduleKey: "payment_requests",
      sourceId: paymentRequest.id,
      sourceTable: "payment_requests",
      summary: `Cost entry sync failed for ${paymentRequest.request_number}`,
    }).catch(() => null),
  );

  await postPaymentRequestJournalSafe(
    {
      id: paymentRequest.id,
      request_number: paymentRequest.request_number,
      title: paymentRequest.title,
      site_id: paymentRequest.site_id,
      payment_type: paymentRequest.payment_type,
      requested_amount: paymentRequest.requested_amount,
      cost_treatment: paymentRequest.cost_treatment,
    },
    "accrued",
    profile.id,
  );

  await recordOpsAuditEvent({
    action: "payment_request.approved",
    actorUserId: profile.id,
    entityId: paymentRequest.id,
    entityType: "payment_request",
    metadata: { approved_at: now },
    moduleKey: "payment_requests",
    sourceId: paymentRequest.id,
    sourceTable: "payment_requests",
    summary: `Approved payment request ${paymentRequest.request_number}`,
  }).catch(() => null);

  revalidatePath(PAYMENT_REQUESTS_ROUTE);
  revalidatePath(PROJECT_BUDGETS_ROUTE);
  redirect(`${PAYMENT_REQUESTS_ROUTE}?updated=approved`);
}

export async function rejectPaymentRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = paymentRequestIdSchema.safeParse({
    payment_request_id: field(formData, "payment_request_id"),
  });

  if (!parsed.success) {
    paymentError(parsed.error.issues[0]?.message ?? "Select a payment request.");
  }

  const paymentRequest = await fetchPaymentRequestForMutation(parsed.data.payment_request_id);

  if (!paymentRequest) {
    paymentError("Payment request was not found.");
  }

  if (!canRejectOpsPaymentRequest(profile.role, paymentRequest)) {
    paymentError("Your role cannot reject this payment request.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("payment_requests")
    .update({ rejected_at: now, rejected_by: profile.id, status: "rejected" })
    .eq("id", paymentRequest.id)
    .in("status", ["submitted", "finance_review"]);

  if (error) {
    paymentError(error.message);
  }

  await upsertPaymentCostEntry({
    actorUserId: profile.id,
    paymentRequest,
    status: "cancelled",
  }).catch(() => null);

  await recordOpsAuditEvent({
    action: "payment_request.rejected",
    actorUserId: profile.id,
    entityId: paymentRequest.id,
    entityType: "payment_request",
    metadata: { rejected_at: now },
    moduleKey: "payment_requests",
    sourceId: paymentRequest.id,
    sourceTable: "payment_requests",
    summary: `Rejected payment request ${paymentRequest.request_number}`,
  }).catch(() => null);

  revalidatePath(PAYMENT_REQUESTS_ROUTE);
  revalidatePath(PROJECT_BUDGETS_ROUTE);
  redirect(`${PAYMENT_REQUESTS_ROUTE}?updated=rejected`);
}

export async function markPaymentRequestPaidAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = paymentReferenceSchema.safeParse({
    payment_reference: field(formData, "payment_reference"),
    payment_request_id: field(formData, "payment_request_id"),
  });

  if (!parsed.success) {
    paymentError(parsed.error.issues[0]?.message ?? "Check the payment details.");
  }

  const paymentRequest = await fetchPaymentRequestForMutation(parsed.data.payment_request_id);

  if (!paymentRequest) {
    paymentError("Payment request was not found.");
  }

  if (!canPayOpsPaymentRequest(profile.role, paymentRequest)) {
    paymentError("Your role cannot mark this payment as paid.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("payment_requests")
    .update({
      paid_at: now,
      paid_by: profile.id,
      payment_reference: parsed.data.payment_reference,
      status: "paid",
    })
    .eq("id", paymentRequest.id)
    .eq("status", "approved");

  if (error) {
    paymentError(error.message);
  }

  await upsertPaymentCostEntry({
    actorUserId: profile.id,
    paymentReference: parsed.data.payment_reference,
    paymentRequest,
    status: "posted",
  });

  await postPaymentRequestJournalSafe(
    {
      id: paymentRequest.id,
      request_number: paymentRequest.request_number,
      title: paymentRequest.title,
      site_id: paymentRequest.site_id,
      payment_type: paymentRequest.payment_type,
      requested_amount: paymentRequest.requested_amount,
      cost_treatment: paymentRequest.cost_treatment,
      payment_reference: parsed.data.payment_reference,
    },
    "paid",
    profile.id,
  );

  await recordOpsAuditEvent({
    action: "payment_request.paid",
    actorUserId: profile.id,
    entityId: paymentRequest.id,
    entityType: "payment_request",
    metadata: {
      paid_at: now,
      payment_reference: parsed.data.payment_reference,
    },
    moduleKey: "payment_requests",
    sourceId: paymentRequest.id,
    sourceTable: "payment_requests",
    summary: `Marked ${paymentRequest.request_number} as paid`,
  }).catch(() => null);

  revalidatePath(PAYMENT_REQUESTS_ROUTE);
  revalidatePath(PROJECT_BUDGETS_ROUTE);
  redirect(`${PAYMENT_REQUESTS_ROUTE}?updated=paid`);
}

export async function cancelPaymentRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = paymentRequestIdSchema.safeParse({
    payment_request_id: field(formData, "payment_request_id"),
  });

  if (!parsed.success) {
    paymentError(parsed.error.issues[0]?.message ?? "Select a payment request.");
  }

  const paymentRequest = await fetchPaymentRequestForMutation(parsed.data.payment_request_id);

  if (!paymentRequest) {
    paymentError("Payment request was not found.");
  }

  if (!canCancelOpsPaymentRequest(profile.id, profile.role, paymentRequest)) {
    paymentError("Your role cannot cancel this payment request.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("payment_requests")
    .update({ cancelled_at: now, cancelled_by: profile.id, status: "cancelled" })
    .eq("id", paymentRequest.id)
    .in("status", ["draft", "submitted", "finance_review"]);

  if (error) {
    paymentError(error.message);
  }

  await upsertPaymentCostEntry({
    actorUserId: profile.id,
    paymentRequest,
    status: "cancelled",
  }).catch(() => null);

  await recordOpsAuditEvent({
    action: "payment_request.cancelled",
    actorUserId: profile.id,
    entityId: paymentRequest.id,
    entityType: "payment_request",
    metadata: { cancelled_at: now },
    moduleKey: "payment_requests",
    sourceId: paymentRequest.id,
    sourceTable: "payment_requests",
    summary: `Cancelled payment request ${paymentRequest.request_number}`,
  }).catch(() => null);

  revalidatePath(PAYMENT_REQUESTS_ROUTE);
  revalidatePath(PROJECT_BUDGETS_ROUTE);
  redirect(`${PAYMENT_REQUESTS_ROUTE}?updated=cancelled`);
}

// =============================================================================
// J2: Edit / archive / hard-delete actions for payment requests.
// =============================================================================

const updatePaymentRequestSchema = z.object({
  payment_request_id: z.string().uuid("Select a payment request."),
  title: z.string().trim().min(2, "Title is required.").max(160),
  description: z.string().trim().max(800).default(""),
  requested_amount: z.coerce.number().min(0, "Amount cannot be negative."),
  due_date: z.string().trim().default(""),
  // Attribution is editable while the payable is still a draft. Charging a bill
  // to the wrong thing is the most likely mistake to need correcting, and
  // before approval nothing has posted, so there is nothing to unwind.
  charge_target: z.string().trim().default(""),
  cost_centre_id: z.string().trim().default(""),
  cost_treatment: z.string().trim().default(""),
  legacy_project_id: z.string().trim().default(""),
  site_id: z.string().trim().default(""),
});

export async function updatePaymentRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = updatePaymentRequestSchema.safeParse({
    payment_request_id: field(formData, "payment_request_id"),
    title: field(formData, "title"),
    description: field(formData, "description"),
    requested_amount: field(formData, "requested_amount"),
    due_date: field(formData, "due_date"),
    charge_target: field(formData, "charge_target"),
    cost_centre_id: field(formData, "cost_centre_id"),
    cost_treatment: field(formData, "cost_treatment"),
    legacy_project_id: field(formData, "legacy_project_id"),
    site_id: field(formData, "site_id"),
  });
  if (!parsed.success) {
    paymentError(parsed.error.issues[0]?.message ?? "Check the payment request details.");
  }

  const paymentRequest = await fetchPaymentRequestForMutation(parsed.data.payment_request_id);
  if (!paymentRequest) {
    paymentError("Payment request was not found.");
  }
  if (!canEditOpsPaymentRequest(profile.id, profile.role, paymentRequest)) {
    paymentError("Payment requests can only be edited while in draft or rejected status.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const dueDate =
    parsed.data.due_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.data.due_date)
      ? parsed.data.due_date
      : null;

  // Attribution is only rewritten when the form actually submitted one, so an
  // older edit form that predates the charge-target selector still works and
  // leaves the existing attribution alone.
  let attribution: Record<string, unknown> = {};

  if (parsed.data.charge_target) {
    const charge = resolveOpsChargeTarget({
      // Only a site payable keeps its budget line. Re-charging a bill to a
      // completed project or an overhead means the budget link no longer
      // applies, so it is dropped below rather than reported as a conflict the
      // edit form gives you no way to resolve.
      budgetLineId:
        parsed.data.charge_target === "site" ? paymentRequest.budget_line_id : null,
      chargeTarget: parsed.data.charge_target,
      costCentreId: parsed.data.cost_centre_id,
      costTreatment: parsed.data.cost_treatment,
      legacyProjectId: parsed.data.legacy_project_id,
      siteId: parsed.data.site_id,
    });

    if (!charge.ok) {
      paymentError(charge.message);
    }

    if (charge.value.charge_target === "site") {
      await assertActiveSite(charge.value.site_id!, paymentError);
    } else {
      await assertChargeTargetExists(charge.value, paymentError);
    }

    attribution = {
      charge_target: charge.value.charge_target,
      cost_centre_id: charge.value.cost_centre_id,
      cost_treatment: charge.value.cost_treatment,
      legacy_project_id: charge.value.legacy_project_id,
      site_id: charge.value.site_id,
      // The CHECK constraint requires this anyway; doing it here means the user
      // gets a working save rather than a constraint violation.
      ...(charge.value.charge_target === "site"
        ? {}
        : { budget_id: null, budget_line_id: null }),
    };
  }

  const { error } = await supabase
    .from("payment_requests")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      requested_amount: parsed.data.requested_amount,
      due_date: dueDate,
      ...attribution,
    })
    .eq("id", parsed.data.payment_request_id);
  if (error) {
    paymentError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "payment_request.updated",
    entity_type: "payment_request",
    entity_id: parsed.data.payment_request_id,
    module_key: "payment_requests",
    source_table: "payment_requests",
    source_id: parsed.data.payment_request_id,
    metadata: { request_number: paymentRequest.request_number },
  });

  revalidatePath(PAYMENT_REQUESTS_ROUTE);
  redirect(`${PAYMENT_REQUESTS_ROUTE}?updated=payment_request`);
}

const paymentRequestIdOnlySchema = z.object({
  payment_request_id: z.string().uuid("Select a payment request."),
});

export async function archivePaymentRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = paymentRequestIdOnlySchema.safeParse({
    payment_request_id: field(formData, "payment_request_id"),
  });
  if (!parsed.success) {
    paymentError(parsed.error.issues[0]?.message ?? "Select a payment request.");
  }

  const paymentRequest = await fetchPaymentRequestForMutation(parsed.data.payment_request_id);
  if (!paymentRequest) {
    paymentError("Payment request was not found.");
  }
  if (!canArchiveOpsPaymentRequest(profile.role, paymentRequest)) {
    paymentError(
      "Payment requests can only be archived once paid, rejected, or cancelled, and only by leadership.",
    );
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("payment_requests")
    .update({ archived_at: new Date().toISOString(), archived_by: profile.id })
    .eq("id", parsed.data.payment_request_id);
  if (error) {
    paymentError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "payment_request.archived",
    entity_type: "payment_request",
    entity_id: parsed.data.payment_request_id,
    module_key: "payment_requests",
    source_table: "payment_requests",
    source_id: parsed.data.payment_request_id,
  });

  revalidatePath(PAYMENT_REQUESTS_ROUTE);
  redirect(`${PAYMENT_REQUESTS_ROUTE}?updated=archived`);
}

export async function deletePaymentRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = paymentRequestIdOnlySchema.safeParse({
    payment_request_id: field(formData, "payment_request_id"),
  });
  if (!parsed.success) {
    paymentError(parsed.error.issues[0]?.message ?? "Select a payment request.");
  }

  const paymentRequest = await fetchPaymentRequestForMutation(parsed.data.payment_request_id);
  if (!paymentRequest) {
    paymentError("Payment request was not found.");
  }

  if (!canDeleteOpsPaymentRequest(profile.id, profile.role, paymentRequest)) {
    paymentError(
      "Only a draft or rejected payable can be deleted. Cancel it instead — an approved payable has already been posted to the ledger.",
    );
  }

  const supabase = getOpsSupabaseServiceClient();

  // Belt and braces. The status check above is the real guard, but if the
  // lifecycle ever changes so that something posts earlier, this stops a
  // delete from orphaning a journal entry rather than discovering it later in
  // an unbalanced trial balance.
  const { count: postedCosts } = await supabase
    .from("project_cost_entries")
    .select("id", { count: "exact", head: true })
    .eq("payment_request_id", parsed.data.payment_request_id);

  if ((postedCosts ?? 0) > 0) {
    paymentError(
      "This payable has already reached the cost ledger and cannot be deleted. Cancel it instead.",
    );
  }

  const { error } = await supabase
    .from("payment_requests")
    .delete()
    .eq("id", parsed.data.payment_request_id)
    // Re-assert the state in the delete itself, so a concurrent approval
    // between the check above and this line cannot be deleted out from under.
    .in("status", ["draft", "rejected"]);
  if (error) {
    paymentError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "payment_request.deleted",
    entity_type: "payment_request",
    entity_id: parsed.data.payment_request_id,
    metadata: {
      charge_target: paymentRequest.charge_target,
      request_number: paymentRequest.request_number,
      requested_amount: paymentRequest.requested_amount,
      status_when_deleted: paymentRequest.status,
    },
    module_key: "payment_requests",
    source_table: "payment_requests",
    source_id: parsed.data.payment_request_id,
    summary: `Deleted ${paymentRequest.status} payable ${paymentRequest.request_number}`,
  });

  revalidatePath(PAYMENT_REQUESTS_ROUTE);
  redirect(`${PAYMENT_REQUESTS_ROUTE}?updated=deleted`);
}
