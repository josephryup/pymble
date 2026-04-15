import { MetadataRoute } from "next";
import { SITE_UPDATED_AT, SITE_URL } from "@/lib/constants";
import { blogPosts } from "@/lib/blog-data";
import { projects } from "@/lib/project-data";
import { locations } from "@/lib/location-data";

export default function sitemap(): MetadataRoute.Sitemap {
    const staticRouteConfig = [
        { route: "", priority: 1, changeFrequency: "weekly" as const, lastModified: SITE_UPDATED_AT },
        { route: "/about", priority: 0.8, changeFrequency: "monthly" as const, lastModified: SITE_UPDATED_AT },
        { route: "/services", priority: 0.9, changeFrequency: "monthly" as const, lastModified: SITE_UPDATED_AT },
        { route: "/projects", priority: 0.9, changeFrequency: "weekly" as const, lastModified: SITE_UPDATED_AT },
        { route: "/blog", priority: 0.8, changeFrequency: "weekly" as const, lastModified: SITE_UPDATED_AT },
        { route: "/contact", priority: 0.8, changeFrequency: "monthly" as const, lastModified: SITE_UPDATED_AT },
        { route: "/privacy", priority: 0.3, changeFrequency: "yearly" as const, lastModified: SITE_UPDATED_AT },
        { route: "/terms", priority: 0.3, changeFrequency: "yearly" as const, lastModified: SITE_UPDATED_AT },
        { route: "/resources", priority: 0.6, changeFrequency: "monthly" as const, lastModified: SITE_UPDATED_AT },
    ];

    const routes = staticRouteConfig.map(({ route, priority, changeFrequency, lastModified }) => ({
        url: `${SITE_URL}${route}`,
        lastModified,
        changeFrequency,
        priority,
    }));

    const blogRoutes = blogPosts.map((post) => ({
        url: `${SITE_URL}/blog/${post.slug}`,
        lastModified: post.publishDate,
        changeFrequency: "weekly" as const,
        priority: 0.7,
    }));

    const projectRoutes = projects.map((project) => ({
        url: `${SITE_URL}/projects/${project.slug}`,
        lastModified: `${project.year}-12-31T00:00:00+02:00`,
        changeFrequency: "monthly" as const,
        priority: 0.8,
    }));

    const locationRoutes = locations.map((loc) => ({
        url: `${SITE_URL}/locations/${loc.slug}`,
        lastModified: SITE_UPDATED_AT,
        changeFrequency: "monthly" as const,
        priority: 0.7,
    }));

    return [...routes, ...blogRoutes, ...projectRoutes, ...locationRoutes];
}
