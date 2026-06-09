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
};

export default function OpsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
