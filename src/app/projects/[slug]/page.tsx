import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectBySlug, projects } from "@/lib/project-data";
import ProjectDetailClient from "./ProjectDetailClient";
import { SITE_URL } from "@/lib/constants";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";

type Props = {
    params: Promise<{ slug: string }>;
};

/** Ensure all project pages are pre-rendered at build time */
export async function generateStaticParams() {
    return projects.map((project) => ({
        slug: project.slug,
    }));
}

/** Dynamic metadata for project-specific SEO */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const project = getProjectBySlug(slug);

    if (!project) return { title: "Project Not Found" };

    const description = project.description.slice(0, 160);

    return {
        title: `${project.title} | Pymble Construction Zambia`,
        description: description,
        alternates: {
            canonical: `/projects/${slug}`,
        },
        openGraph: {
            title: project.title,
            description: description,
            url: `${SITE_URL}/projects/${slug}`,
            siteName: "Pymble Construction",
            type: "article",
            images: [
                {
                    url: project.image?.startsWith('http') ? project.image : `${SITE_URL}${project.image || '/images/og-image.png'}`,
                    width: 1200,
                    height: 630,
                    alt: project.title,
                }
            ]
        },
        twitter: {
            card: "summary_large_image",
            title: project.title,
            description: description,
            images: [project.image?.startsWith('http') ? project.image : `${SITE_URL}${project.image || '/images/og-image.png'}`],
        }
    };
}

export default async function ProjectPage({ params }: Props) {
    const { slug } = await params;
    const project = getProjectBySlug(slug);

    if (!project) {
        notFound();
    }

    return (
        <>
            <BreadcrumbSchema
                items={[
                    { name: "Home", item: "/" },
                    { name: "Portfolio", item: "/projects" },
                    { name: project.title, item: `/projects/${slug}` }
                ]}
            />
            <ProjectDetailClient project={project} />
        </>
    );
}
