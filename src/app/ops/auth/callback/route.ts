import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createOpsCookieSessionClient } from "@/lib/ops/auth";
import {
  getOpsAuthFlowRedirect,
  parseOpsAuthEmailFlow,
  safeOpsRedirectPath,
} from "@/lib/ops/auth-redirect";

function opsAuthErrorRedirect(requestUrl: URL, message: string) {
  return NextResponse.redirect(
    new URL(
      `/ops/login?error=${encodeURIComponent(message)}`,
      requestUrl.origin,
    ),
  );
}

// The proxy stamps x-nonce onto every ops request in production; only a
// well-formed base64 nonce may be echoed into markup so a spoofed header can
// never inject attributes.
function safeCspNonce(request: NextRequest) {
  const nonce = request.headers.get("x-nonce") ?? "";
  return /^[A-Za-z0-9+/\-_]{16,64}={0,2}$/.test(nonce) ? nonce : null;
}

function hashBridgePage(next: string, nonce: string | null) {
  const nextJson = JSON.stringify(next);
  const errorMessage = JSON.stringify("The secure email link could not be verified.");
  // Without the nonce the CSP blocks this inline script and email-link
  // sign-in dies silently on the bridge page.
  const scriptTag = nonce ? `<script nonce="${nonce}">` : "<script>";

  return new NextResponse(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pymble Operations</title>
</head>
<body style="margin:0;background:#f6f7fb;color:#101828;font-family:Arial,sans-serif;">
  <main style="min-height:100vh;display:grid;place-items:center;padding:24px;">
    <section style="max-width:420px;border:1px solid #e4e7ec;border-radius:12px;background:#fff;padding:28px;box-shadow:0 12px 40px rgba(16,24,40,.08);">
      <p style="margin:0 0 8px;color:#2737e8;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Pymble Operations</p>
      <h1 style="margin:0;color:#0b1220;font-size:22px;line-height:30px;">Verifying secure link</h1>
      <p style="margin:12px 0 0;color:#475467;font-size:14px;line-height:22px;">Please wait while we finish signing you in.</p>
    </section>
  </main>
  ${scriptTag}
    (async function () {
      var fallbackError = ${errorMessage};
      var next = ${nextJson};
      var hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      var query = new URLSearchParams(window.location.search);
      var error = hash.get("error_description") || hash.get("error") || query.get("error_description") || query.get("error");
      var accessToken = hash.get("access_token");
      var refreshToken = hash.get("refresh_token");
      var type = hash.get("type") || query.get("type");

      function fail(message) {
        window.location.replace("/ops/login?error=" + encodeURIComponent(message || fallbackError));
      }

      if (error) {
        fail(error);
        return;
      }

      if (!accessToken || !refreshToken) {
        fail(fallbackError);
        return;
      }

      try {
        var response = await fetch("/api/ops/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: accessToken,
            refresh_token: refreshToken,
            type: type,
            next: next
          })
        });
        var payload = await response.json().catch(function () { return null; });

        if (!response.ok) {
          fail(payload && payload.error ? payload.error : fallbackError);
          return;
        }

        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        window.location.replace(payload && payload.redirectTo ? payload.redirectTo : next);
      } catch (sessionError) {
        fail(fallbackError);
      }
    })();
  </script>
</body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = parseOpsAuthEmailFlow(requestUrl.searchParams.get("type"));
  const next = safeOpsRedirectPath(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createOpsCookieSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, requestUrl.origin));
    }

    return opsAuthErrorRedirect(requestUrl, "The secure email link could not be verified.");
  }

  if (tokenHash && type) {
    const supabase = await createOpsCookieSessionClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });

    if (!error) {
      return NextResponse.redirect(
        new URL(getOpsAuthFlowRedirect(type, next), requestUrl.origin),
      );
    }

    return opsAuthErrorRedirect(requestUrl, "The secure email link could not be verified.");
  }

  return hashBridgePage(next, safeCspNonce(request));
}
