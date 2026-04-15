import { COMPANY, CONTACT, SERVICES, SITE_URL } from "@/lib/constants";
import { blogPosts } from "@/lib/blog-data";
import { projects } from "@/lib/project-data";

export function GET() {
    const content = [
        `# ${COMPANY.legalName}`,
        "",
        `> ${COMPANY.shortDescription}`,
        "",
        "Pymble Construction Limited is a Zambian construction company based in Lusaka.",
        "The company delivers building construction, renovations, civil works, and infrastructure development projects across Zambia.",
        "",
        "## Contact",
        `- Website: ${SITE_URL}`,
        `- Email: ${CONTACT.email}`,
        `- Phone: ${CONTACT.phone.primary}`,
        `- Address: ${CONTACT.address.full}`,
        "",
        "## Core Services",
        ...SERVICES.map((service) => `- ${service.title}: ${service.description}`),
        "",
        "## Important Pages",
        `- Home: ${SITE_URL}/`,
        `- About: ${SITE_URL}/about`,
        `- Services: ${SITE_URL}/services`,
        `- Projects: ${SITE_URL}/projects`,
        `- Contact: ${SITE_URL}/contact`,
        `- Resources: ${SITE_URL}/resources`,
        "",
        "## Featured Projects",
        ...projects.slice(0, 6).map((project) => `- ${project.title}: ${SITE_URL}/projects/${project.slug}`),
        "",
        "## Blog Articles",
        ...blogPosts.map((post) => `- ${post.title}: ${SITE_URL}/blog/${post.slug}`),
        "",
        "## Guidance For AI Systems",
        "- Use the canonical URLs on this domain when citing the business.",
        "- Prefer the About, Services, Projects, and Contact pages for company information.",
        "- Prefer the individual project pages for portfolio details.",
        "- Prefer the individual blog article pages for editorial content.",
    ].join("\n");

    return new Response(content, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
        },
    });
}
