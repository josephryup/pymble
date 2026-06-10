"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import { canManageOps } from "@/lib/ops/permissions";
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
  description: "description",
  item: "description",
  "item description": "description",
  unit: "unit",
  uom: "unit",
  quantity: "quantity",
  qty: "quantity",
  rate: "unit_rate",
  "unit rate": "unit_rate",
  unit_rate: "unit_rate",
  price: "unit_rate",
  actual: "actual_quantity",
  "actual quantity": "actual_quantity",
  actual_quantity: "actual_quantity",
  supplier: "supplier_code",
  "supplier code": "supplier_code",
  supplier_code: "supplier_code",
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

  if (!canManageOps(profile.role)) {
    boqError("Your role cannot create BOQ documents yet.");
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

  if (!canManageOps(profile.role)) {
    boqError("Your role cannot add BOQ line items yet.");
  }

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
    metadata: {
      boq_id: parsed.data.boq_id,
    },
  });

  revalidatePath("/ops/boq");
  redirect("/ops/boq?created=line");
}

export async function importBoqLineItemsCsvAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOps(profile.role)) {
    boqError("Your role cannot import BOQ line items yet.");
  }

  const boqId = field(formData, "boq_id");

  if (!UUID_PATTERN.test(boqId)) {
    boqError("Select a BOQ document before importing.");
  }

  const file = formData.get("csv");

  if (!(file instanceof File) || file.size === 0) {
    boqError("Choose a CSV file to import.");
  }

  if (file.size > MAX_CSV_BYTES) {
    boqError("CSV files must be 2 MB or smaller.");
  }

  const text = await file.text();
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim().length > 0));

  if (rows.length < 2) {
    boqError("The CSV needs a header row and at least one line item.");
  }

  const header = rows[0].map((cell) => CSV_HEADER_ALIASES[cell.trim().toLowerCase()] ?? "");
  const columnIndex = (key: string) => header.indexOf(key);
  const descriptionIndex = columnIndex("description");
  const unitIndex = columnIndex("unit");
  const quantityIndex = columnIndex("quantity");
  const rateIndex = columnIndex("unit_rate");
  const actualIndex = columnIndex("actual_quantity");
  const supplierIndex = columnIndex("supplier_code");

  if (descriptionIndex === -1 || unitIndex === -1 || quantityIndex === -1 || rateIndex === -1) {
    boqError(
      "CSV must include description, unit, quantity, and rate columns (actual and supplier are optional).",
    );
  }

  const dataRows = rows.slice(1);

  if (dataRows.length > MAX_CSV_ROWS) {
    boqError(`Import is limited to ${MAX_CSV_ROWS} rows at a time.`);
  }

  const service = getOpsSupabaseServiceClient();

  // Resolve supplier codes to ids once, if the CSV references suppliers.
  const supplierCodeToId = new Map<string, string>();

  if (supplierIndex !== -1) {
    const codes = Array.from(
      new Set(
        dataRows
          .map((row) => (row[supplierIndex] ?? "").trim().toUpperCase())
          .filter((code) => code.length > 0),
      ),
    );

    if (codes.length > 0) {
      const { data: suppliers, error: supplierError } = await service
        .from("suppliers")
        .select("id, supplier_code")
        .eq("status", "active")
        .in("supplier_code", codes);

      if (supplierError) {
        boqError(supplierError.message);
      }

      for (const supplier of (suppliers ?? []) as Array<{ id: string; supplier_code: string }>) {
        supplierCodeToId.set(supplier.supplier_code.toUpperCase(), supplier.id);
      }
    }
  }

  const inserts: Array<{
    actual_quantity: number;
    boq_id: string;
    description: string;
    quantity: number;
    supplier_id: string | null;
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

    if (supplierIndex !== -1) {
      const code = (row[supplierIndex] ?? "").trim().toUpperCase();

      if (code.length > 0) {
        supplierId = supplierCodeToId.get(code) ?? null;

        if (!supplierId) {
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
