"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import { parseCoordinateInput } from "@/lib/ops/coordinates";
import { fanoutToOpsRoles } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import {
  canArchiveSite,
  canManageSites,
  canViewSiteActualBudget,
  canViewSiteBudget,
} from "@/lib/ops/permissions";
import type { OpsSiteStage, OpsSiteStatus } from "@/lib/ops/types";

const SITE_STAGES = [
  "planning",
  "mobilizing",
  "in_progress",
  "handover",
  "completed",
  "on_hold",
  "cancelled",
] as const satisfies readonly OpsSiteStage[];

// The legacy `status` column is derived from the richer `stage` so existing
// reads (overview map, filters) stay coherent without the user managing it.
function statusFromStage(stage: OpsSiteStage): OpsSiteStatus {
  if (stage === "planning" || stage === "mobilizing") {
    return "mobilizing";
  }

  if (stage === "in_progress" || stage === "handover") {
    return "active";
  }

  return "closing";
}

const siteCoreSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Site code is required.")
    .max(24, "Site code must be 24 characters or fewer.")
    .transform((value) => value.toUpperCase().replace(/\s+/g, "-")),
  name: z.string().trim().min(2, "Site name is required.").max(140),
  location: z.string().trim().min(2, "Location is required.").max(180),
  supervisor_name: z.string().trim().max(120).default(""),
  client_name: z.string().trim().max(140).default(""),
  contract_value: z.coerce.number().min(0, "Contract value cannot be negative.").default(0),
  budget_zmw: z.coerce.number().min(0, "Budget cannot be negative.").default(0),
  actual_budget_zmw: z.coerce
    .number()
    .min(0, "Actual budget cannot be negative.")
    .default(0),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  stage: z.enum(SITE_STAGES).default("planning"),
  progress_percent: z.coerce
    .number()
    .min(0, "Progress cannot be below 0.")
    .max(100, "Progress cannot exceed 100.")
    .default(0),
});

const siteIdSchema = z.object({
  id: z.string().uuid("Select a site."),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function siteError(message: string): never {
  redirect(`/ops/sites?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function coordinateField(formData: FormData, name: "latitude" | "longitude") {
  const parsed = parseCoordinateInput(field(formData, name), name);

  if (parsed === undefined) {
    siteError(`Enter a valid ${name}.`);
  }

  return parsed;
}

function parseSiteForm(formData: FormData) {
  const latitude = coordinateField(formData, "latitude");
  const longitude = coordinateField(formData, "longitude");

  if ((latitude === null) !== (longitude === null)) {
    siteError("Enter both latitude and longitude, or leave both blank.");
  }

  const parsed = siteCoreSchema.safeParse({
    code: field(formData, "code"),
    name: field(formData, "name"),
    location: field(formData, "location"),
    supervisor_name: field(formData, "supervisor_name"),
    client_name: field(formData, "client_name"),
    contract_value: field(formData, "contract_value"),
    budget_zmw: field(formData, "budget_zmw"),
    actual_budget_zmw: field(formData, "actual_budget_zmw"),
    latitude,
    longitude,
    stage: field(formData, "stage") || "planning",
    progress_percent: field(formData, "progress_percent") || "0",
  });

  if (!parsed.success) {
    siteError(parsed.error.issues[0]?.message ?? "Check the site details and try again.");
  }

  return parsed.data;
}

export async function createSiteAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageSites(profile.role)) {
    siteError("Your role cannot create sites.");
  }

  const data = parseSiteForm(formData);
  // Budget figures may only be set by roles allowed to see them; otherwise the
  // column keeps its default of 0.
  if (!canViewSiteBudget(profile.role)) {
    data.budget_zmw = 0;
    data.contract_value = 0;
  }
  if (!canViewSiteActualBudget(profile.role)) {
    data.actual_budget_zmw = 0;
  }
  const supabase = await createOpsServerSessionClient();
  const { data: created, error } = await supabase
    .from("sites")
    .insert({
      ...data,
      status: statusFromStage(data.stage),
      created_by: profile.id,
      is_active: true,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !created) {
    siteError(
      error
        ? error.code === "23505"
          ? "That site code already exists."
          : error.message
        : "The site could not be created.",
    );
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "site.created",
    entity_type: "site",
    entity_id: created.id,
    module_key: "sites",
    source_table: "sites",
    source_id: created.id,
    metadata: { code: data.code, name: data.name, stage: data.stage },
  });

  // Phase M: notify the leadership and delivery audiences when a new site is set up.
  const recipients = await fanoutToOpsRoles(
    [
      "managing_director",
      "general_manager",
      "owner",
      "operations_manager",
      "projects_manager",
      "quantity_surveyor",
      "finance_manager",
    ],
    { excludeUserIds: [profile.id] },
  );
  await Promise.all(
    recipients.map((recipient) =>
      queueOpsNotification({
        actionHref: "/ops/sites",
        body: `${profile.full_name} added a new project site: ${data.name} (${data.code}).`,
        idempotencyKey: `site-created:${created.id}:${recipient.id}`,
        moduleKey: "sites",
        recipientId: recipient.id,
        sourceId: created.id,
        sourceTable: "sites",
        title: `New site created: ${data.name}`,
      }).catch(() => null),
    ),
  );

  revalidatePath("/ops");
  revalidatePath("/ops/sites");
  revalidatePath("/ops/notifications");
  redirect("/ops/sites?created=site");
}

export async function updateSiteAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageSites(profile.role)) {
    siteError("Your role cannot edit sites.");
  }

  const parsedId = siteIdSchema.safeParse({ id: field(formData, "id") });

  if (!parsedId.success) {
    siteError("Select a site to edit.");
  }

  const data = parseSiteForm(formData);
  const supabase = await createOpsServerSessionClient();
  const patch: Record<string, unknown> = {
    ...data,
    status: statusFromStage(data.stage),
    actual_completion_date:
      data.stage === "completed" ? new Date().toISOString().slice(0, 10) : null,
  };
  // Budget is gated. Roles that can edit a site but not see a budget figure
  // never receive that field, so we drop it from the patch to avoid wiping the
  // stored value to the coerced default of 0.
  if (!canViewSiteBudget(profile.role)) {
    delete patch.budget_zmw;
    delete patch.contract_value;
  }
  if (!canViewSiteActualBudget(profile.role)) {
    delete patch.actual_budget_zmw;
  }
  const { error } = await supabase
    .from("sites")
    .update(patch)
    .eq("id", parsedId.data.id)
    .eq("is_active", true);

  if (error) {
    siteError(error.code === "23505" ? "That site code already exists." : error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "site.updated",
    entity_type: "site",
    entity_id: parsedId.data.id,
    module_key: "sites",
    source_table: "sites",
    source_id: parsedId.data.id,
    metadata: { code: data.code, stage: data.stage, progress_percent: data.progress_percent },
  });

  revalidatePath("/ops");
  revalidatePath("/ops/sites");
  redirect("/ops/sites?updated=site");
}

export async function archiveSiteAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canArchiveSite(profile.role)) {
    siteError("Only the Developer, Managing Director, and General Manager can archive sites.");
  }

  const parsedId = siteIdSchema.safeParse({ id: field(formData, "id") });

  if (!parsedId.success) {
    siteError("Select a site to archive.");
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("sites")
    .update({ is_active: false })
    .eq("id", parsedId.data.id);

  if (error) {
    siteError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "site.archived",
    entity_type: "site",
    entity_id: parsedId.data.id,
    module_key: "sites",
    source_table: "sites",
    source_id: parsedId.data.id,
  });

  revalidatePath("/ops");
  revalidatePath("/ops/sites");
  redirect("/ops/sites?updated=archived");
}
