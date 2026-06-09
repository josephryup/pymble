export const OPS_SAFE_ACTION_ERROR_MESSAGE =
  "Could not complete this action. Try again or contact the Pymble admin team.";

const RAW_ACTION_ERROR_PATTERNS = [
  /\bPGRST\d+\b/i,
  /\bSQLSTATE\b/i,
  /\b(PostgREST|Supabase|schema cache|service role|api key|secret|token)\b/i,
  /\b(JWT|auth\.|storage\.|database error)\b/i,
  /\b(r2|s3|bucket|cloudflarestorage|aws|presign|signature|credentials)\b/i,
  /\b(relation|column|function|operator|type)\s+"?[\w.:-]+"?\s+does not exist\b/i,
  /\bduplicate key value violates unique constraint\b/i,
  /\bviolates (foreign key|not-null|check|exclusion) constraint\b/i,
  /\bnew row violates row-level security policy\b/i,
  /\b(row-level security|permission denied|invalid input syntax)\b/i,
  /\bsyntax error at or near\b/i,
  /\bdeadlock detected|could not serialize access\b/i,
  /\bnull value in column\b/i,
  /\bprepared statement .* already exists\b/i,
];

function isRawActionErrorMessage(message: string) {
  return RAW_ACTION_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function safeOpsActionErrorMessage(
  message: string | null | undefined,
  fallback = OPS_SAFE_ACTION_ERROR_MESSAGE,
) {
  const trimmed = message?.trim();

  if (!trimmed) {
    return fallback;
  }

  if (!isRawActionErrorMessage(trimmed)) {
    return trimmed;
  }

  console.error("[ops] suppressed raw action error", trimmed);
  return fallback;
}
