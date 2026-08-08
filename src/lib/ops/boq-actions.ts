"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import {
  canArchiveBoq,
  canAttachBoqPricing,
  canCreateBoq,
  canDeleteBoq,
  canEditBoq,
  canIssueBoq,
  canReviseBoq,
  canSubmitBoqForPricing,
  type OpsBoqMutationTarget,
} from "@/lib/ops/boq-permissions";
import { LockedBudgetError, syncProjectBudgetFromBoq } from "@/lib/ops/boq-budget-sync";
import { diffBoqRevision, summarizeBoqRevisionDiff } from "@/lib/ops/boq-revisions";
import { readPdfRows, readXlsxRows } from "@/lib/ops/boq-imports";
import {
  optionalCostCodeSelectionSchema,
  resolveOpsCostCodeSelection,
} from "@/lib/ops/cost-code-picker";
import { logOpsServerError, swallowOpsError } from "@/lib/ops/log";
import { fanoutToOpsRoles } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const optionalSupplierId = z
  .string()
  .trim()
  .default("")
  .transform((value) => (value.length > 0 ? value : null))
  .refine((value) => value === null || UUID_PATTERN.test(value), {
    message: "Select a valid supplier.",
  });

const createBoqSchema = z.object({
  site_id: z.string().uuid("Select a Pymble site."),
  title: z.string().trim().min(2, "Schedule title is required.").max(160),
  version: z.coerce.number().int().positive().default(1),
});

const optionalCategory = z
  .string()
  .trim()
  .toLowerCase()
  .default("general")
  .transform((value) => {
    const slug = value.replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (!slug) {
      return "general";
    }
    // The DB constraint requires the first character to be a letter.
    return /^[a-z]/.test(slug) ? slug : `c_${slug}`;
  });

const optionalDateInput = z
  .string()
  .trim()
  .default("")
  .transform((value) => (value.length > 0 ? value : null))
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: "Use a valid date.",
  });

const optionalStockItemId = z
  .string()
  .trim()
  .default("")
  .transform((value) => (value.length > 0 ? value : null))
  .refine((value) => value === null || UUID_PATTERN.test(value), {
    message: "Select a valid material from the dictionary.",
  });

const optionalProjectTaskId = z
  .string()
  .trim()
  .default("")
  .transform((value) => (value.length > 0 ? value : null))
  .refine((value) => value === null || UUID_PATTERN.test(value), {
    message: "Select a valid project task.",
  });

const optionalLeadTimeDays = z
  .string()
  .trim()
  .default("")
  .transform((value) => (value.length > 0 ? Number(value) : null))
  .refine((value) => value === null || (Number.isFinite(value) && value >= 0), {
    message: "Lead time must be zero or more days.",
  });

const createLineItemSchema = z.object({
  boq_id: z.string().uuid("Select a material schedule."),
  description: z.string().trim().min(2, "Line item description is required.").max(220),
  unit: z.string().trim().min(1, "Unit is required.").max(40),
  quantity: z.coerce.number().min(0, "Quantity cannot be negative."),
  unit_rate: z.coerce.number().min(0, "Unit rate cannot be negative.").default(0),
  actual_quantity: z.coerce.number().min(0, "Actual quantity cannot be negative.").default(0),
  supplier_id: optionalSupplierId,
  category: optionalCategory,
  needed_by: optionalDateInput,
  project_task_id: optionalProjectTaskId,
  lead_time_days_override: optionalLeadTimeDays,
  stock_item_id: optionalStockItemId,
  // The WBS leaf this planned line belongs to. Every material request called
  // off against the line inherits it, so setting it here is what makes the
  // planned→actual comparison work at all. Had no writer before this.
  cost_code_id: optionalCostCodeSelectionSchema,
});

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_CSV_ROWS = 1000;

const csvLineItemSchema = z.object({
  description: z.string().trim().min(2).max(220),
  unit: z.string().trim().min(1).max(40),
  quantity: z.coerce.number().min(0),
  unit_rate: z.coerce.number().min(0),
  actual_quantity: z.coerce.number().min(0).default(0),
});

// Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes ("")
// and both \n and \r\n line endings. Returns an array of string-cell rows.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char === "\r") {
      // ignore; handled by the \n branch
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

const CSV_HEADER_ALIASES: Record<string, string> = {
  // Description column variants
  description: "description",
  item: "description",
  "item description": "description",
  "item no.": "item_no",
  "item no": "item_no",
  item_no: "item_no",
  // Unit of measure variants
  unit: "unit",
  uom: "unit",
  "unit of measure": "unit",
  // Quantity variants
  quantity: "quantity",
  qty: "quantity",
  // Unit rate variants (including the form's "Unit Price (K)")
  rate: "unit_rate",
  "unit rate": "unit_rate",
  unit_rate: "unit_rate",
  price: "unit_rate",
  "unit price": "unit_rate",
  "unit price (k)": "unit_rate",
  // Optional actual
  actual: "actual_quantity",
  "actual quantity": "actual_quantity",
  actual_quantity: "actual_quantity",
  // Supplier — accept either internal code OR human name. We treat both as
  // a single "supplier" column: try to match against supplier_code first,
  // then against name; otherwise fall back to free-text.
  supplier: "supplier",
  "supplier code": "supplier",
  supplier_code: "supplier",
  "supplier name": "supplier",
  supplier_name: "supplier",
  vendor: "supplier",
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function boqError(message: string): never {
  redirect(`/ops/material-schedule?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

export async function createBoqDocumentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateBoq(profile.role)) {
    boqError(
      "Only the Quantity Surveyor, Projects Manager, and leadership can create material schedules.",
    );
  }

  const parsed = createBoqSchema.safeParse({
    site_id: field(formData, "site_id"),
    title: field(formData, "title"),
    version: field(formData, "version") || "1",
  });

  if (!parsed.success) {
    boqError(parsed.error.issues[0]?.message ?? "Check the BOQ details.");
  }

  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("boq_documents")
    .insert({
      ...parsed.data,
      status: "draft",
      created_by: profile.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    boqError(error?.message ?? "The BOQ document could not be created.");
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "boq.created",
    entity_type: "boq_document",
    entity_id: data.id,
    module_key: "boq",
    source_table: "boq_documents",
    source_id: data.id,
    metadata: {
      site_id: parsed.data.site_id,
      title: parsed.data.title,
    },
  });

  revalidatePath("/ops/material-schedule");
  redirect("/ops/material-schedule?created=boq");
}

export async function createBoqLineItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = createLineItemSchema.safeParse({
    actual_quantity: field(formData, "actual_quantity") || "0",
    boq_id: field(formData, "boq_id"),
    description: field(formData, "description"),
    quantity: field(formData, "quantity"),
    supplier_id: field(formData, "supplier_id"),
    unit: field(formData, "unit"),
    unit_rate: field(formData, "unit_rate") || "0",
    category: field(formData, "category"),
    needed_by: field(formData, "needed_by"),
    project_task_id: field(formData, "project_task_id"),
    lead_time_days_override: field(formData, "lead_time_days_override"),
    stock_item_id: field(formData, "stock_item_id"),
    cost_code_id: field(formData, "cost_code_id"),
  });

  if (!parsed.success) {
    boqError(parsed.error.issues[0]?.message ?? "Check the line item details.");
  }

  const target = await fetchBoqMutationTarget(parsed.data.boq_id);
  if (!target) {
    boqError("material schedule was not found.");
  }
  if (!canEditBoq(profile.role, target)) {
    boqError(
      "Lines can only be added to a material schedule while it is in draft and not archived.",
    );
  }

  // A planned line is measured work, so it charges a leaf — a phase node would
  // double-count against the leaves rolled up beneath it.
  const costCode = await resolveOpsCostCodeSelection({
    selection: parsed.data.cost_code_id,
    siteId: target.site_id,
    actorUserId: profile.id,
    leafOnly: true,
  });
  if (!costCode.ok) {
    boqError(costCode.message);
  }

  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("boq_line_items")
    .insert({ ...parsed.data, cost_code_id: costCode.costCodeId })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    boqError(error?.message ?? "The line item could not be added.");
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "boq_line_item.created",
    entity_type: "boq_line_item",
    entity_id: data.id,
    module_key: "boq",
    source_table: "boq_documents",
    source_id: parsed.data.boq_id,
    metadata: {
      boq_id: parsed.data.boq_id,
    },
  });

  revalidatePath("/ops/material-schedule");
  redirect("/ops/material-schedule?created=line");
}

// ---------------------------------------------------------------------------
// I3: Edit / delete / archive actions for BOQ
// ---------------------------------------------------------------------------

const boqIdSchema = z.object({
  boq_id: z.string().uuid("Select a material schedule."),
});

const lineItemIdSchema = z.object({
  line_item_id: z.string().uuid("Select a line item."),
});

const updateBoqSchema = boqIdSchema.extend({
  title: z.string().trim().min(2, "Title is required.").max(160),
  version: z.coerce.number().int().positive().default(1),
});

const updateLineItemSchema = lineItemIdSchema.extend({
  description: z.string().trim().min(2, "Line item description is required.").max(220),
  unit: z.string().trim().min(1, "Unit is required.").max(40),
  quantity: z.coerce.number().min(0, "Quantity cannot be negative."),
  unit_rate: z.coerce.number().min(0, "Unit rate cannot be negative."),
  actual_quantity: z.coerce.number().min(0, "Actual quantity cannot be negative.").default(0),
  supplier_id: z
    .string()
    .trim()
    .default("")
    .transform((value) => (value.length > 0 ? value : null)),
  category: optionalCategory,
  needed_by: optionalDateInput,
  project_task_id: optionalProjectTaskId,
  lead_time_days_override: optionalLeadTimeDays,
  stock_item_id: optionalStockItemId,
  cost_code_id: optionalCostCodeSelectionSchema,
});

type BoqDocumentForMutation = OpsBoqMutationTarget & {
  id: string;
  site_id: string;
  title: string;
  created_by: string | null;
};

async function fetchBoqMutationTarget(boqId: string): Promise<BoqDocumentForMutation | null> {
  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("boq_documents")
    .select("id, site_id, title, created_by, status, deleted_at, archived_at, superseded_at")
    .eq("id", boqId)
    .maybeSingle<BoqDocumentForMutation>();
  if (error) {
    throw error;
  }
  return data;
}

async function fetchBoqIdForLine(lineItemId: string): Promise<string | null> {
  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("boq_line_items")
    .select("boq_id")
    .eq("id", lineItemId)
    .maybeSingle<{ boq_id: string }>();
  if (error) {
    throw error;
  }
  return data?.boq_id ?? null;
}

export async function updateBoqDocumentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = updateBoqSchema.safeParse({
    boq_id: field(formData, "boq_id"),
    title: field(formData, "title"),
    version: field(formData, "version") || "1",
  });
  if (!parsed.success) {
    boqError(parsed.error.issues[0]?.message ?? "Check the BOQ details.");
  }

  const target = await fetchBoqMutationTarget(parsed.data.boq_id);
  if (!target) {
    boqError("material schedule was not found.");
  }
  if (!canEditBoq(profile.role, target)) {
    boqError(
      "Only the Quantity Surveyor, Projects Manager, and leadership can edit a material schedule while it is in draft.",
    );
  }

  // Status is no longer editable from here — it only moves forward through
  // submitBoqForPricingAction / attachBoqPricingAction / issueBoqAction, so a
  // schedule can never skip Procurement's mandatory pricing step.
  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("boq_documents")
    .update({
      title: parsed.data.title,
      version: parsed.data.version,
    })
    .eq("id", parsed.data.boq_id);
  if (error) {
    boqError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "boq.updated",
    entity_type: "boq_document",
    entity_id: parsed.data.boq_id,
    module_key: "boq",
    source_table: "boq_documents",
    source_id: parsed.data.boq_id,
    metadata: { title: parsed.data.title, version: parsed.data.version },
  });

  revalidatePath("/ops/material-schedule");
  redirect("/ops/material-schedule?updated=boq");
}

export async function updateBoqLineItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = updateLineItemSchema.safeParse({
    line_item_id: field(formData, "line_item_id"),
    description: field(formData, "description"),
    unit: field(formData, "unit"),
    quantity: field(formData, "quantity"),
    unit_rate: field(formData, "unit_rate"),
    actual_quantity: field(formData, "actual_quantity") || "0",
    supplier_id: field(formData, "supplier_id"),
    category: field(formData, "category"),
    needed_by: field(formData, "needed_by"),
    project_task_id: field(formData, "project_task_id"),
    lead_time_days_override: field(formData, "lead_time_days_override"),
    stock_item_id: field(formData, "stock_item_id"),
    cost_code_id: field(formData, "cost_code_id"),
  });
  if (!parsed.success) {
    boqError(parsed.error.issues[0]?.message ?? "Check the line item details.");
  }

  const boqId = await fetchBoqIdForLine(parsed.data.line_item_id);
  if (!boqId) {
    boqError("Line item was not found.");
  }
  const target = await fetchBoqMutationTarget(boqId);
  if (!target) {
    boqError("material schedule was not found.");
  }
  if (!canEditBoq(profile.role, target)) {
    boqError("Lines can only be edited while the material schedule is in draft.");
  }

  const costCode = await resolveOpsCostCodeSelection({
    selection: parsed.data.cost_code_id,
    siteId: target.site_id,
    actorUserId: profile.id,
    leafOnly: true,
  });
  if (!costCode.ok) {
    boqError(costCode.message);
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("boq_line_items")
    .update({
      description: parsed.data.description,
      unit: parsed.data.unit,
      quantity: parsed.data.quantity,
      unit_rate: parsed.data.unit_rate,
      supplier_id: parsed.data.supplier_id,
      category: parsed.data.category,
      needed_by: parsed.data.needed_by,
      project_task_id: parsed.data.project_task_id,
      lead_time_days_override: parsed.data.lead_time_days_override,
      stock_item_id: parsed.data.stock_item_id,
      cost_code_id: costCode.costCodeId,
    })
    .eq("id", parsed.data.line_item_id);
  if (error) {
    boqError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "boq_line_item.updated",
    entity_type: "boq_line_item",
    entity_id: parsed.data.line_item_id,
    module_key: "boq",
    source_table: "boq_documents",
    source_id: boqId,
    metadata: { description: parsed.data.description },
  });

  revalidatePath("/ops/material-schedule");
  redirect("/ops/material-schedule?updated=line");
}

export async function deleteBoqLineItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = lineItemIdSchema.safeParse({ line_item_id: field(formData, "line_item_id") });
  if (!parsed.success) {
    boqError(parsed.error.issues[0]?.message ?? "Select a line item.");
  }

  const boqId = await fetchBoqIdForLine(parsed.data.line_item_id);
  if (!boqId) {
    boqError("Line item was not found.");
  }
  const target = await fetchBoqMutationTarget(boqId);
  if (!target) {
    boqError("material schedule was not found.");
  }
  if (!canEditBoq(profile.role, target)) {
    boqError("Lines can only be deleted while the material schedule is in draft.");
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("boq_line_items")
    .delete()
    .eq("id", parsed.data.line_item_id);
  if (error) {
    boqError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "boq_line_item.deleted",
    entity_type: "boq_line_item",
    entity_id: parsed.data.line_item_id,
    module_key: "boq",
    source_table: "boq_documents",
    source_id: boqId,
    metadata: { boq_id: boqId },
  });

  revalidatePath("/ops/material-schedule");
  redirect("/ops/material-schedule?updated=line_deleted");
}

/**
 * Archiving or restoring an *issued* schedule changes the set of live phases
 * the site budget is computed from (audit D14), so the budget must recompute.
 * Best-effort, same non-fatal pattern as issueBoqAction: the lifecycle change
 * itself must never be blocked by a sync hiccup, but a failure is logged and
 * recorded rather than swallowed.
 */
async function resyncSiteBudgetAfterBoqLifecycleChange(
  boqId: string,
  actorUserId: string,
  action: string,
) {
  await syncProjectBudgetFromBoq(boqId, actorUserId).catch((syncError: unknown) => {
    const supabase = getOpsSupabaseServiceClient();

    if (syncError instanceof LockedBudgetError) {
      return supabase.from("audit_events").insert({
        actor_user_id: actorUserId,
        action: `${action}_budget_locked`,
        entity_type: "boq_document",
        entity_id: boqId,
        module_key: "boq",
        source_table: "boq_documents",
        source_id: boqId,
        metadata: { budget_id: syncError.budgetId },
      });
    }

    logOpsServerError(syncError, {
      module: "boq",
      action: `${action}.syncProjectBudget`,
      actorUserId,
      entityType: "boq_document",
      entityId: boqId,
    });

    return supabase.from("audit_events").insert({
      actor_user_id: actorUserId,
      action: `${action}_budget_sync_failed`,
      entity_type: "boq_document",
      entity_id: boqId,
      module_key: "boq",
      source_table: "boq_documents",
      source_id: boqId,
      metadata: {
        error: syncError instanceof Error ? syncError.message : String(syncError),
      },
    });
  });
}

export async function archiveBoqAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canArchiveBoq(profile.role)) {
    boqError(
      "Only Developer, Managing Director, General Manager, Operations Manager, and Projects Manager can archive a material schedule.",
    );
  }

  const parsed = boqIdSchema.safeParse({ boq_id: field(formData, "boq_id") });
  if (!parsed.success) {
    boqError(parsed.error.issues[0]?.message ?? "Select a material schedule.");
  }

  const target = await fetchBoqMutationTarget(parsed.data.boq_id);
  if (!target) {
    boqError("material schedule was not found.");
  }
  if (target.archived_at) {
    boqError("This material schedule is already archived.");
  }

  const supabase = await createOpsServerSessionClient();
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("boq_documents")
    .update({ archived_at: nowIso, archived_by: profile.id })
    .eq("id", parsed.data.boq_id);
  if (error) {
    boqError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "boq.archived",
    entity_type: "boq_document",
    entity_id: parsed.data.boq_id,
    module_key: "boq",
    source_table: "boq_documents",
    source_id: parsed.data.boq_id,
  });

  // An archived issued schedule leaves the live set — its phase's amounts
  // must come out of the site budget (audit D14).
  if (target.status === "issued") {
    await resyncSiteBudgetAfterBoqLifecycleChange(target.id, profile.id, "boq.archived");
  }

  revalidatePath("/ops/material-schedule");
  redirect("/ops/material-schedule?updated=archived");
}

export async function restoreBoqAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canArchiveBoq(profile.role)) {
    boqError("Your role cannot restore archived material schedules.");
  }

  const parsed = boqIdSchema.safeParse({ boq_id: field(formData, "boq_id") });
  if (!parsed.success) {
    boqError(parsed.error.issues[0]?.message ?? "Select a material schedule.");
  }

  const target = await fetchBoqMutationTarget(parsed.data.boq_id);
  if (!target) {
    boqError("material schedule was not found.");
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("boq_documents")
    .update({ archived_at: null, archived_by: null })
    .eq("id", parsed.data.boq_id);
  if (error) {
    boqError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "boq.restored",
    entity_type: "boq_document",
    entity_id: parsed.data.boq_id,
    module_key: "boq",
    source_table: "boq_documents",
    source_id: parsed.data.boq_id,
  });

  // A restored issued schedule rejoins the live set — its phase's amounts
  // must come back into the site budget (audit D14). Superseded schedules
  // stay out: the live-set query in the sync excludes them regardless.
  if (target.status === "issued") {
    await resyncSiteBudgetAfterBoqLifecycleChange(target.id, profile.id, "boq.restored");
  }

  revalidatePath("/ops/material-schedule");
  redirect("/ops/material-schedule?updated=restored");
}

export async function deleteBoqAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canDeleteBoq(profile.role)) {
    boqError("Only the Developer can permanently delete a material schedule.");
  }

  const parsed = boqIdSchema.safeParse({ boq_id: field(formData, "boq_id") });
  if (!parsed.success) {
    boqError(parsed.error.issues[0]?.message ?? "Select a material schedule.");
  }

  const supabase = await createOpsServerSessionClient();
  // Soft tombstone via deleted_at so any FK references are preserved.
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("boq_documents")
    .update({ deleted_at: nowIso })
    .eq("id", parsed.data.boq_id);
  if (error) {
    boqError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "boq.deleted",
    entity_type: "boq_document",
    entity_id: parsed.data.boq_id,
    module_key: "boq",
    source_table: "boq_documents",
    source_id: parsed.data.boq_id,
  });

  revalidatePath("/ops/material-schedule");
  redirect("/ops/material-schedule?updated=deleted");
}

// ---------------------------------------------------------------------------
// BOQ pricing-split workflow: draft (QS) → pricing_pending → priced
// (Procurement) → issued (QS/Projects Manager/leadership sign-off, which also
// generates/syncs the project budget). Mirrors the Material Request
// pricing_pending/priced pattern in material-request-actions.ts.
// ---------------------------------------------------------------------------

export async function submitBoqForPricingAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = boqIdSchema.safeParse({ boq_id: field(formData, "boq_id") });
  if (!parsed.success) {
    boqError(parsed.error.issues[0]?.message ?? "Select a material schedule.");
  }

  const target = await fetchBoqMutationTarget(parsed.data.boq_id);
  if (!target) {
    boqError("material schedule was not found.");
  }
  if (!canSubmitBoqForPricing(profile.role, target)) {
    boqError(
      "Only the Quantity Surveyor, Projects Manager, and leadership can submit a schedule for pricing while it is in draft.",
    );
  }

  const supabase = await createOpsServerSessionClient();
  const { count } = await supabase
    .from("boq_line_items")
    .select("id", { count: "exact", head: true })
    .eq("boq_id", target.id);
  if (!count) {
    boqError("Add at least one line item before submitting the schedule for pricing.");
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("boq_documents")
    .update({ status: "pricing_pending", submitted_at: nowIso })
    .eq("id", target.id)
    .eq("status", "draft");
  if (error) {
    boqError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "boq.submitted_for_pricing",
    entity_type: "boq_document",
    entity_id: target.id,
    module_key: "boq",
    source_table: "boq_documents",
    source_id: target.id,
    metadata: { title: target.title },
  });

  const recipients = await fanoutToOpsRoles(
    ["procurement_manager", "procurement", "procurement_assistant"],
    { excludeUserIds: [profile.id] },
  );
  await Promise.all(
    recipients.map((recipient) =>
      queueOpsNotification({
        actionHref: `/ops/material-schedule?boq=${target.id}`,
        body: `${profile.full_name} submitted "${target.title}" for pricing. Add unit rates and transport estimates.`,
        idempotencyKey: `boq-submitted-pricing:${target.id}:${recipient.id}`,
        moduleKey: "boq",
        recipientId: recipient.id,
        sourceId: target.id,
        sourceTable: "boq_documents",
        title: `Price schedule: ${target.title}`,
      }).catch(() => null),
    ),
  );

  revalidatePath("/ops/material-schedule");
  redirect(`/ops/material-schedule?updated=submitted_for_pricing#boq-${target.id}`);
}

const pricingLineItemSchema = z.object({
  item_id: z.string().uuid("Select a line item."),
  unit_rate: z.coerce.number().min(0, "Unit rate cannot be negative.").max(1_000_000_000),
  estimated_transport_cost: z.coerce
    .number()
    .min(0, "Transport cost cannot be negative.")
    .max(1_000_000_000)
    .optional(),
});

export async function attachBoqPricingAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const idParsed = boqIdSchema.safeParse({ boq_id: field(formData, "boq_id") });
  if (!idParsed.success) {
    boqError(idParsed.error.issues[0]?.message ?? "Select a material schedule.");
  }

  const target = await fetchBoqMutationTarget(idParsed.data.boq_id);
  if (!target) {
    boqError("material schedule was not found.");
  }
  if (!canAttachBoqPricing(profile.role, target)) {
    boqError(
      "Only Procurement and leadership can price a schedule, and only once it has been submitted by the Quantity Surveyor.",
    );
  }

  // Collect every `unit_rate::<itemId>` / `estimated_transport_cost::<itemId>`
  // pair from the form — a partial save is allowed, mirroring
  // attachMaterialRequestPricingAction.
  const updates = new Map<string, { unit_rate?: number; estimated_transport_cost?: number }>();
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("unit_rate::")) {
      const itemId = key.slice("unit_rate::".length);
      const parsed = pricingLineItemSchema.pick({ item_id: true, unit_rate: true }).safeParse({
        item_id: itemId,
        unit_rate: value,
      });
      if (!parsed.success) {
        boqError(parsed.error.issues[0]?.message ?? "Check the line item prices.");
      }
      updates.set(itemId, { ...updates.get(itemId), unit_rate: parsed.data.unit_rate });
    } else if (key.startsWith("estimated_transport_cost::")) {
      const itemId = key.slice("estimated_transport_cost::".length);
      const parsed = pricingLineItemSchema
        .pick({ item_id: true, estimated_transport_cost: true })
        .safeParse({ item_id: itemId, estimated_transport_cost: value });
      if (!parsed.success) {
        boqError(parsed.error.issues[0]?.message ?? "Check the transport estimates.");
      }
      updates.set(itemId, {
        ...updates.get(itemId),
        estimated_transport_cost: parsed.data.estimated_transport_cost,
      });
    }
  }

  if (updates.size === 0) {
    boqError("Enter at least one unit rate before saving.");
  }

  const supabase = getOpsSupabaseServiceClient();

  const itemIds = Array.from(updates.keys());
  const { data: lineRows, error: lineFetchError } = await supabase
    .from("boq_line_items")
    .select("id, boq_id")
    .in("id", itemIds);
  if (lineFetchError) {
    boqError(lineFetchError.message);
  }
  const valid = (lineRows ?? []) as Array<{ id: string; boq_id: string }>;
  if (valid.length !== itemIds.length || valid.some((row) => row.boq_id !== target.id)) {
    boqError("One or more line items don't belong to this schedule.");
  }

  for (const [itemId, update] of updates) {
    const payload: Record<string, number> = {};
    if (update.unit_rate !== undefined) {
      payload.unit_rate = update.unit_rate;
    }
    if (update.estimated_transport_cost !== undefined) {
      payload.estimated_transport_cost = update.estimated_transport_cost;
    }
    const { error: updErr } = await supabase
      .from("boq_line_items")
      .update(payload)
      .eq("id", itemId);
    if (updErr) {
      boqError(updErr.message);
    }
  }

  const nowIso = new Date().toISOString();
  const { error: stateError } = await supabase
    .from("boq_documents")
    .update({ status: "priced", priced_at: nowIso, priced_by: profile.id })
    .eq("id", target.id)
    .in("status", ["pricing_pending", "priced"]);
  if (stateError) {
    boqError(stateError.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "boq.priced",
    entity_type: "boq_document",
    entity_id: target.id,
    module_key: "boq",
    source_table: "boq_documents",
    source_id: target.id,
    metadata: { title: target.title, lines_updated: updates.size },
  });

  const recipients = await fanoutToOpsRoles(["quantity_surveyor", "projects_manager"], {
    excludeUserIds: [profile.id],
  });
  const notifyIds = new Set(recipients.map((recipient) => recipient.id));
  if (target.created_by) {
    notifyIds.add(target.created_by);
  }
  await Promise.all(
    Array.from(notifyIds).map((recipientId) =>
      queueOpsNotification({
        actionHref: `/ops/material-schedule?boq=${target.id}`,
        body: `${profile.full_name} priced "${target.title}". It's ready to issue.`,
        idempotencyKey: `boq-priced:${target.id}:${recipientId}`,
        moduleKey: "boq",
        recipientId,
        sourceId: target.id,
        sourceTable: "boq_documents",
        title: `Ready to issue: ${target.title}`,
      }).catch(() => null),
    ),
  );

  revalidatePath("/ops/material-schedule");
  redirect(`/ops/material-schedule?updated=priced#boq-${target.id}`);
}

/**
 * Diff a schedule against the one it supersedes. Returns null when this is not
 * a revision, so callers can treat "first issue" and "re-issue" uniformly.
 */
async function buildBoqRevisionDiff(boqId: string) {
  const supabase = getOpsSupabaseServiceClient();

  const { data: document } = await supabase
    .from("boq_documents")
    .select("supersedes_id")
    .eq("id", boqId)
    .maybeSingle<{ supersedes_id: string | null }>();

  const previousId = document?.supersedes_id ?? null;
  if (!previousId) {
    return null;
  }

  const { data: rows, error } = await supabase
    .from("boq_line_items")
    .select("boq_id, description, unit, quantity, unit_rate, category, estimated_transport_cost")
    .in("boq_id", [previousId, boqId]);

  if (error) {
    throw error;
  }

  const toDiffLines = (targetId: string) =>
    ((rows ?? []) as Array<{
      boq_id: string;
      description: string;
      unit: string;
      quantity: number | string;
      unit_rate: number | string;
      category: string;
      estimated_transport_cost: number | string;
    }>)
      .filter((row) => row.boq_id === targetId)
      .map((row) => {
        const quantity = Number(row.quantity ?? 0);
        const unitRate = Number(row.unit_rate ?? 0);
        return {
          description: row.description,
          unit: row.unit,
          quantity,
          unitRate,
          category: row.category || "general",
          total: Math.round((quantity * unitRate + Number.EPSILON) * 100) / 100,
          transportCost: Number(row.estimated_transport_cost ?? 0),
        };
      });

  return {
    previousId,
    diff: diffBoqRevision(toDiffLines(previousId), toDiffLines(boqId)),
  };
}

/**
 * Open a revision of an issued schedule (audit B1).
 *
 * Clones the document and every line into a fresh draft at version + 1,
 * pointing back at the original via supersedes_id. The issued schedule is left
 * completely untouched — it stays the live version, and the budget it generated
 * stays authoritative, until the revision is itself issued. That keeps a
 * half-finished revision from disturbing anything downstream.
 */
export async function createBoqRevisionAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = boqIdSchema.safeParse({ boq_id: field(formData, "boq_id") });
  if (!parsed.success) {
    boqError(parsed.error.issues[0]?.message ?? "Select a schedule.");
  }

  const target = await fetchBoqMutationTarget(parsed.data.boq_id);
  if (!target) {
    boqError("Material schedule was not found.");
  }
  if (!canReviseBoq(profile.role, target)) {
    boqError(
      "Only an issued schedule can be revised, and only by the Quantity Surveyor, Projects Manager, or leadership.",
    );
  }

  const supabase = getOpsSupabaseServiceClient();

  const { data: source, error: sourceError } = await supabase
    .from("boq_documents")
    .select("id, site_id, title, version")
    .eq("id", target.id)
    .single<{ id: string; site_id: string; title: string; version: number }>();
  if (sourceError || !source) {
    boqError(sourceError?.message ?? "Material schedule was not found.");
  }

  // The partial unique index on supersedes_id is the real guard against two
  // people branching the same version; check first so they get a clear message
  // rather than a constraint violation.
  const { data: openRevision } = await supabase
    .from("boq_documents")
    .select("id")
    .eq("supersedes_id", target.id)
    .is("superseded_at", null)
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();

  if (openRevision) {
    boqError("A revision of this schedule is already open. Finish or discard it first.");
  }

  const { data: revision, error: revisionError } = await supabase
    .from("boq_documents")
    .insert({
      site_id: source.site_id,
      title: source.title,
      version: source.version + 1,
      status: "draft",
      supersedes_id: source.id,
      created_by: profile.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (revisionError || !revision) {
    boqError(revisionError?.message ?? "The revision could not be created.");
  }

  const { data: sourceLines, error: linesError } = await supabase
    .from("boq_line_items")
    .select(
      "description, unit, quantity, unit_rate, category, needed_by, estimated_transport_cost, lead_time_days_override, project_task_id, supplier_id, supplier_name_freeform",
    )
    .eq("boq_id", source.id)
    .order("created_at", { ascending: true });

  if (linesError) {
    boqError(linesError.message);
  }

  const lines = (sourceLines ?? []) as Array<Record<string, unknown>>;
  if (lines.length > 0) {
    const { error: cloneError } = await supabase
      .from("boq_line_items")
      .insert(lines.map((line) => ({ ...line, boq_id: revision.id })));
    if (cloneError) {
      boqError(cloneError.message);
    }
  }

  await recordOpsAuditEvent({
    action: "boq.revision_opened",
    actorUserId: profile.id,
    entityId: revision.id,
    entityType: "boq_document",
    metadata: {
      supersedes_id: source.id,
      title: source.title,
      version: source.version + 1,
      lines_cloned: lines.length,
    },
    moduleKey: "boq",
    sourceId: revision.id,
    sourceTable: "boq_documents",
    summary: `${profile.full_name} opened revision v${source.version + 1} of "${source.title}"`,
  }).catch(swallowOpsError({ module: "boq", action: "createBoqRevisionAction" }));

  revalidatePath("/ops/material-schedule");
  redirect(`/ops/material-schedule?updated=revision#boq-${revision.id}`);
}

export async function issueBoqAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = boqIdSchema.safeParse({ boq_id: field(formData, "boq_id") });
  if (!parsed.success) {
    boqError(parsed.error.issues[0]?.message ?? "Select a material schedule.");
  }

  const target = await fetchBoqMutationTarget(parsed.data.boq_id);
  if (!target) {
    boqError("material schedule was not found.");
  }
  if (!canIssueBoq(profile.role, target)) {
    boqError(
      "A schedule can only be issued once Procurement has priced every line. Only the Quantity Surveyor, Projects Manager, and leadership can issue it.",
    );
  }

  const supabase = getOpsSupabaseServiceClient();
  const nowIso = new Date().toISOString();

  // Capture the diff before anything changes, so the audit trail and the
  // notification can say what actually moved (audit B1).
  const revisionDiff = await buildBoqRevisionDiff(target.id);

  const { error } = await supabase
    .from("boq_documents")
    .update({ status: "issued", issued_at: nowIso, issued_by: profile.id })
    .eq("id", target.id)
    .eq("status", "priced");
  if (error) {
    boqError(error.message);
  }

  // Retire the predecessor only once its replacement is safely issued.
  if (revisionDiff) {
    const { error: supersedeError } = await supabase
      .from("boq_documents")
      .update({ superseded_at: nowIso, superseded_by: profile.id })
      .eq("id", revisionDiff.previousId)
      .is("superseded_at", null);
    if (supersedeError) {
      logOpsServerError(supersedeError, {
        module: "boq",
        action: "issueBoqAction.supersede",
        entityId: revisionDiff.previousId,
      });
    }
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "boq.issued",
    entity_type: "boq_document",
    entity_id: target.id,
    module_key: "boq",
    source_table: "boq_documents",
    source_id: target.id,
    metadata: {
      title: target.title,
      ...(revisionDiff
        ? {
            supersedes_id: revisionDiff.previousId,
            revision_summary: summarizeBoqRevisionDiff(revisionDiff.diff),
            total_delta: revisionDiff.diff.totalDelta,
            category_deltas: revisionDiff.diff.categoryDeltas,
          }
        : {}),
    },
  });

  // Generate/sync the project budget from the priced schedule. Best-effort:
  // a sync failure shouldn't block the issue itself, but is recorded so it
  // can be retried/investigated (same non-fatal pattern used for
  // material-request cost entries).
  await syncProjectBudgetFromBoq(target.id, profile.id).catch((syncError: unknown) => {
    // A locked budget is a legitimate refusal, not a fault — record it, but
    // don't page anyone (audit B1/B5).
    if (syncError instanceof LockedBudgetError) {
      return supabase.from("audit_events").insert({
        actor_user_id: profile.id,
        action: "boq.issued_budget_locked",
        entity_type: "boq_document",
        entity_id: target.id,
        module_key: "boq",
        source_table: "boq_documents",
        source_id: target.id,
        metadata: { budget_id: syncError.budgetId },
      });
    }

    // Report as well as record: the audit row alone meant a failed sync was
    // invisible until someone went looking (audit B4/S1).
    logOpsServerError(syncError, {
      module: "boq",
      action: "issueBoqAction.syncProjectBudget",
      actorUserId: profile.id,
      entityType: "boq_document",
      entityId: target.id,
    });

    return supabase.from("audit_events").insert({
      actor_user_id: profile.id,
      action: "boq.issued_budget_sync_failed",
      entity_type: "boq_document",
      entity_id: target.id,
      module_key: "boq",
      source_table: "boq_documents",
      source_id: target.id,
      metadata: {
        error: syncError instanceof Error ? syncError.message : String(syncError),
      },
    });
  });

  const recipients = await fanoutToOpsRoles(
    ["procurement_manager", "procurement", "finance_manager", "projects_manager"],
    { excludeUserIds: [profile.id] },
  );
  await Promise.all(
    recipients.map((recipient) =>
      queueOpsNotification({
        actionHref: `/ops/material-schedule?boq=${target.id}`,
        body: `${profile.full_name} issued "${target.title}". The project budget has been generated from it.`,
        idempotencyKey: `boq-issued:${target.id}:${recipient.id}`,
        moduleKey: "boq",
        recipientId: recipient.id,
        sourceId: target.id,
        sourceTable: "boq_documents",
        title: `Issued: ${target.title}`,
      }).catch(() => null),
    ),
  );

  revalidatePath("/ops/material-schedule");
  revalidatePath("/ops/project-budgets");
  redirect(`/ops/material-schedule?updated=issued#boq-${target.id}`);
}

export async function importBoqLineItemsCsvAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const boqId = field(formData, "boq_id");

  if (!UUID_PATTERN.test(boqId)) {
    boqError("Select a material schedule before importing.");
  }

  const target = await fetchBoqMutationTarget(boqId);
  if (!target) {
    boqError("material schedule was not found.");
  }
  if (!canEditBoq(profile.role, target)) {
    boqError(
      "Only the Quantity Surveyor, Projects Manager, and leadership can import lines while a material schedule is in draft.",
    );
  }

  // Accept the legacy "csv" field name or the new "file" field name so existing
  // UIs keep working while new UIs use a wider file input.
  const file =
    (formData.get("file") as File | null) ?? (formData.get("csv") as File | null);

  if (!(file instanceof File) || file.size === 0) {
    boqError("Choose a CSV, XLSX, or PDF file to import.");
  }

  if (file.size > MAX_CSV_BYTES) {
    boqError("Import files must be 2 MB or smaller.");
  }

  const filename = file.name.toLowerCase();
  let rows: string[][] = [];

  try {
    if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
      rows = await readXlsxRows(file);
    } else if (filename.endsWith(".pdf")) {
      rows = await readPdfRows(file);
    } else {
      const text = await file.text();
      rows = parseCsv(text);
    }
  } catch (importError) {
    boqError(
      importError instanceof Error
        ? `Could not read the file: ${importError.message}`
        : "Could not read the file.",
    );
  }

  rows = rows.filter((row) => row.some((cell) => (cell ?? "").toString().trim().length > 0));

  if (rows.length < 2) {
    boqError("The file needs a header row and at least one line item.");
  }

  const header = rows[0].map((cell) => CSV_HEADER_ALIASES[cell.trim().toLowerCase()] ?? "");
  const columnIndex = (key: string) => header.indexOf(key);
  const descriptionIndex = columnIndex("description");
  const unitIndex = columnIndex("unit");
  const quantityIndex = columnIndex("quantity");
  const rateIndex = columnIndex("unit_rate");
  const actualIndex = columnIndex("actual_quantity");
  const supplierIndex = columnIndex("supplier");

  if (descriptionIndex === -1 || unitIndex === -1 || quantityIndex === -1 || rateIndex === -1) {
    boqError(
      "Spreadsheet must include description, unit, quantity, and unit price columns (supplier is optional).",
    );
  }

  const dataRows = rows.slice(1);

  if (dataRows.length > MAX_CSV_ROWS) {
    boqError(`Import is limited to ${MAX_CSV_ROWS} rows at a time.`);
  }

  const service = getOpsSupabaseServiceClient();

  // Resolve supplier references once. We accept either the internal code
  // (e.g. "PATRIW") or the human name ("Patriw" / "Micmar woodlands").
  // If neither resolves to an active supplier we store the typed value as
  // free text on the line — per the per-item supplier model.
  const supplierCodeToId = new Map<string, string>();
  const supplierNameToId = new Map<string, string>();

  if (supplierIndex !== -1) {
    const rawValues = Array.from(
      new Set(
        dataRows
          .map((row) => (row[supplierIndex] ?? "").trim())
          .filter((value) => value.length > 0),
      ),
    );

    if (rawValues.length > 0) {
      const { data: suppliers, error: supplierError } = await service
        .from("suppliers")
        .select("id, supplier_code, legal_name")
        .eq("status", "active");

      if (supplierError) {
        boqError(supplierError.message);
      }

      for (const supplier of (suppliers ?? []) as Array<{ id: string; supplier_code: string | null; legal_name: string }>) {
        if (supplier.supplier_code) {
          supplierCodeToId.set(supplier.supplier_code.toUpperCase(), supplier.id);
        }
        supplierNameToId.set(supplier.legal_name.toLowerCase(), supplier.id);
      }
    }
  }

  const inserts: Array<{
    actual_quantity: number;
    boq_id: string;
    description: string;
    quantity: number;
    supplier_id: string | null;
    supplier_name_freeform: string | null;
    unit: string;
    unit_rate: number;
  }> = [];
  const rowErrors: string[] = [];
  let unmatchedSuppliers = 0;

  dataRows.forEach((row, index) => {
    const parsed = csvLineItemSchema.safeParse({
      actual_quantity: (row[actualIndex] ?? "").trim() || "0",
      description: row[descriptionIndex] ?? "",
      quantity: (row[quantityIndex] ?? "").trim(),
      unit: row[unitIndex] ?? "",
      unit_rate: (row[rateIndex] ?? "").trim(),
    });

    if (!parsed.success) {
      rowErrors.push(`Row ${index + 2}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
      return;
    }

    let supplierId: string | null = null;
    let supplierFreeform: string | null = null;

    if (supplierIndex !== -1) {
      const raw = (row[supplierIndex] ?? "").trim();
      if (raw.length > 0) {
        supplierId =
          supplierCodeToId.get(raw.toUpperCase()) ??
          supplierNameToId.get(raw.toLowerCase()) ??
          null;
        if (!supplierId) {
          supplierFreeform = raw;
          unmatchedSuppliers += 1;
        }
      }
    }

    inserts.push({
      actual_quantity: parsed.data.actual_quantity,
      boq_id: boqId,
      description: parsed.data.description,
      quantity: parsed.data.quantity,
      supplier_id: supplierId,
      supplier_name_freeform: supplierFreeform,
      unit: parsed.data.unit,
      unit_rate: parsed.data.unit_rate,
    });
  });

  if (inserts.length === 0) {
    boqError(
      rowErrors[0]
        ? `No rows imported. ${rowErrors[0]}`
        : "No valid line items were found in the CSV.",
    );
  }

  const { error: insertError } = await service.from("boq_line_items").insert(inserts);

  if (insertError) {
    boqError(insertError.message);
  }

  await service.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "boq_line_item.csv_imported",
    entity_type: "boq_document",
    entity_id: boqId,
    metadata: {
      boq_id: boqId,
      imported: inserts.length,
      skipped: rowErrors.length,
      unmatched_suppliers: unmatchedSuppliers,
    },
  });

  revalidatePath("/ops/material-schedule");
  redirect(`/ops/material-schedule?imported=${inserts.length}&skipped=${rowErrors.length}#boq-register`);
}
