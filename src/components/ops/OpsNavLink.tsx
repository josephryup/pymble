"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { OPS_FOCUS_CLASS } from "@/lib/ops/ui";

export function OpsNavLink({
  href,
  icon: Icon,
  onNavigate,
  title,
}: {
  href: string;
  icon?: LucideIcon;
  onNavigate?: () => void;
  title: string;
}) {
  const pathname = usePathname();
  const isActive = href === "/ops" ? pathname === "/ops" : pathname.startsWith(href);

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={`flex min-h-10 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold transition ${OPS_FOCUS_CLASS} ${
        isActive
          ? "bg-primary/10 text-primary shadow-sm shadow-primary-dark/5"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
      href={href}
      onClick={onNavigate}
    >
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
      <span className="min-w-0 truncate">{title}</span>
    </Link>
  );
}
