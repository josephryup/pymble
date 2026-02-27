/**
 * Dynamic Blog Post Page
 * ================================================
 * Renders individual blog articles based on the URL slug.
 * Content is stored as static data for now (MDX/CMS-ready).
 *
 * Route: /blog/[slug]
 *
 * TODO: When client starts producing blog content, this can
 * be connected to a headless CMS (Sanity/Contentful) or
 * switched to file-based MDX content.
 * ================================================
 */

"use client";

import { use } from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Clock, Calendar } from "lucide-react";

/**
 * Blog post content database
 * Each post contains full article body as HTML-safe paragraphs.
 * In a production CMS setup, this would be fetched from an API.
 */
const blogPostsData: Record<
    string,
    {
        title: string;
        category: string;
        date: string;
        readTime: string;
        image: string;
        content: string[];
    }
> = {
    "importance-of-quality-construction": {
        title: "The Importance of Quality Construction in Zambia's Growing Economy",
        category: "Industry Insights",
        date: "February 2026",
        readTime: "5 min read",
        image:
            "https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=2076&auto=format&fit=crop",
        content: [
            "Zambia's construction sector has been experiencing remarkable growth, driven by increased government spending on infrastructure and a growing private sector. As the nation builds its future, the quality of construction becomes paramount — not just for aesthetics, but for safety, longevity, and economic value.",
            "At Pymble Construction Limited, we've witnessed firsthand how quality construction transforms communities. Our work with government ministries, international NGOs, and commercial clients has reinforced a fundamental truth: cutting corners today creates far greater costs tomorrow.",
            "Quality construction begins with materials. We source high-grade materials that meet international standards while supporting local suppliers wherever possible. This approach ensures structural integrity while contributing to Zambia's economic ecosystem.",
            "Equally important is craftsmanship. Our teams undergo continuous training to stay current with global construction best practices. From foundation work to finishing touches, every phase of a project receives meticulous attention to detail.",
            "For government and institutional clients, quality construction means buildings that serve their purpose for decades without excessive maintenance costs. For commercial clients, it means spaces that attract tenants and maintain property values. For all our clients, it means peace of mind.",
            "As Zambia continues its growth trajectory, investing in quality construction isn't just good practice — it's essential for sustainable development. We're proud to be part of building a stronger, more resilient Zambia.",
        ],
    },
    "sustainable-building-practices": {
        title: "Sustainable Building Practices for Modern Infrastructure",
        category: "Sustainability",
        date: "January 2026",
        readTime: "4 min read",
        image:
            "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=80&w=2070&auto=format&fit=crop",
        content: [
            "Sustainability in construction is no longer optional — it's a responsibility. As Southern Africa faces the dual challenges of rapid urbanisation and climate change, the construction industry must evolve to build infrastructure that serves both people and planet.",
            "At Pymble Construction, we're integrating sustainable practices into every phase of our projects. From site selection and preparation to material sourcing and waste management, sustainability is woven into our methodology.",
            "One key area is energy-efficient design. By incorporating natural ventilation, optimal building orientation, and energy-saving systems from the planning stage, we help our clients reduce long-term operational costs while minimising environmental impact.",
            "Water management is another critical consideration in Zambia. Our projects increasingly feature rainwater harvesting systems, efficient drainage solutions, and water-recycling facilities that make the most of this precious resource.",
            "We also prioritise local material sourcing wherever possible. This reduces transport-related emissions, supports local economies, and ensures materials are suited to Zambia's specific climate and conditions.",
            "The future of construction in Zambia lies in balancing growth with responsibility. By embracing sustainable practices today, we're building infrastructure that future generations can be proud of.",
        ],
    },
    "choosing-construction-partner": {
        title: "How to Choose the Right Construction Partner for Government Projects",
        category: "Guide",
        date: "December 2025",
        readTime: "6 min read",
        image:
            "https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=2131&auto=format&fit=crop",
        content: [
            "Government and institutional construction projects carry unique challenges and requirements. From compliance with procurement regulations to managing complex stakeholder relationships, these projects demand a construction partner with specific expertise and proven experience.",
            "The first consideration should always be track record. A construction company's portfolio of completed government projects tells you more than any marketing brochure. Look for demonstrated experience with projects of similar scale and complexity to what you're planning.",
            "Compliance and certification matter significantly in government procurement. Ensure your construction partner holds all necessary certifications — ZPPA registration, PACRA compliance, Workers' Compensation coverage, and ZRA tax clearance. These aren't just bureaucratic requirements; they indicate a professionally managed operation.",
            "Financial stability is another critical factor. Government projects often involve phased payments, which means your construction partner needs the financial resilience to manage cash flow through sometimes lengthy payment cycles without compromising on quality or timelines.",
            "Communication and transparency should never be underestimated. The best construction partners provide regular progress reports, maintain open lines of communication, and flag potential issues before they become problems. In government projects, where accountability is paramount, this transparency is non-negotiable.",
            "Finally, consider the company's approach to local impact. Does the construction partner employ local workers? Do they source materials from local suppliers? Government projects should benefit the communities they serve, and a socially responsible construction partner contributes to this goal.",
            "At Pymble Construction Limited, we've built our reputation on delivering government and institutional projects that meet the highest standards of quality, compliance, and community benefit. Our experience with government ministries, NGOs, and institutional clients gives us a deep understanding of what these projects require — and how to deliver them successfully.",
        ],
    },
};

export default function BlogPostPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = use(params);
    const post = blogPostsData[slug];

    // 404 fallback — post not found
    if (!post) {
        return (
            <main className="min-h-screen bg-white flex items-center justify-center">
                <Container className="text-center py-32">
                    <h1 className="font-heading text-4xl md:text-6xl font-bold text-primary-dark mb-6">
                        Article Not Found
                    </h1>
                    <p className="text-primary-dark/60 text-lg mb-8">
                        The article you&apos;re looking for doesn&apos;t exist.
                    </p>
                    <Link
                        href="/blog"
                        className="inline-flex items-center gap-2 text-accent-orange font-medium hover:gap-3 transition-all"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Blog
                    </Link>
                </Container>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-white">
            {/* ── Article Header ── */}
            <Section className="pt-32 pb-8 md:pt-48 md:pb-12 bg-white">
                <Container>
                    {/* Back link */}
                    <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="mb-12"
                    >
                        <Link
                            href="/blog"
                            className="inline-flex items-center gap-2 text-primary-dark/40 hover:text-accent-orange transition-colors label-uppercase"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Blog
                        </Link>
                    </motion.div>

                    <div className="max-w-3xl">
                        <motion.span
                            className="label-uppercase text-accent-orange mb-4 block"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            {post.category}
                        </motion.span>

                        <motion.h1
                            className="font-heading text-3xl md:text-5xl lg:text-6xl font-bold text-primary-dark tracking-tight leading-[1.1] mb-8"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            {post.title}
                        </motion.h1>

                        {/* Article meta */}
                        <motion.div
                            className="flex items-center gap-6 text-primary-dark/40"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                        >
                            <span className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                {post.date}
                            </span>
                            <span className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                {post.readTime}
                            </span>
                        </motion.div>
                    </div>
                </Container>
            </Section>

            {/* ── Featured Image ── */}
            <Section className="pb-12 md:pb-16">
                <Container>
                    <motion.div
                        className="relative aspect-[21/9] overflow-hidden rounded-2xl bg-neutral-100"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 }}
                    >
                        <Image
                            src={post.image}
                            alt={post.title}
                            fill
                            className="object-cover"
                            priority
                        />
                    </motion.div>
                </Container>
            </Section>

            {/* ── Article Content ── */}
            <Section className="pb-20 md:pb-32">
                <Container>
                    <motion.div
                        className="max-w-3xl mx-auto"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                    >
                        <div className="prose prose-lg prose-primary-dark max-w-none">
                            {post.content.map((paragraph, i) => (
                                <p
                                    key={i}
                                    className="text-primary-dark/70 text-lg leading-relaxed mb-6 font-light"
                                >
                                    {paragraph}
                                </p>
                            ))}
                        </div>

                        {/* Article Footer — CTA */}
                        <div className="mt-16 pt-12 border-t border-black/5">
                            <div className="bg-neutral-50 rounded-2xl p-8 md:p-12 text-center">
                                <h3 className="font-heading text-2xl md:text-3xl font-bold text-primary-dark mb-4">
                                    Ready to discuss your project?
                                </h3>
                                <p className="text-primary-dark/60 mb-6 max-w-lg mx-auto">
                                    Our team is ready to help bring your construction vision to
                                    life with quality and precision.
                                </p>
                                <Link
                                    href="/contact"
                                    className="inline-flex items-center gap-2 bg-primary-dark text-white px-8 py-4 rounded-full font-medium hover:bg-black transition-colors"
                                >
                                    Contact Us
                                </Link>
                            </div>
                        </div>
                    </motion.div>
                </Container>
            </Section>
        </main>
    );
}
