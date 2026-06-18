"use client";

import { createBrowserClient } from "@supabase/ssr";

type BrowserClient = ReturnType<typeof createBrowserClient>;

let browserClient: BrowserClient | null = null;
let envMissingReported = false;

function readBrowserEnv(key: string) {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value : null;
}

/**
 * Returns the Supabase browser client when the required NEXT_PUBLIC env vars
 * are present, or null when they are missing.
 *
 * Realtime / live-refresh features call this and gracefully no-op when it
 * returns null, so a misconfigured deploy still renders the workspace
 * (auth-protected pages just won't auto-refresh until the env is fixed).
 */
export function getOpsSupabaseBrowserClient(): BrowserClient | null {
  if (browserClient) return browserClient;

  const url = readBrowserEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readBrowserEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url || !anonKey) {
    if (!envMissingReported && typeof window !== "undefined") {
      envMissingReported = true;
      console.warn(
        "[ops] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing in this build. " +
          "Realtime auto-refresh and any client-side Supabase calls will be disabled until the env vars are configured.",
      );
    }
    return null;
  }

  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}
