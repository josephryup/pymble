import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SEO } from "@/lib/constants";
import { WhatsAppButton } from "@/components/ui/WhatsAppButton";
import { QuoteCTA } from "@/components/ui/QuoteCTA";

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
  title: SEO.defaultTitle,
  description: SEO.defaultDescription,
  keywords: [...SEO.keywords],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${manrope.variable} antialiased bg-white text-primary-dark font-sans selection:bg-primary-blue selection:text-white`}
      >
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
