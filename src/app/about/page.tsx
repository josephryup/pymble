import { Metadata } from "next";
import AboutClient from "./AboutClient";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";

export const metadata: Metadata = {
    title: "About Us | Leading Construction Company in Zambia",
    description: "Learn about Pymble Construction, a top-tier Zambian firm specializing in civil works, renovations, and infrastructure development. Our mission is excellence through integrity.",
    alternates: {
        canonical: "/about",
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
