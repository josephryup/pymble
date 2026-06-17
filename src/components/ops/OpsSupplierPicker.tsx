"use client";

import { useId, useMemo, useState } from "react";
import { OPS_INPUT_CLASS } from "@/lib/ops/ui";

export type OpsSupplierOption = {
  id: string;
  /** Human label of the supplier (matches `OpsSupplierOption.label` in suppliers.ts). */
  label: string;
};

type OpsSupplierPickerProps = {
  /**
   * Suppliers from the master list. Each becomes a datalist option keyed by
   * name; the hidden supplier_id field is populated when the typed name
   * matches one of them.
   */
  suppliers: OpsSupplierOption[];
  /**
   * Field name prefix. Defaults to "" so it can be used standalone:
   *   inputs are submitted as `supplier_id` and `supplier_name_freeform`.
   * Provide a prefix when used in repeating rows (e.g. `lines.0.`) so each
   * row has its own pair of fields.
   */
  namePrefix?: string;
  /** Optional initial selection (server render). */
  defaultSupplierId?: string | null;
  defaultSupplierName?: string | null;
  /**
   * Visible label above the input. Pass empty string to render unlabelled.
   */
  label?: string;
  /** Optional helper text below the input. */
  helperText?: string;
  /** Required attribute on the visible input. */
  required?: boolean;
};

/**
 * Per-item supplier picker. Lets the user either pick a supplier from the
 * master list or type a free-text name (e.g. when the supplier isn't on the
 * list yet — common on the Pymble procurement requisition form where suppliers
 * vary per item).
 *
 * Behaviour:
 *  - Renders a `<datalist>` of supplier names from `suppliers`.
 *  - If the typed value exactly matches a supplier name, the hidden
 *    `supplier_id` field is set to that supplier's id.
 *  - Otherwise the typed value is sent as `supplier_name_freeform`, and
 *    `supplier_id` stays empty.
 */
export function OpsSupplierPicker({
  suppliers,
  namePrefix = "",
  defaultSupplierId = null,
  defaultSupplierName = null,
  label = "Supplier",
  helperText,
  required = false,
}: OpsSupplierPickerProps) {
  const reactId = useId();
  const listId = `supplier-list-${reactId}`;
  const nameToId = useMemo(
    () =>
      new Map(
        suppliers.map((supplier) => [supplier.label.toLowerCase(), supplier.id] as const),
      ),
    [suppliers],
  );

  const initialName =
    defaultSupplierName ??
    (defaultSupplierId
      ? suppliers.find((supplier) => supplier.id === defaultSupplierId)?.label ?? ""
      : "");

  const [value, setValue] = useState(initialName);
  const resolvedSupplierId = nameToId.get(value.trim().toLowerCase()) ?? "";
  const isFreeform = value.trim().length > 0 && !resolvedSupplierId;

  const supplierIdName = `${namePrefix}supplier_id`;
  const freeformName = `${namePrefix}supplier_name_freeform`;

  return (
    <div className="grid gap-1.5">
      {label ? (
        <label
          className="text-sm font-medium text-muted-foreground"
          htmlFor={`${reactId}-input`}
        >
          {label}
        </label>
      ) : null}
      <input
        autoComplete="off"
        className={OPS_INPUT_CLASS}
        id={`${reactId}-input`}
        list={listId}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Pick from list or type a name..."
        required={required}
        type="text"
        value={value}
      />
      <datalist id={listId}>
        {suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.label} />
        ))}
      </datalist>
      <input name={supplierIdName} type="hidden" value={resolvedSupplierId} />
      <input
        name={freeformName}
        type="hidden"
        value={isFreeform ? value.trim() : ""}
      />
      {helperText ? (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          {isFreeform
            ? "This supplier is not on the master list yet — it will be stored as free text on this line."
            : resolvedSupplierId
              ? "Picked from the supplier master list."
              : "Optional — leave blank if no specific supplier."}
        </p>
      )}
    </div>
  );
}
