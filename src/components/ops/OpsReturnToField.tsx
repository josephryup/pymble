"use client";

import { usePathname, useSearchParams } from "next/navigation";

/**
 * Carries the page you are currently on into a form submission (audit §11).
 *
 * Drop this inside any form whose action redirects, and the action can return
 * you to the same page, filter and scroll position instead of resetting to
 * page 1. Pair it with `opsReturnTo` in the action.
 *
 *   <form action={someAction}>
 *     <OpsReturnToField />
 *     …
 *   </form>
 *
 * Why a client component: the current query string is not otherwise available
 * inside an arbitrarily nested form without threading `searchParams` through
 * every intermediate component. This reads it once, at the point of use.
 *
 * Progressive enhancement is deliberate and matters here — the workspace is
 * used on site where JavaScript may not have loaded. Without JS this field is
 * simply absent, `opsReturnTo` falls back to the action's own route, and the
 * behaviour is exactly what it is today. Nothing depends on this working.
 *
 * Safe by construction on the read side: the value is rebuilt from the live
 * pathname and query rather than echoed from anywhere, and the action still
 * validates it through `safeOpsReturnTo` because a hidden field is
 * user-editable.
 */
export function OpsReturnToField({ hash }: { hash?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Only workspace paths are ever useful here, and the action rejects anything
  // else anyway — but there is no reason to send a value that cannot be used.
  if (!pathname || !pathname.startsWith("/ops")) {
    return null;
  }

  const query = searchParams?.toString() ?? "";
  const anchor = hash ? `#${hash}` : "";
  const value = `${pathname}${query ? `?${query}` : ""}${anchor}`;

  return <input name="return_to" type="hidden" value={value} />;
}
