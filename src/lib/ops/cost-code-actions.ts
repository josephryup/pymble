"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  canManageOpsCostCodeLibrary,
  canManageOpsProjectCostCodes,
} from "@/lib/ops/cost-code-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Maintaining the cost-code spine.
 *
 * Business decision §7.4: the LIBRARY belongs to Finance and the MD — every
 * code maps to a GL account, so editing it is editing the chart of accounts by
 * proxy. The per-project WBS is assembled from those codes by the QS and
 * Projects Manager, who know the phasing.
 *
 * Without these actions the spine was complete but frozen: seeded, mapped, and
 * impossible to extend without a migration. A taxonomy nobody can add to is a
 * taxonomy people work around, which is exactly how free-text categories got
 * established in the first place.
 */

const COST_CODES_ROUTE = "/ops/cost-codes";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function costCodeError(message: string): never {
  throw new Error(safeOpsActionErrorMessage(message));
}

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const KIND = z.enum([
  "materials",
  "labour",
  "plant",
  "subcontract",
  "transport",
  "preliminaries",
  "other",
]);

// ---------------------------------------------------------------------------
// The company library (Finance + MD).
// ---------------------------------------------------------------------------

const libraryCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Give the code an identifier, e.g. 03.30.")
    .max(20)
    // Codes are a join key and appear in the WBS path, so keep them tight.
    .regex(/^[A-Za-z0-9][A-Za-z0-9.\-_]*$/, "Use letters, numbers, dots or dashes only."),
  name: z.string().trim().min(2, "Give the code a name.").max(160),
  division: z.string().trim().max(80).default(""),
  kind: KIND,
  gl_account_id: z
    .string()
    .trim()
    .default("")
    .transform((value) => (value.length > 0 ? value : null))
    .refine((value) => value === null || UUID.test(value), {
      message: "Select a valid GL account.",
    }),
  description: z.string().trim().max(400).default(""),
});

export async function createCostCodeLibraryEntryAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsCostCodeLibrary(profile.role)) {
    costCodeError(
      "Only Finance and the Managing Director can add cost codes — the library maps directly to the general ledger.",
    );
  }

  const parsed = libraryCreateSchema.safeParse({
    code: field(formData, "code"),
    name: field(formData, "name"),
    division: field(formData, "division"),
    kind: field(formData, "kind") || "materials",
    gl_account_id: field(formData, "gl_account_id"),
    description: field(formData, "description"),
  });
  if (!parsed.success) {
    costCodeError(parsed.error.issues[0]?.message ?? "Check the cost code details.");
  }

  // A code with no GL account still works, but every cost booked to it falls
  // back to 5090 and is flagged in reconciliation — so refuse rather than
  // create a known reconciliation break.
  if (!parsed.data.gl_account_id) {
    costCodeError(
      "Map the code to a GL account. Without one, every cost booked to it posts to Other Direct Costs and shows as unmapped in reconciliation.",
    );
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("cost_code_library")
    .insert({ ...parsed.data, created_by: profile.id })
    .select("id, code")
    .single<{ id: string; code: string }>();

  if (error || !data) {
    costCodeError(
      error?.code === "23505"
        ? `Cost code ${parsed.data.code} already exists.`
        : (error?.message ?? "Could not create the cost code."),
    );
  }

  await recordOpsAuditEvent({
    action: "cost_code_library.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "cost_code_library",
    metadata: { code: data.code, kind: parsed.data.kind },
    moduleKey: "finance",
    sourceId: data.id,
    sourceTable: "cost_code_library",
    summary: `Added cost code ${data.code} — ${parsed.data.name}`,
  }).catch(() => null);

  revalidatePath(COST_CODES_ROUTE);
  redirect(`${COST_CODES_ROUTE}?updated=code_added`);
}

const libraryUpdateSchema = z.object({
  id: z.string().regex(UUID, "Select a cost code."),
  name: z.string().trim().min(2, "Give the code a name.").max(160),
  gl_account_id: z.string().regex(UUID, "Select a GL account."),
  is_active: z.enum(["true", "false"]),
});

/**
 * Rename a code, remap its GL account, or deactivate it.
 *
 * `system_locked` codes may be renamed, remapped and deactivated but never
 * deleted — the same rule chart_of_accounts uses. Deleting a code that history
 * points at would orphan the ledger.
 */
export async function updateCostCodeLibraryEntryAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsCostCodeLibrary(profile.role)) {
    costCodeError("Only Finance and the Managing Director can change cost codes.");
  }

  const parsed = libraryUpdateSchema.safeParse({
    id: field(formData, "id"),
    name: field(formData, "name"),
    gl_account_id: field(formData, "gl_account_id"),
    is_active: field(formData, "is_active") || "true",
  });
  if (!parsed.success) {
    costCodeError(parsed.error.issues[0]?.message ?? "Check the cost code details.");
  }

  const supabase = getOpsSupabaseServiceClient();

  const { data: before } = await supabase
    .from("cost_code_library")
    .select("code, gl_account_id")
    .eq("id", parsed.data.id)
    .maybeSingle<{ code: string; gl_account_id: string | null }>();

  const { error } = await supabase
    .from("cost_code_library")
    .update({
      name: parsed.data.name,
      gl_account_id: parsed.data.gl_account_id,
      is_active: parsed.data.is_active === "true",
    })
    .eq("id", parsed.data.id);

  if (error) {
    costCodeError(error.message);
  }

  // A GL remap changes where every future cost on this code lands, so it is
  // recorded explicitly rather than folded into a generic "updated" row.
  const remapped =
    before && before.gl_account_id !== parsed.data.gl_account_id
      ? { from: before.gl_account_id, to: parsed.data.gl_account_id }
      : null;

  await recordOpsAuditEvent({
    action: remapped ? "cost_code_library.gl_remapped" : "cost_code_library.updated",
    actorUserId: profile.id,
    entityId: parsed.data.id,
    entityType: "cost_code_library",
    metadata: {
      code: before?.code ?? null,
      is_active: parsed.data.is_active === "true",
      ...(remapped ? { gl_account_from: remapped.from, gl_account_to: remapped.to } : {}),
    },
    moduleKey: "finance",
    sourceId: parsed.data.id,
    sourceTable: "cost_code_library",
    summary: remapped
      ? `Remapped cost code ${before?.code ?? ""} to a different GL account`
      : `Updated cost code ${before?.code ?? ""}`,
  }).catch(() => null);

  revalidatePath(COST_CODES_ROUTE);
  redirect(`${COST_CODES_ROUTE}?updated=code_updated`);
}

// ---------------------------------------------------------------------------
// The per-project WBS (QS + Projects Manager).
// ---------------------------------------------------------------------------

const phaseSchema = z.object({
  site_id: z.string().regex(UUID, "Select a project."),
  code: z
    .string()
    .trim()
    .min(1, "Give the phase a short code, e.g. P2.")
    .max(20)
    .regex(/^[A-Za-z0-9][A-Za-z0-9\-_]*$/, "Use letters, numbers, dashes or underscores."),
  name: z.string().trim().min(2, "Name the phase.").max(160),
});

export async function createProjectPhaseAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsProjectCostCodes(profile.role)) {
    costCodeError("Only the Quantity Surveyor, Projects Manager or leadership can build the WBS.");
  }

  const parsed = phaseSchema.safeParse({
    site_id: field(formData, "site_id"),
    code: field(formData, "code"),
    name: field(formData, "name"),
  });
  if (!parsed.success) {
    costCodeError(parsed.error.issues[0]?.message ?? "Check the phase details.");
  }

  const supabase = getOpsSupabaseServiceClient();

  const { data: last } = await supabase
    .from("project_cost_codes")
    .select("sort_order")
    .eq("site_id", parsed.data.site_id)
    .is("parent_id", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();

  const { data, error } = await supabase
    .from("project_cost_codes")
    .insert({
      site_id: parsed.data.site_id,
      parent_id: null,
      library_code_id: null,
      code: parsed.data.code,
      // A phase node's path is just its own code — leaves append to it.
      path: parsed.data.code,
      name: parsed.data.name,
      sort_order: (last?.sort_order ?? 0) + 1,
      created_by: profile.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    costCodeError(
      error?.code === "23505"
        ? `This project already has a phase "${parsed.data.code}".`
        : (error?.message ?? "Could not create the phase."),
    );
  }

  await recordOpsAuditEvent({
    action: "project_cost_code.phase_created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "project_cost_code",
    metadata: { site_id: parsed.data.site_id, code: parsed.data.code },
    moduleKey: "finance",
    sourceId: data.id,
    sourceTable: "project_cost_codes",
    summary: `Added phase ${parsed.data.code} — ${parsed.data.name}`,
  }).catch(() => null);

  revalidatePath(COST_CODES_ROUTE);
  redirect(`${COST_CODES_ROUTE}?site=${parsed.data.site_id}&updated=phase_added`);
}

const leafSchema = z.object({
  site_id: z.string().regex(UUID, "Select a project."),
  parent_id: z.string().regex(UUID, "Select the phase this sits under."),
  library_code_id: z.string().regex(UUID, "Pick a code from the library."),
});

/**
 * Attach a library code to a phase as a trade leaf.
 *
 * A leaf must reference the library — that constraint is the whole reason the
 * taxonomy cannot drift back into free text, and it is enforced in the
 * database by project_cost_codes_two_level_shape as well as here.
 */
export async function addProjectCostCodeLeafAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsProjectCostCodes(profile.role)) {
    costCodeError("Only the Quantity Surveyor, Projects Manager or leadership can build the WBS.");
  }

  const parsed = leafSchema.safeParse({
    site_id: field(formData, "site_id"),
    parent_id: field(formData, "parent_id"),
    library_code_id: field(formData, "library_code_id"),
  });
  if (!parsed.success) {
    costCodeError(parsed.error.issues[0]?.message ?? "Check the cost code selection.");
  }

  const supabase = getOpsSupabaseServiceClient();

  const [{ data: phase }, { data: library }] = await Promise.all([
    supabase
      .from("project_cost_codes")
      .select("id, site_id, path, parent_id")
      .eq("id", parsed.data.parent_id)
      .maybeSingle<{ id: string; site_id: string; path: string; parent_id: string | null }>(),
    supabase
      .from("cost_code_library")
      .select("id, code, name, is_active")
      .eq("id", parsed.data.library_code_id)
      .maybeSingle<{ id: string; code: string; name: string; is_active: boolean }>(),
  ]);

  if (!phase || phase.site_id !== parsed.data.site_id || phase.parent_id !== null) {
    costCodeError("Pick a phase belonging to this project.");
  }
  if (!library) {
    costCodeError("That cost code is not in the library.");
  }
  if (!library.is_active) {
    costCodeError(`Cost code ${library.code} is deactivated and cannot be added to a project.`);
  }

  const { data, error } = await supabase
    .from("project_cost_codes")
    .insert({
      site_id: parsed.data.site_id,
      parent_id: phase.id,
      library_code_id: library.id,
      code: library.code,
      path: `${phase.path}.${library.code}`,
      name: library.name,
      created_by: profile.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    costCodeError(
      error?.code === "23505"
        ? `${library.code} is already under this phase.`
        : (error?.message ?? "Could not add the cost code."),
    );
  }

  await recordOpsAuditEvent({
    action: "project_cost_code.leaf_added",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "project_cost_code",
    metadata: { site_id: parsed.data.site_id, path: `${phase.path}.${library.code}` },
    moduleKey: "finance",
    sourceId: data.id,
    sourceTable: "project_cost_codes",
    summary: `Added ${library.code} to phase ${phase.path}`,
  }).catch(() => null);

  revalidatePath(COST_CODES_ROUTE);
  redirect(`${COST_CODES_ROUTE}?site=${parsed.data.site_id}&updated=leaf_added`);
}
