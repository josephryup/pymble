"use client";

import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, MapPin, Calendar, User, CheckCircle2, Building2 } from "lucide-react";
import type { Project } from "@/lib/project-data";

export default function ProjectDetailClient({ project }: { project: Project }) {
    return (
        <main className="min-h-screen bg-white">
            {/* ── Project Hero ── */}
            <Section className="pt-32 pb-16 md:pt-48 md:pb-24 bg-primary-dark text-white relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 pointer-events-none">
                    <div className="absolute right-0 top-0 w-[600px] h-[600px] bg-accent-orange/20 blur-[150px] rounded-full" />
                </div>

                <Container className="relative z-10">
                    <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="mb-12"
                    >
                        <Link
                            href="/projects"
                            className="inline-flex items-center gap-2 text-white/40 hover:text-accent-orange transition-colors label-uppercase group"
                        >
                            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                            Back to Portfolio
                        </Link>
                    </motion.div>

                    <div className="max-w-4xl">
                        <motion.span
                            className="label-uppercase text-accent-orange mb-6 block"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            {project.category} Project
                        </motion.span>
                        <motion.h1
                            className="font-heading text-4xl md:text-7xl lg:text-8xl font-bold leading-[0.9] tracking-tighter mb-12"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            {project.title}
                        </motion.h1>

                        {/* Project Info Bar */}
                        <motion.div
                            className="grid grid-cols-2 md:grid-cols-4 gap-8 pt-12 border-t border-white/10"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                        >
                            <div className="space-y-1">
                                <span className="label-uppercase text-white/30 text-[10px] flex items-center gap-2">
                                    <MapPin className="w-3 h-3 text-accent-orange" /> Location
                                </span>
                                <p className="font-medium text-sm md:text-base">{project.location}</p>
                            </div>
                            <div className="space-y-1">
                                <span className="label-uppercase text-white/30 text-[10px] flex items-center gap-2">
                                    <Calendar className="w-3 h-3 text-accent-orange" /> Year
                                </span>
                                <p className="font-medium text-sm md:text-base text-nowrap">{project.year}</p>
                            </div>
                            <div className="space-y-1">
                                <span className="label-uppercase text-white/30 text-[10px] flex items-center gap-2">
                                    <User className="w-3 h-3 text-accent-orange" /> Client
                                </span>
                                <p className="font-medium text-sm md:text-base">{project.client}</p>
                            </div>
                            <div className="space-y-1">
                                <span className="label-uppercase text-white/30 text-[10px] flex items-center gap-2">
                                    <Building2 className="w-3 h-3 text-accent-orange" /> Type
                                </span>
                                <p className="font-medium text-sm md:text-base">{project.category}</p>
                            </div>
                        </motion.div>
                    </div>
                </Container>
            </Section>

            {/* ── Featured Image/Video ── */}
            <Section className="py-0 -mt-12 md:-mt-20">
                <Container>
                    <motion.div
                        className="relative aspect-[16/9] md:aspect-[21/9] overflow-hidden rounded-3xl shadow-2xl bg-neutral-100"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4 }}
                    >
                        {project.video ? (
                            <video
                                src={project.video}
                                autoPlay
                                loop
                                muted
                                playsInline
                                poster={project.poster}
                                className="absolute inset-0 w-full h-full object-cover"
                            />
                        ) : project.image ? (
                            <Image
                                src={project.image}
                                alt={project.title}
                                fill
                                className="object-cover"
                                priority
                                sizes="(max-width: 768px) 100vw, (max-width: 1216px) 100vw, 1216px"
                            />
                        ) : null}
                    </motion.div>
                </Container>
            </Section>

            {/* ── Content Section ── */}
            <Section className="py-20 md:py-32">
                <Container>
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 md:gap-24">
                        {/* Description */}
                        <div className="lg:col-span-7 space-y-8">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                            >
                                <h2 className="font-heading text-3xl md:text-4xl font-bold text-primary-dark mb-6 tracking-tight">
                                    Project Overview
                                </h2>
                                <p className="text-primary-dark/70 text-lg md:text-xl leading-relaxed font-light">
                                    {project.description}
                                </p>
                            </motion.div>

                            {project.challenges && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                >
                                    <h3 className="font-heading text-2xl font-bold text-primary-dark mb-4">
                                        The Challenge
                                    </h3>
                                    <p className="text-primary-dark/60 leading-relaxed">
                                        {project.challenges}
                                    </p>
                                </motion.div>
                            )}
                        </div>

                        {/* Project Scope/Checklist */}
                        <motion.div
                            className="lg:col-span-5 bg-neutral-50 rounded-3xl p-8 md:p-12"
                            initial={{ opacity: 0, x: 20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            <h3 className="font-heading text-2xl font-bold text-primary-dark mb-8 tracking-tight">
                                Our Scope of Work
                            </h3>
                            <ul className="space-y-4">
                                {project.scope.map((item, i) => (
                                    <li key={i} className="flex items-start gap-4 text-primary-dark/70 border-b border-black/5 pb-4 last:border-0">
                                        <CheckCircle2 className="w-5 h-5 text-accent-orange flex-shrink-0 mt-0.5" />
                                        <span className="text-sm md:text-base font-medium">{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </motion.div>
                    </div>
                </Container>
            </Section>

            {/* ── Gallery Loop (If multiple images) ── */}
            {project.gallery && project.gallery.length > 1 && (
                <Section className="pb-20 md:pb-32">
                    <Container>
                        <h2 className="font-heading text-3xl font-bold text-primary-dark mb-12 tracking-tight">Project Gallery</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {project.gallery.map((img, i) => (
                                <motion.div
                                    key={i}
                                    className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-neutral-100"
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                >
                                    <Image
                                        src={img}
                                        alt={`${project.title} - Gallary ${i + 1}`}
                                        fill
                                        className="object-cover hover:scale-105 transition-transform duration-700"
                                        sizes="(max-width: 768px) 100vw, 600px"
                                    />
                                </motion.div>
                            ))}
                        </div>
                    </Container>
                </Section>
            )}

            {/* ── Project CTA ── */}
            <Section className="py-20 md:py-32 bg-primary-dark text-white text-center">
                <Container>
                    <h2 className="font-heading text-4xl md:text-6xl font-bold tracking-tighter mb-8">
                        Inspired by this vision?
                    </h2>
                    <p className="text-white/60 text-lg md:text-xl max-w-xl mx-auto mb-10">
                        Let&apos;s talk about how we can deliver the same level of excellence for your next infrastructure or commercial project.
                    </p>
                    <Link
                        href="/contact"
                        className="inline-flex items-center gap-2 bg-accent-orange hover:bg-amber-600 text-primary-dark px-10 py-4 rounded-full font-bold transition-all group"
                    >
                        Start Your Project
                        <ArrowLeft className="w-4 h-4 rotate-180 group-hover:translate-x-1 transition-transform" />
                    </Link>
                </Container>
            </Section>
        </main>
    );
}
