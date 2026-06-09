import { z } from "zod";
import { safeOpsReturnTo } from "@/lib/ops/return-paths";

const notificationActionSchema = z.object({
  id: z.string().uuid("Select a notification."),
  return_to: z.string().trim().max(160).optional(),
});

export type OpsNotificationActionInput = {
  id: string;
  return_to?: string;
};

export function safeOpsNotificationReturnTo(value?: string) {
  return safeOpsReturnTo(value, "/ops/notifications");
}

export function opsNotificationNoticeHref(returnTo: string, key: "error" | "updated", value: string) {
  const separator = returnTo.includes("?") ? "&" : "?";
  return `${returnTo}${separator}${key}=${encodeURIComponent(value)}`;
}

export function parseOpsNotificationActionInput(input: OpsNotificationActionInput) {
  const returnTo = safeOpsNotificationReturnTo(input.return_to);
  const parsed = notificationActionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      message: parsed.error.issues[0]?.message ?? "Select a notification.",
      ok: false as const,
      returnTo,
    };
  }

  return {
    id: parsed.data.id,
    ok: true as const,
    returnTo,
  };
}
