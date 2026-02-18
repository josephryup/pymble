"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import Image from "next/image";
import { Team } from "@/components/about/Team";
import { CTA } from "@/components/home/CTA";

export default function AboutPage() {
    return (
        <main className="min-h-screen bg-white">
            {/* 1. Mission Statement / Intro (Matches 'At OH Architecture...' style) */}
            <Section className="pt-32 pb-20 md:pt-48 md:pb-32 bg-white">
                <Container>
                    <div className="max-w-5xl">
                        <motion.span
                            className="label-uppercase mb-8 block text-accent-orange"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                        >
                            (Who We Are)
                        </motion.span>
                        <motion.h1
                            className="font-heading text-4xl md:text-6xl lg:text-[4rem] font-medium leading-[1.1] tracking-tight text-primary-dark mb-12"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.1 }}
                        >
                            At Pymble Construction, we create architectural solutions that are a unique expression of structure and functionality,
                            <span className="text-primary-dark/40"> vision and craftsmanship.</span>
                        </motion.h1>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mt-24">
                            <motion.div
                                className="md:col-span-5 hidden md:block"
                                initial={{ opacity: 0, scale: 0.95 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.8 }}
                            >
                                <div className="aspect-[3/4] relative overflow-hidden rounded-sm grayscale hover:grayscale-0 transition-all duration-700">
                                    <Image
                                        src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop"
                                        alt="Modern Architecture Detail"
                                        fill
                                        className="object-cover"
                                    />
                                </div>
                            </motion.div>
                            <div className="md:col-span-7 flex flex-col justify-end space-y-8">
                                <motion.p
                                    className="text-lg md:text-xl text-primary-dark/70 leading-relaxed font-light"
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.6, delay: 0.2 }}
                                >
                                    Pymble Construction Limited was founded on simple yet powerful principles: quality, integrity, and client satisfaction.
                                    We believe that every project is an opportunity to shape the skyline and improve the way people live and work.
                                </motion.p>
                                <motion.p
                                    className="text-lg md:text-xl text-primary-dark/70 leading-relaxed font-light"
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.6, delay: 0.3 }}
                                >
                                    Through expert craftsmanship and innovative solutions, we&apos;ve built a reputation as one of the region&apos;s most trusted
                                    construction partners — delivering complex bespoke projects that stand the test of time.
                                </motion.p>
                            </div>
                        </div>
                    </div>
                </Container>
            </Section>

            {/* 2. Team Section (Existing Component) */}
            <Team />

            {/* 3. Philosophy / Legacy (Text-Driven) */}
            <Section className="py-24 md:py-32 bg-neutral-50/50">
                <Container>
                    <div className="flex flex-col md:flex-row gap-16 md:gap-24">
                        <div className="md:w-1/3">
                            <span className="label-uppercase text-accent-orange mb-6 block">(Our Philosophy)</span>
                            <h2 className="font-heading text-4xl md:text-5xl font-bold text-primary-dark">
                                Focused on Quality, <br /> Driven by Integrity.
                            </h2>
                        </div>
                        <div className="md:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-16">
                            {[
                                { title: "Transparent Process", desc: "We believe trust is earned through openness. From costs to timelines, you'll never be in the dark." },
                                { title: "Precision Detail", desc: "Our obsessive attention to detail ensures that the final result isn't just a building, but a crafted experience." },
                                { title: "Safety First", desc: "Uncompromising commitment to the well-being of our team, clients, and the community in every phase." },
                                { title: "Future-Ready", desc: "Integrating sustainable practices and modern technologies to build for tomorrow, not just today." },
                            ].map((item, i) => (
                                <motion.div
                                    key={i}
                                    className="space-y-4"
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.1 }}
                                >
                                    <h3 className="font-heading text-xl font-bold text-primary-dark">{item.title}</h3>
                                    <p className="text-primary-dark/60 leading-relaxed font-light">{item.desc}</p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </Container>
            </Section>

            {/* CTA Section */}
            <CTA />
        </main>
    );
}

