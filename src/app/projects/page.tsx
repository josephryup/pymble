"use client";

import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import Image from "next/image";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

/**
 * Project categories — matches Pymble's core service areas
 * from the client questionnaire
 */
const categories = ["All", "Commercial", "Healthcare", "Hospitality", "Infrastructure", "Civil Works"];

/**
 * Project portfolio data
 * These are real Pymble Construction projects in Zambia.
 * TODO: Replace Unsplash images with actual project photos from client.
 */
const projects = [
    {
        id: 1,
        title: "Nandos (Rubis) — Kitwe",
        category: "Commercial",
        year: "2026",
        image: "/images/projects/Rubis-gas-station.jpg",
    },
    {
        id: 2,
        title: "BeitCure Hospital — Lusaka",
        category: "Healthcare",
        year: "2025",
        image: "/images/projects/beitcure.jpg",
    },
    {
        id: 3,
        title: "Longacres Matebeto — Lusaka",
        category: "Hospitality",
        year: "2025",
        image: "/images/projects/matebeto-lusaka.jpg",
    },
    {
        id: 4,
        title: "SolidarMed Zambia — Livingstone",
        category: "Infrastructure",
        year: "2024",
        image: "/images/projects/solidarmed.jpg",
    },
    {
        id: 5,
        title: "Coca-Cola Zambia — Lusaka",
        category: "Commercial",
        year: "2024",
        // Compressed with FFmpeg: CRF 28, original 720x1280 portrait format
        video: "/images/projects/coca-cola-compressed.mp4",
        // Poster prevents blank card while video loads
        poster: "/images/projects/coca-cola-poster.jpg",
    },

];

export default function ProjectsPage() {
    const [activeCategory, setActiveCategory] = useState("All");

    const filteredProjects = activeCategory === "All"
        ? projects
        : projects.filter(p => p.category === activeCategory);

    return (
        <main className="min-h-screen bg-white">
            <Section className="pt-32 pb-0 md:pt-48 md:pb-0 lg:pb-0">
                <Container>
                    <motion.span
                        className="label-uppercase mb-8 block text-accent-orange"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        Project Index / Portfolio
                    </motion.span>
                    <motion.h1
                        className="font-heading text-5xl md:text-8xl lg:text-[7.5rem] font-bold leading-[0.85] tracking-tighter text-primary-dark mb-10 md:mb-16"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        Works.
                    </motion.h1>

                    {/* Category Filter */}
                    <div className="flex flex-wrap gap-4 md:gap-8 border-b border-black/5 pb-1 mb-8 md:mb-12">
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`label-uppercase font-bold transition-all relative pb-1 border-b-2 ${activeCategory === cat ? "border-accent-orange text-accent-orange" : "border-transparent text-primary-dark/30 hover:text-primary-dark/60"
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    <motion.div
                        layout
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8 md:gap-12"
                    >
                        {filteredProjects.map((project) => (
                            <motion.div
                                layout
                                key={project.id}
                                className="group cursor-pointer"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.5 }}
                            >
                                <div className="relative aspect-[3/2] overflow-hidden rounded-2xl mb-6">
                                    {"video" in project && project.video ? (
                                        <video
                                            src={project.video}
                                            autoPlay
                                            loop
                                            muted
                                            playsInline
                                            preload="none"
                                            poster={"poster" in project ? project.poster : undefined}
                                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                        />
                                    ) : project.image ? (
                                        <Image
                                            src={project.image}
                                            alt={project.title}
                                            fill
                                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                                        />
                                    ) : null}
                                    <div className="absolute inset-0 bg-primary-dark/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                        <div className="bg-white text-primary-dark p-4 rounded-full transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                            <ArrowUpRight className="w-6 h-6" />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <span className="label-uppercase opacity-60 mb-3 block">
                                            {project.category}
                                        </span>
                                        <h2 className="font-heading text-2xl md:text-3xl font-bold tracking-tight text-primary-dark group-hover:opacity-60 transition-all">
                                            {project.title}
                                        </h2>
                                    </div>
                                    <span className="label-uppercase opacity-20 whitespace-nowrap mb-1">
                                        EST / {project.year}
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                </Container>
            </Section>

            {/* Empty State */}
            {filteredProjects.length === 0 && (
                <Section>
                    <Container className="text-center py-20">
                        <p className="text-xl text-primary-dark/40 font-heading">No projects found in this category.</p>
                    </Container>
                </Section>
            )}
        </main>
    );
}
