"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import {
  canArchiveBoq,
  canCreateBoq,
  canDeleteBoq,
  canEditBoq,
  type OpsBoqMutationTarget,
} from "@/lib/ops/boq-permissions";
import { readPdfRows, readXlsxRows } from "@/lib/ops/boq-imports";
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
  title: z.string().trim().min(2, "BOQ title is required.").max(160),
  version: z.coerce.number().int().positive().default(1),
  status: z.enum(["draft", "issued"]),
});

const createLineItemSchema = z.object({
  boq_id: z.string().uuid("Select a BOQ document."),
  description: z.string().trim().min(2, "Line item description is required.").max(220),
  unit: z.string().trim().min(1, "Unit is required.").max(40),
  quantity: z.coerce.number().min(0, "Quantity cannot be negative."),
  unit_rate: z.coerce.number().min(0, "Unit rate cannot be negative."),
  actual_quantity: z.coerce.number().min(0, "Actual quantity cannot be negative.").default(0),
  supplier_id: optionalSupplierId,
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
  redirect(`/ops/boq?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

export async function createBoqDocumentAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateBoq(profile.role)) {
    boqError(
      "Only the Quantity Surveyor, Projects Manager, and leadership can create Bills of Quantities.",
    );
  }

  const parsed = createBoqSchema.safeParse({
    site_id: field(formData, "site_id"),
    status: field(formData, "status") || "draft",
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

  revalidatePath("/ops/boq");
  redirect("/ops/boq?created=boq");
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
    unit_rate: field(formData, "unit_rate"),
  });

  if (!parsed.success) {
    boqError(parsed.error.issues[0]?.message ?? "Check the line item details.");
  }

  const target = await fetchBoqMutationTarget(parsed.data.boq_id);
  if (!target) {
    boqError("Bill of Quantities was not found.");
  }
  if (!canEditBoq(profile.role, target)) {
    boqError(
      "Lines can only be added to a Bill of Quantities while it is in draft and not archived.",
    );
  }

  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("boq_line_items")
    .insert(parsed.data)
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

  revalidatePath("/ops/boq");
  redirect("/ops/boq?created=line");
}

// ---------------------------------------------------------------------------
// I3: Edit / delete / archive actions for BOQ
// ---------------------------------------------------------------------------

const boqIdSchema = z.object({
  boq_id: z.string().uuid("Select a Bill of Quantities."),
});

const lineItemIdSchema = z.object({
  line_item_id: z.string().uuid("Select a line item."),
});

const updateBoqSchema = boqIdSchema.extend({
  title: z.string().trim().min(2, "Title is required.").max(160),
  version: z.coerce.number().int().positive().default(1),
  status: z.enum(["draft", "issued"]),
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
});

type BoqDocumentForMutation = OpsBoqMutationTarget & { id: string; site_id: string };

async function fetchBoqMutationTarget(boqId: string): Promise<BoqDocumentForMutation | null> {
  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("boq_documents")
    .select("id, site_id, status, deleted_at, archived_at")
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
    status: field(formData, "status") || "draft",
  });
  if (!parsed.success) {
    boqError(parsed.error.issues[0]?.message ?? "Check the BOQ details.");
  }

  const target = await fetchBoqMutationTarget(parsed.data.boq_id);
  if (!target) {
    boqError("Bill of Quantities was not found.");
  }
  if (!canEditBoq(profile.role, target)) {
    boqError(
      "Only the Quantity Surveyor, Projects Manager, and leadership can edit a Bill of Quantities while it is in draft.",
    );
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("boq_documents")
    .update({
      title: parsed.data.title,
      version: parsed.data.version,
      status: parsed.data.status,
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
    metadata: { title: parsed.data.title, status: parsed.data.status, version: parsed.data.version },
  });

  revalidatePath("/ops/boq");
  redirect("/ops/boq?updated=boq");
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
    boqError("Bill of Quantities was not found.");
  }
  if (!canEditBoq(profile.role, target)) {
    boqError("Lines can only be edited while the Bill of Quantities is in draft.");
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("boq_line_items")
    .update({
      description: parsed.data.description,
      unit: parsed.data.unit,
      quantity: parsed.data.quantity,
      unit_rate: parsed.data.unit_rate,
      actual_quantity: parsed.data.actual_quantity,
      supplier_id: parsed.data.supplier_id,
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

  revalidatePath("/ops/boq");
  redirect("/ops/boq?updated=line");
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
    boqError("Bill of Quantities was not found.");
  }
  if (!canEditBoq(profile.role, target)) {
    boqError("Lines can only be deleted while the Bill of Quantities is in draft.");
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

  revalidatePath("/ops/boq");
  redirect("/ops/boq?updated=line_deleted");
}

export async function archiveBoqAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canArchiveBoq(profile.role)) {
    boqError(
      "Only Developer, Managing Director, General Manager, Operations Manager, and Projects Manager can archive a Bill of Quantities.",
    );
  }

  const parsed = boqIdSchema.safeParse({ boq_id: field(formData, "boq_id") });
  if (!parsed.success) {
    boqError(parsed.error.issues[0]?.message ?? "Select a BOQ.");
  }

  const target = await fetchBoqMutationTarget(parsed.data.boq_id);
  if (!target) {
    boqError("Bill of Quantities was not found.");
  }
  if (target.archived_at) {
    boqError("This Bill of Quantities is already archived.");
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

  revalidatePath("/ops/boq");
  redirect("/ops/boq?updated=archived");
}

export async function restoreBoqAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canArchiveBoq(profile.role)) {
    boqError("Your role cannot restore archived Bills of Quantities.");
  }

  const parsed = boqIdSchema.safeParse({ boq_id: field(formData, "boq_id") });
  if (!parsed.success) {
    boqError(parsed.error.issues[0]?.message ?? "Select a BOQ.");
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

  revalidatePath("/ops/boq");
  redirect("/ops/boq?updated=restored");
}

export async function deleteBoqAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canDeleteBoq(profile.role)) {
    boqError("Only the Developer can permanently delete a Bill of Quantities.");
  }

  const parsed = boqIdSchema.safeParse({ boq_id: field(formData, "boq_id") });
  if (!parsed.success) {
    boqError(parsed.error.issues[0]?.message ?? "Select a BOQ.");
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

  revalidatePath("/ops/boq");
  redirect("/ops/boq?updated=deleted");
}

export async function importBoqLineItemsCsvAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const boqId = field(formData, "boq_id");

  if (!UUID_PATTERN.test(boqId)) {
    boqError("Select a Bill of Quantities before importing.");
  }

  const target = await fetchBoqMutationTarget(boqId);
  if (!target) {
    boqError("Bill of Quantities was not found.");
  }
  if (!canEditBoq(profile.role, target)) {
    boqError(
      "Only the Quantity Surveyor, Projects Manager, and leadership can import lines while a Bill of Quantities is in draft.",
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
        .select("id, supplier_code, name")
        .eq("status", "active");

      if (supplierError) {
        boqError(supplierError.message);
      }

      for (const supplier of (suppliers ?? []) as Array<{ id: string; supplier_code: string | null; name: string }>) {
        if (supplier.supplier_code) {
          supplierCodeToId.set(supplier.supplier_code.toUpperCase(), supplier.id);
        }
        supplierNameToId.set(supplier.name.toLowerCase(), supplier.id);
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

  revalidatePath("/ops/boq");
  redirect(`/ops/boq?imported=${inserts.length}&skipped=${rowErrors.length}#boq-register`);
}
