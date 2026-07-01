import type { Metadata, Viewport } from "next";
import { OPS_BRAND } from "@/lib/ops/constants";

export const metadata: Metadata = {
  title: `${OPS_BRAND.name} | ${OPS_BRAND.companyName}`,
  description: "Internal Pymble Construction operations workspace.",
  applicationName: OPS_BRAND.name,
  manifest: "/ops/manifest.webmanifest",
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#2235DD",
  // Lets the installed PWA render edge-to-edge and exposes real
  // env(safe-area-inset-*) values (notch, Dynamic Island, home-indicator,
  // Android gesture bar) instead of always reporting 0 — every fixed/sticky
  // element in the ops shell pads against these so nothing renders under or
  // gets crowded by device chrome once installed.
  viewportFit: "cover",
};

export default function OpsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
