"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import Image from "next/image";

const teamMembers = [
    {
        id: 1,
        name: "Johnny Hyde",
        role: "Director",
        credentials: "M. Arch (QUT), B.Be Arch (QUT)\nBOA Queensland No. 4787.\nNSW Architects Registration Board\nNo. 10589",
        image: "https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=1974&auto=format&fit=crop", // Professional man in suit
    },
    {
        id: 2,
        name: "Poppie Kenneally",
        role: "Director - Interior Designer",
        credentials: "B.Int Arch (Hons) (UNSW)\nSpecializing in high-end residential\nand commercial hospitality spaces.",
        image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=1976&auto=format&fit=crop", // Professional woman
    },
    {
        id: 3,
        name: "Daniel Hickey",
        role: "Associate Architect",
        credentials: "M. Arch (USyd), B.Des Arch (USyd)\nRegistered Architect NSW No. 11245.\nLead Project Manager.",
        image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=2070&auto=format&fit=crop", // Professional smiling man
    },
    {
        id: 4,
        name: "Nick Tan",
        role: "Architect",
        credentials: "M. Arch (Melb), B.Enviro Des (UWA)\nExpert in sustainable urban design\nand technical implementation.",
        image: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?q=80&w=1974&auto=format&fit=crop", // Professional man
    },
    {
        id: 5,
        name: "Rachael Mellick",
        role: "Architect",
        credentials: "M. Arch (QUT), B.Des (QUT)\nSpecialist in heritage conservation\nand modern adaptive reuse.",
        image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=1961&auto=format&fit=crop", // Professional woman
    },
    {
        id: 6,
        name: "Laura Sherriff",
        role: "Architect",
        credentials: "M. Arch (USyd), B.Des Arch (USyd)\nFocused on project feasibility\nand computational design workflows.",
        image: "https://images.unsplash.com/photo-1598550874175-4d7112ee7f43?q=80&w=2070&auto=format&fit=crop", // Professional woman
    },
];

export function Team() {
    const [activeMember, setActiveMember] = useState(teamMembers[0]);

    return (
        <Section className="min-h-screen w-full bg-white py-24 m-0 max-w-none">
            <Container>
                <div className="flex flex-col gap-12 md:gap-24">
                    {/* Header */}
                    <div className="w-full">
                        <span className="label-uppercase text-accent-orange mb-4 block">
                            (Our Team)
                        </span>
                        <h2 className="font-heading text-5xl md:text-7xl lg:text-8xl font-bold leading-[0.8] tracking-tighter text-primary-dark uppercase">
                            Meet the Team <br />
                            <span className="opacity-100">Behind the Designs</span>
                        </h2>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-12 lg:gap-24 relative">
                        {/* Nav List - Scrollable */}
                        <div className="lg:w-1/2 flex flex-col items-start space-y-12 pb-24">
                            {teamMembers.map((member) => (
                                <div
                                    key={member.id}
                                    className="group relative flex flex-col md:flex-row md:items-center gap-2 md:gap-0 cursor-pointer w-full text-left"
                                    onMouseEnter={() => setActiveMember(member)}
                                >
                                    <span className={`label-uppercase text-[10px] w-24 md:w-32 md:absolute md:left-0 md:text-right transition-all duration-300 ${activeMember.id === member.id ? "opacity-100 text-primary-dark" : "opacity-0 group-hover:opacity-40"}`}>
                                        {member.role}
                                    </span>
                                    <button
                                        className={`font-heading text-3xl md:text-5xl lg:text-6xl font-bold tracking-tighter transition-all duration-500 text-left ${activeMember.id === member.id
                                            ? "text-primary-dark translate-x-4 md:translate-x-40"
                                            : "text-primary-dark/20 hover:text-primary-dark hover:translate-x-2"
                                            }`}
                                    >
                                        {member.name}
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Display Area - Sticky & Contained (Desktop) / Static (Mobile) */}
                        <div className="lg:w-1/2 flex flex-col order-first lg:order-last mb-12 lg:mb-0 lg:sticky lg:top-24 h-fit">
                            <div className="relative aspect-[3/4] w-full max-w-sm lg:max-w-md mx-auto rounded-sm overflow-hidden bg-neutral-100 mb-8 grayscale hover:grayscale-0 transition-all duration-700 shadow-2xl">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={activeMember.id}
                                        initial={{ opacity: 0, scale: 1.05 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.5, ease: "easeOut" }}
                                        className="absolute inset-0"
                                    >
                                        <Image
                                            src={activeMember.image}
                                            alt={activeMember.name}
                                            fill
                                            className="object-cover"
                                        />
                                    </motion.div>
                                </AnimatePresence>
                            </div>

                            <div className="max-w-md mx-auto w-full px-4 text-center lg:text-left">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={activeMember.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        transition={{ duration: 0.3 }}
                                        className="space-y-2"
                                    >
                                        <p className="text-sm font-mono text-primary-dark/80 leading-relaxed whitespace-pre-line tracking-tight">
                                            {activeMember.credentials}
                                        </p>
                                    </motion.div>
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>
                </div>
            </Container>
        </Section>
    );
}
