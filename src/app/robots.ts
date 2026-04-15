import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                disallow: ["/api/", "/_next/"],
            },
            {
                userAgent: "Googlebot",
                allow: "/",
                disallow: ["/api/", "/_next/"],
            },
            {
                userAgent: "OAI-SearchBot",
                allow: "/",
                disallow: ["/api/", "/_next/"],
            },
            {
                userAgent: "GPTBot",
                allow: "/",
                disallow: ["/api/", "/_next/"],
            },
            {
                userAgent: "Claude-SearchBot",
                allow: "/",
                disallow: ["/api/", "/_next/"],
            },
            {
                userAgent: "ClaudeBot",
                allow: "/",
                disallow: ["/api/", "/_next/"],
            },
            {
                userAgent: "Google-Extended",
                allow: "/",
                disallow: ["/api/", "/_next/"],
            },
            {
                userAgent: "CCBot",
                allow: "/",
                disallow: ["/api/", "/_next/"],
            },
        ],
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
    };
}
