import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getOpsAuthFlowRedirect,
  parseOpsAuthEmailFlow,
  safeOpsRedirectPath,
} from "../src/lib/ops/auth-redirect";

describe("ops auth redirect helpers", () => {
  it("allows only internal Ops redirect paths", () => {
    assert.equal(safeOpsRedirectPath("/ops/profile#password"), "/ops/profile#password");
    assert.equal(safeOpsRedirectPath("/ops/staff?created=invitation"), "/ops/staff?created=invitation");
    assert.equal(safeOpsRedirectPath("https://example.com"), "/ops/profile?updated=welcome");
    assert.equal(safeOpsRedirectPath("//example.com"), "/ops/profile?updated=welcome");
    assert.equal(safeOpsRedirectPath("/login"), "/ops/profile?updated=welcome");
  });

  it("maps Supabase email flows to the right Ops destinations", () => {
    assert.equal(getOpsAuthFlowRedirect("invite"), "/ops/profile?updated=welcome");
    assert.equal(getOpsAuthFlowRedirect("signup"), "/ops/profile?updated=welcome");
    assert.equal(getOpsAuthFlowRedirect("recovery"), "/ops/profile#password");
    assert.equal(getOpsAuthFlowRedirect("email_change"), "/ops/profile?updated=email");
    assert.equal(getOpsAuthFlowRedirect("magiclink"), "/ops");
  });

  it("lets a safe next path override the default email-flow destination", () => {
    assert.equal(
      getOpsAuthFlowRedirect("recovery", "/ops/profile#password"),
      "/ops/profile#password",
    );
    assert.equal(
      getOpsAuthFlowRedirect("invite", "/ops/staff?created=invitation"),
      "/ops/staff?created=invitation",
    );
  });

  it("parses supported Supabase auth email flow types", () => {
    assert.equal(parseOpsAuthEmailFlow("invite"), "invite");
    assert.equal(parseOpsAuthEmailFlow("recovery"), "recovery");
    assert.equal(parseOpsAuthEmailFlow("bad"), null);
    assert.equal(parseOpsAuthEmailFlow(null), null);
  });
});
