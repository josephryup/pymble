import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Only enable in production builds — dev gets HMR and dev-tools instead.
  disable: process.env.NODE_ENV !== "production",
});

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async headers() {
    return [
      {
        // Baseline security headers for the whole origin.
        //
        // These are duplicated from applyBaselineSecurityHeaders in
        // src/proxy.ts ON PURPOSE, and this config is the copy that is meant
        // to survive. The proxy currently runs on every request — including
        // immutable static assets and pages the CDN serves from cache — which
        // is the single largest source of Vercel Fluid invocations in this
        // project. Setting them here, where Vercel applies them at the edge
        // for zero compute, is what makes it safe to stop running a Node
        // function purely to attach four headers.
        //
        // Both layers set identical values, so the changeover has no window
        // where the origin is unprotected. Do not remove this block when the
        // proxy matcher is narrowed — narrowing it is the whole point.
        source: "/:path*",
        headers: [
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
        ],
      },
      {
        source: "/:path*.(jpg|jpeg|png|webp|avif|svg|gif|ico)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/:path*.(mp4|webm|pdf)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(withSerwist(nextConfig), {
  // Sentry Organization + project. Override via env vars in CI if these
  // ever change. Wizard-equivalent settings — see `docs/sentry-setup.md`.
  org: process.env.SENTRY_ORG ?? "joseph-5u",
  project: process.env.SENTRY_PROJECT ?? "pymble-ops",

  // SENTRY_AUTH_TOKEN must be set in the CI environment for source maps to
  // upload during the production build. In dev / local builds the upload is
  // skipped silently.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Print upload + injection notices in CI logs only; suppress locally.
  silent: !process.env.CI,

  // Bypass ad-blockers that swallow requests to *.sentry.io by tunnelling
  // events through our own /monitoring path. Vercel proxies it onward.
  tunnelRoute: "/monitoring",

  // Upload source maps for both client and edge runtimes; also widen the
  // upload to catch chunks that the default glob misses.
  widenClientFileUpload: true,

  sourcemaps: {
    disable: false,
  },
});
