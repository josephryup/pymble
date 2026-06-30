"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { OpsSupplierPicker, type OpsSupplierOption } from "@/components/ops/OpsSupplierPicker";
import {
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
} from "@/lib/ops/ui";

export type OpsLineItemDefaults = {
  item_name?: string;
  quantity?: string;
  unit?: string;
  estimated_unit_cost?: string;
  supplier_id?: string | null;
};

type OpsLineItemsEditorProps = {
  /** Suppliers from the master list, for the per-line supplier picker. */
  suppliers: OpsSupplierOption[];
  /**
   * Show the "Actual unit price" field (requisitions record the price the
   * procurement office obtained from the supplier; material requests do not).
   */
  withActualCost?: boolean;
  /**
   * Pre-fill the first row (e.g. when a requisition is seeded from a BOQ line).
   * Only applied to the initial row; added rows start blank.
   */
  firstItemDefaults?: OpsLineItemDefaults;
};

let rowKeySeed = 0;

/**
 * Repeatable line-item entry shared by the material-request and requisition
 * create forms. Each row renders the same field names; the server action zips
 * them back together with `collectOpsLineItems`. Users can add or remove rows
 * and nominate a supplier per line (pick from list or type a new name).
 */
export function OpsLineItemsEditor({
  suppliers,
  withActualCost = false,
  firstItemDefaults,
}: OpsLineItemsEditorProps) {
  const [rows, setRows] = useState<number[]>(() => [rowKeySeed++]);

  const addRow = () => setRows((current) => [...current, rowKeySeed++]);
  const removeRow = (key: number) =>
    setRows((current) => (current.length > 1 ? current.filter((row) => row !== key) : current));

  return (
    <div className="grid gap-3">
      {rows.map((key, index) => {
        const defaults = index === 0 ? firstItemDefaults : undefined;
        return (
        <div
          className="rounded-md border border-border bg-muted/50 p-3"
          key={key}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Item {index + 1}
            </p>
            <button
              aria-label={`Remove item ${index + 1}`}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={rows.length === 1}
              onClick={() => removeRow(key)}
              type="button"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Remove
            </button>
          </div>

          <div className="grid gap-3 min-[520px]:grid-cols-2 lg:grid-cols-6">
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Item name
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={defaults?.item_name}
                name="item_name"
                required
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Quantity
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={defaults?.quantity}
                min="0.01"
                name="quantity"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Unit
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={defaults?.unit ?? "each"}
                name="unit"
                required
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Unit estimate
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={defaults?.estimated_unit_cost}
                min="0"
                name="estimated_unit_cost"
                step="0.01"
                type="number"
              />
            </label>
            {withActualCost ? (
              <label className={OPS_LABEL_CLASS}>
                Actual unit price
                <input
                  className={OPS_INPUT_CLASS}
                  min="0"
                  name="actual_unit_cost"
                  step="0.01"
                  type="number"
                />
              </label>
            ) : null}
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
              Specification
              <input className={OPS_INPUT_CLASS} name="specification" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
              Notes
              <input className={OPS_INPUT_CLASS} name="notes" />
            </label>
            <div className="lg:col-span-6">
              <OpsSupplierPicker
                defaultSupplierId={defaults?.supplier_id ?? null}
                helperText="Optional — pick this line's supplier from the list or type a new name."
                label="Supplier"
                suppliers={suppliers}
              />
            </div>
          </div>
        </div>
        );
      })}

      <div>
        <button className={OPS_SECONDARY_BUTTON_CLASS} onClick={addRow} type="button">
          <Plus className="size-4" aria-hidden="true" />
          Add another item
        </button>
      </div>
    </div>
  );
}
