import { formatOpsRole } from "@/lib/ops/roles";
import type { OpsUserRole } from "@/lib/ops/types";

/**
 * A person, shown as a photo or their initials (audit §3).
 *
 * One component for every place a person appears — the shell, the activity
 * timeline, comment threads — so an avatar cannot end up looking different
 * depending on which screen you are on.
 *
 * Initials are the fallback rather than a generic silhouette: in a workspace
 * where most people will never upload a photo, a wall of identical grey
 * outlines is worse than useless, whereas initials still distinguish one
 * person from another. The background colour is derived from the name, so the
 * same person is always the same colour and the eye can track them down a
 * list without reading.
 */

const AVATAR_TONES = [
  "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
];

const SIZES = {
  sm: "size-7 text-[11px]",
  md: "size-9 text-xs",
  lg: "size-12 text-sm",
} as const;

/** First letter of the first and last word — "Joseph Mwansa Phiri" → "JP". */
export function opsAvatarInitials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

/** Stable colour per person. Deterministic, so it never changes between renders. */
export function opsAvatarTone(name: string | null | undefined): string {
  const seed = (name ?? "").split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return AVATAR_TONES[seed % AVATAR_TONES.length];
}

export function OpsAvatar({
  avatarUpdatedAt,
  hasAvatar,
  name,
  size = "md",
  userId,
}: {
  /** Cache-buster so a newly uploaded photo appears immediately. */
  avatarUpdatedAt?: string | null;
  hasAvatar?: boolean;
  name: string | null | undefined;
  size?: keyof typeof SIZES;
  userId?: string | null;
}) {
  const initials = opsAvatarInitials(name);
  const shared = `${SIZES[size]} shrink-0 rounded-full object-cover`;

  if (hasAvatar && userId) {
    const version = avatarUpdatedAt ? `?v=${encodeURIComponent(avatarUpdatedAt)}` : "";
    return (
      // Plain <img>: the source is an authenticated API route, not a static
      // asset, so next/image's optimiser cannot fetch it and would only add a
      // round trip.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        className={`${shared} border border-border bg-muted`}
        height={48}
        loading="lazy"
        src={`/api/ops/avatar/${userId}${version}`}
        width={48}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${shared} inline-flex items-center justify-center font-bold ${opsAvatarTone(name)}`}
    >
      {initials}
    </span>
  );
}

/**
 * Avatar plus name and role — the "who is this" unit used wherever a person is
 * identified. Kept together so the spacing and the role formatting stay
 * consistent instead of being re-invented per screen.
 */
export function OpsPersonBadge({
  avatarUpdatedAt,
  hasAvatar,
  name,
  role,
  size = "md",
  userId,
}: {
  avatarUpdatedAt?: string | null;
  hasAvatar?: boolean;
  name: string | null | undefined;
  role?: OpsUserRole | string | null;
  size?: keyof typeof SIZES;
  userId?: string | null;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <OpsAvatar
        avatarUpdatedAt={avatarUpdatedAt}
        hasAvatar={hasAvatar}
        name={name}
        size={size}
        userId={userId}
      />
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-foreground">
          {name || "Unnamed"}
        </span>
        {role ? (
          <span className="block truncate text-xs text-muted-foreground">
            {formatOpsRole(role)}
          </span>
        ) : null}
      </span>
    </span>
  );
}
