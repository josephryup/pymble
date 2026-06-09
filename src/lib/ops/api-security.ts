import { NextResponse } from "next/server";
import { OPS_HOST } from "@/lib/ops/constants";

const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizeHost(host: string | null | undefined) {
  return (host ?? "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function isLocalHost(host: string) {
  const hostname = host.split(":")[0] ?? "";
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function sourceUrlFromRequest(request: Request) {
  const source = request.headers.get("origin") ?? request.headers.get("referer");

  if (!source) {
    return null;
  }

  try {
    return new URL(source);
  } catch {
    return null;
  }
}

function allowedOpsRequestHosts(requestUrl: URL) {
  const requestHost = normalizeHost(requestUrl.host);
  const configuredHost = normalizeHost(process.env.NEXT_PUBLIC_OPS_HOST || OPS_HOST);
  const hosts = new Set([requestHost, configuredHost].filter(Boolean));

  if (isLocalHost(requestHost)) {
    hosts.add("localhost:3000");
    hosts.add("127.0.0.1:3000");
  }

  return hosts;
}

export function rejectMismatchedOpsOrigin(request: Request) {
  if (SAFE_HTTP_METHODS.has(request.method.toUpperCase())) {
    return null;
  }

  const requestUrl = new URL(request.url);
  const sourceUrl = sourceUrlFromRequest(request);

  if (!sourceUrl) {
    return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  }

  const sourceHost = normalizeHost(sourceUrl.host);
  const allowedHosts = allowedOpsRequestHosts(requestUrl);

  if (!allowedHosts.has(sourceHost)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  if (!isLocalHost(sourceHost) && sourceUrl.protocol !== "https:") {
    return NextResponse.json({ error: "Request origin is not secure." }, { status: 403 });
  }

  return null;
}
