"use client";

import { useCallback, useState } from "react";
import {
  enqueueOutboxIntent,
  newOutboxId,
} from "@/lib/ops/offline/outbox";

type OpsOfflineFormProps = React.FormHTMLAttributes<HTMLFormElement> & {
  /**
   * Stable label for what this form represents — used by the sync indicator
   * to describe pending intents, e.g. "daily_site_report.create".
   */
  kind: string;
  /**
   * URL that the queued FormData should POST to on replay. Normally the same
   * URL the action would submit to when online.
   */
  replayEndpoint: string;
  /**
   * Optional human-readable summary shown in the sync indicator while the
   * intent is pending.
   */
  summary?: string;
  /**
   * Server-action functor for the online path. Forms use this exactly like
   * `action={createDailySiteReportAction}`. We pass FormData straight through.
   */
  action: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
};

/**
 * Form wrapper that submits to the server action when online and queues the
 * FormData (along with a client-side UUID) when offline. The queue is
 * replayed on reconnect by the sync indicator.
 *
 * The hidden `client_id` field is added automatically so the server action
 * can upsert on it.
 */
export function OpsOfflineForm({
  kind,
  replayEndpoint,
  summary,
  action,
  children,
  ...formProps
}: OpsOfflineFormProps) {
  const [clientId, setClientId] = useState<string>(() => newOutboxId());

  const handleAction = useCallback(
    async (formData: FormData) => {
      formData.set("client_id", clientId);

      const isOnline =
        typeof navigator === "undefined" ? true : navigator.onLine;
      if (isOnline) {
        try {
          await action(formData);
          setClientId(newOutboxId());
          return;
        } catch (error) {
          // Network errors during the server action also queue for retry.
          console.warn("Server action failed; queuing for retry", error);
        }
      }

      // Either we're offline or the online attempt failed — persist.
      await enqueueOutboxIntent({
        id: clientId,
        kind,
        endpoint: replayEndpoint,
        method: "POST",
        payload: formData,
        summary: summary ?? kind,
      });
      setClientId(newOutboxId());
    },
    [action, clientId, kind, replayEndpoint, summary],
  );

  return (
    <form action={handleAction} {...formProps}>
      <input name="client_id" type="hidden" value={clientId} />
      {children}
    </form>
  );
}
