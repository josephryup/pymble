import * as Sentry from "@sentry/nextjs";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

/**
 * Login throttling backed by the ops_rate_limit_* RPCs (Postgres), so the
 * counters are shared across serverless instances. Supabase Auth's own rate
 * limits remain the backstop: if the RPC fails we fail OPEN rather than lock
 * every user out on a database blip.
 */

export const OPS_LOGIN_RATE_LIMIT = {
  // A human retrying a forgotten password stays well under this; a
  // credential-stuffing script does not.
  email: { maxHits: 5, windowSeconds: 15 * 60 },
  // Wider net for one machine hammering many accounts.
  ip: { maxHits: 20, windowSeconds: 15 * 60 },
} as const;

type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function opsClientIp(headers: Headers): string | null {
  // Vercel sets x-forwarded-for with the client address first.
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim() || "";
  return ip.length > 0 && ip.length <= 64 ? ip : null;
}

export function opsLoginEmailRateLimitKey(email: string) {
  return `login:email:${email.trim().toLowerCase()}`;
}

export function opsLoginIpRateLimitKey(ip: string) {
  return `login:ip:${ip}`;
}

async function hitRateLimit(
  key: string,
  limit: { maxHits: number; windowSeconds: number },
): Promise<RateLimitDecision> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .rpc("ops_rate_limit_hit", {
      p_key: key,
      p_max_hits: limit.maxHits,
      p_window_seconds: limit.windowSeconds,
    })
    .single<{ allowed: boolean; retry_after_seconds: number }>();

  if (error || !data) {
    Sentry.captureException(
      error ?? new Error("ops_rate_limit_hit returned no row"),
      { tags: { module: "ops-rate-limit" } },
    );
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return { allowed: data.allowed, retryAfterSeconds: data.retry_after_seconds };
}

export async function checkOpsLoginRateLimit(
  email: string,
  headers: Headers,
): Promise<RateLimitDecision> {
  const ip = opsClientIp(headers);
  const decisions = await Promise.all([
    hitRateLimit(opsLoginEmailRateLimitKey(email), OPS_LOGIN_RATE_LIMIT.email),
    ...(ip
      ? [hitRateLimit(opsLoginIpRateLimitKey(ip), OPS_LOGIN_RATE_LIMIT.ip)]
      : []),
  ]);

  const blocked = decisions.filter((decision) => !decision.allowed);
  if (blocked.length === 0) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(...blocked.map((d) => d.retryAfterSeconds)),
  };
}

/** After a successful login the email bucket is forgiven; the IP bucket is
 * deliberately left alone so one valid account cannot launder an IP that is
 * spraying many accounts. */
export async function resetOpsLoginRateLimit(email: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase.rpc("ops_rate_limit_reset", {
    p_key: opsLoginEmailRateLimitKey(email),
  });

  if (error) {
    Sentry.captureException(error, { tags: { module: "ops-rate-limit" } });
  }
}
