"use client";

import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";

const services = [
    {
        id: "01",
        title: "Construction",
        description: "Expert residential, commercial, and industrial construction services across Zambia, focusing on structural integrity and premium finishes.",
        image: "/images/services/construction.jpg"
    },
    {
        id: "02",
        title: "Design & Building",
        description: "Creative architectural solutions and end-to-end design-build projects that combine aesthetic vision with technical precision.",
        image: "/images/services/design and building.jpg"
    },
    {
        id: "03",
        title: "Roofing & Aluminum",
        description: "Our roofing and aluminum services combine technical expertise with quality materials to deliver weather-resistant, durable solutions. From installation to maintenance, we ensure your investment is protected.",
        image: "/images/services/roofing.jpg"
    },
    {
        id: "04",
        title: "Road Works",
        description: "Infrastructure development, civil engineering, and road construction services that build the backbone of regional connectivity.",
        image: "/images/services/road-works.webp"
    },
];

import { useState } from "react";
import Image from "next/image";

const capabilities = [
    "Project management",
    "Surveying services",
    "Maintenance and renovations",
    "Warehouses and industrial facilities",
    "Drainage and foundations",
];

export function Services() {
    const [activeService, setActiveService] = useState(services[0]);

    return (
        <Section className="bg-white border-t border-black/5 overflow-hidden min-h-0 md:min-h-screen flex flex-col justify-center">
            <Container>
                <div className="flex flex-col lg:flex-row gap-12 lg:gap-24 items-start mb-12">
                    {/* Text Column (Versatility / Core Expertise) */}
                    <div className="w-full lg:w-1/2 flex flex-col gap-12 pt-0 lg:pt-0">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 1 }}
                        >
                            <span className="label-uppercase mb-8 block text-accent-orange">
                                Versatility / Core Expertise
                            </span>
                            <h2 className="font-heading text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold leading-[1.1] tracking-tighter text-primary-dark mb-8">
                                Engineering excellence <br />
                                and innovative solutions <br />
                                for residential, commercial <br />
                                and industrial sectors.
                            </h2>

                            <div className="max-w-3xl">
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    key={activeService.id}
                                    className="pt-1"
                                >
                                    <p className="text-xl md:text-2xl text-primary-dark/70 max-w-xl leading-snug">
                                        <span className="text-primary-dark font-bold mr-2 uppercase tracking-widest text-[11px]">Specialization:</span>
                                        {activeService.description}
                                    </p>
                                </motion.div>
                            </div>
                        </motion.div>
                    </div>

                    {/* Image + List Column */}
                    <div className="w-full lg:w-1/2 flex flex-col gap-16">
                        <motion.div
                            key={activeService.id}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.6 }}
                            className="relative aspect-[16/10] w-full overflow-hidden rounded-sm"
                        >
                            <Image
                                src={activeService.image}
                                alt={activeService.title}
                                fill
                                className="object-cover"
                            />
                        </motion.div>

                        <div className="space-y-0">
                            {services.map((service) => (
                                <div
                                    key={service.id}
                                    onMouseEnter={() => setActiveService(service)}
                                    className={cn(
                                        "group flex items-center justify-between py-6 border-b border-black/5 cursor-pointer transition-all duration-300",
                                        activeService.id === service.id ? "opacity-100" : "opacity-30 hover:opacity-100"
                                    )}
                                >
                                    <div className="flex items-center gap-6">
                                        <span className="text-[12px] font-mono tracking-widest text-primary-dark uppercase">
                                            ({service.id})
                                        </span>
                                        <h3 className="text-xl md:text-2xl font-bold tracking-tight text-primary-dark">
                                            {service.title}
                                        </h3>
                                    </div>
                                    <motion.div
                                        animate={{ x: activeService.id === service.id ? 0 : -10, opacity: activeService.id === service.id ? 1 : 0 }}
                                        className="hidden md:block"
                                    >
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-dark">
                                            <line x1="7" y1="17" x2="17" y2="7"></line>
                                            <polyline points="7 7 17 7 17 17"></polyline>
                                        </svg>
                                    </motion.div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="border-t border-black/5 pt-8">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">
                        <div className="lg:col-span-1">
                            <motion.span
                                className="label-uppercase mb-6 block text-accent-orange"
                                initial={{ opacity: 0, x: -10 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                            >
                                Versatility / Skill
                            </motion.span>
                            <motion.h3
                                className="font-heading text-3xl md:text-4xl font-bold text-primary-dark"
                                initial={{ opacity: 0, x: -10 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: 0.1 }}
                            >
                                Additional <br /> Capabilities
                            </motion.h3>
                        </div>
                        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6">
                            {capabilities.map((capability, index) => (
                                <motion.div
                                    key={capability}
                                    className="flex items-center gap-4 group"
                                    initial={{ opacity: 0, y: 10 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: index * 0.05 }}
                                >
                                    <div className="w-1.5 h-1.5 bg-primary-dark/20 group-hover:bg-primary-dark transition-colors" />
                                    <span className="label-uppercase opacity-100 text-sm">{capability}</span>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </Container>
        </Section>
    );
}

import { cn } from "@/lib/utils";
