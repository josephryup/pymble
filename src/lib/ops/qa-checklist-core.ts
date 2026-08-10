import { z } from "zod";
import type { OpsUserProfile } from "@/lib/ops/auth";
import { canCreateOpsEngineeringControl } from "@/lib/ops/engineering-controls-permissions";
import { qaChecklistTemplate } from "@/lib/ops/qa-checklist-templates";
import { hasActiveOpsSiteAssignment, requiresOpsSiteAssignment } from "@/lib/ops/site-assignments";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Shared core for starting a checklist run — used by both the online server
 * action and the /api/ops/offline/qa-checklists replay route. Kept outside any
 * "use server" file so the Route Handler can import it without it becoming an
 * accidental server action, exactly as attendance-core.ts does.
 */

export const startQaChecklistSchema = z.object({
  site_id: z.string().uuid("Select a Pymble site."),
  template_key: z.string().trim().min(1, "Choose a construction process."),
  location: z.string().trim().max(160).default(""),
  inspection_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Select an inspection date."),
});

export function qaField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export type StartQaChecklistResult =
  | { ok: true; id: string }
  | { ok: false; message: string };

export async function startQaChecklistCore(
  formData: FormData,
  profile: OpsUserProfile,
): Promise<StartQaChecklistResult> {
  if (!canCreateOpsEngineeringControl(profile.role)) {
    return { ok: false, message: "Your role cannot run site checklists." };
  }

  const parsed = startQaChecklistSchema.safeParse({
    site_id: qaField(formData, "site_id"),
    template_key: qaField(formData, "template_key"),
    location: qaField(formData, "location"),
    inspection_date: qaField(formData, "inspection_date"),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the checklist details." };
  }

  const template = qaChecklistTemplate(parsed.data.template_key);
  if (!template) {
    return { ok: false, message: "That construction process is not a known checklist." };
  }

  if (
    requiresOpsSiteAssignment(profile.role) &&
    !(await hasActiveOpsSiteAssignment(profile.id, parsed.data.site_id))
  ) {
    return { ok: false, message: "You can only run checklists for a site assigned to you." };
  }

  const supabase = getOpsSupabaseServiceClient();

  // Offline replay lands the same queued checklist once (unique index on
  // client_id). Without a client_id this is an ordinary online insert.
  const clientId = qaField(formData, "client_id").trim() || null;
  if (clientId) {
    const { data: existing } = await supabase
      .from("qa_inspections")
      .select("id")
      .eq("client_id", clientId)
      .maybeSingle<{ id: string }>();
    if (existing) {
      return { ok: true, id: existing.id };
    }
  }

  const { data: inspection, error } = await supabase
    .from("qa_inspections")
    .insert({
      site_id: parsed.data.site_id,
      inspection_type: template.key,
      template_key: template.key,
      title: `${template.process} inspection`,
      location: parsed.data.location,
      inspection_date: parsed.data.inspection_date,
      inspector_id: profile.id,
      status: "planned",
      client_id: clientId,
      created_by: profile.id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !inspection) {
    return { ok: false, message: error?.message ?? "The checklist could not be started." };
  }

  // Seed the template's items. This is the whole point of templates: an
  // engineer on site should never retype twelve checks on a phone.
  const { error: itemsError } = await supabase.from("qa_inspection_items").insert(
    template.items.map((item, index) => ({
      inspection_id: inspection.id,
      line_number: index + 1,
      checklist_item: item.text,
      criterion: item.criterion ?? "",
      is_hold_point: Boolean(item.holdPoint),
      result: "pending" as const,
      created_by: profile.id,
    })),
  );

  if (itemsError) {
    // Roll the header back rather than leaving an empty checklist that looks
    // complete because it has nothing to answer.
    await supabase.from("qa_inspections").delete().eq("id", inspection.id);
    return { ok: false, message: itemsError.message };
  }

  return { ok: true, id: inspection.id };
}
