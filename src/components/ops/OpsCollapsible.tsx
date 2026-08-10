import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { OPS_FOCUS_CLASS } from "@/lib/ops/ui";

/**
 * The workspace's disclosure control.
 *
 * There were 186 hand-rolled `<details>` across 46 ops files with at least a
 * dozen different summary treatments (2026-08-10 UI/UX audit §3). Most of the
 * inline ones neither hid the native marker nor carried a focus ring, so the
 * affordance — and keyboard visibility — changed from page to page.
 *
 * Two shapes, because the workspace genuinely has two:
 *
 *  - `panel`  — a card section that opens. Header row, body separated by a rule.
 *  - `inline` — a small disclosure inside a record row ("Certify IPC"), where
 *               the bordered box *is* the control.
 *
 * The body is rendered as-is unless `bodyClassName` is given. That is
 * deliberate: callers already control their own body layout, and a primitive
 * that also imposed padding would have to be fought on half the call sites.
 */

/** Neutral, caution, destructive — matching the notice tones. */
type OpsCollapsibleTone = "default" | "warning" | "danger";

type OpsCollapsibleProps = {
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  /** Optional leading icon, for panel headers that carry one. */
  icon?: LucideIcon;
  id?: string;
  /** Right-hand slot: counts, badges, a status pill. */
  meta?: ReactNode;
  /**
   * Start open. Drive it from a search param so the state survives the redirect
   * every server action performs — see `?open=` on /ops/site-checklists.
   */
  open?: boolean;
  title: ReactNode;
  tone?: OpsCollapsibleTone;
  variant?: "panel" | "inline";
};

const SHELL: Record<"panel" | "inline", string> = {
  panel: "group rounded-lg border border-border bg-card",
  inline: "group w-full rounded-md border p-3",
};

const SHELL_TONE: Record<OpsCollapsibleTone, string> = {
  default: "border-border",
  warning: "border-orange-200",
  danger: "border-red-100",
};

const SUMMARY: Record<"panel" | "inline", string> = {
  panel:
    "flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-4 font-heading text-base font-bold text-foreground transition hover:bg-muted/40 group-open:rounded-b-none group-open:border-b group-open:border-border",
  inline:
    "flex cursor-pointer list-none items-center gap-1.5 text-xs font-bold uppercase tracking-[0.1em] transition hover:text-foreground",
};

const SUMMARY_TONE: Record<OpsCollapsibleTone, string> = {
  default: "text-muted-foreground",
  warning: "text-orange-700",
  danger: "text-red-700",
};

export function OpsCollapsible({
  bodyClassName,
  children,
  className,
  icon: Icon,
  id,
  meta,
  open,
  title,
  tone = "default",
  variant = "inline",
}: OpsCollapsibleProps) {
  const shell = [SHELL[variant], variant === "inline" ? SHELL_TONE[tone] : "", className]
    .filter(Boolean)
    .join(" ");

  const summary = [
    SUMMARY[variant],
    variant === "inline" ? SUMMARY_TONE[tone] : "",
    // Safari still paints its own triangle unless this is spelled out.
    "[&::-webkit-details-marker]:hidden",
    OPS_FOCUS_CLASS,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <details className={shell} id={id} open={open}>
      <summary className={summary}>
        <ChevronDown
          aria-hidden="true"
          className={`${
            variant === "panel" ? "size-5" : "size-3.5"
          } shrink-0 transition-transform group-open:rotate-180`}
        />
        {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0" /> : null}
        {/* Block-level, so callers can put headings and paragraphs in a title. */}
        <div className="min-w-0 flex-1">{title}</div>
        {meta ? <div className="shrink-0">{meta}</div> : null}
      </summary>
      {bodyClassName ? <div className={bodyClassName}>{children}</div> : children}
    </details>
  );
}
