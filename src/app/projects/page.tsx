import { Metadata } from "next";
import ProjectsClient from "./ProjectsClient";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";

export const metadata: Metadata = {
    title: "Our Projects | Construction Portfolio in Zambia",
    description: "Explore Pymble Construction's portfolio of completed commercial, industrial, and infrastructure projects across Zambia, including works for Coca-Cola, UNHCR, and Rubis.",
    alternates: {
        canonical: "/projects",
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
