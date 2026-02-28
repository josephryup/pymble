import { SITE_URL, COMPANY } from "@/lib/constants";
import { BlogPost } from "@/lib/blog-data";

interface BlogSchemaProps {
    post: BlogPost;
}

export function BlogSchema({ post }: BlogSchemaProps) {
    const postUrl = `${SITE_URL}/blog/${post.slug}`;

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "@id": `${postUrl}/#post`,
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": postUrl
        },
        "headline": post.title,
        "description": post.excerpt,
        "image": post.image.startsWith('http') ? post.image : `${SITE_URL}${post.image}`,
        "datePublished": post.publishDate,
        "dateModified": post.publishDate,
        "author": {
            "@type": "Person",
            "@id": `${SITE_URL}/about/#founder`,
            "name": post.author.name,
            "jobTitle": post.author.role,
            "url": `${SITE_URL}/about`
        },
        "publisher": {
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            "name": COMPANY.name,
            "logo": {
                "@type": "ImageObject",
                "url": `${SITE_URL}/logo.png`
            }
        },
        "keywords": [post.category, "Construction Zambia", "Zambian Building Industry"],
        "articleSection": post.category
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
    );
}
