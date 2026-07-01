"use client";

import { openDB, type IDBPDatabase } from "idb";

/**
 * Offline outbox for the ops workspace.
 *
 * Stores serialised intents (typically server-action submissions) in
 * IndexedDB and replays them when the network is available. Each intent
 * carries a client-side UUID that the server uses as an idempotency key, so
 * a retry that arrives after a previous attempt actually landed becomes a
 * harmless upsert instead of a duplicate insert.
 *
 * This is the bottom layer — UI components use the higher-level helpers in
 * `OpsOfflineForm.tsx` and `OpsSyncIndicator.tsx`.
 */

const DB_NAME = "pymble-ops-outbox";
const DB_VERSION = 1;
const STORE_NAME = "intents";

export type OpsOutboxIntentStatus =
  | "pending"
  | "in_flight"
  | "failed"
  | "dead_letter";

export type OpsOutboxIntent = {
  /** Client-generated UUID. Also doubles as the `client_id` on the row. */
  id: string;
  /** Stable label for the kind of action, e.g. "daily_site_report.create". */
  kind: string;
  /** Endpoint or server-action route the page will POST to on replay. */
  endpoint: string;
  /** HTTP method to use on replay. Defaults to POST. */
  method?: "POST" | "PUT" | "PATCH";
  /**
   * Serialised payload. The page is responsible for the encoding (FormData,
   * JSON, etc.) and re-creating it from this when replaying.
   */
  payload: unknown;
  /** Free-text summary shown in the sync indicator. */
  summary: string;
  /** When the user queued the intent. */
  enqueued_at: number;
  /** Last attempt timestamp, if any. */
  last_attempt_at?: number;
  /** Last server error message, if any. */
  last_error?: string;
  /** How many replay attempts have happened so far. */
  attempts: number;
  status: OpsOutboxIntentStatus;
};

/**
 * IndexedDB stores values via the structured clone algorithm, which does NOT
 * support `FormData` (it throws `DataCloneError`) — only its underlying
 * primitives, `File`/`Blob`, arrays, and plain objects. So a `FormData`
 * payload is serialised to a plain entries array before `db.put` and
 * reconstructed on read; this is transparent to callers, who can still pass
 * a `FormData` straight through.
 */
type OpsOutboxSerializedFormData = {
  __opsFormData: true;
  entries: Array<[string, string | File]>;
};

function isSerializedFormData(value: unknown): value is OpsOutboxSerializedFormData {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __opsFormData?: unknown }).__opsFormData === true
  );
}

function serializeOutboxPayload(payload: unknown): unknown {
  if (payload instanceof FormData) {
    return { __opsFormData: true, entries: Array.from(payload.entries()) } satisfies OpsOutboxSerializedFormData;
  }
  return payload;
}

function deserializeOutboxPayload(payload: unknown): unknown {
  if (isSerializedFormData(payload)) {
    const formData = new FormData();
    for (const [key, value] of payload.entries) {
      formData.append(key, value);
    }
    return formData;
  }
  return payload;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is unavailable in this environment.");
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("by_kind", "kind");
          store.createIndex("by_status", "status");
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Generate a stable UUIDv4 in the browser. Falls back to a math-random
 * implementation when `crypto.randomUUID` isn't available (old Safari).
 */
export function newOutboxId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function enqueueOutboxIntent(
  intent: Omit<OpsOutboxIntent, "enqueued_at" | "attempts" | "status"> &
    Partial<Pick<OpsOutboxIntent, "attempts" | "status">>,
): Promise<OpsOutboxIntent> {
  const db = await getDb();
  const full: OpsOutboxIntent = {
    ...intent,
    enqueued_at: Date.now(),
    attempts: intent.attempts ?? 0,
    status: intent.status ?? "pending",
  };
  await db.put(STORE_NAME, { ...full, payload: serializeOutboxPayload(full.payload) });
  notifyOutboxChanged();
  return full;
}

export async function listOutbox(): Promise<OpsOutboxIntent[]> {
  const db = await getDb();
  return (await db.getAll(STORE_NAME)) as OpsOutboxIntent[];
}

export async function pendingOutboxCount(): Promise<number> {
  const intents = await listOutbox();
  return intents.filter((intent) =>
    intent.status === "pending" || intent.status === "failed",
  ).length;
}

export async function markOutboxIntent(
  id: string,
  patch: Partial<OpsOutboxIntent>,
) {
  const db = await getDb();
  const existing = (await db.get(STORE_NAME, id)) as OpsOutboxIntent | undefined;
  if (!existing) return;
  await db.put(STORE_NAME, { ...existing, ...patch });
  notifyOutboxChanged();
}

export async function deleteOutboxIntent(id: string) {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
  notifyOutboxChanged();
}

export async function clearOutbox() {
  const db = await getDb();
  await db.clear(STORE_NAME);
  notifyOutboxChanged();
}

const OUTBOX_EVENT = "ops:outbox-changed";

function notifyOutboxChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OUTBOX_EVENT));
}

export function subscribeOutbox(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(OUTBOX_EVENT, listener);
  return () => window.removeEventListener(OUTBOX_EVENT, listener);
}

/**
 * Replay one intent against the server. Returns true on success so the
 * caller can delete it from the outbox.
 *
 * Network errors leave the intent as `failed` (retryable). Server-side 4xx
 * responses send the intent to the dead-letter state — the user has to
 * inspect and either fix or discard.
 */
export async function replayOutboxIntent(intent: OpsOutboxIntent): Promise<boolean> {
  await markOutboxIntent(intent.id, {
    status: "in_flight",
    last_attempt_at: Date.now(),
    attempts: intent.attempts + 1,
  });

  const payload = deserializeOutboxPayload(intent.payload);
  let body: BodyInit | undefined;
  const headers: Record<string, string> = {};
  if (payload instanceof FormData) {
    body = payload;
  } else if (payload && typeof payload === "object") {
    body = JSON.stringify(payload);
    headers["Content-Type"] = "application/json";
  } else {
    body = String(payload ?? "");
  }

  try {
    const response = await fetch(intent.endpoint, {
      method: intent.method ?? "POST",
      body,
      headers,
      credentials: "same-origin",
    });

    if (response.ok || response.status === 303) {
      await deleteOutboxIntent(intent.id);
      return true;
    }

    if (response.status >= 400 && response.status < 500) {
      await markOutboxIntent(intent.id, {
        status: "dead_letter",
        last_error: `HTTP ${response.status}`,
      });
      return false;
    }

    await markOutboxIntent(intent.id, {
      status: "failed",
      last_error: `HTTP ${response.status}`,
    });
    return false;
  } catch (error) {
    await markOutboxIntent(intent.id, {
      status: "failed",
      last_error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Replay every retryable (pending + failed) intent in queue order. Used by
 * the sync indicator + the online-event listener.
 */
export async function flushOutbox(): Promise<{ ok: number; failed: number }> {
  const intents = await listOutbox();
  const queue = intents
    .filter((intent) => intent.status === "pending" || intent.status === "failed")
    .sort((a, b) => a.enqueued_at - b.enqueued_at);

  let ok = 0;
  let failed = 0;
  for (const intent of queue) {
    const success = await replayOutboxIntent(intent);
    if (success) ok += 1;
    else failed += 1;
  }
  return { ok, failed };
}
