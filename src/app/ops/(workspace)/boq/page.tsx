import { permanentRedirect } from "next/navigation";
import type { OpsSearchParams } from "@/lib/ops/ui";

/**
 * The Bill of Quantities module was renamed to Material Schedule and moved to
 * /ops/material-schedule. This stub keeps every old entry point working:
 * bookmarks, and — more importantly — the `actionHref` already written into
 * historical notification rows, which cannot be rewritten retroactively.
 *
 * Only the route and the UI wording changed. Table names, the `boq` module id,
 * and the `module_key` on audit and notification rows are deliberately
 * unchanged, so no history is orphaned.
 */
export default async function OpsBoqRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<OpsSearchParams>;
}) {
  const params = await (searchParams ?? Promise.resolve({} as OpsSearchParams));
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      query.set(key, value);
    } else if (Array.isArray(value)) {
      for (const entry of value) query.append(key, entry);
    }
  }

  const suffix = query.toString();
  permanentRedirect(`/ops/material-schedule${suffix ? `?${suffix}` : ""}`);
}
