import { Metadata } from "next";
import ProjectsClient from "./ProjectsClient";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";
import { COMPANY, SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
    title: "Our Projects | Construction Portfolio in Zambia",
    description: "Explore Pymble Construction's portfolio of completed commercial, industrial, and infrastructure projects across Zambia, including works for Coca-Cola, UNHCR, and Rubis.",
    keywords: [
        "construction portfolio Zambia",
        "building projects Zambia",
        "civil works projects Zambia",
        "commercial construction projects Lusaka",
        "Pymble Construction projects",
    ],
    alternates: {
        canonical: "/projects",
    },
    openGraph: {
        title: "Our Projects | Construction Portfolio in Zambia",
        description: "Explore Pymble Construction's portfolio of completed commercial, industrial, and infrastructure projects across Zambia, including works for Coca-Cola, UNHCR, and Rubis.",
        url: `${SITE_URL}/projects`,
        siteName: COMPANY.name,
        type: "website",
        images: [
            {
                url: `${SITE_URL}/images/og-image.png`,
                width: 1200,
                height: 630,
                alt: `${COMPANY.name} project portfolio`,
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Our Projects | Construction Portfolio in Zambia",
        description: "Explore Pymble Construction's portfolio of completed commercial, industrial, and infrastructure projects across Zambia, including works for Coca-Cola, UNHCR, and Rubis.",
        images: [`${SITE_URL}/images/og-image.png`],
    },
};

export default function ProjectsPage() {
    return (
        <>
            <BreadcrumbSchema
                items={[
                    { name: "Home", item: "/" },
                    { name: "Portfolio", item: "/projects" }
                ]}
            />
            <ProjectsClient />
        </>
    );
}
