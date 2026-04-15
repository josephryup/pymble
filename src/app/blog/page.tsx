import { Metadata } from "next";
import BlogClient from "./BlogClient";
import { COMPANY, SITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
    title: "Blog & Insights | Pymble Construction Zambia",
    description: "Stay updated with the latest in the Zambian construction industry. Expert insights, project highlights, and infrastructure development news from the Pymble team.",
    keywords: [
        "construction blog Zambia",
        "construction insights Zambia",
        "infrastructure news Zambia",
        "building industry blog Zambia",
        "Pymble Construction blog",
    ],
    alternates: {
        canonical: "/blog",
    },
    openGraph: {
        title: "Blog & Insights | Pymble Construction Zambia",
        description: "Stay updated with the latest in the Zambian construction industry. Expert insights, project highlights, and infrastructure development news from the Pymble team.",
        url: `${SITE_URL}/blog`,
        siteName: COMPANY.name,
        type: "website",
        images: [
            {
                url: `${SITE_URL}/images/og-image.png`,
                width: 1200,
                height: 630,
                alt: `${COMPANY.name} blog`,
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Blog & Insights | Pymble Construction Zambia",
        description: "Stay updated with the latest in the Zambian construction industry. Expert insights, project highlights, and infrastructure development news from the Pymble team.",
        images: [`${SITE_URL}/images/og-image.png`],
    },
};

export default function BlogPage() {
    return <BlogClient />;
}
