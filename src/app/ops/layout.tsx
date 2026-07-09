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
  // A custom viewport export REPLACES Next's default meta viewport entirely —
  // it is not merged. Omitting width/initialScale here silently dropped
  // `width=device-width, initial-scale=1` for every /ops route, so phones fell
  // back to a ~980px virtual viewport and Tailwind sm:/md: breakpoints fired
  // on mobile (system-wide audit §1). Never remove these two fields.
  width: "device-width",
  initialScale: 1,
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
