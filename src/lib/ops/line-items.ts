import { z } from "zod";

/**
 * Shared parser for the multi-line item editor used by the material-request and
 * requisition (RFQ) create forms.
 *
 * The editor renders one set of inputs per row, all using the SAME field names
 * (item_name, quantity, unit, …). Native form submission preserves DOM order,
 * so `formData.getAll(name)` returns the values aligned by row, and we zip them
 * back into item objects here.
 */

export type OpsParsedLineItem = {
  item_name: string;
  quantity: number;
  unit: string;
  estimated_unit_cost: number;
  actual_unit_cost: number;
  specification: string;
  notes: string;
  supplier_id: string | null;
  supplier_name_freeform: string | null;
};

const lineItemSchema = z.object({
  item_name: z.string().trim().min(2, "Item name is required.").max(160),
  quantity: z.coerce.number().positive("Quantity must be greater than zero."),
  unit: z.string().trim().min(1, "Unit is required.").max(40),
  estimated_unit_cost: z.coerce.number().min(0, "Estimated unit cost cannot be negative."),
  actual_unit_cost: z.coerce.number().min(0, "Actual unit cost cannot be negative."),
  specification: z.string().trim().max(500).default(""),
  notes: z.string().trim().max(400).default(""),
  supplier_id: z
    .string()
    .trim()
    .default("")
    .transform((value) => (value.length > 0 ? value : null)),
  supplier_name_freeform: z.string().trim().max(160).default(""),
});

export type CollectLineItemsResult =
  | { ok: true; items: OpsParsedLineItem[] }
  | { ok: false; message: string };

function stringsAt(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .map((value) => (typeof value === "string" ? value : ""));
}

/**
 * Collect and validate the line items submitted by the editor.
 *
 * Fully-blank trailing rows (no item name and no quantity) are dropped so an
 * empty extra row the user added but didn't fill never blocks submission.
 * Returns the first validation error rather than throwing, so each caller can
 * route it through its own redirect/error helper.
 */
export function collectOpsLineItems(formData: FormData): CollectLineItemsResult {
  const itemNames = stringsAt(formData, "item_name");
  const quantities = stringsAt(formData, "quantity");
  const units = stringsAt(formData, "unit");
  const estimatedCosts = stringsAt(formData, "estimated_unit_cost");
  const actualCosts = stringsAt(formData, "actual_unit_cost");
  const specifications = stringsAt(formData, "specification");
  const notes = stringsAt(formData, "notes");
  const supplierIds = stringsAt(formData, "supplier_id");
  const supplierNames = stringsAt(formData, "supplier_name_freeform");

  const rowCount = Math.max(
    itemNames.length,
    quantities.length,
    units.length,
  );

  if (rowCount === 0) {
    return { ok: false, message: "Add at least one line item." };
  }

  const items: OpsParsedLineItem[] = [];
  for (let index = 0; index < rowCount; index += 1) {
    const rawName = (itemNames[index] ?? "").trim();
    const rawQuantity = (quantities[index] ?? "").trim();

    // Drop a row the user left completely empty (typically an extra blank row).
    if (rawName.length === 0 && rawQuantity.length === 0) {
      continue;
    }

    const parsed = lineItemSchema.safeParse({
      item_name: itemNames[index] ?? "",
      quantity: rawQuantity,
      unit: (units[index] ?? "").trim() || "each",
      estimated_unit_cost: (estimatedCosts[index] ?? "").trim() || "0",
      actual_unit_cost: (actualCosts[index] ?? "").trim() || "0",
      specification: specifications[index] ?? "",
      notes: notes[index] ?? "",
      supplier_id: supplierIds[index] ?? "",
      supplier_name_freeform: supplierNames[index] ?? "",
    });

    if (!parsed.success) {
      return {
        ok: false,
        message: `Line ${items.length + 1}: ${parsed.error.issues[0]?.message ?? "invalid item"}`,
      };
    }

    items.push({
      ...parsed.data,
      supplier_name_freeform: parsed.data.supplier_name_freeform || null,
    });
  }

  if (items.length === 0) {
    return { ok: false, message: "Add at least one line item." };
  }

  return { ok: true, items };
}
