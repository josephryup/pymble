"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import Image from "next/image";

const projects = [
    {
        id: 1,
        title: "Nandos (Rubis) - Kitwe",
        category: "Commercial",
        year: "2026",
        image: "/images/projects/Rubis-gas-station.jpg", //  construction of Nandos (Rubis) in Kitwe Zambia
    },
    {
        id: 2,
        title: "BeitCure Hospital - Lusaka ",
        category: "Healthcare",
        year: "2025",
        image: "/images/projects/beitcure.jpg", // BeitCure Hospital
    },
    {
        id: 3,
        title: "Longacres Matebeto  ",
        category: "Hospitality  ",
        year: "2025",
        image: "/images/projects/matebeto-lusaka.jpg", // Clean modern medical/white architecture
    },
];

const ProjectCard = ({ project, index }: { project: any; index: number }) => {
    const containerRef = useRef(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start end", "end start"],
    });

    const y = useTransform(scrollYProgress, [0, 1], ["-10%", "10%"]);

    return (
        <motion.div
            ref={containerRef}
            className="group cursor-pointer relative overflow-hidden bg-white md:bg-neutral-100 h-auto md:h-full w-full border-b md:border-b-0 border-black/5 last:border-b-0 pb-12 md:pb-0"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: index * 0.1 }}
        >
            <div className="relative h-full w-full flex flex-col md:block">
                {/* Image Container */}
                <div className="relative aspect-[4/3] md:h-full w-full overflow-hidden">
                    <motion.div style={{ y }} className="absolute inset-0 scale-110">
                        <Image
                            src={project.image}
                            alt={project.title}
                            fill
                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                    </motion.div>

                    {/* Desktop Overlay Gradient */}
                    <div className="hidden md:block absolute inset-0 bg-gradient-to-t from-primary-dark/90 via-primary-dark/20 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-700" />
                </div>

                {/* Content - Below on Mobile, Overlay on Desktop */}
                <div className="relative md:absolute md:inset-0 p-6 md:p-12 flex flex-col justify-end bg-white md:bg-transparent">
                    <div className="md:translate-y-4 md:group-hover:translate-y-0 transition-transform duration-700 ease-out">
                        <span className="label-uppercase text-accent-orange mb-2 md:mb-3 block text-[10px] md:text-white/60">
                            {project.category} / {project.year}
                        </span>
                        <h3 className="font-heading text-2xl md:text-3xl xl:text-4xl text-primary-dark md:text-white font-bold tracking-tight mb-4">
                            {project.title}
                        </h3>
                        <div className="flex items-center gap-2 text-primary-dark/40 md:text-white/40 md:group-hover:text-white transition-colors duration-500">
                            <span className="label-uppercase text-accent-orange text-[9px] uppercase tracking-[0.3em]">View Project</span>
                            <ArrowUpRight className="w-4 h-4" strokeWidth={2} />
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export function FeaturedProjects() {
    return (
        <Section className="bg-white border-t border-black/5 overflow-hidden min-h-0 md:min-h-screen flex flex-col justify-center relative">
            {/* Header Overlays */}
            <div className="relative md:absolute md:top-24 md:left-12 z-20 pointer-events-none px-6 py-12 md:p-0">
                <motion.span
                    className="label-uppercase mb-4 block text-accent-orange"
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                >
                    Curated Selection
                </motion.span>
                <motion.h2
                    className="font-heading text-4xl md:text-5xl xl:text-6xl font-bold tracking-tighter text-primary-dark leading-[0.9]"
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 1 }}
                >
                    Selected Works
                </motion.h2>
            </div>

            <div className="relative md:absolute md:top-24 md:right-12 z-20 px-6 pb-12 md:p-0">
                <motion.a
                    href="/projects"
                    className="group"
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                >
                    <div className="flex items-center gap-4">
                        <span className="label-uppercase text-accent-orange group-hover:opacity-60 transition-opacity">Explore Portfolio</span>
                        <div className="w-10 h-10 rounded-full border border-black/10 flex items-center justify-center group-hover:bg-primary-dark group-hover:text-white transition-all duration-500">
                            <ArrowUpRight className="w-5 h-5" strokeWidth={2} />
                        </div>
                    </div>
                </motion.a>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 h-full w-full">
                {projects.map((project, index) => (
                    <ProjectCard key={project.id} project={project} index={index} />
                ))}
            </div>
        </Section>
    );
}
