import { Metadata } from "next";
import ServicesClient from "./ServicesClient";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";
import { SERVICES, SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
    title: "Our Services | Pymble Construction Zambia",
    description: "Explore our comprehensive construction services in Zambia: building construction, civil engineering, renovations, and infrastructure development. Quality-driven results for every project.",
    keywords: [
        "construction services Zambia",
        "building construction Lusaka",
        "civil works Zambia",
        "infrastructure development Zambia",
        "renovation services Zambia",
    ],
    alternates: {
        canonical: "/services",
    },
    openGraph: {
        title: "Our Services | Pymble Construction Zambia",
        description: "Explore our comprehensive construction services in Zambia: building construction, civil engineering, renovations, and infrastructure development. Quality-driven results for every project.",
        url: `${SITE_URL}/services`,
        siteName: "Pymble Construction",
        type: "website",
        images: [
            {
                url: `${SITE_URL}/images/og-image.png`,
                width: 1200,
                height: 630,
                alt: "Pymble Construction services",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Our Services | Pymble Construction Zambia",
        description: "Explore our comprehensive construction services in Zambia: building construction, civil engineering, renovations, and infrastructure development. Quality-driven results for every project.",
        images: [`${SITE_URL}/images/og-image.png`],
    },
};

export default function ServicesPage() {
    const serviceListSchema = {
        "@context": "https://schema.org",
        "@type": "Service",
        "name": "Construction Services",
        "serviceType": "Building and Civil Works",
        "provider": {
            "@type": "LocalBusiness",
            "name": "Pymble Construction Limited",
            "url": SITE_URL
        },
        "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": "Construction Services Catalog",
            "itemListElement": SERVICES.map((service) => ({
                "@type": "Offer",
                "itemOffered": {
                    "@type": "Service",
                    "name": service.title,
                    "description": service.description
                }
            }))
        }
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceListSchema) }}
            />
            <BreadcrumbSchema
                items={[
                    { name: "Home", item: "/" },
                    { name: "Services", item: "/services" }
                ]}
            />
            <ServicesClient />
        </>
    );
}
