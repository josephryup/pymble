"use client";

import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import Image from "next/image";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

const categories = ["All", "Residential", "Commercial", "Healthcare", "Industrial"];

const projects = [
    {
        id: 1,
        title: "Gordon Residential Complex",
        category: "Residential",
        year: "2024",
        image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=2053&auto=format&fit=crop", // Modern luxury facade
    },
    {
        id: 2,
        title: "North Sydney Office Hub",
        category: "Commercial",
        year: "2023",
        image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop", // Corporate glass architecture
    },
    {
        id: 3,
        title: "Chatswood Medical Centre",
        category: "Healthcare",
        year: "2023",
        image: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=2053&auto=format&fit=crop", // Clean modern medical/white architecture
    },
    {
        id: 4,
        title: "Pymble Luxury Estate",
        category: "Residential",
        year: "2024",
        image: "https://images.unsplash.com/photo-1600596542815-3ad19c6f98d7?q=80&w=2075&auto=format&fit=crop", // Stately luxury home
    },
    {
        id: 5,
        title: "Western Industrial Park",
        category: "Industrial",
        year: "2022",
        image: "https://images.unsplash.com/photo-1581094794329-cd1096a7a2a8?q=80&w=2070&auto=format&fit=crop", // Construction detail / Industrial vibe
    },
    {
        id: 6,
        title: "Crows Nest Apartments",
        category: "Residential",
        year: "2023",
        image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=2070&auto=format&fit=crop", // Modern apartment interior/exterior
    },
];

export default function ProjectsPage() {
    const [activeCategory, setActiveCategory] = useState("All");

    const filteredProjects = activeCategory === "All"
        ? projects
        : projects.filter(p => p.category === activeCategory);

    return (
        <main className="min-h-screen bg-white">
            <Section className="pt-32 pb-0 md:pt-48 md:pb-0">
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
                    <div className="flex flex-wrap gap-4 md:gap-8 border-b border-black/5 pb-1">
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
                </Container>
            </Section>

            <Section className="pt-0">
                <Container>
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
                                    <Image
                                        src={project.image}
                                        alt={project.title}
                                        fill
                                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                                    />
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
