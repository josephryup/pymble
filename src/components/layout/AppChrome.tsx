"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { Footer } from "@/components/layout/Footer";
import { GlobalFloatingWidgets } from "@/components/layout/GlobalFloatingWidgets";
import { Header } from "@/components/layout/Header";
import { SchemaOrg } from "@/components/seo/SchemaOrg";

const APP_ROUTE_PREFIXES = ["/ops", "/login"];

function isAppRoute(pathname: string) {
  return APP_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isAppRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="public-site">
      <SchemaOrg />
      <Header />
      {children}
      <Footer />
      <GlobalFloatingWidgets />
      {process.env.NODE_ENV === "production" ? (
        <Script
          src="https://analytics.ahrefs.com/analytics.js"
          data-key="yoxMRxpcS5OCp4crqDkMpw"
          strategy="lazyOnload"
        />
      ) : null}
    </div>
  );
}
