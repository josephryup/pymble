import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OPS_MODULE_GROUPS, OPS_MODULES } from "../src/lib/ops/constants";
import { OPS_NAV_ICONS } from "../src/lib/ops/nav-icons";

describe("nav module icon coverage", () => {
  it("every nav-visible module has an icon", () => {
    const missing = OPS_MODULES.filter(
      (module) =>
        module.status === "ready" &&
        module.showInNavigation !== false &&
        !OPS_NAV_ICONS[module.href],
    );
    assert.deepEqual(
      missing.map((module) => module.href),
      [],
      "modules missing an icon entry in OPS_NAV_ICONS",
    );
  });

  it("every module's group exists in OPS_MODULE_GROUPS", () => {
    const groupIds = new Set(OPS_MODULE_GROUPS.map((group) => group.id));
    const stray = OPS_MODULES.filter((module) => !groupIds.has(module.group)).map(
      (module) => `${module.id} → ${module.group}`,
    );
    assert.deepEqual(stray, [], "modules assigned to unknown groups");
  });

  it("Operations group no longer contains procurement / HR modules", () => {
    const opsHrefs = OPS_MODULES.filter((module) => module.group === "operations").map(
      (module) => module.href,
    );
    // Anything that ended up here would be a regression of the nav taxonomy fix.
    for (const href of [
      "/ops/material-requests",
      "/ops/suppliers",
      "/ops/rfq-po",
      "/ops/stores-inventory",
      "/ops/delivery-exceptions",
      "/ops/payroll",
      "/ops/staff-payroll",
      "/ops/staff",
    ]) {
      assert.equal(opsHrefs.includes(href), false, `${href} should not be in operations`);
    }
  });

  it("HR group owns payroll, staff payroll, employees, recruitment, and staff access", () => {
    const hrHrefs = OPS_MODULES.filter((module) => module.group === "hr").map(
      (module) => module.href,
    );
    for (const href of [
      "/ops/employees",
      "/ops/recruitment",
      "/ops/payroll",
      "/ops/staff-payroll",
      "/ops/staff",
    ]) {
      assert.equal(hrHrefs.includes(href), true, `${href} should be in hr`);
    }
  });
});
