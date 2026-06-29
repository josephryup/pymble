import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison for secrets (e.g. the CRON_SECRET bearer
 * token). Hashing both sides to a fixed-length SHA-256 digest before comparing
 * means the comparison time leaks neither the secret's length nor how many
 * leading characters matched, closing the timing side-channel that a plain
 * `===`/`!==` comparison has.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}
