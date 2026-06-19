import * as Sentry from "@sentry/nextjs";

export type OpsLogContext = {
  /** Module key (matches the audit_events.module_key convention). */
  module?: string;
  /** Server action or fetch function name. */
  action?: string;
  /** Authenticated actor id, if available. */
  actorUserId?: string | null;
  /** Logical entity / resource the call targeted. */
  entityType?: string;
  entityId?: string | null;
  /** Anything else useful — keep this PII-free. */
  extra?: Record<string, unknown>;
};

/**
 * Capture an exception thrown inside a server action / data fetcher.
 *
 * Behaviour:
 *  1. Sends the exception to Sentry with tags + extra context so we can
 *     filter dashboards by module, action, or actor.
 *  2. Prints a single structured line to the platform logs (Vercel etc.)
 *     so on-call can correlate without opening Sentry.
 *
 * Always returns. The caller decides whether to re-throw, redirect to an
 * error page, or fall through with a fallback value.
 */
export function logOpsServerError(error: unknown, context: OpsLogContext = {}) {
  const normalized = error instanceof Error ? error : new Error(String(error));

  Sentry.withScope((scope) => {
    if (context.module) scope.setTag("module", context.module);
    if (context.action) scope.setTag("action", context.action);
    if (context.actorUserId) scope.setUser({ id: context.actorUserId });
    if (context.entityType) scope.setTag("entityType", context.entityType);
    if (context.entityId) scope.setTag("entityId", context.entityId);
    if (context.extra) {
      scope.setExtras(context.extra);
    }
    Sentry.captureException(normalized);
  });

  // Log a single JSON line so Vercel / log drains can index it.
  try {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "ops.server",
        message: normalized.message,
        ...context,
      }),
    );
  } catch {
    console.error("[ops.server] error logging failed", normalized.message);
  }
}

/**
 * Wrap an async server-side function so any throw is logged with context
 * before being re-thrown. Use sparingly — usually it's cleaner to handle
 * the catch inline in the action.
 */
export async function withOpsLog<T>(
  context: OpsLogContext,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logOpsServerError(error, context);
    throw error;
  }
}
