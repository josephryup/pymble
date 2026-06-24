import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OPS_MODULES } from "../src/lib/ops/constants";
import {
  canAccessOpsHref,
  canDeleteOpsArchived,
  canViewOpsBackoffice,
  canViewSiteActualBudget,
  canViewSiteBudget,
  visibleOpsModuleRegistry,
  visibleOpsModules,
  visibleOpsRouteModules,
} from "../src/lib/ops/permissions";

describe("permanent archive delete", () => {
  it("is restricted to the Developer", () => {
    assert.equal(canDeleteOpsArchived("developer"), true);
    assert.equal(canDeleteOpsArchived("managing_director"), false);
    assert.equal(canDeleteOpsArchived("operations_manager"), false);
    assert.equal(canDeleteOpsArchived("owner"), false);
  });
});

describe("back-office oversight access", () => {
  it("is leadership, manager, and the operations manager only", () => {
    for (const role of [
      "developer",
      "managing_director",
      "general_manager",
      "owner",
      "manager",
      "operations_manager",
    ] as const) {
      assert.equal(canViewOpsBackoffice(role), true, role);
    }
    assert.equal(canViewOpsBackoffice("projects_manager"), false);
    assert.equal(canViewOpsBackoffice("finance_manager"), false);
    assert.equal(canViewOpsBackoffice("engineer"), false);
    assert.equal(canViewOpsBackoffice("crew"), false);
  });
});
import { canCreateOpsRfq, canManageOpsRfq } from "../src/lib/ops/rfq-po-permissions";

describe("site budget visibility", () => {
  it("shows the planned budget to leadership, the operations manager, and finance", () => {
    for (const role of [
      "developer",
      "managing_director",
      "general_manager",
      "owner",
      "operations_manager",
      "finance_manager",
      "accountant",
    ] as const) {
      assert.equal(canViewSiteBudget(role), true, role);
    }
    assert.equal(canViewSiteBudget("engineer"), false);
    assert.equal(canViewSiteBudget("projects_manager"), false);
    assert.equal(canViewSiteBudget("crew"), false);
  });

  it("restricts the actual budget to leadership and the operations manager", () => {
    assert.equal(canViewSiteActualBudget("managing_director"), true);
    assert.equal(canViewSiteActualBudget("owner"), true);
    assert.equal(canViewSiteActualBudget("operations_manager"), true);
    assert.equal(canViewSiteActualBudget("finance_manager"), false);
    assert.equal(canViewSiteActualBudget("accountant"), false);
    assert.equal(canViewSiteActualBudget("engineer"), false);
  });
});

describe("operations manager requisition rights", () => {
  it("can create and manage requisitions", () => {
    assert.equal(canCreateOpsRfq("operations_manager"), true);
    assert.equal(canManageOpsRfq("operations_manager"), true);
  });
});

describe("ops module visibility", () => {
  it("gives Developer every route and every planned registry module", () => {
    const readyRoutes = OPS_MODULES.filter((module) => module.status === "ready");
    const navigableReadyRoutes = readyRoutes.filter(
      (module) => module.showInNavigation !== false,
    );

    assert.equal(visibleOpsRouteModules("developer").length, readyRoutes.length);
    assert.equal(visibleOpsModules("developer").length, navigableReadyRoutes.length);
    assert.equal(visibleOpsModuleRegistry("developer").length, OPS_MODULES.length);
    assert.equal(canAccessOpsHref("developer", "/ops/modules"), true);
    assert.equal(
      visibleOpsModules("developer").some((module) => module.href === "/ops/modules"),
      false,
    );
  });

  it("keeps role roadmaps scoped for non-developer roles", () => {
    const accountantRegistry = visibleOpsModuleRegistry("accountant");
    const hseRegistry = visibleOpsModuleRegistry("hse_officer");

    assert.equal(
      accountantRegistry.some((module) => module.id === "hse-incidents"),
      false,
    );
    assert.equal(
      hseRegistry.some((module) => module.id === "hse-incidents"),
      true,
    );
    assert.equal(
      hseRegistry.some((module) => module.id === "employees"),
      false,
    );
  });

  it("keeps cost entries as a finance bridge rather than a standalone planned module", () => {
    assert.equal(
      visibleOpsModuleRegistry("developer").some((module) => module.id === "cost-entries"),
      false,
    );
    assert.equal(
      visibleOpsModuleRegistry("developer").some(
        (module) => module.title === "Site Instructions and Quality Assurance / Quality Control",
      ),
      true,
    );
  });

  it("hides the system registry from daily sidebar modules", () => {
    assert.equal(
      visibleOpsModules("managing_director").some((module) => module.href === "/ops/modules"),
      false,
    );
    assert.equal(canAccessOpsHref("managing_director", "/ops/modules"), true);
  });

  it("shows material requests to operational roles but hides it from unrelated roles", () => {
    assert.equal(canAccessOpsHref("engineer", "/ops/material-requests"), true);
    assert.equal(canAccessOpsHref("procurement_manager", "/ops/material-requests"), true);
    assert.equal(canAccessOpsHref("accountant", "/ops/material-requests"), false);
    assert.equal(canAccessOpsHref("hse_officer", "/ops/material-requests"), false);
  });

  it("shows suppliers to procurement, finance, and delivery management roles", () => {
    assert.equal(canAccessOpsHref("developer", "/ops/suppliers"), true);
    assert.equal(canAccessOpsHref("procurement_manager", "/ops/suppliers"), true);
    assert.equal(canAccessOpsHref("accountant", "/ops/suppliers"), true);
    assert.equal(canAccessOpsHref("projects_manager", "/ops/suppliers"), true);
    assert.equal(canAccessOpsHref("hse_officer", "/ops/suppliers"), false);
    assert.equal(canAccessOpsHref("human_resource", "/ops/suppliers"), false);
  });

  it("shows RFQs and purchase orders to procurement, finance, and delivery management roles", () => {
    assert.equal(canAccessOpsHref("developer", "/ops/rfq-po"), true);
    assert.equal(canAccessOpsHref("procurement_manager", "/ops/rfq-po"), true);
    assert.equal(canAccessOpsHref("finance_manager", "/ops/rfq-po"), true);
    assert.equal(canAccessOpsHref("operations_manager", "/ops/rfq-po"), true);
    assert.equal(canAccessOpsHref("hse_officer", "/ops/rfq-po"), false);
    assert.equal(canAccessOpsHref("human_resource", "/ops/rfq-po"), false);
  });

  it("shows stores and inventory to stores, procurement, finance, and delivery roles", () => {
    assert.equal(canAccessOpsHref("developer", "/ops/stores-inventory"), true);
    assert.equal(canAccessOpsHref("procurement", "/ops/stores-inventory"), true);
    assert.equal(canAccessOpsHref("procurement_assistant", "/ops/stores-inventory"), true);
    assert.equal(canAccessOpsHref("finance_manager", "/ops/stores-inventory"), true);
    assert.equal(canAccessOpsHref("engineer", "/ops/stores-inventory"), true);
    assert.equal(canAccessOpsHref("hse_officer", "/ops/stores-inventory"), false);
    assert.equal(canAccessOpsHref("human_resource", "/ops/stores-inventory"), false);
  });

  it("shows daily site reports to delivery, commercial, finance, and HSE roles", () => {
    assert.equal(canAccessOpsHref("developer", "/ops/daily-site-reports"), true);
    assert.equal(canAccessOpsHref("engineer", "/ops/daily-site-reports"), true);
    assert.equal(canAccessOpsHref("quantity_surveyor", "/ops/daily-site-reports"), true);
    assert.equal(canAccessOpsHref("finance_manager", "/ops/daily-site-reports"), true);
    assert.equal(canAccessOpsHref("hse_officer", "/ops/daily-site-reports"), true);
    assert.equal(canAccessOpsHref("procurement", "/ops/daily-site-reports"), false);
    assert.equal(canAccessOpsHref("human_resource", "/ops/daily-site-reports"), false);
  });

  it("shows engineering controls to delivery, QS, and HSE roles", () => {
    assert.equal(canAccessOpsHref("developer", "/ops/engineering-controls"), true);
    assert.equal(canAccessOpsHref("operations_manager", "/ops/engineering-controls"), true);
    assert.equal(canAccessOpsHref("projects_manager", "/ops/engineering-controls"), true);
    assert.equal(canAccessOpsHref("engineer", "/ops/engineering-controls"), true);
    assert.equal(canAccessOpsHref("quantity_surveyor", "/ops/engineering-controls"), true);
    assert.equal(canAccessOpsHref("hse_officer", "/ops/engineering-controls"), true);
    assert.equal(canAccessOpsHref("hse_assistant_officer", "/ops/engineering-controls"), true);
    assert.equal(canAccessOpsHref("procurement", "/ops/engineering-controls"), false);
    assert.equal(canAccessOpsHref("finance_manager", "/ops/engineering-controls"), false);
    assert.equal(canAccessOpsHref("human_resource", "/ops/engineering-controls"), false);
  });

  it("shows delivery exceptions to stores, delivery, procurement, and finance roles", () => {
    assert.equal(canAccessOpsHref("developer", "/ops/delivery-exceptions"), true);
    assert.equal(canAccessOpsHref("operations_manager", "/ops/delivery-exceptions"), true);
    assert.equal(canAccessOpsHref("procurement_assistant", "/ops/delivery-exceptions"), true);
    assert.equal(canAccessOpsHref("finance_manager", "/ops/delivery-exceptions"), true);
    assert.equal(canAccessOpsHref("engineer", "/ops/delivery-exceptions"), true);
    assert.equal(canAccessOpsHref("hse_officer", "/ops/delivery-exceptions"), false);
    assert.equal(canAccessOpsHref("human_resource", "/ops/delivery-exceptions"), false);
  });

  it("shows finance bridge routes to finance and relevant delivery/commercial roles", () => {
    assert.equal(canAccessOpsHref("developer", "/ops/project-budgets"), true);
    assert.equal(canAccessOpsHref("finance_manager", "/ops/project-budgets"), true);
    assert.equal(canAccessOpsHref("quantity_surveyor", "/ops/project-budgets"), true);
    assert.equal(canAccessOpsHref("operations_manager", "/ops/project-budgets"), true);
    assert.equal(canAccessOpsHref("hse_officer", "/ops/project-budgets"), false);
    assert.equal(canAccessOpsHref("human_resource", "/ops/project-budgets"), false);

    assert.equal(canAccessOpsHref("procurement", "/ops/payment-requests"), true);
    assert.equal(canAccessOpsHref("projects_manager", "/ops/payment-requests"), true);
    assert.equal(canAccessOpsHref("accountant", "/ops/payment-requests"), true);
    assert.equal(canAccessOpsHref("engineer", "/ops/payment-requests"), false);
  });

  it("shows equipment to fleet, delivery, finance, HSE, and leadership roles", () => {
    assert.equal(canAccessOpsHref("developer", "/ops/equipment"), true);
    assert.equal(canAccessOpsHref("operations_manager", "/ops/equipment"), true);
    assert.equal(canAccessOpsHref("projects_manager", "/ops/equipment"), true);
    assert.equal(canAccessOpsHref("engineer", "/ops/equipment"), true);
    assert.equal(canAccessOpsHref("finance_manager", "/ops/equipment"), true);
    assert.equal(canAccessOpsHref("hse_officer", "/ops/equipment"), true);
    assert.equal(canAccessOpsHref("human_resource", "/ops/equipment"), false);
  });

  it("shows fleet logistics to delivery, HR, finance, HSE, and leadership roles", () => {
    assert.equal(canAccessOpsHref("developer", "/ops/fleet-logistics"), true);
    assert.equal(canAccessOpsHref("operations_manager", "/ops/fleet-logistics"), true);
    assert.equal(canAccessOpsHref("projects_manager", "/ops/fleet-logistics"), true);
    assert.equal(canAccessOpsHref("engineer", "/ops/fleet-logistics"), true);
    assert.equal(canAccessOpsHref("human_resource", "/ops/fleet-logistics"), true);
    assert.equal(canAccessOpsHref("finance_manager", "/ops/fleet-logistics"), true);
    assert.equal(canAccessOpsHref("hse_officer", "/ops/fleet-logistics"), true);
    assert.equal(canAccessOpsHref("procurement_assistant", "/ops/fleet-logistics"), false);
  });

  it("shows commercial controls to QS, delivery, finance, and leadership roles", () => {
    assert.equal(canAccessOpsHref("developer", "/ops/commercial"), true);
    assert.equal(canAccessOpsHref("managing_director", "/ops/commercial"), true);
    assert.equal(canAccessOpsHref("general_manager", "/ops/commercial"), true);
    assert.equal(canAccessOpsHref("quantity_surveyor", "/ops/commercial"), true);
    assert.equal(canAccessOpsHref("projects_manager", "/ops/commercial"), true);
    assert.equal(canAccessOpsHref("finance_manager", "/ops/commercial"), true);
    assert.equal(canAccessOpsHref("engineer", "/ops/commercial"), true);
    assert.equal(canAccessOpsHref("hse_officer", "/ops/commercial"), false);
    assert.equal(canAccessOpsHref("human_resource", "/ops/commercial"), false);
    assert.equal(canAccessOpsHref("procurement_assistant", "/ops/commercial"), false);
  });

  it("shows the executive dashboard only to leadership roles", () => {
    assert.equal(canAccessOpsHref("developer", "/ops/executive"), true);
    assert.equal(canAccessOpsHref("managing_director", "/ops/executive"), true);
    assert.equal(canAccessOpsHref("general_manager", "/ops/executive"), true);
    assert.equal(canAccessOpsHref("manager", "/ops/executive"), true);
    assert.equal(canAccessOpsHref("finance_manager", "/ops/executive"), false);
    assert.equal(canAccessOpsHref("operations_manager", "/ops/executive"), false);
    assert.equal(canAccessOpsHref("human_resource", "/ops/executive"), false);
  });

  it("shows HSE incidents to HSE and delivery oversight roles", () => {
    assert.equal(canAccessOpsHref("developer", "/ops/hse"), true);
    assert.equal(canAccessOpsHref("hse_officer", "/ops/hse"), true);
    assert.equal(canAccessOpsHref("hse_assistant_officer", "/ops/hse"), true);
    assert.equal(canAccessOpsHref("operations_manager", "/ops/hse"), true);
    assert.equal(canAccessOpsHref("engineer", "/ops/hse"), true);
    assert.equal(canAccessOpsHref("human_resource", "/ops/hse"), false);
    assert.equal(canAccessOpsHref("accountant", "/ops/hse"), false);
  });

  it("shows HSE compliance to HSE and delivery oversight roles", () => {
    assert.equal(canAccessOpsHref("developer", "/ops/hse-compliance"), true);
    assert.equal(canAccessOpsHref("hse_officer", "/ops/hse-compliance"), true);
    assert.equal(canAccessOpsHref("hse_assistant_officer", "/ops/hse-compliance"), true);
    assert.equal(canAccessOpsHref("operations_manager", "/ops/hse-compliance"), true);
    assert.equal(canAccessOpsHref("engineer", "/ops/hse-compliance"), true);
    assert.equal(canAccessOpsHref("human_resource", "/ops/hse-compliance"), false);
    assert.equal(canAccessOpsHref("accountant", "/ops/hse-compliance"), false);
  });

  it("shows employee and leave records to HR and leadership roles", () => {
    assert.equal(canAccessOpsHref("developer", "/ops/employees"), true);
    assert.equal(canAccessOpsHref("human_resource", "/ops/employees"), true);
    assert.equal(canAccessOpsHref("admin_receptionist", "/ops/employees"), true);
    assert.equal(canAccessOpsHref("finance_manager", "/ops/employees"), false);
    assert.equal(canAccessOpsHref("hse_officer", "/ops/employees"), false);
    assert.equal(canAccessOpsHref("engineer", "/ops/employees"), false);
  });
});
