import { SITE_URL, COMPANY } from "@/lib/constants";
import type { Project } from "@/lib/project-data";

export function ProjectSchema({ project }: { project: Project }) {
    const projectUrl = `${SITE_URL}/projects/${project.slug}`;
    const imageUrl = project.image
        ? (project.image.startsWith("http") ? project.image : `${SITE_URL}${project.image}`)
        : `${SITE_URL}/images/og-image.png`;

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        "@id": `${projectUrl}/#project`,
        "url": projectUrl,
        "name": project.title,
        "headline": project.title,
        "description": project.description,
        "image": imageUrl,
        "creator": {
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            "name": COMPANY.name,
        },
        "provider": {
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            "name": COMPANY.name,
        },
        "about": [
            project.category,
            project.location,
            ...project.scope,
        ],
        "locationCreated": {
            "@type": "Place",
            "name": project.location,
        },
        "dateCreated": `${project.year}-01-01`,
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
    );
}
