"use client";

import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import Image from "next/image";
import { Team } from "@/components/about/Team";
import { CTA } from "@/components/home/CTA";
import { VISION_MISSION, REGIONS } from "@/lib/constants";

export default function AboutClient() {
    return (
        <main className="min-h-screen bg-white">
            {/* 1. Mission Statement / Intro — uses official brochure copy */}
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
                        <h1 className="font-heading text-4xl md:text-6xl lg:text-[4rem] font-medium leading-[1.1] tracking-tight text-primary-dark mb-12">
                            We deliver high-quality construction services that meet client expectations through{" "}
                            <span className="text-primary-dark/40">professionalism, integrity, and excellence.</span>
                        </h1>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mt-24">
                            <motion.div
                                className="md:col-span-5 relative"
                                initial={{ opacity: 0, scale: 0.95 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.8 }}
                            >
                                <div className="aspect-[3/4] relative overflow-hidden rounded-sm grayscale hover:grayscale-0 transition-all duration-700">
                                    <Image
                                        src="/images/pymble_office.webp"
                                        alt="Pymble Construction Lusaka Office"
                                        fill
                                        className="object-cover"
                                        sizes="(max-width: 768px) 100vw, 400px"
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
                                    {VISION_MISSION.servicesStatement}
                                </motion.p>
                                <motion.p
                                    className="text-lg md:text-xl text-primary-dark/70 leading-relaxed font-light"
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.6, delay: 0.3 }}
                                >
                                    Pymble Construction Limited was founded on simple yet powerful principles: quality,
                                    integrity, and client satisfaction. Through expert craftsmanship and innovative
                                    solutions, we've built a reputation as one of Zambia's most trusted
                                    construction partners — delivering complex projects that stand the test of time.
                                </motion.p>
                            </div>
                        </div>
                    </div>
                </Container>
            </Section>

            {/* 2. Vision & Mission — official statements from PCL brochure */}
            <Section className="py-20 md:py-28 bg-primary-dark text-white relative overflow-hidden">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute left-0 top-0 w-[400px] h-[400px] bg-accent-orange/5 blur-[150px] rounded-full" />
                </div>

                <Container className="relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20">
                        <motion.div
                            className="space-y-6"
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                        >
                            <span className="label-uppercase text-accent-orange block">
                                Our Vision
                            </span>
                            <h2 className="font-heading text-3xl md:text-4xl font-bold tracking-tight leading-tight">
                                The preferred construction firm in Zambia and beyond.
                            </h2>
                            <p className="text-white/50 text-lg leading-relaxed">
                                {VISION_MISSION.vision}
                            </p>
                        </motion.div>

                        <motion.div
                            className="space-y-6"
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.15 }}
                        >
                            <span className="label-uppercase text-accent-orange block">
                                Our Mission
                            </span>
                            <h2 className="font-heading text-3xl md:text-4xl font-bold tracking-tight leading-tight">
                                Delivering excellence through professionalism.
                            </h2>
                            <p className="text-white/50 text-lg leading-relaxed">
                                {VISION_MISSION.mission}
                            </p>
                        </motion.div>
                    </div>
                </Container>
            </Section>

            <Team />

            {/* 3. Regional Presence — Local SEO targeting */}
            <Section className="py-24 md:py-32 bg-white overflow-hidden">
                <Container>
                    <div className="flex flex-col lg:flex-row gap-16 lg:items-center">
                        <div className="lg:w-1/2">
                            <motion.span
                                className="label-uppercase text-accent-orange mb-6 block"
                                initial={{ opacity: 0, x: -10 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                            >
                                (Our Reach)
                            </motion.span>
                            <motion.h2
                                className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold text-primary-dark tracking-tighter leading-[0.9] mb-8"
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                            >
                                Building across the <br />
                                <span className="text-primary-dark/40 italic">entirety of Zambia.</span>
                            </motion.h2>
                            <motion.p
                                className="text-lg text-primary-dark/70 max-w-xl leading-relaxed font-light mb-10"
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                            >
                                With our headquarters in Lusaka, Pymble Construction has established a robust operational
                                network that spans all 10 provinces. From the mining hubs of Copperbelt and Solwezi to
                                the tourism capital of Livingstone, we bring technical excellence to every corner of the nation.
                            </motion.p>
                        </div>
                        <div className="lg:w-1/2 grid grid-cols-2 md:grid-cols-3 gap-4">
                            {REGIONS.map((region, i) => (
                                <motion.div
                                    key={region.slug}
                                    className="p-6 md:p-8 bg-neutral-50 rounded-2xl border border-black/5 flex flex-col justify-between aspect-square group hover:bg-primary-dark transition-all duration-500"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: i * 0.05 }}
                                >
                                    <span className="text-xs font-mono text-primary-dark/40 group-hover:text-white/40 tracking-widest uppercase mb-4">
                                        Active Site
                                    </span>
                                    <h3 className="font-heading text-lg md:text-xl font-bold text-primary-dark group-hover:text-white leading-tight">
                                        {region.name}
                                    </h3>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </Container>
            </Section>

            <Section className="py-24 md:py-32 bg-neutral-50/50">
                <Container>
                    <div className="flex flex-col md:flex-row gap-16 md:gap-24">
                        <div className="md:w-1/3">
                            <span className="label-uppercase text-accent-orange mb-6 block">(Our Values)</span>
                            <h2 className="font-heading text-4xl md:text-5xl font-bold text-primary-dark">
                                Focused on Quality, <br /> Driven by Integrity.
                            </h2>
                        </div>
                        <div className="md:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-16">
                            {[
                                { title: "Professionalism", desc: "Structured project management and skilled workmanship ensure every project is executed to the highest professional standards." },
                                { title: "Quality & Safety", desc: "Strict adherence to quality and safety standards across all project phases — we never compromise on the integrity of our work." },
                                { title: "Client Commitment", desc: "We deliver construction services and products that meet client expectations, building trust through transparency and results." },
                                { title: "Reliable Execution", desc: "From planning to handover, we ensure reliable and efficient project execution — on time, on budget, and built to last." },
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

            <CTA />
        </main>
    );
}
