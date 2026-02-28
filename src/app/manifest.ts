import { MetadataRoute } from "next";
import { COMPANY, SITE_URL } from "@/lib/constants";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: COMPANY.name,
        short_name: "Pymble",
        description: COMPANY.description,
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0a192f", // Primary dark blue
        icons: [
            {
                src: "/favicon.png",
                sizes: "any",
                type: "image/png",
            },
            {
                src: "/favicon.png",
                sizes: "192x192",
                type: "image/png",
            },
            {
                src: "/favicon.png",
                sizes: "512x512",
                type: "image/png",
            },
        ],
    };
}
