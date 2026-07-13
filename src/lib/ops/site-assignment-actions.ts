"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOpsUser } from "@/lib/ops/auth";
import { canManageOpsSiteAssignments } from "@/lib/ops/site-assignments";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

const schema = z.object({
  site_id: z.string().uuid(),
  user_id: z.string().uuid(),
});

const unassignSchema = z.object({
  assignment_id: z.string().uuid(),
});

function value(formData: FormData, name: string) {
  const field = formData.get(name);
  return typeof field === "string" ? field : "";
}

function fail(message: string): never {
  redirect(`/ops/staff?error=${encodeURIComponent(message)}`);
}

export async function assignEngineeringInternToSiteAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageOpsSiteAssignments(profile.role)) fail("Your role cannot assign staff to sites.");
  const parsed = schema.safeParse({ site_id: value(formData, "site_id"), user_id: value(formData, "user_id") });
  if (!parsed.success) fail("Select an Engineering Intern and site.");

  const supabase = getOpsSupabaseServiceClient();
  const { data: intern } = await supabase
    .from("users")
    .select("id, role, is_active")
    .eq("id", parsed.data.user_id)
    .maybeSingle<{ id: string; role: string; is_active: boolean }>();
  if (!intern || !intern.is_active || intern.role !== "engineering_intern") {
    fail("Only an active Engineering Intern can receive a site assignment.");
  }
  const { data: site } = await supabase
    .from("sites")
    .select("id, supervisor_user_id, is_active")
    .eq("id", parsed.data.site_id)
    .maybeSingle<{ id: string; supervisor_user_id: string | null; is_active: boolean }>();
  if (!site?.is_active) fail("Select an active site.");

  const { data: existing } = await supabase
    .from("user_site_assignments")
    .select("id")
    .eq("user_id", intern.id)
    .eq("site_id", site.id)
    .is("unassigned_at", null)
    .maybeSingle<{ id: string }>();
  if (existing) redirect("/ops/staff?updated=site-assignment");

  const { error } = await supabase.from("user_site_assignments").insert({
    user_id: intern.id,
    site_id: site.id,
    supervisor_user_id: site.supervisor_user_id,
    assigned_by: profile.id,
  });
  if (error) fail(error.message);
  revalidatePath("/ops/staff");
  redirect("/ops/staff?updated=site-assignment");
}

export async function unassignEngineeringInternFromSiteAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  if (!canManageOpsSiteAssignments(profile.role)) fail("Your role cannot remove site assignments.");

  const parsed = unassignSchema.safeParse({ assignment_id: value(formData, "assignment_id") });
  if (!parsed.success) fail("Select an active site assignment.");

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("user_site_assignments")
    .update({ unassigned_at: new Date().toISOString(), unassigned_by: profile.id })
    .eq("id", parsed.data.assignment_id)
    .is("unassigned_at", null);

  if (error) fail(error.message);

  revalidatePath("/ops/staff");
  redirect("/ops/staff?updated=site-unassigned");
}
