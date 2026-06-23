import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isOpsArchiveType,
  OPS_ARCHIVE_ADAPTERS,
  OPS_ARCHIVE_TYPES,
} from "../src/lib/ops/archive";

describe("archive adapter registry", () => {
  it("recognises only the known archive types", () => {
    assert.equal(isOpsArchiveType("workers"), true);
    assert.equal(isOpsArchiveType("sites"), true);
    assert.equal(isOpsArchiveType("invoices"), false);
    assert.equal(isOpsArchiveType("nope"), false);
  });

  it("excludes requisitions and financial records from v1", () => {
    for (const type of ["rfqs", "requisitions", "invoices", "payroll_runs", "payment_requests"]) {
      assert.equal(isOpsArchiveType(type), false, type);
    }
  });

  it("every type has a complete adapter", () => {
    for (const type of OPS_ARCHIVE_TYPES) {
      const adapter = OPS_ARCHIVE_ADAPTERS[type];
      assert.ok(adapter, `${type} has an adapter`);
      assert.ok(adapter.columns.split(",").map((c) => c.trim()).includes("id"), `${type} selects id`);
      assert.ok(adapter.moduleHref.startsWith("/ops/"), `${type} has a module href`);
      assert.ok(adapter.label.length > 0 && adapter.singular.length > 0, `${type} has labels`);
      assert.ok(Object.keys(adapter.restorePatch).length > 0, `${type} has a restore patch`);
    }
  });

  it("restore patch matches the archive mechanism", () => {
    for (const type of OPS_ARCHIVE_TYPES) {
      const adapter = OPS_ARCHIVE_ADAPTERS[type];
      if (adapter.mechanism === "archived_at") {
        // Un-archiving must clear the archived_at timestamp.
        assert.equal(adapter.restorePatch.archived_at, null, `${type} clears archived_at`);
      } else {
        // is_active mechanism must reactivate the row.
        assert.equal(adapter.restorePatch.is_active, true, `${type} reactivates`);
      }
    }
  });
});
