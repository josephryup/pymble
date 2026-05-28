import type { Metadata } from "next";
import { OPS_BRAND } from "@/lib/ops/constants";

export const metadata: Metadata = {
  title: `${OPS_BRAND.name} | ${OPS_BRAND.companyName}`,
  description: "Internal Pymble Construction operations workspace.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function OpsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
