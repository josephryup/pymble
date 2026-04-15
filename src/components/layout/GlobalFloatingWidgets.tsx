"use client";

import dynamic from "next/dynamic";

const WhatsAppButton = dynamic(
    () => import("@/components/ui/WhatsAppButton").then((mod) => mod.WhatsAppButton),
    { ssr: false }
);

const QuoteCTA = dynamic(
    () => import("@/components/ui/QuoteCTA").then((mod) => mod.QuoteCTA),
    { ssr: false }
);

export function GlobalFloatingWidgets() {
    return (
        <>
            <WhatsAppButton />
            <QuoteCTA />
        </>
    );
}
