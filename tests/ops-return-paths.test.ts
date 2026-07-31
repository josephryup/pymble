import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { opsReturnTo, safeOpsReturnTo } from "../src/lib/ops/return-paths";

/**
 * Returning someone to where they were after a save (audit §11).
 *
 * The value under test is attacker-controllable — it arrives in a hidden form
 * field — so the safety cases matter as much as the convenience ones.
 */

describe("safeOpsReturnTo", () => {
  it("accepts paths inside the workspace", () => {
    assert.equal(safeOpsReturnTo("/ops/material-requests?page=3"), "/ops/material-requests?page=3");
    assert.equal(safeOpsReturnTo("/ops"), "/ops");
  });

  it("rejects anything that could leave the workspace", () => {
    // Protocol-relative URLs are the classic open-redirect vector.
    assert.equal(safeOpsReturnTo("//evil.example.com", "/ops"), "/ops");
    assert.equal(safeOpsReturnTo("https://evil.example.com", "/ops"), "/ops");
    assert.equal(safeOpsReturnTo("/admin", "/ops"), "/ops");
    assert.equal(safeOpsReturnTo("/opsfake", "/ops"), "/ops");
    assert.equal(safeOpsReturnTo(undefined, "/ops"), "/ops");
  });
});

describe("opsReturnTo", () => {
  it("keeps page and filters while adding the result flag", () => {
    // The reported bug: editing on page 3 of a filtered list.
    const result = opsReturnTo({
      returnTo: "/ops/material-requests?page=3&q=cement&status=approved",
      fallback: "/ops/material-requests",
      params: { updated: "item_added" },
    });

    assert.match(result, /^\/ops\/material-requests\?/);
    assert.match(result, /page=3/);
    assert.match(result, /q=cement/);
    assert.match(result, /status=approved/);
    assert.match(result, /updated=item_added/);
  });

  it("falls back to today's behaviour when no return path is supplied", () => {
    // No JavaScript, or a form that has not adopted the field yet.
    const result = opsReturnTo({
      returnTo: undefined,
      fallback: "/ops/project-budgets",
      params: { updated: "line_edited" },
    });

    assert.equal(result, "/ops/project-budgets?updated=line_edited");
  });

  it("never honours an off-site return path", () => {
    const result = opsReturnTo({
      returnTo: "https://evil.example.com/steal",
      fallback: "/ops/employees",
      params: { updated: "employee" },
    });

    assert.equal(result, "/ops/employees?updated=employee");
  });

  it("replaces a stale result flag rather than stacking them", () => {
    const result = opsReturnTo({
      returnTo: "/ops/employees?page=2&updated=account_linked",
      fallback: "/ops/employees",
      params: { updated: "employee" },
    });

    assert.match(result, /page=2/);
    assert.match(result, /updated=employee/);
    assert.doesNotMatch(result, /account_linked/);
  });

  it("clears a previous flag the caller did not set this time", () => {
    // Otherwise the old success banner reappears after an unrelated save.
    const result = opsReturnTo({
      returnTo: "/ops/sites?page=2&error=Something%20failed",
      fallback: "/ops/sites",
      params: { updated: "site" },
    });

    assert.doesNotMatch(result, /error=/);
    assert.match(result, /page=2/);
  });

  it("attaches an anchor so the edited record is scrolled to", () => {
    const result = opsReturnTo({
      returnTo: "/ops/material-requests?page=3",
      fallback: "/ops/material-requests",
      params: { updated: "procured" },
      hash: "mr-abc",
    });

    assert.match(result, /#mr-abc$/);
    assert.match(result, /page=3/);
  });

  it("preserves an anchor already on the return path", () => {
    const result = opsReturnTo({
      returnTo: "/ops/employees?page=2#emp-1",
      fallback: "/ops/employees",
      params: { updated: "employee" },
    });

    assert.match(result, /#emp-1$/);
  });

  it("produces a clean path when there is nothing to merge", () => {
    const result = opsReturnTo({
      returnTo: "/ops/sites",
      fallback: "/ops/sites",
    });

    assert.equal(result, "/ops/sites");
  });
});
