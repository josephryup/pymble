import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requirePublicEnv, requireServerEnv } from "@/lib/ops/env";

let serviceClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

export function getOpsSupabaseServiceClient() {
  if (!serviceClient) {
    serviceClient = createClient(
      requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }

  return serviceClient;
}

export function getOpsSupabaseAnonServerClient() {
  if (!anonClient) {
    anonClient = createClient(
      requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }

  return anonClient;
}
