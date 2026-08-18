"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  canApproveOpsContract,
  canDraftOpsContractKind,
  canIssueOpsContract,
  canReviewOpsContract,
  canSignOpsContractAs,
  canViewOpsContractKind,
  OPS_CONTRACT_INTERNAL_SIGNATORIES,
} from "@/lib/ops/contract-permissions";
import {
  copyOwnSpecimenForSigning,
  generateOpsSignatureVerificationCode,
  hashOpsContractContent,
} from "@/lib/ops/contract-signatures";
import type {
  OpsContractSignatoryRole,
  OpsContractStatus,
} from "@/lib/ops/contract-types";
import {
  fetchOpsContractById,
  fetchOpsContractTemplateClauses,
  toOpsContractSignableContent,
} from "@/lib/ops/contracts";
import { requirePublicEnv } from "@/lib/ops/env";
import { logOpsServerError } from "@/lib/ops/log";
import { fanoutToOpsAudiences } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

const ROUTE = "/ops/contracts";
const MODULE = "contracts";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function contractError(message: string, contractId?: string): never {
  const base = contractId ? `${ROUTE}/${contractId}` : ROUTE;
  redirect(`${base}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function revalidateContract(contractId?: string) {
  revalidatePath(ROUTE);
  if (contractId) revalidatePath(`${ROUTE}/${contractId}`);
}

// ---------------------------------------------------------------------------
// Drafting
// ---------------------------------------------------------------------------

const createSchema = z.object({
  template_id: z.string().uuid("Choose a template."),
  kind: z.enum(["subcontract", "employment"]),
  counterparty_type: z.enum(["subcontractor", "employee"]),
  subcontractor_id: z.string().trim().default(""),
  employee_id: z.string().trim().default(""),
  title: z.string().trim().min(2, "Give the contract a title.").max(200),
  site_id: z.string().trim().default(""),
});

/**
 * Start a draft from a template.
 *
 * The template's clauses are COPIED into contract_clauses rather than
 * referenced, which is the whole of decision D2: HR edits their copy, the
 * master is untouched, and template_body_snapshot preserves what the clause
 * said when it was copied so the approver can diff against it later.
 */
export async function createOpsContractDraftAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = createSchema.safeParse({
    template_id: field(formData, "template_id"),
    kind: field(formData, "kind") || "subcontract",
    counterparty_type: field(formData, "counterparty_type") || "subcontractor",
    subcontractor_id: field(formData, "subcontractor_id"),
    employee_id: field(formData, "employee_id"),
    title: field(formData, "title"),
    site_id: field(formData, "site_id"),
  });

  if (!parsed.success) {
    contractError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  }

  const input = parsed.data;

  if (!canDraftOpsContractKind(profile.role, input.kind)) {
    contractError("Your role cannot draft this kind of contract.");
  }

  if (input.counterparty_type === "subcontractor" && !input.subcontractor_id) {
    contractError("Choose the subcontractor this contract is with.");
  }
  if (input.counterparty_type === "employee" && !input.employee_id) {
    contractError("Choose the employee this contract is with.");
  }

  const supabase = getOpsSupabaseServiceClient();

  const { data: template, error: templateError } = await supabase
    .from("contract_templates")
    .select(
      "id, version, kind, default_vat_percent, default_retention_percent, default_penalty_percent_per_week, default_penalty_cap_percent, default_warranty_months, default_defects_liability_months, default_variation_threshold_percent, default_payment_terms_days",
    )
    .eq("id", input.template_id)
    .maybeSingle();

  if (templateError || !template) {
    contractError("That template could not be found.");
  }

  if (template.kind !== input.kind) {
    contractError("That template is for a different kind of contract.");
  }

  const { data: contract, error } = await supabase
    .from("contracts")
    .insert({
      template_id: template.id,
      template_version: template.version,
      kind: input.kind,
      status: "draft" satisfies OpsContractStatus,
      counterparty_type: input.counterparty_type,
      subcontractor_id:
        input.counterparty_type === "subcontractor" ? input.subcontractor_id : null,
      employee_id: input.counterparty_type === "employee" ? input.employee_id : null,
      site_id: input.site_id || null,
      title: input.title,
      vat_percent: template.default_vat_percent,
      retention_percent: template.default_retention_percent,
      penalty_percent_per_week: template.default_penalty_percent_per_week,
      penalty_cap_percent: template.default_penalty_cap_percent,
      warranty_months: template.default_warranty_months,
      defects_liability_months: template.default_defects_liability_months,
      variation_threshold_percent: template.default_variation_threshold_percent,
      payment_terms_days: template.default_payment_terms_days,
      created_by: profile.id,
    })
    .select("id, contract_number")
    .single();

  if (error || !contract) {
    logOpsServerError(error, { module: MODULE, action: "createOpsContractDraft" });
    contractError(error?.message ?? "The contract could not be created.");
  }

  const templateClauses = await fetchOpsContractTemplateClauses(template.id);

  if (templateClauses.length > 0) {
    const { error: clauseError } = await supabase.from("contract_clauses").insert(
      templateClauses.map((clause) => ({
        contract_id: contract.id,
        section_key: clause.section_key,
        heading: clause.heading,
        body_markdown: clause.body_markdown,
        sort_order: clause.sort_order,
        is_required: clause.is_required,
        is_customised: false,
        template_body_snapshot: clause.body_markdown,
      })),
    );

    if (clauseError) {
      logOpsServerError(clauseError, {
        module: MODULE,
        action: "createOpsContractDraft.clauses",
        entityId: contract.id,
      });
    }
  }

  await recordOpsAuditEvent({
    action: "contract.created",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    metadata: { contract_number: contract.contract_number, kind: input.kind },
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} created contract ${contract.contract_number}`,
  }).catch(() => null);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}`);
}

const clauseSchema = z.object({
  clause_id: z.string().uuid(),
  contract_id: z.string().uuid(),
  heading: z.string().trim().max(200).default(""),
  body_markdown: z.string().trim().max(20000).default(""),
});

/**
 * Edit one clause on one contract (D2).
 *
 * is_customised is derived by comparing against template_body_snapshot rather
 * than being set blindly, so editing a clause back to the template wording
 * correctly clears the flag — otherwise a reviewer chases a diff that no longer
 * exists.
 */
export async function updateOpsContractClauseAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = clauseSchema.safeParse({
    clause_id: field(formData, "clause_id"),
    contract_id: field(formData, "contract_id"),
    heading: field(formData, "heading"),
    body_markdown: field(formData, "body_markdown"),
  });

  if (!parsed.success) {
    contractError("That clause edit could not be saved.");
  }

  const input = parsed.data;
  const contract = await fetchOpsContractById(input.contract_id);

  if (!contract) contractError("Contract not found.");
  if (!canDraftOpsContractKind(profile.role, contract.kind)) {
    contractError("Your role cannot edit this contract.", contract.id);
  }
  if (contract.status !== "draft") {
    contractError(
      "Only a draft can be edited. Raise an addendum to change an issued contract.",
      contract.id,
    );
  }

  const clause = contract.clauses.find((row) => row.id === input.clause_id);
  if (!clause) contractError("That clause is not on this contract.", contract.id);

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("contract_clauses")
    .update({
      heading: input.heading,
      body_markdown: input.body_markdown,
      is_customised: input.body_markdown.trim() !== clause.template_body_snapshot.trim(),
    })
    .eq("id", clause.id);

  if (error) {
    logOpsServerError(error, {
      module: MODULE,
      action: "updateOpsContractClause",
      entityId: contract.id,
    });
    contractError(error.message, contract.id);
  }

  await recordOpsAuditEvent({
    action: "contract.clause_edited",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    metadata: { section_key: clause.section_key },
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} edited the "${clause.heading || clause.section_key}" clause on ${contract.contract_number}`,
  }).catch(() => null);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=clause`);
}

/** Put a clause back to the template wording. */
export async function resetOpsContractClauseAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const clauseId = field(formData, "clause_id");
  const contractId = field(formData, "contract_id");

  const contract = await fetchOpsContractById(contractId);
  if (!contract) contractError("Contract not found.");
  if (!canDraftOpsContractKind(profile.role, contract.kind)) {
    contractError("Your role cannot edit this contract.", contract.id);
  }
  if (contract.status !== "draft") {
    contractError("Only a draft can be edited.", contract.id);
  }

  const clause = contract.clauses.find((row) => row.id === clauseId);
  if (!clause) contractError("That clause is not on this contract.", contract.id);

  const supabase = getOpsSupabaseServiceClient();
  await supabase
    .from("contract_clauses")
    .update({
      body_markdown: clause.template_body_snapshot,
      is_customised: false,
    })
    .eq("id", clause.id);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=clause_reset`);
}

// ---------------------------------------------------------------------------
// Review and approval
// ---------------------------------------------------------------------------

export async function submitOpsContractForReviewAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const contractId = field(formData, "contract_id");

  const contract = await fetchOpsContractById(contractId);
  if (!contract) contractError("Contract not found.");
  if (!canDraftOpsContractKind(profile.role, contract.kind)) {
    contractError("Your role cannot submit this contract.", contract.id);
  }
  if (contract.status !== "draft") {
    contractError("Only a draft can be submitted for review.", contract.id);
  }

  // Milestone percentages are checked here rather than by a database
  // constraint: a milestone set is legitimately incomplete while someone is
  // still typing it, and only submission is the moment it must add up.
  if (contract.milestones.length > 0) {
    const total = contract.milestones.reduce(
      (sum, milestone) => sum + Number(milestone.percent ?? 0),
      0,
    );
    if (Math.abs(total - 100) > 0.01) {
      contractError(
        `The payment milestones total ${total.toFixed(1)}%, not 100%.`,
        contract.id,
      );
    }
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("contracts")
    .update({ status: "in_review" satisfies OpsContractStatus })
    .eq("id", contract.id);

  if (error) contractError(error.message, contract.id);

  const customised = contract.clauses.filter((clause) => clause.is_customised);

  const recipients = await fanoutToOpsAudiences({
    actionNeeded: ["managing_director", "general_manager", "owner"],
    stakeholders: ["operations_manager", "quantity_surveyor"],
    excludeUserIds: [profile.id],
  });

  await Promise.all(
    recipients.map((recipient) =>
      queueOpsNotification({
        actionHref: `${ROUTE}/${contract.id}`,
        body:
          customised.length > 0
            ? `${customised.length} clause(s) were customised and need review.`
            : "Standard template wording, no clauses customised.",
        moduleKey: MODULE,
        recipientId: recipient.id,
        sourceId: contract.id,
        sourceTable: "contracts",
        title: `Contract ${contract.contract_number} needs review`,
      }).catch(() => null),
    ),
  );

  await recordOpsAuditEvent({
    action: "contract.submitted",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    metadata: { customised_clauses: customised.length },
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} submitted ${contract.contract_number} for review`,
  }).catch(() => null);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=submitted`);
}

/**
 * Approve, and open the signature slots.
 *
 * The internal panel is HR, the General Manager and the Managing Director, in
 * that order. Rows are created here rather than at draft time so a contract
 * that never gets approved never carries a pending signature nobody owes.
 */
export async function approveOpsContractAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const contractId = field(formData, "contract_id");

  const contract = await fetchOpsContractById(contractId);
  if (!contract) contractError("Contract not found.");
  if (!canApproveOpsContract(profile.role)) {
    contractError("Your role cannot approve contracts.", contract.id);
  }
  if (!canReviewOpsContract(profile.role)) {
    contractError("Your role cannot review contracts.", contract.id);
  }
  if (contract.status !== "in_review") {
    contractError("Only a contract in review can be approved.", contract.id);
  }

  const supabase = getOpsSupabaseServiceClient();

  const { error } = await supabase
    .from("contracts")
    .update({
      status: "approved" satisfies OpsContractStatus,
      approved_at: new Date().toISOString(),
      approved_by: profile.id,
    })
    .eq("id", contract.id);

  if (error) contractError(error.message, contract.id);

  const { error: slotError } = await supabase.from("contract_signatures").upsert(
    OPS_CONTRACT_INTERNAL_SIGNATORIES.map((role, index) => ({
      contract_id: contract.id,
      signatory_role: role,
      sequence: index + 1,
      is_required: true,
    })),
    { onConflict: "contract_id,signatory_role" },
  );

  if (slotError) {
    logOpsServerError(slotError, {
      module: MODULE,
      action: "approveOpsContract.slots",
      entityId: contract.id,
    });
  }

  await recordOpsAuditEvent({
    action: "contract.approved",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} approved ${contract.contract_number}`,
  }).catch(() => null);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=approved`);
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * Verify the caller's password without touching their session.
 *
 * A throwaway client, not the shared anon singleton: signInWithPassword parks a
 * session on whatever client it is called on, and the singleton is shared
 * across every request this server handles. Built per call and signed out
 * immediately so no session outlives the check.
 */
async function verifyOwnPassword(email: string, password: string) {
  const client = createClient(
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const { error } = await client.auth.signInWithPassword({ email, password });
    return !error;
  } catch {
    return false;
  } finally {
    await client.auth.signOut().catch(() => null);
  }
}

/**
 * Sign a contract with YOUR OWN signature mark.
 *
 * There is no parameter for whose signature to apply — the specimen is read
 * from the session in copyOwnSpecimenForSigning. Signing on someone else's
 * behalf is not blocked here so much as unrepresentable.
 *
 * Three gates before a mark is applied: the slot must be yours (by assignment
 * or by office), you must re-enter your password, and the session must be a
 * real one. A local role-preview session carries a synthetic user id and can
 * never execute an agreement.
 */
export async function signOpsContractAction(formData: FormData) {
  const { profile, isLocalRolePreview } = await requireOpsUser();
  const contractId = field(formData, "contract_id");
  const signatureId = field(formData, "signature_id");
  const password = field(formData, "password");

  if (isLocalRolePreview) {
    contractError("A role-preview session cannot sign contracts.", contractId);
  }

  const contract = await fetchOpsContractById(contractId);
  if (!contract) contractError("Contract not found.");

  if (!canViewOpsContractKind(profile.role, contract.kind)) {
    contractError("Contract not found.");
  }

  if (!["approved", "issued"].includes(contract.status)) {
    contractError("This contract is not open for signature.", contract.id);
  }

  const signature = contract.signatures.find((row) => row.id === signatureId);
  if (!signature) contractError("That signature slot is not on this contract.", contract.id);
  if (signature.status !== "pending") {
    contractError("That signature slot has already been actioned.", contract.id);
  }

  const slotIsMine =
    signature.assigned_user_id === profile.id ||
    (signature.assigned_user_id === null &&
      canSignOpsContractAs(profile.role, signature.signatory_role as OpsContractSignatoryRole));

  if (!slotIsMine) {
    contractError("That signature slot is not yours to sign.", contract.id);
  }

  if (!profile.email) {
    contractError("Your account has no email address, so you cannot be re-verified.", contract.id);
  }
  if (!password) {
    contractError("Enter your password to sign.", contract.id);
  }
  if (!(await verifyOwnPassword(profile.email, password))) {
    contractError("That password was not correct.", contract.id);
  }

  const mark = await copyOwnSpecimenForSigning({
    contractId: contract.id,
    signatureId: signature.id,
    userId: profile.id,
  });

  if (!mark) {
    contractError(
      "You have not uploaded a signature yet. Add one on your profile, then sign.",
      contract.id,
    );
  }

  // The hash is taken over the contract as it stands right now, so this
  // signature is bound to this wording. A later edit makes it visibly stale
  // rather than silently carrying over.
  const documentHash = hashOpsContractContent(toOpsContractSignableContent(contract));

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("contract_signatures")
    .update({
      status: "signed",
      signed_by_user_id: profile.id,
      signed_name: mark.specimenName || profile.full_name,
      signed_title: profile.role,
      signature_r2_key: mark.key,
      signed_at: new Date().toISOString(),
      document_sha256: documentHash,
      verification_code: generateOpsSignatureVerificationCode(),
    })
    .eq("id", signature.id)
    .eq("status", "pending");

  if (error) {
    logOpsServerError(error, {
      module: MODULE,
      action: "signOpsContract",
      entityId: contract.id,
    });
    contractError("The signature could not be recorded.", contract.id);
  }

  // All required internal marks in place moves the contract on to issued.
  const { data: outstanding } = await supabase
    .from("contract_signatures")
    .select("id")
    .eq("contract_id", contract.id)
    .eq("is_required", true)
    .neq("status", "signed")
    .in("signatory_role", OPS_CONTRACT_INTERNAL_SIGNATORIES);

  if ((outstanding ?? []).length === 0 && contract.status !== "issued") {
    await supabase
      .from("contracts")
      .update({
        status: "issued" satisfies OpsContractStatus,
        issued_at: new Date().toISOString(),
        issued_by: profile.id,
      })
      .eq("id", contract.id);
  }

  await recordOpsAuditEvent({
    action: "contract.signed",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    metadata: { signatory_role: signature.signatory_role },
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} signed ${contract.contract_number} as ${signature.signatory_role.replace(/_/g, " ")}`,
  }).catch(() => null);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=signed`);
}

/**
 * Decline to sign, with a reason.
 *
 * A first-class outcome rather than an absence. Without it people simply do not
 * click, and nobody downstream can tell a refusal from a backlog. Declining
 * sends the contract back to draft so the objection can be dealt with.
 */
export async function declineOpsContractSignatureAction(formData: FormData) {
  const { profile, isLocalRolePreview } = await requireOpsUser();
  const contractId = field(formData, "contract_id");
  const signatureId = field(formData, "signature_id");
  const reason = field(formData, "decline_reason").trim();

  if (isLocalRolePreview) {
    contractError("A role-preview session cannot action signatures.", contractId);
  }
  if (reason.length < 4) {
    contractError("Give a reason for declining to sign.", contractId);
  }

  const contract = await fetchOpsContractById(contractId);
  if (!contract) contractError("Contract not found.");

  const signature = contract.signatures.find((row) => row.id === signatureId);
  if (!signature) contractError("That signature slot is not on this contract.", contract.id);
  if (signature.status !== "pending") {
    contractError("That signature slot has already been actioned.", contract.id);
  }

  const slotIsMine =
    signature.assigned_user_id === profile.id ||
    (signature.assigned_user_id === null &&
      canSignOpsContractAs(profile.role, signature.signatory_role as OpsContractSignatoryRole));

  if (!slotIsMine) {
    contractError("That signature slot is not yours to action.", contract.id);
  }

  const supabase = getOpsSupabaseServiceClient();

  const { error } = await supabase
    .from("contract_signatures")
    .update({ status: "declined", decline_reason: reason })
    .eq("id", signature.id)
    .eq("status", "pending");

  if (error) contractError("The decline could not be recorded.", contract.id);

  await supabase
    .from("contracts")
    .update({ status: "draft" satisfies OpsContractStatus })
    .eq("id", contract.id);

  const recipients = await fanoutToOpsAudiences({
    actionNeeded: ["human_resource", "hr"],
    oversight: ["managing_director", "general_manager"],
    extraUserIds: [contract.created_by],
    excludeUserIds: [profile.id],
  });

  await Promise.all(
    recipients.map((recipient) =>
      queueOpsNotification({
        actionHref: `${ROUTE}/${contract.id}`,
        body: reason,
        moduleKey: MODULE,
        recipientId: recipient.id,
        sourceId: contract.id,
        sourceTable: "contracts",
        title: `${profile.full_name} declined to sign ${contract.contract_number}`,
      }).catch(() => null),
    ),
  );

  await recordOpsAuditEvent({
    action: "contract.signature_declined",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    metadata: { signatory_role: signature.signatory_role, reason },
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} declined to sign ${contract.contract_number}`,
  }).catch(() => null);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=declined`);
}

/**
 * Record the countersigned copy and make the contract live.
 *
 * The counterparty signs on paper; this is where that scan lands. Internal
 * marks alone never reach 'signed' — an agreement only one side has executed is
 * not an agreement.
 */
export async function recordOpsContractCountersignatureAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const contractId = field(formData, "contract_id");
  const documentId = field(formData, "signed_document_id").trim();

  const contract = await fetchOpsContractById(contractId);
  if (!contract) contractError("Contract not found.");
  if (!canIssueOpsContract(profile.role)) {
    contractError("Your role cannot record a countersignature.", contract.id);
  }
  if (contract.status !== "issued") {
    contractError("Only an issued contract can be countersigned.", contract.id);
  }
  if (!documentId) {
    contractError("Attach the signed copy first.", contract.id);
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("contracts")
    .update({
      status: "active" satisfies OpsContractStatus,
      signed_at: new Date().toISOString(),
      signed_document_id: documentId,
    })
    .eq("id", contract.id);

  if (error) contractError(error.message, contract.id);

  await recordOpsAuditEvent({
    action: "contract.countersigned",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "contract",
    moduleKey: MODULE,
    sourceId: contract.id,
    sourceTable: "contracts",
    summary: `${profile.full_name} recorded the countersigned copy of ${contract.contract_number}`,
  }).catch(() => null);

  revalidateContract(contract.id);
  redirect(`${ROUTE}/${contract.id}?updated=countersigned`);
}
