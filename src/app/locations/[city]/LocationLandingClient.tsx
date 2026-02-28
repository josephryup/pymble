"use client";

import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import Image from "next/image";
import Link from "next/link";
import { MapPin, ArrowRight, CheckCircle2, Building2, HardHat } from "lucide-react";
import type { LocationPage } from "@/lib/location-data";
import { projects } from "@/lib/project-data";

export default function LocationLandingClient({ location }: { location: LocationPage }) {
    const cityProjects = projects.filter(p => location.localProjects.includes(p.slug));

    return (
        <main className="min-h-screen bg-white">
            {/* Hero Section */}
            <Section className="pt-32 pb-20 md:pt-48 md:pb-32 bg-primary-dark text-white relative overflow-hidden">
                <div className="absolute inset-0 opacity-20 transition-opacity duration-1000">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-primary-dark" />
                </div>

                <Container className="relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <div className="flex items-center gap-2 text-accent-orange mb-6">
                            <MapPin className="w-5 h-5" />
                            <span className="label-uppercase tracking-widest">{location.cityName}, Zambia</span>
                        </div>
                        <h1 className="font-heading text-5xl md:text-7xl lg:text-8xl font-bold leading-[0.9] tracking-tighter mb-8 max-w-4xl">
                            {location.fullName}
                        </h1>
                        <p className="text-white/60 text-lg md:text-xl max-w-2xl leading-relaxed">
                            {location.description}
                        </p>
                    </motion.div>
                </Container>
            </Section>

            {/* Key Capabilities in City */}
            <Section className="py-20 md:py-32 bg-white">
                <Container>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                        <div>
                            <span className="label-uppercase text-accent-orange mb-6 block">(Local Expertise)</span>
                            <h2 className="font-heading text-4xl md:text-5xl font-bold text-primary-dark mb-8 tracking-tight">
                                Delivering Excellence in <br /> {location.cityName}.
                            </h2>
                            <div className="space-y-4">
                                {location.keyPoints.map((point, i) => (
                                    <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-black/5 bg-neutral-50">
                                        <CheckCircle2 className="w-6 h-6 text-accent-orange" />
                                        <span className="font-medium text-primary-dark/80">{point}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-6 text-white">
                            <div className="p-8 bg-primary-dark rounded-3xl flex flex-col justify-between aspect-square">
                                <Building2 className="w-10 h-10 text-accent-orange" />
                                <h3 className="text-xl font-bold">Commercial Building</h3>
                            </div>
                            <div className="p-8 bg-primary-blue rounded-3xl flex flex-col justify-between aspect-square">
                                <HardHat className="w-10 h-10 text-white" />
                                <h3 className="text-xl font-bold">Civil Works</h3>
                            </div>
                        </div>
                    </div>
                </Container>
            </Section>

            {/* local projects if any */}
            {cityProjects.length > 0 && (
                <Section className="py-20 bg-neutral-50">
                    <Container>
                        <div className="flex items-center justify-between mb-12">
                            <h2 className="font-heading text-3xl md:text-4xl font-bold">Recent Projects in {location.cityName}</h2>
                            <Link href="/projects" className="hidden md:flex items-center gap-2 text-primary-dark hover:text-accent-orange font-bold uppercase text-sm tracking-widest transition-colors">
                                View Portfolio <ArrowRight className="w-4 h-4" />
                            </Link>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {cityProjects.map((project) => (
                                <Link key={project.slug} href={`/projects/${project.slug}`} className="group block">
                                    <div className="relative aspect-[16/9] rounded-2xl overflow-hidden bg-neutral-200 mb-4">
                                        <Image
                                            src={project.image || project.poster || "/placeholder.svg"}
                                            alt={project.title}
                                            fill
                                            className="object-cover group-hover:scale-105 transition-transform duration-700"
                                            sizes="(max-width: 768px) 100vw, 50vw"
                                        />
                                    </div>
                                    <h3 className="text-xl font-bold group-hover:text-accent-orange transition-colors">{project.title}</h3>
                                    <span className="text-sm text-primary-dark/40 uppercase tracking-wide font-mono">{project.category}</span>
                                </Link>
                            ))}
                        </div>
                    </Container>
                </Section>
            )}

            {/* CTA */}
            <Section className="py-20 md:py-32 bg-primary-dark text-white text-center">
                <Container>
                    <h2 className="font-heading text-4xl md:text-6xl font-bold mb-8">Ready to build in {location.cityName}?</h2>
                    <Link href="/contact">
                        <Button className="bg-accent-orange hover:bg-amber-600 text-primary-dark px-10 py-4 h-auto text-lg font-bold">
                            Get a Local Consultation
                        </Button>
                    </Link>
                </Container>
            </Section>
        </main>
    );
}
