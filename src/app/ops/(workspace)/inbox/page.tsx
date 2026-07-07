import { AtSign, Clock3, MessageSquare, UserCircle2 } from "lucide-react";
import Link from "next/link";
import { OpsEmptyState } from "@/components/ops/OpsEmptyState";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import {
  fetchOpsInboxMentionsForCurrentUser,
  groupOpsInboxMentions,
} from "@/lib/ops/inbox";
import { getOpsInboxRecordRoute, getOpsRecordLabel } from "@/lib/ops/inbox-routes";
import { formatOpsRole } from "@/lib/ops/roles";
import { OPS_SECONDARY_BUTTON_CLASS } from "@/lib/ops/ui";

export const dynamic = "force-dynamic";

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lusaka",
  }).format(new Date(iso));
}

export default async function OpsInboxPage() {
  const mentions = await fetchOpsInboxMentionsForCurrentUser();
  const conversations = groupOpsInboxMentions(mentions);

  return (
    <div className="space-y-6">
      <OpsRealtimeRefresh tables={["record_comments"]} />
      <header className="rounded-lg border border-slate-200 bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-violet-100 p-2 text-violet-700">
            <MessageSquare className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">My Conversations</h1>
            <p className="mt-1 text-sm text-slate-600">
              Every record where teammates have @mentioned you, grouped by conversation. Click
              through to reply on the record.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {conversations.length === 0
                ? "No conversations yet."
                : `${conversations.length} ${
                    conversations.length === 1 ? "conversation" : "conversations"
                  } · ${mentions.length} ${mentions.length === 1 ? "mention" : "mentions"}.`}
            </p>
          </div>
        </div>
      </header>

      {conversations.length === 0 ? (
        <OpsEmptyState
          icon={MessageSquare}
          title="No conversations yet"
          description='When a teammate types "@YourName" inside a record comment, their message appears here so you can follow up on it.'
          actions={[{ href: "/ops/notifications", label: "Open notifications", variant: "secondary" }]}
          tip="Tip: replies on a record auto-notify the original author too — no extra channel needed."
        />
      ) : (
        <ul className="space-y-3">
          {conversations.map((conversation) => {
            const route = getOpsInboxRecordRoute(conversation.source_table, conversation.source_id);
            const label = getOpsRecordLabel(conversation.source_table);
            const latest = conversation.mentions[0];
            const earlier = conversation.mentions.slice(1, 4);
            return (
              <li
                key={conversation.key}
                id={`rc-${conversation.source_id}`}
                className="rounded-lg border border-slate-200 bg-card p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                    {label}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden />
                    {formatWhen(conversation.latest_at)}
                  </span>
                </div>
                {latest ? (
                  <div className="mt-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      <AtSign className="h-4 w-4 text-violet-600" aria-hidden />
                      <span className="font-semibold text-slate-800">
                        {latest.author?.full_name ?? "Unknown teammate"}
                      </span>
                      {latest.author?.role ? (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <UserCircle2 className="h-3.5 w-3.5" aria-hidden />
                          {formatOpsRole(latest.author.role)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {latest.body}
                    </p>
                  </div>
                ) : null}
                {earlier.length > 0 ? (
                  <details className="mt-3 group">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-violet-700 hover:text-violet-900">
                      {conversation.mentions.length - 1} earlier
                      {conversation.mentions.length - 1 === 1 ? " mention" : " mentions"}
                    </summary>
                    <ul className="mt-2 space-y-2">
                      {earlier.map((mention) => (
                        <li
                          className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600"
                          id={`cm-${mention.id}`}
                          key={mention.id}
                        >
                          <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                            <span>{mention.author?.full_name ?? "Unknown"}</span>
                            <span aria-hidden>·</span>
                            <span>{formatWhen(mention.created_at)}</span>
                          </p>
                          <p className="mt-1 whitespace-pre-wrap leading-5 text-slate-700">
                            {mention.body}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <div className="mt-4 flex justify-end">
                  <Link className={OPS_SECONDARY_BUTTON_CLASS} href={route}>
                    Open record
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
