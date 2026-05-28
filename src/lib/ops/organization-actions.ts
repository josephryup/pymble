"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";
import { parseCoordinateInput } from "@/lib/ops/coordinates";
import { canManageOps } from "@/lib/ops/permissions";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length > 0 ? value : null));

const optionalEmail = z
  .string()
  .trim()
  .max(160)
  .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
    message: "Enter a valid email address.",
  })
  .transform((value) => (value.length > 0 ? value : null));

const organizationSchema = z.object({
  address_line: optionalText(220),
  city: optionalText(120),
  country: z.string().trim().min(2, "Country is required.").max(80),
  currency_code: z
    .string()
    .trim()
    .min(3, "Currency code is required.")
    .max(3, "Currency code must be 3 characters.")
    .transform((value) => value.toUpperCase()),
  email: optionalEmail,
  headquarters_latitude: z.number().min(-90).max(90).nullable(),
  headquarters_longitude: z.number().min(-180).max(180).nullable(),
  invoice_prefix: z
    .string()
    .trim()
    .min(2, "Invoice prefix is required.")
    .max(12, "Invoice prefix must be 12 characters or fewer.")
    .transform((value) => value.toUpperCase().replace(/\s+/g, "-")),
  legal_name: z.string().trim().min(2, "Legal name is required.").max(180),
  phone_primary: optionalText(40),
  phone_secondary: optionalText(40),
  tpin: optionalText(80),
  trading_name: z.string().trim().min(2, "Trading name is required.").max(180),
  vat_rate_percent: z.coerce
    .number()
    .min(0, "VAT rate cannot be negative.")
    .max(100, "VAT rate cannot exceed 100.")
    .transform((value) => Math.round((value / 100 + Number.EPSILON) * 10000) / 10000),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function organizationError(message: string): never {
  redirect(`/ops/settings?error=${encodeURIComponent(message)}`);
}

function coordinateField(formData: FormData, name: "headquarters_latitude" | "headquarters_longitude") {
  const kind = name === "headquarters_latitude" ? "latitude" : "longitude";
  const parsed = parseCoordinateInput(field(formData, name), kind);

  if (parsed === undefined) {
    organizationError(`Enter a valid headquarters ${kind}.`);
  }

  return parsed;
}

export async function updateOrganizationProfileAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOps(profile.role)) {
    organizationError("Your role cannot update organization settings yet.");
  }

  const headquartersLatitude = coordinateField(formData, "headquarters_latitude");
  const headquartersLongitude = coordinateField(formData, "headquarters_longitude");

  if ((headquartersLatitude === null) !== (headquartersLongitude === null)) {
    organizationError("Enter both headquarters latitude and longitude, or leave both blank.");
  }

  const parsed = organizationSchema.safeParse({
    address_line: field(formData, "address_line"),
    city: field(formData, "city"),
    country: field(formData, "country"),
    currency_code: field(formData, "currency_code"),
    email: field(formData, "email"),
    headquarters_latitude: headquartersLatitude,
    headquarters_longitude: headquartersLongitude,
    invoice_prefix: field(formData, "invoice_prefix"),
    legal_name: field(formData, "legal_name"),
    phone_primary: field(formData, "phone_primary"),
    phone_secondary: field(formData, "phone_secondary"),
    tpin: field(formData, "tpin"),
    trading_name: field(formData, "trading_name"),
    vat_rate_percent: field(formData, "vat_rate_percent"),
  });

  if (!parsed.success) {
    organizationError(parsed.error.issues[0]?.message ?? "Check the organization settings.");
  }

  const { vat_rate_percent: vatRate, ...profileUpdate } = parsed.data;
  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("organization_profile")
    .update({
      ...profileUpdate,
      vat_rate: vatRate,
    })
    .eq("id", 1);

  if (error) {
    organizationError(error.message);
  }

  await supabase.from("audit_events").insert({
    actor_user_id: profile.id,
    action: "organization_profile.updated",
    entity_type: "organization_profile",
    entity_id: null,
    metadata: {
      headquarters_latitude: profileUpdate.headquarters_latitude,
      headquarters_longitude: profileUpdate.headquarters_longitude,
      trading_name: profileUpdate.trading_name,
    },
  });

  revalidatePath("/ops");
  revalidatePath("/ops/settings");
  redirect("/ops/settings?updated=organization");
}
