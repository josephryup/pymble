import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  canSignOpsContractAs,
  OPS_CONTRACT_INTERNAL_SIGNATORIES,
  opsContractSignatorySlotForRole,
} from "../src/lib/ops/contract-permissions";
import type { OpsUserRole } from "../src/lib/ops/types";

/**
 * A person's signature specimen is private to them — not to HR, not to the MD,
 * not to a developer. That rule is enforced by structure rather than by care at
 * each call site, and this file pins the structure so a later change has to
 * break a test rather than quietly widen the boundary.
 *
 * The R2 and Supabase calls themselves are not reachable from a unit test; what
 * IS testable is the shape of the code that surrounds them, which is where the
 * guarantee actually lives.
 */

const root = join(import.meta.dirname, "..");

function readSource(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

/**
 * Strip comments before scanning for field names. Without this the checks below
 * fail on the doc comments that explain why a key is absent — which would push
 * the next person to delete the explanation to make the test pass, the exact
 * opposite of what is wanted.
 */
function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const signaturesSource = readSource("src/lib/ops/contract-signatures.ts");
const typesSource = readSource("src/lib/ops/contract-types.ts");
const routeSource = readSource("src/app/api/ops/signature/me/route.ts");

describe("signature specimen privacy", () => {
  it("exposes no reader that takes someone else's user id", () => {
    // The two functions that return specimen content. Both derive identity from
    // the session; neither accepts an argument. If a parameter ever appears
    // here, a caller can be pointed at another person's mark.
    assert.match(
      signaturesSource,
      /export async function fetchMyOpsSignatureSpecimenMeta\(\s*\)/,
      "fetchMyOpsSignatureSpecimenMeta must take no arguments",
    );
    assert.match(
      signaturesSource,
      /export async function loadMyOpsSignatureSpecimenBytes\(\s*\)/,
      "loadMyOpsSignatureSpecimenBytes must take no arguments",
    );
  });

  it("keeps the raw specimen row reader unexported", () => {
    assert.ok(
      signaturesSource.includes("async function loadOwnSpecimenRow("),
      "loadOwnSpecimenRow should exist",
    );
    assert.ok(
      !signaturesSource.includes("export async function loadOwnSpecimenRow("),
      "loadOwnSpecimenRow must stay module-private — it is the only function that returns an R2 key",
    );
  });

  it("never mints a presigned read URL for a specimen", () => {
    // A signed URL is a URL: copyable, forwardable, loggable. Specimen bytes go
    // into a PDF server-side or through the /me route, never as an asset link.
    assert.ok(
      !signaturesSource.includes("createOpsR2ReadUrl"),
      "contract-signatures must not create presigned read URLs",
    );
  });

  it("serves the specimen from a route with no user parameter", () => {
    // The strongest version of the rule: there is no URL shape that can even
    // express a request for another person's signature.
    assert.ok(
      !routeSource.includes("params"),
      "the signature route must not accept route params",
    );
    assert.match(routeSource, /export async function GET\(\s*\)/);
  });

  it("has no [userId] segment on the signature route directory", () => {
    // Guards against someone adding /api/ops/signature/[userId] alongside /me.
    let hasParamRoute = false;
    try {
      readSource("src/app/api/ops/signature/[userId]/route.ts");
      hasParamRoute = true;
    } catch {
      hasParamRoute = false;
    }
    assert.equal(
      hasParamRoute,
      false,
      "a per-user signature route would defeat the whole design",
    );
  });
});

describe("signature keys never reach the client", () => {
  it("omits r2 keys from every client-facing type", () => {
    const declarations = stripComments(typesSource);
    assert.ok(
      !declarations.includes("r2_key"),
      "no type a client component can import may declare an R2 key field",
    );
    assert.ok(
      !declarations.includes("document_sha256"),
      "the document hash stays server-side — publishing it enables offline confirmation of a guessed document",
    );
  });

  it("exposes presence as a boolean instead of a path", () => {
    assert.match(typesSource, /has_mark: boolean/);
    assert.match(typesSource, /has_specimen: boolean/);
  });

  it("routes every signature row through the scrubber", () => {
    const contractsSource = readSource("src/lib/ops/contracts.ts");
    assert.ok(
      contractsSource.includes("toClientOpsContractSignature"),
      "contract reads must scrub signature rows rather than returning them raw",
    );
  });
});

describe("applied marks cannot be read back out of the specimen library", () => {
  it("refuses any key outside ops/contracts/", () => {
    // The applied copy lives under ops/contracts/**. The library lives under
    // ops/signatures/**. This guard is what stops a library path being passed
    // in and rendered onto a document.
    assert.match(
      signaturesSource,
      /if \(!signatureR2Key\.startsWith\("ops\/contracts\/"\)\)/,
    );
  });

  it("copies the specimen at signing rather than pointing at it", () => {
    assert.ok(
      signaturesSource.includes("export async function copyOwnSpecimenForSigning"),
      "signing must copy the mark so replacing a specimen cannot alter an already-signed contract",
    );
    assert.match(
      signaturesSource,
      /ops\/contracts\/\$\{input\.contractId\}\/signatures\/\$\{input\.signatureId\}/,
    );
  });

  it("takes the signer's identity from the session, not a parameter", () => {
    const actionsSource = readSource("src/lib/ops/contract-actions.ts");
    assert.match(
      actionsSource,
      /copyOwnSpecimenForSigning\(\{[^}]*userId: profile\.id/,
      "the mark applied must always be the caller's own",
    );
    assert.ok(
      actionsSource.includes("isLocalRolePreview"),
      "a role-preview session carries a synthetic user id and must not be able to sign",
    );
  });
});

describe("signatory panel", () => {
  it("is HR, the General Manager and the Managing Director", () => {
    assert.deepEqual(OPS_CONTRACT_INTERNAL_SIGNATORIES, [
      "hr",
      "general_manager",
      "managing_director",
    ]);
  });

  it("does not let the Operations Manager sign", () => {
    // Swapped out for the General Manager deliberately; pinned so it cannot
    // drift back in unnoticed.
    for (const slot of OPS_CONTRACT_INTERNAL_SIGNATORIES) {
      assert.equal(canSignOpsContractAs("operations_manager", slot), false);
    }
    assert.equal(opsContractSignatorySlotForRole("operations_manager"), null);
  });

  it("does not let a developer sign", () => {
    // Holding the database keys is not authority to execute an agreement.
    for (const slot of OPS_CONTRACT_INTERNAL_SIGNATORIES) {
      assert.equal(canSignOpsContractAs("developer", slot), false);
    }
  });

  it("maps each office to exactly its own slot", () => {
    assert.equal(opsContractSignatorySlotForRole("general_manager"), "general_manager");
    assert.equal(opsContractSignatorySlotForRole("managing_director"), "managing_director");
    assert.equal(opsContractSignatorySlotForRole("human_resource"), "hr");
    assert.equal(opsContractSignatorySlotForRole("hr"), "hr");

    assert.equal(canSignOpsContractAs("general_manager", "managing_director"), false);
    assert.equal(canSignOpsContractAs("hr", "managing_director"), false);
  });

  it("leaves counterparty and witness slots unclickable by any workspace role", () => {
    const everyRole: OpsUserRole[] = [
      "developer",
      "managing_director",
      "general_manager",
      "human_resource",
      "hr",
      "operations_manager",
      "owner",
      "manager",
      "quantity_surveyor",
      "finance_manager",
    ];

    for (const role of everyRole) {
      assert.equal(canSignOpsContractAs(role, "counterparty"), false);
      assert.equal(canSignOpsContractAs(role, "witness_internal"), false);
      assert.equal(canSignOpsContractAs(role, "witness_counterparty"), false);
    }
  });
});
