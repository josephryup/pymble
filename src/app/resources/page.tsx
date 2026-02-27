/**
 * Resources Page
 * ================================================
 * Central hub for downloadable resources:
 * - Company documents (brochure, profile)
 * - Brand identity assets
 * - Legal documents (privacy, terms)
 * ================================================
 */

"use client";

import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { COMPANY, CONTACT } from "@/lib/constants";
import {
    FileText,
    Download,
    Building2,
    Phone,
    Palette,
    Scale,
    BookOpen,
    ExternalLink,
    Shield,
    FileCheck,
} from "lucide-react";
import Link from "next/link";

type ResourceItem = {
    title: string;
    description: string;
    icon: React.ElementType;
    action: "download" | "link";
    href: string;
    badge?: string;
    badgeColor?: string;
};

type ResourceGroup = {
    category: string;
    description: string;
    items: ResourceItem[];
};

const resourceGroups: ResourceGroup[] = [
    {
        category: "Company Documents",
        description: "Official Pymble Construction profiles, portfolios, and capability statements.",
        items: [
            {
                title: "Company Profile & Brochure",
                description:
                    "Our comprehensive company profile with the full project portfolio, service capabilities, client references, and full contract history. Ideal for procurement teams.",
                icon: FileText,
                action: "download",
                href: "/PCL-Brochure-1.pdf",
                badge: "PDF · ~2 MB",
            },
            {
                title: "Project Portfolio Overview",
                description:
                    "A curated overview of our key completed projects across commercial, healthcare, hospitality, infrastructure, and civil works sectors.",
                icon: Building2,
                action: "download",
                href: "/PCL-Brochure-1.pdf",
                badge: "PDF · ~2 MB",
            },
            {
                title: "Services Capability Statement",
                description:
                    "A concise one-page summary of Pymble Construction's core service offerings, team credentials, and project delivery approach — suitable for tender submissions.",
                icon: BookOpen,
                action: "download",
                href: "/PCL-Brochure-1.pdf",
                badge: "PDF · ~2 MB",
            },
        ],
    },
    {
        category: "Brand Identity",
        description: "Official brand assets for media, press, and partner use.",
        items: [
            {
                title: "Logo Package",
                description:
                    "Official Pymble Construction logos in multiple formats — PNG, SVG, and dark/light variants. For use in publications, presentations, and partner materials.",
                icon: Palette,
                action: "download",
                href: "/logo.png",
                badge: "PNG",
            },
            {
                title: "Brand Guidelines",
                description:
                    "Typography, colour palette, spacing, and usage rules for all Pymble Construction brand materials. Ensures consistent representation across all channels.",
                icon: Palette,
                action: "link",
                href: "/contact",
                badge: "Request",
                badgeColor: "orange",
            },
            {
                title: "Media & Press Kit",
                description:
                    "High-resolution photography, project imagery, executive bios, and approved company descriptions for media and editorial use.",
                icon: BookOpen,
                action: "link",
                href: "/contact",
                badge: "Request",
                badgeColor: "orange",
            },
        ],
    },
    {
        category: "Legal Documents",
        description: "Policies and legal terms governing our website and services.",
        items: [
            {
                title: "Privacy Policy",
                description:
                    "How we collect, use, and protect your personal information when you engage with our website and services.",
                icon: Shield,
                action: "link",
                href: "/privacy",
                badge: "View Page",
            },
            {
                title: "Terms & Conditions",
                description:
                    "The terms governing use of our website and engagement with Pymble Construction for construction and related services.",
                icon: FileCheck,
                action: "link",
                href: "/terms",
                badge: "View Page",
            },
            {
                title: "Contractor Prequalification",
                description:
                    "For subcontractors and suppliers interested in working with Pymble Construction — contact us to receive our prequalification questionnaire.",
                icon: Scale,
                action: "link",
                href: "/contact",
                badge: "Request",
                badgeColor: "orange",
            },
        ],
    },
];

export default function ResourcesPage() {
    return (
        <main className="min-h-screen bg-white">
            {/* Hero */}
            <Section className="pt-32 pb-16 md:pt-48 md:pb-20 bg-white">
                <Container>
                    <div className="max-w-4xl">
                        <motion.span
                            className="label-uppercase mb-6 block text-accent-orange"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            Resources
                        </motion.span>
                        <motion.h1
                            className="font-heading text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter text-primary-dark mb-6 leading-[0.9]"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            Downloads &amp;
                            <br />
                            <span className="text-primary-dark/30">Documents.</span>
                        </motion.h1>
                        <motion.p
                            className="text-primary-dark/50 text-lg md:text-xl max-w-xl leading-relaxed"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            Access our official company documents, brand materials, and legal policies — all in one place.
                        </motion.p>
                    </div>
                </Container>
            </Section>

            {/* Resource Groups */}
            {resourceGroups.map((group, groupIdx) => (
                <Section
                    key={group.category}
                    className={`py-16 md:py-20 ${groupIdx % 2 !== 0 ? "bg-neutral-50/70" : "bg-white"}`}
                >
                    <Container>
                        {/* Group Header */}
                        <motion.div
                            className="mb-10 md:mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b border-black/8 pb-8"
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5 }}
                        >
                            <div>
                                <span className="label-uppercase text-accent-orange block mb-3">
                                    {groupIdx === 0 ? "01" : groupIdx === 1 ? "02" : "03"} / {String(resourceGroups.length).padStart(2, "0")}
                                </span>
                                <h2 className="font-heading text-3xl md:text-4xl font-bold text-primary-dark tracking-tight">
                                    {group.category}
                                </h2>
                            </div>
                            <p className="text-primary-dark/40 text-sm max-w-sm md:text-right leading-relaxed">
                                {group.description}
                            </p>
                        </motion.div>

                        {/* Cards Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {group.items.map((item, itemIdx) => {
                                const Icon = item.icon;
                                const isDownload = item.action === "download";
                                const isOrangeBadge = item.badgeColor === "orange";

                                return (
                                    <motion.div
                                        key={item.title}
                                        className="group bg-white border border-black/7 rounded-2xl p-8 hover:border-accent-orange/30 hover:shadow-xl transition-all duration-300 flex flex-col"
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: itemIdx * 0.08, duration: 0.5 }}
                                    >
                                        {/* Icon */}
                                        <div className="w-12 h-12 rounded-xl bg-primary-dark flex items-center justify-center mb-6 group-hover:bg-accent-orange transition-colors duration-300">
                                            <Icon className="w-5 h-5 text-accent-orange group-hover:text-primary-dark transition-colors duration-300" />
                                        </div>

                                        {/* Content */}
                                        <h3 className="font-heading text-lg font-bold text-primary-dark mb-3 tracking-tight leading-snug">
                                            {item.title}
                                        </h3>
                                        <p className="text-primary-dark/50 text-sm leading-relaxed mb-auto">
                                            {item.description}
                                        </p>

                                        {/* Footer */}
                                        <div className="mt-8 flex items-center justify-between">
                                            {item.badge && (
                                                <span
                                                    className={`text-xs font-mono px-2.5 py-1 rounded-full ${isOrangeBadge
                                                            ? "bg-accent-orange/10 text-accent-orange"
                                                            : "bg-primary-dark/5 text-primary-dark/50"
                                                        }`}
                                                >
                                                    {item.badge}
                                                </span>
                                            )}

                                            {isDownload ? (
                                                <a
                                                    href={item.href}
                                                    download
                                                    className="ml-auto inline-flex items-center gap-2 bg-primary-dark hover:bg-black text-white font-bold px-5 py-2.5 rounded-full text-xs transition-colors"
                                                >
                                                    <Download className="w-3.5 h-3.5" />
                                                    Download
                                                </a>
                                            ) : (
                                                <Link
                                                    href={item.href}
                                                    className="ml-auto inline-flex items-center gap-2 bg-primary-dark/5 hover:bg-primary-dark hover:text-white text-primary-dark font-bold px-5 py-2.5 rounded-full text-xs transition-colors"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                    {item.action === "link" && item.href === "/contact" ? "Get in Touch" : "Open"}
                                                </Link>
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </Container>
                </Section>
            ))}

            {/* CTA — Contact */}
            <Section className="py-20 md:py-28 bg-primary-dark text-white">
                <Container>
                    <motion.div
                        className="flex flex-col md:flex-row md:items-center md:justify-between gap-10"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <div className="max-w-xl">
                            <span className="label-uppercase text-accent-orange block mb-4">Get in Touch</span>
                            <h2 className="font-heading text-3xl md:text-5xl font-bold tracking-tighter mb-4 leading-tight">
                                Can&apos;t find what you&apos;re looking for?
                            </h2>
                            <p className="text-white/50 text-lg leading-relaxed">
                                Contact our team for technical specifications, detailed project references, prequalification documents, or a tailored proposal.
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row md:flex-col gap-4 shrink-0">
                            <Link
                                href="/contact"
                                className="inline-flex items-center justify-center gap-2 bg-accent-orange hover:bg-amber-500 text-primary-dark font-bold px-8 py-4 rounded-full transition-colors whitespace-nowrap"
                            >
                                <Phone className="w-5 h-5" />
                                Contact Us
                            </Link>
                            <a
                                href={`mailto:${CONTACT.email}`}
                                className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold px-8 py-4 rounded-full border border-white/10 transition-colors whitespace-nowrap text-sm"
                            >
                                {CONTACT.email}
                            </a>
                        </div>
                    </motion.div>
                </Container>
            </Section>
        </main>
    );
}
