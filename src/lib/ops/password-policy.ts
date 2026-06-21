import { z } from "zod";

/**
 * Pymble Operations password policy. Tighter than the Supabase default to
 * reduce brute-force risk on leadership accounts in particular.
 *
 *  - At least 12 characters
 *  - At least one uppercase letter
 *  - At least one lowercase letter
 *  - At least one digit
 *  - Not in a small blocklist of obvious passwords
 *
 * Supabase's own min-length is mirrored here so server-side rejects line up
 * with the client-side guidance.
 */
export const OPS_PASSWORD_MIN_LENGTH = 12;

const COMMON_PASSWORDS = new Set<string>([
  "password",
  "password1",
  "password123",
  "qwerty",
  "qwerty123",
  "letmein",
  "welcome",
  "welcome1",
  "admin",
  "admin123",
  "pymble",
  "pymble1",
  "pymble123",
  "construction",
  "construction1",
  "construction123",
  "iloveyou",
  "12345678",
  "123456789",
  "1234567890",
  "abcdef1234",
]);

export type OpsPasswordPolicyResult =
  | { ok: true }
  | { ok: false; reason: string };

export function evaluateOpsPassword(password: string): OpsPasswordPolicyResult {
  const value = password.trim();
  if (value.length < OPS_PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      reason: `Password must be at least ${OPS_PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (!/[A-Z]/.test(value)) {
    return { ok: false, reason: "Password must include an uppercase letter." };
  }
  if (!/[a-z]/.test(value)) {
    return { ok: false, reason: "Password must include a lowercase letter." };
  }
  if (!/\d/.test(value)) {
    return { ok: false, reason: "Password must include a digit." };
  }
  if (COMMON_PASSWORDS.has(value.toLowerCase())) {
    return {
      ok: false,
      reason: "That password is too common — pick something less guessable.",
    };
  }
  return { ok: true };
}

/**
 * Zod refinement for any schema that captures a Pymble password. Use as:
 *   z.object({ password: opsPasswordSchema })
 */
export const opsPasswordSchema = z
  .string()
  .superRefine((value, ctx) => {
    const result = evaluateOpsPassword(value);
    if (!result.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.reason });
    }
  });
