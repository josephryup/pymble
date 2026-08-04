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

/**
 * Offline outbox replay throttle. These endpoints accept business writes
 * (attendance, site reports, photos) over plain fetch, so a signed-in client —
 * or a stolen session — can otherwise write without bound. Generous enough for
 * a phone flushing a whole day's queue on reconnect (audit finding A5).
 */
export const OPS_OFFLINE_REPLAY_RATE_LIMIT = {
  user: { maxHits: 120, windowSeconds: 5 * 60 },
  ip: { maxHits: 300, windowSeconds: 5 * 60 },
} as const;

/**
 * Unauthenticated public endpoints, keyed by IP (audit finding S4).
 *
 * Limits are set from what a real person plausibly does in an hour, not from
 * what a script can do in a second. Someone submitting the contact form twice
 * because the first felt slow is normal; twenty times is not.
 *
 * `apply` is the tightest because each request writes a CV to R2 — that is a
 * storage-cost vector, not just spam. `reset` is tight because the abuse is
 * email-bombing a known address through our domain.
 */
export const OPS_PUBLIC_FORM_RATE_LIMIT = {
  apply: { maxHits: 5, windowSeconds: 60 * 60 },
  contact: { maxHits: 8, windowSeconds: 60 * 60 },
  newsletter: { maxHits: 5, windowSeconds: 60 * 60 },
  quote: { maxHits: 8, windowSeconds: 60 * 60 },
  reset: { maxHits: 5, windowSeconds: 15 * 60 },
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

export function opsOfflineReplayUserRateLimitKey(userId: string, kind: string) {
  return `offline:${kind}:user:${userId}`;
}

export function opsOfflineReplayIpRateLimitKey(ip: string, kind: string) {
  return `offline:${kind}:ip:${ip}`;
}

/**
 * Throttle an offline replay POST. `kind` separates the buckets per endpoint
 * (e.g. "attendance") so a photo backlog cannot starve attendance sync.
 */
export async function checkOpsOfflineReplayRateLimit(
  userId: string,
  kind: string,
  headers: Headers,
): Promise<RateLimitDecision> {
  const ip = opsClientIp(headers);
  const decisions = await Promise.all([
    hitRateLimit(
      opsOfflineReplayUserRateLimitKey(userId, kind),
      OPS_OFFLINE_REPLAY_RATE_LIMIT.user,
    ),
    ...(ip
      ? [
          hitRateLimit(
            opsOfflineReplayIpRateLimitKey(ip, kind),
            OPS_OFFLINE_REPLAY_RATE_LIMIT.ip,
          ),
        ]
      : []),
  ]);

  const blocked = decisions.filter((decision) => !decision.allowed);
  if (blocked.length === 0) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(...blocked.map((decision) => decision.retryAfterSeconds)),
  };
}

export function opsPublicFormIpRateLimitKey(form: string, ip: string) {
  return `public:${form}:ip:${ip}`;
}

/**
 * Throttle an unauthenticated public endpoint, keyed by IP and by form.
 *
 * These are the marketing-site forms and the ops password reset — the only
 * routes on the origin that accept a POST from someone with no session. Login
 * has had a limiter since the June audit; these did not (audit finding S4).
 *
 * `careers/apply` matters most: it writes an uploaded CV to R2. The 10MB cap
 * and MIME allowlist bound a single request, but nothing bounded the number of
 * requests, so the ceiling was storage cost rather than abuse. `reset-password`
 * matters for a different reason — unthrottled, it lets anyone email-bomb a
 * known address through our own domain.
 *
 * Fails OPEN, like the login limiter: a database blip must not take the public
 * contact form offline.
 */
export async function checkOpsPublicFormRateLimit(
  form: keyof typeof OPS_PUBLIC_FORM_RATE_LIMIT,
  headers: Headers,
): Promise<RateLimitDecision> {
  const ip = opsClientIp(headers);

  // No usable client address — nothing to key on. Allowing is the same
  // decision the login limiter makes when the IP bucket is unavailable.
  if (!ip) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return hitRateLimit(
    opsPublicFormIpRateLimitKey(form, ip),
    OPS_PUBLIC_FORM_RATE_LIMIT[form],
  );
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
