"use client";

import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

function requireBrowserEnv(key: string) {
  const value = process.env[key];

  if (!value?.trim()) {
    throw new Error(`${key} is required.`);
  }

  return value;
}

export function getOpsSupabaseBrowserClient() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      requireBrowserEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireBrowserEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    );
  }

  return browserClient;
}
