"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { OPS_FOCUS_CLASS } from "@/lib/ops/ui";

export function OpsNavLink({
  badge,
  href,
  icon: Icon,
  onNavigate,
  title,
}: {
  badge?: number;
  href: string;
  icon?: LucideIcon;
  onNavigate?: () => void;
  title: string;
}) {
  const pathname = usePathname();
  const isActive = href === "/ops" ? pathname === "/ops" : pathname.startsWith(href);
  const showBadge = typeof badge === "number" && badge > 0;

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={`flex min-h-10 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold transition ${OPS_FOCUS_CLASS} ${
        isActive
          ? "bg-primary/10 text-primary shadow-sm shadow-foreground/5"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
      href={href}
      onClick={onNavigate}
    >
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {showBadge ? (
        <span
          aria-label={`${badge} unread`}
          className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-black leading-none text-primary-foreground"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}
