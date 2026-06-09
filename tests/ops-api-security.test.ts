import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { rejectMismatchedOpsOrigin } from "../src/lib/ops/api-security";

const ORIGINAL_OPS_HOST = process.env.NEXT_PUBLIC_OPS_HOST;

afterEach(() => {
  if (ORIGINAL_OPS_HOST === undefined) {
    delete process.env.NEXT_PUBLIC_OPS_HOST;
    return;
  }

  process.env.NEXT_PUBLIC_OPS_HOST = ORIGINAL_OPS_HOST;
});

describe("ops API origin protection", () => {
  it("allows same-origin production writes", () => {
    const response = rejectMismatchedOpsOrigin(
      new Request("https://ops.pymbleconstruction.com/api/ops/auth/login", {
        headers: { origin: "https://ops.pymbleconstruction.com" },
        method: "POST",
      }),
    );

    assert.equal(response, null);
  });

  it("allows local loopback origins during development", () => {
    const response = rejectMismatchedOpsOrigin(
      new Request("http://localhost:3000/api/ops/auth/login", {
        headers: { origin: "http://127.0.0.1:3000" },
        method: "POST",
      }),
    );

    assert.equal(response, null);
  });

  it("rejects unsafe writes without a verifiable browser origin", async () => {
    const response = rejectMismatchedOpsOrigin(
      new Request("https://ops.pymbleconstruction.com/api/ops/auth/login", {
        method: "POST",
      }),
    );

    assert.equal(response?.status, 403);
    assert.deepEqual(await response?.json(), {
      error: "Request origin could not be verified.",
    });
  });

  it("rejects mismatched write origins", async () => {
    const response = rejectMismatchedOpsOrigin(
      new Request("https://ops.pymbleconstruction.com/api/ops/auth/login", {
        headers: { origin: "https://example.com" },
        method: "POST",
      }),
    );

    assert.equal(response?.status, 403);
    assert.deepEqual(await response?.json(), {
      error: "Request origin is not allowed.",
    });
  });

  it("does not require origins on safe reads", () => {
    const response = rejectMismatchedOpsOrigin(
      new Request("https://ops.pymbleconstruction.com/api/ops/health", {
        method: "GET",
      }),
    );

    assert.equal(response, null);
  });
});
