/**
 * Returning someone to where they actually were after a save (audit §11).
 *
 * Every server action ends `redirect(\`${ROUTE}?updated=x\`)`, which rebuilds
 * the URL from scratch — so `page=3`, the search box and every filter are
 * dropped. 363 redirects do this and none preserved list state. Edit something
 * on page 3 of a filtered list and you land on page 1, unfiltered, every time.
 *
 * `opsReturnTo` merges the result flag into the URL the user came FROM instead
 * of replacing it. Forms carry that URL in a hidden `return_to` field
 * (see OpsReturnToField), which is why this is safe: the value is
 * attacker-controllable, so it goes through `safeOpsReturnTo` first and can
 * only ever point inside /ops.
 *
 * Degrades cleanly: with no `return_to` — no JavaScript, or a form that has
 * not adopted the field yet — it produces exactly today's URL, so adoption can
 * be incremental and nothing breaks in between.
 */
export function opsReturnTo(input: {
  /** Raw `return_to` from the submitted form. Untrusted. */
  returnTo: string | undefined;
  /** Where to go when there is no usable return path. */
  fallback: string;
  /** Result flags to merge in, e.g. `{ updated: "line_edited" }`. */
  params?: Record<string, string>;
  /** Anchor to scroll to, without the leading `#`. */
  hash?: string;
}): string {
  const safe = safeOpsReturnTo(input.returnTo, input.fallback);

  // A relative path needs a base to parse against; the origin is discarded.
  const url = new URL(safe, "https://ops.invalid");

  for (const [key, value] of Object.entries(input.params ?? {})) {
    url.searchParams.set(key, value);
  }

  // A stale result flag from the previous round-trip would otherwise re-show
  // the old banner. Drop any the caller did not explicitly set this time.
  for (const flag of ["updated", "created", "error"]) {
    if (!(flag in (input.params ?? {}))) {
      url.searchParams.delete(flag);
    }
  }

  const query = url.searchParams.toString();
  const anchor = input.hash ? `#${input.hash}` : url.hash;

  return `${url.pathname}${query ? `?${query}` : ""}${anchor}`;
}

export function safeOpsReturnTo(value: string | undefined, fallback = "/ops") {
  if (!value || value.startsWith("//")) {
    return fallback;
  }

  const isOpsPath =
    value === "/ops" ||
    value.startsWith("/ops/") ||
    value.startsWith("/ops?") ||
    value.startsWith("/ops#");

  if (!isOpsPath) {
    return fallback;
  }

  return value;
}
