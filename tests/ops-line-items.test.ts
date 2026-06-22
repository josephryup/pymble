import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectOpsLineItems } from "../src/lib/ops/line-items";

function formDataFrom(rows: Record<string, string>[]): FormData {
  const fd = new FormData();
  const keys = [
    "item_name",
    "quantity",
    "unit",
    "estimated_unit_cost",
    "actual_unit_cost",
    "specification",
    "notes",
    "supplier_id",
    "supplier_name_freeform",
  ];
  for (const row of rows) {
    for (const key of keys) {
      fd.append(key, row[key] ?? "");
    }
  }
  return fd;
}

describe("collectOpsLineItems", () => {
  it("zips multiple rows back into items in order", () => {
    const fd = formDataFrom([
      { item_name: "Cement", quantity: "10", unit: "bags", estimated_unit_cost: "120" },
      { item_name: "Sand", quantity: "5", unit: "tonnes", actual_unit_cost: "300" },
    ]);
    const result = collectOpsLineItems(fd);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].item_name, "Cement");
    assert.equal(result.items[0].quantity, 10);
    assert.equal(result.items[0].estimated_unit_cost, 120);
    assert.equal(result.items[1].item_name, "Sand");
    assert.equal(result.items[1].actual_unit_cost, 300);
  });

  it("drops a fully blank trailing row", () => {
    const fd = formDataFrom([
      { item_name: "Cement", quantity: "10", unit: "bags" },
      { item_name: "", quantity: "", unit: "each" },
    ]);
    const result = collectOpsLineItems(fd);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.items.length, 1);
  });

  it("rejects when no items are present", () => {
    const result = collectOpsLineItems(new FormData());
    assert.equal(result.ok, false);
  });

  it("reports the offending line on validation failure", () => {
    const fd = formDataFrom([
      { item_name: "Cement", quantity: "10", unit: "bags" },
      { item_name: "Sand", quantity: "-2", unit: "tonnes" },
    ]);
    const result = collectOpsLineItems(fd);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.message, /Line 2/);
  });

  it("keeps a supplier id and normalises blank free-text to null", () => {
    const fd = formDataFrom([
      {
        item_name: "Cement",
        quantity: "10",
        unit: "bags",
        supplier_id: "11111111-1111-4111-8111-111111111111",
      },
    ]);
    const result = collectOpsLineItems(fd);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.items[0].supplier_id, "11111111-1111-4111-8111-111111111111");
    assert.equal(result.items[0].supplier_name_freeform, null);
  });
});
