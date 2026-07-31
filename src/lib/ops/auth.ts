import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { requirePublicEnv } from "@/lib/ops/env";
import {
  buildOpsLocalRolePreviewProfile,
  canUseOpsLocalRolePreview,
  OPS_LOCAL_ROLE_PREVIEW_COOKIE,
  parseOpsLocalRolePreviewRole,
} from "@/lib/ops/local-role-preview";
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
  /** R2 key of the profile photo, or null for initials (audit §3). */
  avatar_key: string | null;
  /** Cache-buster so a replaced photo appears immediately. */
  avatar_updated_at: string | null;
};

export type OpsUserContext = {
  authUser: OpsSessionUser;
  isLocalRolePreview: boolean;
  profile: OpsUserProfile;
};

async function getOpsLocalRolePreviewContext(): Promise<OpsUserContext | null> {
  const headerStore = await headers();

  if (!canUseOpsLocalRolePreview(headerStore.get("host"))) {
    return null;
  }

  const cookieStore = await cookies();
  const role = parseOpsLocalRolePreviewRole(
    cookieStore.get(OPS_LOCAL_ROLE_PREVIEW_COOKIE)?.value,
  );

  if (!role) {
    return null;
  }

  const profile = buildOpsLocalRolePreviewProfile(role);

  return {
    authUser: {
      email: profile.email,
      id: profile.id,
    },
    isLocalRolePreview: true,
    profile,
  };
}

export async function createOpsServerSessionClient() {
  const localRolePreview = await getOpsLocalRolePreviewContext();

  if (localRolePreview) {
    return getOpsSupabaseServiceClient();
  }

  return createOpsCookieSessionClient();
}

export async function createOpsCookieSessionClient() {
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
    .select(
      "id, full_name, role, phone, email, is_active, created_at, updated_at, avatar_key, avatar_updated_at",
    )
    .eq("id", userId)
    .eq("is_active", true)
    .single<OpsUserProfile>();

  if (error) {
    throw error;
  }

  return data;
});

export const getOptionalOpsUser = cache(async () => {
  const localRolePreview = await getOpsLocalRolePreviewContext();

  if (localRolePreview) {
    return localRolePreview;
  }

  const user = await getOpsSessionUser();

  if (!user) {
    return null;
  }

  try {
    const profile = await getOpsUserProfile(user.id);
    return { authUser: user, isLocalRolePreview: false, profile };
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
