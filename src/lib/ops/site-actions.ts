"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import { parseCoordinateInput } from "@/lib/ops/coordinates";
import { canManageOps } from "@/lib/ops/permissions";

const createSiteSchema = z.object({
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
  budget_zmw: z.coerce.number().min(0, "Budget cannot be negative.").default(0),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  status: z.enum(["active", "mobilizing", "closing"]),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function siteError(message: string): never {
  redirect(`/ops/sites?error=${encodeURIComponent(message)}`);
}

function coordinateField(formData: FormData, name: "latitude" | "longitude") {
  const parsed = parseCoordinateInput(field(formData, name), name);

  if (parsed === undefined) {
    siteError(`Enter a valid ${name}.`);
  }

  return parsed;
}

export async function createSiteAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOps(profile.role)) {
    siteError("Your role cannot create sites yet.");
  }

  const latitude = coordinateField(formData, "latitude");
  const longitude = coordinateField(formData, "longitude");

  if ((latitude === null) !== (longitude === null)) {
    siteError("Enter both latitude and longitude, or leave both blank.");
  }

  const parsed = createSiteSchema.safeParse({
    code: field(formData, "code"),
    name: field(formData, "name"),
    location: field(formData, "location"),
    supervisor_name: field(formData, "supervisor_name"),
    client_name: field(formData, "client_name"),
    budget_zmw: field(formData, "budget_zmw"),
    latitude,
    longitude,
    status: field(formData, "status") || "active",
  });

  if (!parsed.success) {
    siteError(parsed.error.issues[0]?.message ?? "Check the site details and try again.");
  }

  const supabase = await createOpsServerSessionClient();
  const { data, error } = await supabase
    .from("sites")
    .insert({
      ...parsed.data,
      created_by: profile.id,
      is_active: true,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
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
    entity_id: data.id,
    metadata: {
      code: parsed.data.code,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      name: parsed.data.name,
    },
  });

  revalidatePath("/ops");
  revalidatePath("/ops/sites");
  redirect("/ops/sites?created=site");
}
