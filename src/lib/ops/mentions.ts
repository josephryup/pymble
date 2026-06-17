import type { OpsActiveUser } from "@/lib/ops/notification-fanout";

const MENTION_PATTERN = /@([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,3})/g;

/**
 * Scan a comment body for "@First Last" mentions and resolve them against the
 * active user pool. Match is case-insensitive and prefix-friendly:
 *
 * - "@Joseph Phiri" → matches user "Joseph Phiri"
 * - "@joseph"       → matches the longest active full_name starting with
 *                      "joseph" (first match wins if there are multiple)
 *
 * Returns the list of matched user ids, deduplicated.
 */
export function extractMentionedUserIds(
  body: string,
  users: OpsActiveUser[],
): string[] {
  if (!body) return [];

  const matches = new Set<string>();
  // Try greedy multi-word matches first by walking each regex hit and seeing
  // whether the captured phrase matches a user's full_name as a prefix.
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const raw = (match[1] ?? "").trim().toLowerCase();
    if (!raw) continue;

    // Look for an exact case-insensitive full_name match first.
    const exact = users.find((user) => user.full_name.toLowerCase() === raw);
    if (exact) {
      matches.add(exact.id);
      continue;
    }

    // Fall back to a starts-with match against either the full name or just
    // the first word — pick the user whose full_name starts with the mention,
    // preferring longer mentions (which we already get from the greedy regex).
    const prefix = users.find((user) =>
      user.full_name.toLowerCase().startsWith(raw),
    );
    if (prefix) {
      matches.add(prefix.id);
      continue;
    }

    // Last attempt: single-word first-name match.
    const firstWord = raw.split(/\s+/)[0];
    const firstNameMatch = users.find((user) => {
      const firstName = user.full_name.split(/\s+/)[0]?.toLowerCase();
      return firstName === firstWord;
    });
    if (firstNameMatch) {
      matches.add(firstNameMatch.id);
    }
  }

  return Array.from(matches);
}
