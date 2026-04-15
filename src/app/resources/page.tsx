import { Metadata } from "next";
import ResourcesClient from "./ResourcesClient";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";
import { COMPANY, SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
    title: "Resources | Company Profile, Brochure & Documents",
    description: `Access official ${COMPANY.name} resources including company profile documents, portfolio materials, legal pages, and brand assets.`,
    keywords: [
        `${COMPANY.name} brochure`,
        `${COMPANY.name} company profile`,
        "construction company profile Zambia",
        "construction brochure Zambia",
        "project portfolio Zambia",
    ],
    alternates: {
        canonical: "/resources",
    },
    openGraph: {
        title: "Resources | Company Profile, Brochure & Documents",
        description: `Access official ${COMPANY.name} resources including company profile documents, portfolio materials, legal pages, and brand assets.`,
        url: `${SITE_URL}/resources`,
        siteName: COMPANY.name,
        type: "website",
        images: [
            {
                url: `${SITE_URL}/images/og-image.png`,
                width: 1200,
                height: 630,
                alt: `${COMPANY.name} resources`,
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Resources | Company Profile, Brochure & Documents",
        description: `Access official ${COMPANY.name} resources including company profile documents, portfolio materials, legal pages, and brand assets.`,
        images: [`${SITE_URL}/images/og-image.png`],
    },
};

export default function ResourcesPage() {
    return (
        <>
            <BreadcrumbSchema
                items={[
                    { name: "Home", item: "/" },
                    { name: "Resources", item: "/resources" },
                ]}
            />
            <ResourcesClient />
        </>
    );
}
