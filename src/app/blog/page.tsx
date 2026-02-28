import { Metadata } from "next";
import BlogClient from "./BlogClient";

export const metadata: Metadata = {
    title: "Blog & Insights | Pymble Construction Zambia",
    description: "Stay updated with the latest in the Zambian construction industry. Expert insights, project highlights, and infrastructure development news from the Pymble team.",
    alternates: {
        canonical: "/blog",
    },
};

export default function BlogPage() {
    return <BlogClient />;
}
