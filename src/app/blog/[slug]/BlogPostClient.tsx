"use client";

import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Clock, Calendar } from "lucide-react";
import type { BlogPost } from "@/lib/blog-data";

export default function BlogPostClient({ post }: { post: BlogPost }) {
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

                        <h1 className="font-heading text-3xl md:text-5xl lg:text-6xl font-bold text-primary-dark tracking-tight leading-[1.1] mb-8">
                            {post.title}
                        </h1>

                        {/* Article meta */}
                        <motion.div
                            className="flex flex-wrap items-center gap-y-4 gap-x-8 text-primary-dark/40"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                        >
                            {/* Author */}
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-neutral-200 overflow-hidden relative border border-black/5">
                                    {post.author.image ? (
                                        <Image
                                            src={post.author.image}
                                            alt={post.author.name}
                                            fill
                                            className="object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-primary-dark/40 bg-neutral-100">
                                            {post.author.name.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-primary-dark leading-tight">{post.author.name}</span>
                                    <span className="text-[10px] uppercase tracking-wider text-accent-orange font-bold font-mono">{post.author.role}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-6">
                                <span className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    {post.date}
                                </span>
                                <span className="flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    {post.readTime}
                                </span>
                            </div>
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
