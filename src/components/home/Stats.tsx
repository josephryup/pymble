/**
 * Stats Component
 * ================================================
 * Animated counter section showcasing real company
 * statistics sourced from the PCL-Brochure-1.pdf
 * project portfolio.
 *
 * Design: Full-width dark section with large numbers
 * and subtle count-up animation on scroll.
 *
 * Placement: Between FeaturedProjects and AboutPhilosophy
 * on the homepage for maximum impact.
 * ================================================
 */

"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { COMPANY_STATS } from "@/lib/constants";
import {
    Briefcase,
    Users,
    TrendingUp,
    Calendar,
} from "lucide-react";

/** Stats to display — mapped from COMPANY_STATS constant */
const stats = [
    {
        label: "Projects Completed",
        value: COMPANY_STATS.projectsCompleted,
        icon: Briefcase,
        description: "Across commercial, industrial, and institutional sectors",
    },
    {
        label: "Total Contract Value",
        value: COMPANY_STATS.totalContractValue,
        icon: TrendingUp,
        description: "In completed and ongoing project contracts",
    },
    {
        label: "Major Clients",
        value: COMPANY_STATS.majorClients,
        icon: Users,
        description: "Including UNHCR, Coca-Cola, and government ministries",
    },
    {
        label: "Years of Delivery",
        value: COMPANY_STATS.yearsExperience,
        icon: Calendar,
        description: "Consistently delivering quality since inception",
    },
];

export function Stats() {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: "-100px" });

    return (
        <Section className="py-20 md:py-28 bg-primary-dark text-white relative overflow-hidden">
            {/* Ambient background glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent-orange/5 blur-[200px] rounded-full" />
            </div>

            <Container className="relative z-10">
                {/* Section header */}
                <motion.div
                    className="text-center mb-16"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                >
                    <span className="label-uppercase text-accent-orange mb-4 block">
                        Track Record
                    </span>
                    <h2 className="font-heading text-3xl md:text-5xl lg:text-6xl font-bold tracking-tighter">
                        Built on Results
                    </h2>
                </motion.div>

                {/* Stats grid */}
                <div ref={ref} className="grid grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
                    {stats.map((stat, index) => {
                        const Icon = stat.icon;
                        return (
                            <motion.div
                                key={stat.label}
                                className="text-center"
                                initial={{ opacity: 0, y: 30 }}
                                animate={isInView ? { opacity: 1, y: 0 } : {}}
                                transition={{ delay: index * 0.15 }}
                            >
                                {/* Icon */}
                                <div className="w-12 h-12 rounded-2xl bg-accent-orange/10 flex items-center justify-center text-accent-orange mx-auto mb-5">
                                    <Icon className="w-6 h-6" />
                                </div>

                                {/* Large stat value */}
                                <p className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-2">
                                    {stat.value}
                                </p>

                                {/* Label */}
                                <p className="label-uppercase text-accent-orange text-[11px] mb-2">
                                    {stat.label}
                                </p>

                                {/* Description */}
                                <p className="text-white/40 text-xs md:text-sm leading-relaxed max-w-[200px] mx-auto">
                                    {stat.description}
                                </p>
                            </motion.div>
                        );
                    })}
                </div>
            </Container>
        </Section>
    );
}
