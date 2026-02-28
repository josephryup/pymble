import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SEO, SITE_URL, COMPANY } from "@/lib/constants";
import { WhatsAppButton } from "@/components/ui/WhatsAppButton";
import { QuoteCTA } from "@/components/ui/QuoteCTA";
import { SchemaOrg } from "@/components/seo/SchemaOrg";
import Script from "next/script";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});
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
        {/* Ahrefs Web Analytics */}
        <Script
          src="https://analytics.ahrefs.com/analytics.js"
          data-key="yoxMRxpcS5OCp4crqDkMpw"
          strategy="afterInteractive"
        />
      </head>
      <body
        className={`${inter.variable} ${manrope.variable} antialiased bg-white text-primary-dark font-sans selection:bg-primary-blue selection:text-white`}
      >
        <SchemaOrg />
        <Header />
        {children}
        <Footer />
        {/* WhatsApp floating CTA — visible on all pages */}
        <WhatsAppButton />
        {/* "Request a Quote" floating bar — appears after scrolling */}
        <QuoteCTA />
      </body>
    </html>
  );
}
