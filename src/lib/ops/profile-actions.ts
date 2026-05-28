"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createOpsServerSessionClient, requireOpsUser } from "@/lib/ops/auth";

const updateProfileSchema = z.object({
  full_name: z.string().trim().min(2, "Full name is required.").max(140),
  phone: z.string().trim().max(40).optional(),
});

const updatePasswordSchema = z
  .object({
    confirm_password: z.string(),
    password: z.string().min(8, "Password must be at least 8 characters.").max(72),
  })
  .refine((value) => value.password === value.confirm_password, {
    message: "Passwords do not match.",
    path: ["confirm_password"],
  });

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function profileError(message: string): never {
  redirect(`/ops/profile?error=${encodeURIComponent(message)}`);
}

export async function updateMyProfileAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = updateProfileSchema.safeParse({
    full_name: field(formData, "full_name"),
    phone: field(formData, "phone"),
  });

  if (!parsed.success) {
    profileError(parsed.error.issues[0]?.message ?? "Check your profile details.");
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase
    .from("users")
    .update({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone || null,
    })
    .eq("id", profile.id);

  if (error) {
    profileError(error.message);
  }

  revalidatePath("/ops");
  revalidatePath("/ops/profile");
  redirect("/ops/profile?updated=profile");
}

export async function updateMyPasswordAction(formData: FormData) {
  await requireOpsUser();
  const parsed = updatePasswordSchema.safeParse({
    confirm_password: field(formData, "confirm_password"),
    password: field(formData, "password"),
  });

  if (!parsed.success) {
    profileError(parsed.error.issues[0]?.message ?? "Check the password fields.");
  }

  const supabase = await createOpsServerSessionClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    profileError(error.message);
  }

  revalidatePath("/ops/profile");
  redirect("/ops/profile?updated=password");
}
