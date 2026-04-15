import { Metadata } from "next";
import ContactClient from "./ContactClient";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";
import { COMPANY, SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
    title: "Contact Us | Get a Construction Quote in Zambia",
    description: "Ready to start your project? Contact Pymble Construction today. We're based in Lusaka and serve clients across Zambia with high-quality building and civil works.",
    keywords: [
        "contact Pymble Construction",
        "construction quote Zambia",
        "construction company contact Lusaka",
        "building contractor contact Zambia",
    ],
    alternates: {
        canonical: "/contact",
    },
    openGraph: {
        title: "Contact Us | Get a Construction Quote in Zambia",
        description: "Ready to start your project? Contact Pymble Construction today. We're based in Lusaka and serve clients across Zambia with high-quality building and civil works.",
        url: `${SITE_URL}/contact`,
        siteName: COMPANY.name,
        type: "website",
        images: [
            {
                url: `${SITE_URL}/images/og-image.png`,
                width: 1200,
                height: 630,
                alt: `${COMPANY.name} contact page`,
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Contact Us | Get a Construction Quote in Zambia",
        description: "Ready to start your project? Contact Pymble Construction today. We're based in Lusaka and serve clients across Zambia with high-quality building and civil works.",
        images: [`${SITE_URL}/images/og-image.png`],
    },
};

export default function ContactPage() {
    return (
        <>
            <BreadcrumbSchema
                items={[
                    { name: "Home", item: "/" },
                    { name: "Contact", item: "/contact" }
                ]}
            />
            <ContactClient />
        </>
    );
}
