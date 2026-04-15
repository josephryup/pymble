import { Metadata } from "next";
import AboutClient from "./AboutClient";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";
import { COMPANY, SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
    title: "About Us | Leading Construction Company in Zambia",
    description: "Learn about Pymble Construction, a top-tier Zambian firm specializing in civil works, renovations, and infrastructure development. Our mission is excellence through integrity.",
    keywords: [
        "about Pymble Construction",
        "construction company Lusaka",
        "construction company Zambia",
        "civil works company Zambia",
        "infrastructure contractor Zambia",
    ],
    alternates: {
        canonical: "/about",
    },
    openGraph: {
        title: "About Us | Leading Construction Company in Zambia",
        description: "Learn about Pymble Construction, a top-tier Zambian firm specializing in civil works, renovations, and infrastructure development. Our mission is excellence through integrity.",
        url: `${SITE_URL}/about`,
        siteName: COMPANY.name,
        type: "website",
        images: [
            {
                url: `${SITE_URL}/images/og-image.png`,
                width: 1200,
                height: 630,
                alt: `${COMPANY.name} about page`,
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "About Us | Leading Construction Company in Zambia",
        description: "Learn about Pymble Construction, a top-tier Zambian firm specializing in civil works, renovations, and infrastructure development. Our mission is excellence through integrity.",
        images: [`${SITE_URL}/images/og-image.png`],
    },
};

export default function AboutPage() {
    return (
        <>
            <BreadcrumbSchema
                items={[
                    { name: "Home", item: "/" },
                    { name: "About Us", item: "/about" }
                ]}
            />
            <AboutClient />
        </>
    );
}
