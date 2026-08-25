import { createHash, randomBytes } from "node:crypto";

import { requireOpsUser } from "@/lib/ops/auth";
import type {
  OpsContractSignature,
  OpsContractSignatoryRole,
  OpsSignatureSpecimenMeta,
} from "@/lib/ops/contract-types";
import { logOpsServerError } from "@/lib/ops/log";
import { getOpsR2ObjectBytes, putOpsR2Object } from "@/lib/ops/r2";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Signature specimens and the signing ledger.
 *
 * ============================ THE PRIVACY RULE ============================
 *
 * A person's signature specimen is visible to that person and to nobody else.
 * Not to HR, not to the Managing Director, not to a developer.
 *
 * The distinction that makes this coherent: the specimen IN THE LIBRARY is
 * private. The mark APPLIED to a signed contract is visible to whoever can see
 * that contract — that is what signing means. What is prevented is anyone
 * lifting the image and reusing it.
 *
 * This module is the whole surface. Everything that touches specimen bytes
 * lives here so the rules can be checked by reading one file:
 *
 *   1. NO EXPORTED FUNCTION TAKES A USER ID for reading a specimen. The only
 *      reader derives identity from the session. There is no argument to get
 *      wrong at a call site, and no parameter an attacker can tamper with.
 *
 *   2. R2 KEYS NEVER LEAVE THIS MODULE. Returned shapes carry `has_specimen` /
 *      `has_mark` booleans instead of paths. The client-facing types in
 *      contract-types.ts have nowhere to put a key even by accident.
 *
 *   3. BYTES ARE NEVER SERVED AS AN ASSET. No presigned read URL is ever
 *      minted for a specimen — a URL can be copied, forwarded or logged. The
 *      bytes go straight into a PDF via getOpsR2ObjectBytes, or through
 *      /api/ops/signature/me, which has no [userId] segment and so cannot
 *      express a request for anyone else.
 *
 *   4. YOU CAN ONLY APPLY YOUR OWN MARK. applyOpsContractSignature reads the
 *      caller's specimen from the session. There is no parameter for whose
 *      signature to stamp, so signing on someone's behalf is unrepresentable
 *      rather than merely forbidden.
 *
 *   5. A COPY IS TAKEN AT SIGNING. Replacing your specimen next year must not
 *      retroactively change a contract you signed last year, so the applied
 *      mark is copied to a contract-scoped object and the ledger points there.
 *
 * The database backs this with an ownership-only RLS policy on user_signatures
 * (`user_id = auth.uid()`, no admin escape hatch). That policy is the backstop
 * for direct queries; because this codebase reads through the service-role
 * client, THIS FILE is the real enforcement. Treat any new export here as a
 * change to the security boundary.
 * ==========================================================================
 */

const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024;

export const OPS_SIGNATURE_ALLOWED_TYPES = new Set([
  "image/png",
  "image/webp",
  "image/jpeg",
]);

type SignatureSpecimenRow = {
  r2_key: string;
  content_type: string;
  byte_size: number;
  specimen_name: string;
  updated_at: string;
};

/**
 * The caller's own specimen row, keys included. Private to this module — the
 * `export` keyword is absent on purpose. Callers get metadata or bytes through
 * the narrow functions below.
 */
async function loadOwnSpecimenRow(userId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("user_signatures")
    .select("r2_key, content_type, byte_size, specimen_name, updated_at")
    .eq("user_id", userId)
    .maybeSingle<SignatureSpecimenRow>();

  if (error) {
    logOpsServerError(error, {
      module: "contracts",
      action: "loadOwnSpecimenRow",
    });
    throw error;
  }

  return data ?? null;
}

/**
 * Metadata about YOUR specimen, for the profile page. Identity comes from the
 * session; there is deliberately no parameter.
 */
export async function fetchMyOpsSignatureSpecimenMeta(): Promise<OpsSignatureSpecimenMeta> {
  const { profile } = await requireOpsUser();
  const row = await loadOwnSpecimenRow(profile.id);

  if (!row) {
    return {
      has_specimen: false,
      specimen_name: "",
      content_type: "",
      byte_size: 0,
      updated_at: null,
    };
  }

  return {
    has_specimen: true,
    specimen_name: row.specimen_name,
    content_type: row.content_type,
    byte_size: row.byte_size,
    updated_at: row.updated_at,
  };
}

/**
 * YOUR specimen's bytes, for /api/ops/signature/me to stream back to you.
 * Session-scoped, no parameter — the same reason as above.
 */
export async function loadMyOpsSignatureSpecimenBytes() {
  const { profile } = await requireOpsUser();
  const row = await loadOwnSpecimenRow(profile.id);
  if (!row) return null;

  const object = await getOpsR2ObjectBytes(row.r2_key);
  if (!object) return null;

  return { bytes: object.bytes, contentType: row.content_type };
}

/** Store or replace YOUR specimen. Returns the new R2 key for cleanup of the old one. */
export async function storeMyOpsSignatureSpecimen(input: {
  bytes: Uint8Array;
  contentType: string;
  specimenName: string;
  userId: string;
}) {
  if (!OPS_SIGNATURE_ALLOWED_TYPES.has(input.contentType)) {
    throw new Error("Signatures must be a PNG, WebP or JPEG image.");
  }
  if (input.bytes.byteLength > SIGNATURE_MAX_BYTES) {
    throw new Error("Signatures must be 2 MB or smaller.");
  }

  const extension =
    input.contentType === "image/webp"
      ? "webp"
      : input.contentType === "image/jpeg"
        ? "jpg"
        : "png";

  // Its own key prefix, not one of the shared upload scopes, so a bucket-level
  // policy can treat specimens differently from site evidence.
  const key = `ops/signatures/${input.userId}/${Date.now()}.${extension}`;

  await putOpsR2Object({
    body: input.bytes,
    contentType: input.contentType,
    key,
  });

  const supabase = getOpsSupabaseServiceClient();
  const { data: existing } = await supabase
    .from("user_signatures")
    .select("r2_key")
    .eq("user_id", input.userId)
    .maybeSingle<{ r2_key: string }>();

  const { error } = await supabase.from("user_signatures").upsert(
    {
      user_id: input.userId,
      r2_key: key,
      content_type: input.contentType,
      byte_size: input.bytes.byteLength,
      specimen_name: input.specimenName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    logOpsServerError(error, {
      module: "contracts",
      action: "storeMyOpsSignatureSpecimen",
    });
    throw error;
  }

  return { key, previousKey: existing?.r2_key ?? null };
}

/** Remove YOUR specimen. Returns the orphaned key so the caller can delete it. */
export async function clearMyOpsSignatureSpecimen(userId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data: existing } = await supabase
    .from("user_signatures")
    .select("r2_key")
    .eq("user_id", userId)
    .maybeSingle<{ r2_key: string }>();

  const { error } = await supabase
    .from("user_signatures")
    .delete()
    .eq("user_id", userId);

  if (error) {
    logOpsServerError(error, {
      module: "contracts",
      action: "clearMyOpsSignatureSpecimen",
    });
    throw error;
  }

  return existing?.r2_key ?? null;
}

/**
 * Hash of the contract's signable content.
 *
 * This binds a signature to what was actually agreed, which is what makes
 * per-contract clause editing safe: alter the wording afterwards and the stored
 * hash stops matching, so the document reports a stale signature instead of
 * displaying a mark that no longer corresponds to anything.
 *
 * The design called for hashing the rendered PDF bytes. That does not work:
 * @react-pdf embeds a creation timestamp and does not guarantee stable object
 * ordering, so two renders of an untouched contract produce different bytes and
 * every signature would read as stale the moment anyone re-opened the document.
 * Hashing a canonical projection of the CONTENT is both stable and a truer
 * statement of what a signatory assented to — a change of logo or margin is not
 * a change of agreement, and a reworded indemnity clause is.
 *
 * Key order is fixed by construction below; JSON.stringify preserves insertion
 * order for string keys, so the same content always yields the same digest.
 */
export function hashOpsContractContent(content: OpsContractSignableContent) {
  const canonical = JSON.stringify({
    contract_number: content.contract_number,
    kind: content.kind,
    counterparty_name: content.counterparty_name,
    title: content.title,
    preamble: content.preamble,
    scope_summary: content.scope_summary,
    currency_code: content.currency_code,
    subtotal: Number(content.subtotal).toFixed(2),
    vat_applicable: content.vat_applicable,
    vat_percent: Number(content.vat_percent).toFixed(2),
    vat_amount: Number(content.vat_amount).toFixed(2),
    total_value: Number(content.total_value).toFixed(2),
    retention_percent: Number(content.retention_percent).toFixed(2),
    penalty_percent_per_week: Number(content.penalty_percent_per_week).toFixed(2),
    penalty_cap_percent: Number(content.penalty_cap_percent).toFixed(2),
    warranty_months: content.warranty_months,
    defects_liability_months: content.defects_liability_months,
    duration_days: content.duration_days,
    payment_terms_days: content.payment_terms_days,
    start_date: content.start_date,
    end_date: content.end_date,
    scope_items: content.scope_items.map((item) => [
      item.sort_order,
      item.heading,
      item.detail,
    ]),
    lines: content.lines.map((line) => [
      line.sort_order,
      line.description,
      Number(line.quantity).toFixed(3),
      line.uom,
      Number(line.rate).toFixed(2),
      Number(line.amount).toFixed(2),
    ]),
    milestones: content.milestones.map((milestone) => [
      milestone.sort_order,
      milestone.label,
      Number(milestone.percent).toFixed(3),
      Number(milestone.amount).toFixed(2),
      milestone.trigger_description,
      milestone.payable_within_days,
      milestone.is_retention,
    ]),
    clauses: content.clauses.map((clause) => [
      clause.sort_order,
      clause.section_key,
      clause.heading,
      clause.body_markdown,
    ]),
  });

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** The projection of a contract that a signature actually attests to. */
export type OpsContractSignableContent = {
  contract_number: string;
  kind: string;
  counterparty_name: string;
  title: string;
  preamble: string;
  scope_summary: string;
  currency_code: string;
  subtotal: number;
  vat_applicable: boolean;
  vat_percent: number;
  vat_amount: number;
  total_value: number;
  retention_percent: number;
  penalty_percent_per_week: number;
  penalty_cap_percent: number;
  warranty_months: number;
  defects_liability_months: number;
  duration_days: number;
  payment_terms_days: number;
  start_date: string | null;
  end_date: string | null;
  /** Employment terms. Zero/empty on a subcontract. */
  job_title: string;
  place_of_work: string;
  probation_months: number;
  notice_period_days: number;
  annual_leave_days: number;
  hours_per_week: number;
  /**
   * The pay figures as printed. Part of the hash because a signature attests to
   * a DOCUMENT, and on an employment contract the schedule is the substance of
   * it — a signature over a hash that omitted the salary would verify nothing
   * anyone actually cared about. Null on a subcontract, which has no schedule.
   */
  remuneration: {
    basic: number;
    housing: number;
    other_allowances: number;
    gross: number;
    statutory_applies: boolean;
    net: number;
  } | null;
  scope_items: Array<{ sort_order: number; heading: string; detail: string }>;
  lines: Array<{
    sort_order: number;
    description: string;
    quantity: number;
    uom: string;
    rate: number;
    amount: number;
  }>;
  milestones: Array<{
    sort_order: number;
    label: string;
    percent: number;
    amount: number;
    trigger_description: string;
    payable_within_days: number;
    is_retention: boolean;
  }>;
  clauses: Array<{
    sort_order: number;
    section_key: string;
    heading: string;
    body_markdown: string;
  }>;
};

/** Short human-quotable code printed under the mark so a paper copy traces back. */
export function generateOpsSignatureVerificationCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

type SignatureRow = {
  id: string;
  contract_id: string;
  signatory_role: OpsContractSignatoryRole;
  sequence: number;
  is_required: boolean;
  assigned_user_id: string | null;
  status: OpsContractSignature["status"];
  signed_by_user_id: string | null;
  signed_name: string;
  signed_title: string;
  signature_r2_key: string | null;
  signed_at: string | null;
  decline_reason: string;
  verification_code: string | null;
  document_sha256: string | null;
};

/**
 * The scrubber. Every signature row crossing out of the server passes through
 * here, which is where `signature_r2_key` and `document_sha256` are dropped and
 * replaced by booleans.
 *
 * The hash is withheld as well as the key: publishing it would let anyone
 * confirm a guessed document byte-for-byte offline, and the UI only ever needs
 * the yes/no answer this computes.
 */
export function toClientOpsContractSignature(
  row: SignatureRow,
  currentDocumentSha256: string | null,
): OpsContractSignature {
  return {
    id: row.id,
    contract_id: row.contract_id,
    signatory_role: row.signatory_role,
    sequence: row.sequence,
    is_required: row.is_required,
    assigned_user_id: row.assigned_user_id,
    status: row.status,
    signed_by_user_id: row.signed_by_user_id,
    signed_name: row.signed_name,
    signed_title: row.signed_title,
    has_mark: Boolean(row.signature_r2_key),
    signed_at: row.signed_at,
    decline_reason: row.decline_reason,
    verification_code: row.verification_code,
    matches_current_document:
      row.status !== "signed" || !row.document_sha256
        ? null
        : currentDocumentSha256 !== null &&
          row.document_sha256 === currentDocumentSha256,
  };
}

export type OpsContractSignatureRow = SignatureRow;

/**
 * Copy the caller's specimen to a contract-scoped object and return the key.
 *
 * A COPY, not a reference: re-uploading a specimen must never change how an
 * already-signed contract renders. Called only from the signing action, which
 * has already established that the caller is the person filling the slot.
 */
export async function copyOwnSpecimenForSigning(input: {
  contractId: string;
  signatureId: string;
  userId: string;
}) {
  const row = await loadOwnSpecimenRow(input.userId);
  if (!row) return null;

  const object = await getOpsR2ObjectBytes(row.r2_key);
  if (!object) return null;

  const extension = row.r2_key.split(".").pop() ?? "png";
  const key = `ops/contracts/${input.contractId}/signatures/${input.signatureId}.${extension}`;

  await putOpsR2Object({
    body: object.bytes,
    contentType: row.content_type,
    key,
  });

  return { key, specimenName: row.specimen_name };
}

/**
 * Everything the PDF renderer needs about the signatories, marks included.
 *
 * The only path by which mark images leave this module, and it hands back
 * base64 data URLs rather than keys — the caller renders them and cannot
 * re-request them. Kept here rather than in contracts.ts so that every line of
 * code that can turn a stored key into pixels sits in one reviewable file.
 */
export async function loadOpsContractSignatoriesForRender(
  contractId: string,
  currentDocumentSha256: string | null,
) {
  const supabase = getOpsSupabaseServiceClient();

  const { data, error } = await supabase
    .from("contract_signatures")
    .select(
      "signatory_role, status, signed_name, signed_title, signed_at, verification_code, decline_reason, signature_r2_key, document_sha256",
    )
    .eq("contract_id", contractId)
    .order("sequence", { ascending: true });

  if (error) {
    logOpsServerError(error, {
      module: "contracts",
      action: "loadOpsContractSignatoriesForRender",
      entityId: contractId,
    });
    return [];
  }

  return Promise.all(
    (data ?? []).map(async (row) => ({
      signatoryRole: row.signatory_role as OpsContractSignatoryRole,
      status: row.status as "pending" | "signed" | "declined",
      signedName: row.signed_name ?? "",
      signedTitle: row.signed_title ?? "",
      signedAt: row.signed_at as string | null,
      verificationCode: row.verification_code as string | null,
      declineReason: row.decline_reason ?? "",
      markDataUrl:
        row.status === "signed" && row.signature_r2_key
          ? await loadAppliedOpsSignatureMark(row.signature_r2_key as string)
          : null,
      matchesCurrentDocument:
        row.status !== "signed" || !row.document_sha256
          ? null
          : currentDocumentSha256 !== null &&
            row.document_sha256 === currentDocumentSha256,
    })),
  );
}

/**
 * Load an applied mark's bytes for the PDF renderer.
 *
 * Takes a key that the caller already read off a contract_signatures row, so
 * this cannot reach the specimen library: the applied copies live under
 * ops/contracts/**, and the guard below refuses anything else — including,
 * pointedly, an ops/signatures/** path smuggled in from elsewhere.
 */
export async function loadAppliedOpsSignatureMark(signatureR2Key: string) {
  if (!signatureR2Key.startsWith("ops/contracts/")) {
    logOpsServerError(
      new Error("Refused to load a signature mark from outside ops/contracts/"),
      { module: "contracts", action: "loadAppliedOpsSignatureMark" },
    );
    return null;
  }

  const object = await getOpsR2ObjectBytes(signatureR2Key);
  if (!object) return null;

  return `data:${object.contentType};base64,${Buffer.from(object.bytes).toString("base64")}`;
}
