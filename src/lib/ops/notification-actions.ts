"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  opsNotificationNoticeHref,
  parseOpsNotificationActionInput,
} from "@/lib/ops/notification-form";
import {
  archiveOpsNotification,
  markAllOpsNotificationsRead,
  markOpsNotificationRead,
  restoreOpsNotification,
} from "@/lib/ops/notifications";
import { safeOpsReturnTo } from "@/lib/ops/return-paths";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function redirectWithNotice(returnTo: string, updated: string): never {
  redirect(opsNotificationNoticeHref(returnTo, "updated", updated));
}

function notificationError(message: string, returnTo = "/ops/notifications"): never {
  redirect(opsNotificationNoticeHref(returnTo, "error", message));
}

function parseNotificationAction(formData: FormData) {
  const parsed = parseOpsNotificationActionInput({
    id: field(formData, "id"),
    return_to: field(formData, "return_to"),
  });

  if (!parsed.ok) {
    notificationError(parsed.message, parsed.returnTo);
  }

  return {
    id: parsed.id,
    returnTo: parsed.returnTo,
  };
}

export async function markOpsNotificationReadAction(formData: FormData) {
  const parsed = parseNotificationAction(formData);

  try {
    await markOpsNotificationRead(parsed.id);
  } catch {
    notificationError("The notification could not be updated. Please try again.", parsed.returnTo);
  }

  revalidatePath("/ops");
  revalidatePath("/ops/approvals");
  revalidatePath("/ops/notifications");
  redirectWithNotice(parsed.returnTo, "notification_read");
}

export async function markAllOpsNotificationsReadAction(formData: FormData) {
  const returnTo = field(formData, "return_to") || "/ops/notifications";

  try {
    await markAllOpsNotificationsRead();
  } catch {
    notificationError("Unread notifications could not be updated. Please try again.", returnTo);
  }

  revalidatePath("/ops");
  revalidatePath("/ops/approvals");
  revalidatePath("/ops/notifications");
  redirectWithNotice(returnTo, "notifications_read");
}

export async function archiveOpsNotificationAction(formData: FormData) {
  const parsed = parseNotificationAction(formData);

  try {
    await archiveOpsNotification(parsed.id);
  } catch {
    notificationError("The notification could not be archived. Please try again.", parsed.returnTo);
  }

  revalidatePath("/ops");
  revalidatePath("/ops/approvals");
  revalidatePath("/ops/notifications");
  redirectWithNotice(parsed.returnTo, "notification_archived");
}

/**
 * Opens a notification's related record and marks the notification read in one
 * server action. Lets the UI keep a single "Open related record" button without
 * leaving badges stale after click-through.
 */
export async function openOpsNotificationAction(formData: FormData) {
  const id = field(formData, "id");
  const target = safeOpsReturnTo(field(formData, "action_href"), "/ops");

  if (id) {
    try {
      await markOpsNotificationRead(id);
    } catch {
      // Silently swallow — the user's intent is to view the record. They can
      // mark-read manually from the notifications page if it really matters.
    }

    revalidatePath("/ops");
    revalidatePath("/ops/approvals");
    revalidatePath("/ops/notifications");
  }

  redirect(target);
}

export async function restoreOpsNotificationAction(formData: FormData) {
  const parsed = parseNotificationAction(formData);

  try {
    await restoreOpsNotification(parsed.id);
  } catch {
    notificationError("The notification could not be restored. Please try again.", parsed.returnTo);
  }

  revalidatePath("/ops");
  revalidatePath("/ops/approvals");
  revalidatePath("/ops/notifications");
  redirectWithNotice(parsed.returnTo, "notification_restored");
}
