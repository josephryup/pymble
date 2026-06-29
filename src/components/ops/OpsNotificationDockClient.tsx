"use client";

import { Bell, CheckCircle2, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  markAllOpsNotificationsReadAction,
  markOpsNotificationReadAction,
  openOpsNotificationAction,
} from "@/lib/ops/notification-actions";

export type OpsDockNotification = {
  id: string;
  title: string;
  body: string;
  moduleKey: string;
  category: "action" | "info";
  status: "unread" | "read" | "archived";
  actionHref: string | null;
  createdAt: string;
};

function relativeTime(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(minutes)) return "";
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-ZM", { day: "numeric", month: "short" });
}

function safeActionHref(value: string | null) {
  if (!value || value.startsWith("//")) return null;
  if (value !== "/ops" && !value.startsWith("/ops/")) return null;
  return value;
}

// "Action needed" = the recipient must act. Driven by the server-set category
// column (see deriveOpsNotificationCategory), grouped only while still unread.
function isActionNeeded(notification: OpsDockNotification) {
  return notification.status === "unread" && notification.category === "action";
}

export function OpsNotificationDockClient({
  notifications,
  unreadCount,
}: {
  notifications: OpsDockNotification[];
  unreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const returnTo = pathname && pathname.startsWith("/ops") ? pathname : "/ops";

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const actionNeeded = notifications.filter(isActionNeeded);
  const informational = notifications.filter((notification) => !isActionNeeded(notification));

  const renderItem = (notification: OpsDockNotification) => {
    const href = safeActionHref(notification.actionHref);
    const isUnread = notification.status === "unread";
    return (
      <li key={notification.id}>
        <form action={href ? openOpsNotificationAction : markOpsNotificationReadAction}>
          <input type="hidden" name="id" value={notification.id} />
          {href ? (
            <input type="hidden" name="action_href" value={href} />
          ) : (
            <input type="hidden" name="return_to" value={returnTo} />
          )}
          <button
            type="submit"
            className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-primary-blue/[0.04] focus-visible:bg-primary-blue/[0.06] focus-visible:outline-none ${
              isUnread ? "bg-sky-50/50" : ""
            }`}
          >
            <span
              className={`mt-1.5 size-2 shrink-0 rounded-full ${
                isUnread ? "bg-primary-blue" : "bg-transparent"
              }`}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span
                className={`block truncate text-sm ${
                  isUnread ? "font-bold text-primary-dark" : "font-semibold text-primary-dark/80"
                }`}
              >
                {notification.title}
              </span>
              {notification.body ? (
                <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-primary-dark/60">
                  {notification.body}
                </span>
              ) : null}
              <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-primary-dark/40">
                {notification.moduleKey.replace(/_/g, " ")} · {relativeTime(notification.createdAt)}
              </span>
            </span>
          </button>
        </form>
      </li>
    );
  };

  return (
    <div
      ref={containerRef}
      className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3 print:hidden"
    >
      {open ? (
        <div className="flex w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-primary-dark/10 bg-white shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-primary-dark/10 bg-primary-dark/[0.02] px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-primary-blue" aria-hidden="true" />
              <span className="font-heading text-sm font-bold text-primary-dark">
                Notifications
              </span>
              {unreadCount > 0 ? (
                <span className="inline-flex min-w-5 justify-center rounded-full bg-primary-blue px-1.5 py-0.5 text-[11px] font-black text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
              className="rounded-md p-1 text-primary-dark/50 transition hover:bg-primary-dark/5 hover:text-primary-dark"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <CheckCircle2 className="size-8 text-emerald-600" aria-hidden="true" />
                <p className="text-sm font-semibold text-primary-dark">You&apos;re all caught up</p>
                <p className="text-xs text-primary-dark/55">
                  New workflow alerts will appear here.
                </p>
              </div>
            ) : (
              <>
                {actionNeeded.length > 0 ? (
                  <>
                    <p className="bg-primary-blue/[0.05] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary-blue">
                      Action needed
                    </p>
                    <ul className="divide-y divide-primary-dark/[0.07]">
                      {actionNeeded.map(renderItem)}
                    </ul>
                  </>
                ) : null}
                {informational.length > 0 ? (
                  <>
                    {actionNeeded.length > 0 ? (
                      <p className="bg-primary-dark/[0.02] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary-dark/45">
                        Recent
                      </p>
                    ) : null}
                    <ul className="divide-y divide-primary-dark/[0.07]">
                      {informational.map(renderItem)}
                    </ul>
                  </>
                ) : null}
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-primary-dark/10 px-3 py-2">
            {unreadCount > 0 ? (
              <form action={markAllOpsNotificationsReadAction}>
                <input type="hidden" name="return_to" value={returnTo} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-bold text-primary-blue transition hover:bg-primary-blue/5"
                >
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  Mark all read
                </button>
              </form>
            ) : (
              <span />
            )}
            <Link
              href="/ops/notifications"
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-1.5 text-xs font-bold text-primary-dark/70 transition hover:bg-primary-dark/5 hover:text-primary-dark"
            >
              Open inbox →
            </Link>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        className="relative inline-flex size-14 items-center justify-center rounded-full bg-primary-blue text-white shadow-lg shadow-primary-blue/30 transition hover:bg-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue"
      >
        <Bell className="size-6" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 animate-pulse items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-black text-white ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}
