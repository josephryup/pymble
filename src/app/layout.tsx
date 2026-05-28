import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { SEO, SITE_URL, COMPANY } from "@/lib/constants";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";
import { AppChrome } from "@/components/layout/AppChrome";

/**
 * Root metadata — SEO defaults for the entire site.
 * Values sourced from lib/constants.ts for consistency.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SEO.defaultTitle,
    template: SEO.titleTemplate,
  },
  description: SEO.defaultDescription,
  keywords: [...SEO.keywords],
  authors: [{ name: SEO.author }],
  creator: SEO.author,
  publisher: SEO.author,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
  openGraph: {
    title: SEO.defaultTitle,
    description: SEO.defaultDescription,
    url: SITE_URL,
    siteName: SEO.siteName,
    locale: SEO.locale,
    type: "website",
    images: [
      {
        url: "/images/og-image.png",
        width: 1200,
        height: 630,
        alt: COMPANY.name,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SEO.defaultTitle,
    description: SEO.defaultDescription,
    images: ["/images/og-image.png"],
    creator: SEO.twitterHandle,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {process.env.NODE_ENV === "production" && (
          <Script
            src="https://analytics.ahrefs.com/analytics.js"
            data-key="yoxMRxpcS5OCp4crqDkMpw"
            strategy="lazyOnload"
          />
        )}
      </head>
      <body
        className="antialiased bg-white text-primary-dark font-sans selection:bg-primary-blue selection:text-white"
      >
        <AppChrome>{children}</AppChrome>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
