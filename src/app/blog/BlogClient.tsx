"use client";

import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Clock } from "lucide-react";
import { NewsletterSignup } from "@/components/ui/NewsletterSignup";
import { blogPosts } from "@/lib/blog-data";

export default function BlogClient() {
    return (
        <main className="min-h-screen bg-white">
            {/* ── Hero Section ── */}
            <Section className="pt-32 pb-16 md:pt-48 md:pb-24 bg-white">
                <Container>
                    <motion.span
                        className="label-uppercase mb-8 block text-accent-orange"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        Insights / Articles
                    </motion.span>
                    <h1 className="font-heading text-5xl md:text-7xl lg:text-8xl font-bold leading-[0.9] tracking-tighter text-primary-dark mb-8">
                        Blog.
                    </h1>
                    <motion.p
                        className="text-primary-dark/60 text-lg md:text-xl max-w-2xl leading-relaxed"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        Industry insights, project updates, and expert perspectives from the
                        Pymble Construction team.
                    </motion.p>
                </Container>
            </Section>

            {/* ── Blog Posts Grid ── */}
            <Section className="pb-20 md:pb-32 bg-white">
                <Container>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
                        {blogPosts.map((post, index) => (
                            <motion.article
                                key={post.id}
                                className="group cursor-pointer"
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                            >
                                <Link href={`/blog/${post.slug}`}>
                                    {/* Image */}
                                    <div className="relative aspect-[3/2] overflow-hidden rounded-2xl mb-6 bg-neutral-100">
                                        <Image
                                            src={post.image}
                                            alt={post.title}
                                            fill
                                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                                        />
                                        {/* Category badge */}
                                        <div className="absolute top-4 left-4">
                                            <span className="bg-white/90 backdrop-blur-sm text-primary-dark text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full">
                                                {post.category}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Content */}
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3 text-primary-dark/40">
                                            <span className="label-uppercase text-[10px]">{post.date}</span>
                                            <span className="w-1 h-1 rounded-full bg-current" />
                                            <span className="flex items-center gap-1 label-uppercase text-[10px]">
                                                <Clock className="w-3 h-3" />
                                                {post.readTime}
                                            </span>
                                        </div>

                                        <h2 className="font-heading text-xl md:text-2xl font-bold text-primary-dark tracking-tight group-hover:text-accent-orange transition-colors leading-tight">
                                            {post.title}
                                        </h2>

                                        <p className="text-primary-dark/50 text-sm leading-relaxed line-clamp-3">
                                            {post.excerpt}
                                        </p>

                                        <div className="flex items-center gap-2 text-accent-orange pt-2">
                                            <span className="label-uppercase text-[10px]">Read Article</span>
                                            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                        </div>
                                    </div>
                                </Link>
                            </motion.article>
                        ))}
                    </div>

                    {/* Coming Soon notice */}
                    <motion.div
                        className="text-center mt-16 pt-16 border-t border-black/5"
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                    >
                        <p className="text-primary-dark/40 text-lg font-heading">
                            More articles coming soon.
                        </p>
                    </motion.div>
                </Container>
            </Section>

            {/* ── Newsletter Signup Section ── */}
            <NewsletterSignup
                variant="section"
                heading="Stay In The Loop"
                description="Get construction insights, project highlights, and industry news delivered straight to your inbox."
            />
        </main>
    );
}
