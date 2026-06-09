import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  OPS_SAFE_ACTION_ERROR_MESSAGE,
  safeOpsActionErrorMessage,
} from "../src/lib/ops/action-errors";

const originalConsoleError = console.error;

afterEach(() => {
  console.error = originalConsoleError;
});

function silenceConsoleError() {
  console.error = () => undefined;
}

describe("ops action error sanitizing", () => {
  it("preserves intentional validation and business messages", () => {
    assert.equal(
      safeOpsActionErrorMessage("Select a site."),
      "Select a site.",
    );
    assert.equal(
      safeOpsActionErrorMessage("Only draft payroll runs can be approved."),
      "Only draft payroll runs can be approved.",
    );
  });

  it("suppresses raw database and provider internals", () => {
    silenceConsoleError();

    assert.equal(
      safeOpsActionErrorMessage('duplicate key value violates unique constraint "sites_code_key"'),
      OPS_SAFE_ACTION_ERROR_MESSAGE,
    );
    assert.equal(
      safeOpsActionErrorMessage("PGRST205: Could not find the public.employee_documents table in the schema cache"),
      OPS_SAFE_ACTION_ERROR_MESSAGE,
    );
    assert.equal(
      safeOpsActionErrorMessage("AccessDenied: S3 bucket credentials are invalid"),
      OPS_SAFE_ACTION_ERROR_MESSAGE,
    );
  });

  it("uses a caller fallback for empty or unsafe messages", () => {
    silenceConsoleError();

    assert.equal(safeOpsActionErrorMessage("", "Try again."), "Try again.");
    assert.equal(
      safeOpsActionErrorMessage("new row violates row-level security policy for table users", "Try again."),
      "Try again.",
    );
  });
});
