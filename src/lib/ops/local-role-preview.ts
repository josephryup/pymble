import { OPS_PRODUCTION_ROLE_POLICY } from "@/lib/ops/role-policy";
import { formatOpsRole } from "@/lib/ops/roles";
import type { OpsUserRole } from "@/lib/ops/types";

export const OPS_LOCAL_ROLE_PREVIEW_COOKIE = "ops_local_role_preview";
export const OPS_LOCAL_ROLE_PREVIEW_MAX_AGE_SECONDS = 60 * 60 * 2;
export const OPS_LOCAL_ROLE_PREVIEW_USER_ID = "00000000-0000-4000-8000-000000000001";

export const OPS_LOCAL_ROLE_PREVIEW_OPTIONS = OPS_PRODUCTION_ROLE_POLICY.map(
  ({ label, role }) => ({ label, value: role }),
);

const OPS_LOCAL_ROLE_PREVIEW_VALUES = new Set<OpsUserRole>(
  OPS_LOCAL_ROLE_PREVIEW_OPTIONS.map((option) => option.value),
);

export function isOpsLocalRolePreviewRuntime() {
  // Require BOTH a non-production NODE_ENV AND the absence of Vercel's runtime
  // markers. The positive NODE_ENV check is the important one: it guarantees a
  // production build (next start) can never enable role impersonation + the
  // RLS-bypassing service client, even if this app is ever ported off Vercel
  // (self-host/Docker/etc.) where VERCEL/VERCEL_ENV are unset.
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.VERCEL !== "1" &&
    !process.env.VERCEL_ENV
  );
}

export function isOpsLocalRolePreviewHost(host: string | null | undefined) {
  const normalizedHost = (host ?? "").split(":")[0]?.toLowerCase();

  return (
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost === "[::1]" ||
    normalizedHost === "::1"
  );
}

export function canUseOpsLocalRolePreview(host: string | null | undefined) {
  return isOpsLocalRolePreviewRuntime() && isOpsLocalRolePreviewHost(host);
}

export function parseOpsLocalRolePreviewRole(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return OPS_LOCAL_ROLE_PREVIEW_VALUES.has(value as OpsUserRole)
    ? (value as OpsUserRole)
    : null;
}

export function buildOpsLocalRolePreviewProfile(role: OpsUserRole) {
  const label = formatOpsRole(role);

  return {
    // The preview user has no photo — initials are the fallback (audit §3).
    avatar_key: null,
    avatar_updated_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    email: "local-role-preview@pymbleconstruction.test",
    full_name: `Local Preview - ${label}`,
    id: OPS_LOCAL_ROLE_PREVIEW_USER_ID,
    is_active: true,
    phone: null,
    role,
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}
