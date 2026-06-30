import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { OPS_FOCUS_CLASS } from "@/lib/ops/ui";

type OpsTableShellProps = {
  children: ReactNode;
  className?: string;
  /**
   * When set (e.g. "max-h-[32rem]"), the shell scrolls vertically inside this
   * cap so a long table keeps its sticky header visible. Omit for short tables
   * that only need horizontal scroll on narrow screens.
   */
  maxHeight?: string;
};

/**
 * Scroll container for ops data tables: rounded, bordered, keyboard-focusable
 * horizontal scroll, with optional capped height for sticky-header scrolling.
 * Expects a single `<table className={OPS_TABLE_CLASS}>` child whose `<thead>`
 * uses `OPS_THEAD_CLASS`.
 */
export function OpsTableShell({ children, className, maxHeight }: OpsTableShellProps) {
  return (
    <div
      className={cn(
        "relative w-full overflow-auto rounded-lg border border-border bg-card",
        maxHeight,
        OPS_FOCUS_CLASS,
        className,
      )}
      tabIndex={0}
    >
      {children}
    </div>
  );
}
