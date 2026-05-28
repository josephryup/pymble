import { headers } from "next/headers";

const OPS_CALLBACK_PATH = "/ops/auth/callback";

function normalizeHost(value: string | null | undefined) {
  return value?.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
}

function isLocalHost(host: string | null | undefined) {
  return Boolean(host?.startsWith("localhost") || host?.startsWith("127.0.0.1"));
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
