"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OPS_FOCUS_CLASS } from "@/lib/ops/ui";

export function OpsNavLink({
  href,
  onNavigate,
  title,
}: {
  href: string;
  onNavigate?: () => void;
  title: string;
}) {
  const pathname = usePathname();
  const isActive = href === "/ops" ? pathname === "/ops" : pathname.startsWith(href);

  return (
      <Link
        aria-current={isActive ? "page" : undefined}
        className={`flex min-h-11 items-center rounded-md px-3 py-2.5 text-sm font-semibold transition ${OPS_FOCUS_CLASS} ${
          isActive
            ? "bg-white text-primary-dark shadow-sm"
            : "text-white/78 hover:bg-white/10 hover:text-white"
        }`}
        href={href}
        onClick={onNavigate}
      >
      {title}
    </Link>
  );
}
