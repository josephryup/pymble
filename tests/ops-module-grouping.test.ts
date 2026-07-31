import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OPS_MODULE_GROUPS, OPS_MODULES } from "../src/lib/ops/constants";
import { OPS_GROUP_ICONS } from "../src/lib/ops/nav-icons";

/**
 * Sidebar grouping (audit §4).
 *
 * Modules drift into the wrong group over time because a group is just a string
 * on each module and nothing checks it. The principle these tests pin is
 * "group by the job someone is doing, not by which department owns the data" —
 * the cases below are the ones that were actually wrong, so a future move back
 * has to be deliberate rather than accidental.
 */

function groupOf(href: string) {
  return OPS_MODULES.find((module) => module.href === href)?.group;
}

describe("ops module grouping", () => {
  it("gives every module a group that exists", () => {
    const known = new Set(OPS_MODULE_GROUPS.map((group) => group.id));
    const orphans = OPS_MODULES.filter(
      (module) => module.group && !known.has(module.group),
    ).map((module) => `${module.href} → ${module.group}`);

    assert.deepEqual(orphans, [], "modules point at a group that is not defined");
  });

  it("gives every group an icon", () => {
    const missing = OPS_MODULE_GROUPS.filter(
      (group) => !OPS_GROUP_ICONS[group.id],
    ).map((group) => group.id);

    assert.deepEqual(missing, [], "groups without an icon render as a blank rail");
  });

  it("leaves no group empty", () => {
    const used = new Set(OPS_MODULES.map((module) => module.group));
    const empty = OPS_MODULE_GROUPS.filter((group) => !used.has(group.id)).map(
      (group) => group.id,
    );

    assert.deepEqual(empty, [], "an empty group renders as a heading with nothing under it");
  });

  it("puts personal queues in My Work, not scattered across Operations and Records", () => {
    // These are what a person opens the workspace to deal with. They used to
    // compete with company-wide registers nobody visits daily.
    for (const href of [
      "/ops/my-sites",
      "/ops/approvals",
      "/ops/notifications",
      "/ops/inbox",
      "/ops/it/helpdesk/mine",
    ]) {
      assert.equal(groupOf(href), "workspace", `${href} belongs in My Work`);
    }
  });

  it("keeps the material schedule beside the requests that draw from it", () => {
    // It was filed under Commercial with client-facing documents, but it is the
    // plan material requests call off against — see the call-off flow.
    assert.equal(groupOf("/ops/material-schedule"), "procurement");
    assert.equal(groupOf("/ops/material-requests"), "procurement");
  });

  it("keeps the staff access register with HR", () => {
    // Considered and left alone. Creating someone's account is part of HR
    // onboarding, so it sits with employees and payroll — even though IT can
    // now administer it too (§6). Access is a permission question, not a
    // grouping one, and ops-nav-icons.test.ts already pins this.
    assert.equal(groupOf("/ops/staff"), "hr");
    assert.equal(groupOf("/ops/employees"), "hr");
  });

  it("keeps IT reference material with IT", () => {
    assert.equal(groupOf("/ops/it/handbook"), "it");
  });

  it("opens the sidebar with My Work", () => {
    assert.equal(OPS_MODULE_GROUPS[0]?.id, "workspace");
  });
});
