import { Resend } from "resend";
import { OPS_BRAND, OPS_HOST } from "@/lib/ops/constants";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsEmailDeliveryStatus, OpsUserRole } from "@/lib/ops/types";

type OpsCriticalHseAlertEmailInput = {
  actionHref?: string | null;
  body: string;
  idempotencyKey?: string | null;
  moduleKey?: string | null;
  recipientName?: string | null;
  recipientId?: string | null;
  recipientRole?: OpsUserRole | null;
  sourceId?: string | null;
  sourceTable?: string | null;
  title: string;
  to: string;
};

type OpsCriticalHseAlertEmailContent = {
  actionUrl: string;
  html: string;
  subject: string;
  text: string;
};

export type OpsEmailDeliveryRecordInput = {
  actionHref?: string | null;
  deliveryType?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
  moduleKey?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  reason: string;
  recipientEmail?: string | null;
  recipientId?: string | null;
  recipientName?: string | null;
  recipientRole?: OpsUserRole | null;
  sourceId?: string | null;
  sourceTable?: string | null;
  status: OpsEmailDeliveryStatus;
};

let resendClient: Resend | null = null;

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return null;
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
}

function getOpsEmailFrom() {
  return process.env.OPS_EMAIL_FROM || process.env.RESEND_FROM_EMAIL || "";
}

function getOpsEmailReplyTo() {
  return process.env.OPS_EMAIL_REPLY_TO || OPS_BRAND.supportEmail;
}

export function isOpsEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && getOpsEmailFrom());
}

function isMissingEmailDeliveryTable(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST200" ||
        error.code === "PGRST205" ||
        /ops_email_delivery_events|schema cache/i.test(error.message ?? "")),
  );
}

function normalizeSourceId(value: string | null | undefined) {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return null;
  }

  return value;
}

function truncate(value: string | null | undefined, maxLength: number) {
  const normalized = value?.trim() ?? "";
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function safeActionHref(value: string | null | undefined) {
  return value?.startsWith("/ops") ? value : "/ops/notifications";
}

function errorName(error: unknown) {
  return error && typeof error === "object" && "name" in error
    ? String((error as { name?: unknown }).name ?? "email_error")
    : "email_error";
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return truncate(String((error as { message?: unknown }).message ?? ""), 500);
  }

  return truncate(String(error ?? "Email provider returned an error."), 500);
}

export async function recordOpsEmailDeliveryEvent(input: OpsEmailDeliveryRecordInput) {
  const payload = {
    action_href: safeActionHref(input.actionHref),
    delivery_type: input.deliveryType ?? "hse_critical_alert",
    error_code: truncate(input.errorCode, 120) || null,
    error_message: truncate(input.errorMessage, 500) || null,
    idempotency_key: truncate(input.idempotencyKey, 240) || null,
    metadata: input.metadata ?? {},
    module_key: input.moduleKey ?? "hse",
    provider: input.provider ?? "resend",
    provider_message_id: truncate(input.providerMessageId, 180) || null,
    reason: truncate(input.reason, 160),
    recipient_email: truncate(input.recipientEmail, 320),
    recipient_id: input.recipientId ?? null,
    recipient_name: truncate(input.recipientName, 160),
    recipient_role: input.recipientRole ?? null,
    source_id: normalizeSourceId(input.sourceId),
    source_table: input.sourceTable ?? null,
    status: input.status,
  };
  try {
    const supabase = getOpsSupabaseServiceClient();
    const request = input.idempotencyKey
      ? supabase
          .from("ops_email_delivery_events")
          .upsert(payload, { onConflict: "idempotency_key" })
      : supabase.from("ops_email_delivery_events").insert(payload);
    const { error } = await request;

    if (isMissingEmailDeliveryTable(error)) {
      return false;
    }

    if (error) {
      console.warn("Pymble Ops email delivery event logging failed", {
        code: error.code,
        message: error.message,
      });
      return false;
    }
  } catch (error) {
    console.warn("Pymble Ops email delivery event logging failed", {
      code: errorName(error),
      message: errorMessage(error),
    });
    return false;
  }

  return true;
}

export function buildOpsEmailActionUrl(actionHref: string | null | undefined, host = process.env.NEXT_PUBLIC_OPS_HOST) {
  const safeHref = actionHref?.startsWith("/ops") ? actionHref : "/ops/notifications";
  const normalizedHost = (host || OPS_HOST).replace(/^https?:\/\//i, "").replace(/\/+$/, "");

  return `https://${normalizedHost}${safeHref}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildOpsCriticalHseAlertEmailContent(
  input: OpsCriticalHseAlertEmailInput,
): OpsCriticalHseAlertEmailContent {
  const actionUrl = buildOpsEmailActionUrl(input.actionHref);
  const recipientName = input.recipientName?.trim() || "Pymble team";
  const safeActionUrl = escapeHtml(actionUrl);
  const safeBody = escapeHtml(input.body);
  const safeRecipientName = escapeHtml(recipientName);
  const safeTitle = escapeHtml(input.title);
  const subject = `Pymble HSE alert: ${input.title}`;

  return {
    actionUrl,
    subject,
    text: [
      `Pymble HSE alert: ${input.title}`,
      "",
      `Hello ${recipientName},`,
      "",
      input.body,
      "",
      `Open the HSE alert: ${actionUrl}`,
      "",
      `${OPS_BRAND.companyName} Internal Operations Terminal`,
    ].join("\n"),
    html: `
      <div style="margin:0;background:#f6f7fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#131739;">
        <div style="max-width:640px;margin:0 auto;border:1px solid #e2e5f0;border-radius:12px;background:#ffffff;overflow:hidden;">
          <div style="padding:24px 28px;border-bottom:1px solid #e2e5f0;">
            <img src="${escapeHtml(buildOpsEmailActionUrl("/ops-logo.svg"))}" alt="${escapeHtml(
              OPS_BRAND.companyName,
            )}" style="display:block;width:48px;height:48px;object-fit:contain;margin-bottom:16px;" />
            <p style="margin:0 0 6px;color:#2235DD;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">Critical HSE alert</p>
            <h1 style="margin:0;color:#131739;font-size:24px;line-height:1.25;">${safeTitle}</h1>
          </div>
          <div style="padding:28px;">
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello ${safeRecipientName},</p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${safeBody}</p>
            <a href="${safeActionUrl}" style="display:inline-block;border-radius:8px;background:#2235DD;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 18px;">Open HSE alert</a>
            <p style="margin:24px 0 0;color:#5b607c;font-size:13px;line-height:1.6;">This email supplements the in-app notification and audit trail in Pymble Operations.</p>
          </div>
          <div style="padding:18px 28px;background:#f6f7fb;color:#5b607c;font-size:12px;line-height:1.5;">
            ${escapeHtml(OPS_BRAND.companyName)}<br />
            Internal Operations Terminal
          </div>
        </div>
      </div>
    `,
  };
}

export async function sendOpsCriticalHseAlertEmail(input: OpsCriticalHseAlertEmailInput) {
  const resend = getResendClient();
  const from = getOpsEmailFrom();
  const idempotencyKey = input.idempotencyKey
    ? `ops-hse-critical:${input.idempotencyKey}`.slice(0, 240)
    : undefined;
  const baseRecord = {
    actionHref: input.actionHref,
    deliveryType: "hse_critical_alert",
    idempotencyKey,
    moduleKey: input.moduleKey ?? "hse",
    recipientEmail: input.to,
    recipientId: input.recipientId,
    recipientName: input.recipientName,
    recipientRole: input.recipientRole,
    sourceId: input.sourceId,
    sourceTable: input.sourceTable,
  } satisfies Omit<OpsEmailDeliveryRecordInput, "reason" | "status">;

  if (!resend || !from || !input.to) {
    await recordOpsEmailDeliveryEvent({
      ...baseRecord,
      reason: !input.to ? "missing_recipient" : "not_configured",
      status: "skipped",
    });
    return { ok: false, reason: "not_configured" as const };
  }

  const content = buildOpsCriticalHseAlertEmailContent(input);

  try {
    const { data, error } = await resend.emails.send(
      {
        from,
        html: content.html,
        replyTo: getOpsEmailReplyTo(),
        subject: content.subject,
        text: content.text,
        to: [input.to],
      },
      idempotencyKey
        ? {
            headers: {
              "Idempotency-Key": idempotencyKey,
            },
          }
        : undefined,
    );

    if (error) {
      console.warn("Pymble Ops HSE email failed", error);
      await recordOpsEmailDeliveryEvent({
        ...baseRecord,
        errorCode: errorName(error),
        errorMessage: errorMessage(error),
        reason: "send_failed",
        status: "failed",
      });
      return { ok: false, reason: "send_failed" as const };
    }

    await recordOpsEmailDeliveryEvent({
      ...baseRecord,
      providerMessageId: data?.id,
      reason: "sent",
      status: "sent",
    });
    return { ok: true, reason: "sent" as const };
  } catch (error) {
    console.warn("Pymble Ops HSE email failed", error);
    await recordOpsEmailDeliveryEvent({
      ...baseRecord,
      errorCode: errorName(error),
      errorMessage: errorMessage(error),
      reason: "send_failed",
      status: "failed",
    });
    return { ok: false, reason: "send_failed" as const };
  }
}
