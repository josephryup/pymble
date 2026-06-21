import * as Sentry from "@sentry/nextjs";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

type JsonObject = Record<string, unknown>;

export type RecordOpsAuditEventInput = {
  action: string;
  actorUserId?: string | null;
  entityId?: string | null;
  entityType: string;
  metadata?: JsonObject;
  moduleKey?: string | null;
  sourceId?: string | null;
  sourceTable?: string | null;
  summary?: string | null;
};

export async function recordOpsAuditEvent(input: RecordOpsAuditEventInput) {
  // Sentry breadcrumb — gives us a trail of business events leading up to any
  // later crash, scoped to the same request. Cheap (in-memory) and only
  // shipped if an exception fires within the same scope.
  try {
    Sentry.addBreadcrumb({
      category: input.moduleKey ?? "ops.audit",
      type: "info",
      level: "info",
      message: input.summary ?? input.action,
      data: {
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId ?? undefined,
        actor_user_id: input.actorUserId ?? undefined,
      },
    });
  } catch {
    // Sentry not initialised — fail open.
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase.from("audit_events").insert({
    action: input.action,
    actor_user_id: input.actorUserId ?? null,
    entity_id: input.entityId ?? null,
    entity_type: input.entityType,
    metadata: input.metadata ?? {},
    module_key: input.moduleKey ?? null,
    source_id: input.sourceId ?? null,
    source_table: input.sourceTable ?? null,
    summary: input.summary ?? null,
  });

  if (error) {
    throw error;
  }
}
