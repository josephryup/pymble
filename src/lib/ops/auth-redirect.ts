import { headers } from "next/headers";

const OPS_CALLBACK_PATH = "/ops/auth/callback";
const OPS_DEFAULT_AUTH_DESTINATION = "/ops/profile?updated=welcome";

export type OpsAuthEmailFlow =
  | "email"
  | "email_change"
  | "invite"
  | "magiclink"
  | "recovery"
  | "signup";

const OPS_AUTH_EMAIL_FLOWS = new Set<OpsAuthEmailFlow>([
  "email",
  "email_change",
  "invite",
  "magiclink",
  "recovery",
  "signup",
]);

function normalizeHost(value: string | null | undefined) {
  return value?.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
}

function isLocalHost(host: string | null | undefined) {
  return Boolean(host?.startsWith("localhost") || host?.startsWith("127.0.0.1"));
}

export function parseOpsAuthEmailFlow(value: string | null | undefined) {
  return value && OPS_AUTH_EMAIL_FLOWS.has(value as OpsAuthEmailFlow)
    ? (value as OpsAuthEmailFlow)
    : null;
}

export function safeOpsRedirectPath(
  value: string | null | undefined,
  fallback = OPS_DEFAULT_AUTH_DESTINATION,
) {
  if (!value || !value.startsWith("/ops") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}

export function getOpsAuthFlowRedirect(
  type: OpsAuthEmailFlow | null | undefined,
  next?: string | null,
) {
  if (next) {
    return safeOpsRedirectPath(next, OPS_DEFAULT_AUTH_DESTINATION);
  }

  if (type === "recovery") {
    return "/ops/profile#password";
  }

  if (type === "email_change") {
    return "/ops/profile?updated=email";
  }

  if (type === "magiclink" || type === "email") {
    return "/ops";
  }

  return OPS_DEFAULT_AUTH_DESTINATION;
}

function buildCallbackUrl(host: string | null | undefined, protocol: string | null | undefined, next?: string) {
  const requestHost = normalizeHost(host);
  const configuredHost = normalizeHost(process.env.NEXT_PUBLIC_OPS_HOST);
  const targetHost = isLocalHost(requestHost) ? requestHost : configuredHost ?? requestHost;

  if (!targetHost) {
    return undefined;
  }

  const targetProtocol = isLocalHost(targetHost) ? "http" : protocol ?? "https";
  const url = new URL(OPS_CALLBACK_PATH, `${targetProtocol}://${targetHost}`);

  if (next) {
    url.searchParams.set("next", next);
  }

  return url.toString();
}

export async function getOpsAuthCallbackUrl(next?: string) {
  const headerStore = await headers();

  return buildCallbackUrl(
    headerStore.get("host"),
    headerStore.get("x-forwarded-proto"),
    next,
  );
}

export function getOpsAuthCallbackUrlFromRequest(requestUrl: URL, next?: string) {
  return buildCallbackUrl(requestUrl.host, requestUrl.protocol.replace(":", ""), next);
}
