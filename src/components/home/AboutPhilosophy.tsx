"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import Image from "next/image";

export function AboutPhilosophy() {
    const containerRef = useRef(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start end", "end start"],
    });

    const y = useTransform(scrollYProgress, [0, 1], ["-10%", "10%"]);

    return (
        <Section className="bg-primary-dark text-white overflow-hidden" ref={containerRef}>
            <Container>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
                    <motion.div
                        className="relative order-2 lg:order-1"
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 1.2 }}
                    >
                        <div className="relative aspect-[4/5] w-full max-w-lg mx-auto overflow-hidden rounded-2xl shadow-2xl">
                            <motion.div style={{ y }} className="absolute inset-0 scale-110">
                                <Image
                                    src="/images/work is workship.jpg"
                                    alt="Technical Excellence"
                                    fill
                                    className="object-cover"
                                />
                            </motion.div>
                            {/* Monochromatic Overlay */}
                            <div className="absolute inset-0 bg-primary-dark/20 mix-blend-multiply" />
                        </div>
                    </motion.div>

                    <div className="order-1 lg:order-2 space-y-8">
                        <motion.span
                            className="label-uppercase text-accent-orange mb-6 block"
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                        >
                            Our Philosophy
                        </motion.span>

                        <motion.h2
                            className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold leading-tight"
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                        >
                            Redefining <br /> standards.
                        </motion.h2>

                        <motion.div
                            className="space-y-6 text-white/70 text-body"
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.4 }}
                        >
                            <p>
                                Modern solutions for modern challenges. We embrace innovative technology and sustainable building
                                practices to ensure that every structure represents the peak of technical excellence.
                            </p>
                            <p>
                                Our expertise-driven approach means we anticipate challenges before they arise,
                                providing surgical precision in execution from the initial site visit to the final handover.
                            </p>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.6 }}
                        >
                            <a href="/about" className="label-uppercase text-accent-orange border-b border-accent-orange/20 pb-1 hover:border-accent-orange transition-all">
                                Read Our Story
                            </a>
                        </motion.div>
                    </div>
                </div>
            </Container>
        </Section>
    );
}
