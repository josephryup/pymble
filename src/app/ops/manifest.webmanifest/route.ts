import type { MetadataRoute } from "next";
import { OPS_BRAND } from "@/lib/ops/constants";

export const dynamic = "force-static";

export function GET() {
  const manifest: MetadataRoute.Manifest = {
    background_color: "#f6f7fb",
    categories: ["business", "productivity"],
    description: "Internal Pymble Construction operations workspace.",
    display: "standalone",
    icons: [
      {
        src: "/ops-logo.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/favicon.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/favicon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    name: `${OPS_BRAND.companyName} Operations`,
    scope: "/ops",
    short_name: OPS_BRAND.shortName,
    shortcuts: [
      {
        description: "Open the role-specific operations dashboard.",
        name: "Overview",
        short_name: "Overview",
        url: "/ops",
      },
      {
        description: "Review workflow approvals.",
        name: "Approvals",
        short_name: "Approvals",
        url: "/ops/approvals",
      },
      {
        description: "Review operations notifications.",
        name: "Notifications",
        short_name: "Alerts",
        url: "/ops/notifications",
      },
    ],
    start_url: "/ops",
    theme_color: "#2235DD",
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "content-type": "application/manifest+json",
    },
  });
}
