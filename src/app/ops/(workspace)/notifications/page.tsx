import { Archive, Bell, CheckCircle2, Inbox, MailOpen, RotateCcw } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsRealtimeRefresh } from "@/components/ops/OpsRealtimeRefresh";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  fetchOpsNotifications,
  fetchOpsNotificationStatusCounts,
} from "@/lib/ops/notifications";
import {
  archiveOpsNotificationAction,
  markAllOpsNotificationsReadAction,
  markOpsNotificationReadAction,
  openOpsNotificationAction,
  restoreOpsNotificationAction,
} from "@/lib/ops/notification-actions";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import {
  firstParam,
  OPS_FOCUS_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";
import type { OpsNotificationStatus } from "@/lib/ops/types";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

type StatusOption = {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  status: OpsNotificationStatus;
};

const STATUS_OPTIONS: StatusOption[] = [
  { icon: Inbox, label: "Unread", status: "unread" },
  { icon: MailOpen, label: "Read", status: "read" },
  { icon: Archive, label: "Archived", status: "archived" },
];

const noticeMessages: Record<string, string> = {
  notification_archived: "Notification archived.",
  notification_read: "Notification marked as read.",
  notifications_read: "Unread notifications marked as read.",
  notification_restored: "Notification restored.",
};

function parseNotificationStatus(value: string | undefined): OpsNotificationStatus {
  return STATUS_OPTIONS.some((option) => option.status === value)
    ? (value as OpsNotificationStatus)
    : "unread";
}

function statusClass(status: OpsNotificationStatus) {
  if (status === "archived") {
    return "border-primary-dark/10 bg-primary-dark/[0.04] text-primary-dark/58";
  }

  if (status === "read") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-sky-200 bg-sky-50 text-sky-700";
}

function formatModule(moduleKey: string) {
  return moduleKey.replace(/_/g, " ");
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function safeActionHref(value: string | null) {
  if (!value || value.startsWith("//")) {
    return null;
  }

  if (value !== "/ops" && !value.startsWith("/ops/")) {
    return null;
  }

  return value;
}

export default async function OpsNotificationsPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/notifications")) {
    notFound();
  }

  const status = parseNotificationStatus(firstParam(params.status));
  const returnTo = `/ops/notifications?status=${status}`;
  const [notifications, counts] = await Promise.all([
    fetchOpsNotifications({ limit: 60, status }),
    fetchOpsNotificationStatusCounts(),
  ]);
  const error = firstParam(params.error);
  const updated = firstParam(params.updated);
  const successMessage = updated ? noticeMessages[updated] : null;

  return (
    <div className="w-full max-w-none space-y-6">
      <OpsRealtimeRefresh tables={["notifications"]} />
      <section className="rounded-lg border border-primary-dark/10 bg-white p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Workflow Alerts
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark">
              Notifications
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
              Review workflow alerts assigned to you, open the related record, and keep old alerts
              archived without losing the history.
            </p>
          </div>
          <div className="grid gap-3 min-[520px]:grid-cols-3">
            {STATUS_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <div
                  className="rounded-md border border-primary-dark/10 px-4 py-3"
                  key={option.status}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                      {option.label}
                    </p>
                    <Icon className="size-4 text-primary-blue" aria-hidden={true} />
                  </div>
                  <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                    {counts[option.status]}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {error ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
          role="status"
        >
          {successMessage}
        </div>
      ) : null}

      <section className="rounded-lg border border-primary-dark/10 bg-white">
        <div className="flex flex-col gap-4 border-b border-primary-dark/10 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-heading text-xl font-bold text-primary-dark">
              {STATUS_OPTIONS.find((option) => option.status === status)?.label} alerts
            </h2>
            <p className="mt-1 text-sm text-primary-dark/60">
              Notifications are stored per staff account and remain traceable after they are read.
            </p>
          </div>
          <nav aria-label="Notification filters" className="flex flex-wrap gap-2">
            {status === "unread" && counts.unread > 0 ? (
              <form action={markAllOpsNotificationsReadAction}>
                <input name="return_to" type="hidden" value={returnTo} />
                <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Mark all read
                </button>
              </form>
            ) : null}
            {STATUS_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isActive = option.status === status;
              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-bold transition ${
                    isActive
                      ? "border-primary-blue bg-primary-blue text-white"
                      : "border-primary-dark/10 text-primary-dark hover:border-primary-blue hover:text-primary-blue"
                  } ${OPS_FOCUS_CLASS}`}
                  href={`/ops/notifications?status=${option.status}`}
                  key={option.status}
                >
                  <Icon className="size-4" aria-hidden={true} />
                  {option.label}
                  <span
                    className={`inline-flex min-w-6 justify-center rounded-full px-2 py-0.5 text-[11px] font-black ${
                      isActive
                        ? "bg-white text-primary-blue"
                        : "bg-primary-dark/[0.06] text-primary-dark"
                    }`}
                  >
                    {counts[option.status]}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

        {notifications.length > 0 ? (
          <div className="divide-y divide-primary-dark/10">
            {notifications.map((notification) => {
              const actionHref = safeActionHref(notification.action_href);
              return (
                <article className="p-5" key={notification.id}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
                        <Bell className="size-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-heading text-lg font-bold text-primary-dark">
                            {notification.title}
                          </h3>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${statusClass(
                              notification.status,
                            )}`}
                          >
                            {formatStatus(notification.status)}
                          </span>
                        </div>
                        {notification.body ? (
                          <p className="mt-2 max-w-3xl text-sm leading-6 text-primary-dark/64">
                            {notification.body}
                          </p>
                        ) : null}
                        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary-dark/45">
                          {formatModule(notification.module_key)} /{" "}
                          {formatDateTime(notification.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {actionHref ? (
                        <form action={openOpsNotificationAction}>
                          <input name="id" type="hidden" value={notification.id} />
                          <input name="action_href" type="hidden" value={actionHref} />
                          <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                            Open related record
                          </button>
                        </form>
                      ) : null}

                      {notification.status === "unread" ? (
                        <form action={markOpsNotificationReadAction}>
                          <input name="id" type="hidden" value={notification.id} />
                          <input name="return_to" type="hidden" value={returnTo} />
                          <button className={OPS_PRIMARY_BUTTON_CLASS} type="submit">
                            <CheckCircle2 className="size-4" aria-hidden="true" />
                            Mark read
                          </button>
                        </form>
                      ) : null}

                      {notification.status !== "archived" ? (
                        <form action={archiveOpsNotificationAction}>
                          <input name="id" type="hidden" value={notification.id} />
                          <input name="return_to" type="hidden" value={returnTo} />
                          <OpsConfirmSubmitButton
                            className={OPS_SECONDARY_BUTTON_CLASS}
                            confirmText="Confirm archive"
                          >
                            <Archive className="size-4" aria-hidden="true" />
                            Archive
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : (
                        <form action={restoreOpsNotificationAction}>
                          <input name="id" type="hidden" value={notification.id} />
                          <input name="return_to" type="hidden" value={returnTo} />
                          <button className={OPS_SECONDARY_BUTTON_CLASS} type="submit">
                            <RotateCcw className="size-4" aria-hidden="true" />
                            Restore
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center">
            <CheckCircle2 className="size-10 text-emerald-600" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-primary-dark">
                No {status} notifications
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-primary-dark/60">
                Workflow alerts from approvals, documents, and future ERP modules will appear here
                when they are assigned to you.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
