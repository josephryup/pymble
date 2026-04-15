import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBlogPost, blogPosts } from "@/lib/blog-data";
import BlogPostClient from "./BlogPostClient";
import { BlogSchema } from "@/components/seo/BlogSchema";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";
import { SITE_URL } from "@/lib/constants";

type Props = {
    params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
    return blogPosts.map((post) => ({
        slug: post.slug,
    }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const post = getBlogPost(slug);

    if (!post) return { title: "Post Not Found" };

    return {
        title: post.title,
        description: post.excerpt,
        authors: [{ name: post.author.name }],
        keywords: [post.category, "construction blog", "Zambia construction", post.title],
        alternates: {
            canonical: `/blog/${slug}`,
        },
        openGraph: {
            title: post.title,
            description: post.excerpt,
            type: "article",
            url: `${SITE_URL}/blog/${slug}`,
            siteName: "Pymble Construction",
            publishedTime: post.publishDate,
            authors: [post.author.name],
            images: [
                {
                    url: post.image,
                    width: 1200,
                    height: 630,
                    alt: post.title,
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            title: post.title,
            description: post.excerpt,
            images: [post.image],
        },
    };
}

export default async function BlogPostPage({ params }: Props) {
    const { slug } = await params;
    const post = getBlogPost(slug);

    if (!post) {
        notFound();
    }

    return (
        <>
            <BreadcrumbSchema
                items={[
                    { name: "Home", item: "/" },
                    { name: "Blog", item: "/blog" },
                    { name: post.title, item: `/blog/${slug}` }
                ]}
            />
            <BlogSchema post={post} />
            <BlogPostClient post={post} />
        </>
    );
}
