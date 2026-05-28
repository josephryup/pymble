import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { requirePublicEnv } from "@/lib/ops/env";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsUserRole } from "@/lib/ops/types";

type OpsSessionUser = {
  email: string | null;
  id: string;
};

export type OpsUserProfile = {
  id: string;
  full_name: string;
  role: OpsUserRole;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function createOpsServerSessionClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot always write cookies. Auth route handlers can.
          }
        },
      },
    },
  );
}

export const getOpsSessionUser = cache(async (): Promise<OpsSessionUser | null> => {
  try {
    const supabase = await createOpsServerSessionClient();
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    const id = typeof claims?.sub === "string" ? claims.sub : null;

    if (!error && claims && id) {
      return {
        email: typeof claims.email === "string" ? claims.email : null,
        id,
      };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    return {
      email: user.email ?? null,
      id: user.id,
    };
  } catch {
    return null;
  }
});

export const getOpsUserProfile = cache(async (userId: string) => {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, role, phone, email, is_active, created_at, updated_at")
    .eq("id", userId)
    .eq("is_active", true)
    .single<OpsUserProfile>();

  if (error) {
    throw error;
  }

  return data;
});

export const getOptionalOpsUser = cache(async () => {
  const user = await getOpsSessionUser();

  if (!user) {
    return null;
  }

  try {
    const profile = await getOpsUserProfile(user.id);
    return { authUser: user, profile };
  } catch {
    return null;
  }
});

export const requireOpsUser = cache(async () => {
  const user = await getOptionalOpsUser();

  if (!user) {
    redirect("/ops/login");
  }

  return user;
});
