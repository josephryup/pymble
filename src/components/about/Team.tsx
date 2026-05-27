"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import Image from "next/image";

const COMPANY_LOGO = "/logo.png";

const teamMembers = [
    {
        id: 1,
        name: "Matimba D. Hatimbula",
        role: "Managing Director",
        credentials: "CEO of the Year (ZMOY).\n Diploma Business Admin, B.Tech Civil Eng\nM.Eng Structural Eng, MBA Finance",
        image: "/images/team/matimba.jpg",
    },
    {
        id: 2,
        name: "Alex Hatimbula",
        role: "General Manager",
        credentials: "B.Int Arch (Hons) (UNSW)\nSpecializing in high-end residential\nand commercial hospitality spaces.",
        image: COMPANY_LOGO,
    },
    {
        id: 3,
        name: "John Mulilo",
        role: "Operations Manager",
        credentials: "",
        image: COMPANY_LOGO,
    },
    {
        id: 4,
        name: "Bupe Mwasaga",
        role: "Project Manager",
        credentials: "",
        image: COMPANY_LOGO,
    },
    {
        id: 5,
        name: "Carol Sinkala",
        role: "Procurement Manager",
        credentials: "Diploma in Occupational Health and Safety Management",
        image: COMPANY_LOGO,
    },
    {
        id: 6,
        name: "Asher Mulenga",
        role: "Quality Surveyor",
        credentials: "",
        image: COMPANY_LOGO,
    },
    {
        id: 7,
        name: "Mukuka Ngulube",
        role: "Human Resource and Procurement",
        credentials: "Bachelor of arts in Business Admin, Diploma Human resource, Certificate Occupational Health and Safety, Certificate Project Management, Certificate Monitoring and Evaluation.",
        image: "/images/team/Nikiwe.jpeg",
    },
    {
        id: 8,
        name: "Victor M. Nyalazi",
        role: "Procurement and Planning Assistant",
        credentials: "Diploma in Project Management",
        image: "/images/team/victor-nyalazi.jpeg",
    },
    {
        id: 9,
        name: "Lameck Nyirongo",
        role: "Finance Manager",
        credentials: "",
        image: COMPANY_LOGO,
    },
    {
        id: 10,
        name: "Henda Juma",
        role: "Accountant",
        credentials: "ZICA part qualified ,ACCA Diploma in Accounting and Business\nACCA Diploma in Financial and Management Accounting",
        image: "/images/team/henda-juma.jpeg",
    },
    {
        id: 11,
        name: "Mateo Chalwe",
        role: "Engineer",
        credentials: "",
        image: COMPANY_LOGO,
    },
    {
        id: 12,
        name: "Ishmael Mutale",
        role: "Engineer",
        credentials: "",
        image: COMPANY_LOGO,
    },
    {
        id: 13,
        name: "Thandiwe Mulenga",
        role: "Engineer",
        credentials: "",
        image: COMPANY_LOGO,
    },
    {
        id: 14,
        name: "Cassim Musolo",
        role: "HSE Officer",
        credentials: "",
        image: COMPANY_LOGO,
    },
    {
        id: 15,
        name: "Rose Chipili",
        role: "HSE Assistant Officer",
        credentials: "Diploma in Occupational Health and Safety Management",
        image: "/images/team/rose-chipili.jpeg",
    },
    {
        id: 16,
        name: "Lulamba Mulenga",
        role: "Admin Officer",
        credentials: "",
        image: COMPANY_LOGO,
    },
    {
        id: 17,
        name: "Jonathan",
        role: "Caretaker",
        credentials: "",
        image: COMPANY_LOGO,
    },
];

export function Team() {
    const [activeMember, setActiveMember] = useState(teamMembers[0]);
    const isCompanyLogo = activeMember.image === COMPANY_LOGO;

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
                            Meet the Team
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
                                        type="button"
                                        onClick={() => setActiveMember(member)}
                                        onFocus={() => setActiveMember(member)}
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
                            <div className={`relative aspect-[3/4] w-full max-w-sm lg:max-w-md mx-auto rounded-sm overflow-hidden mb-8 grayscale hover:grayscale-0 transition-all duration-700 shadow-2xl ${isCompanyLogo ? "bg-white" : "bg-neutral-100"}`}>
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
                                            className={isCompanyLogo ? "object-contain p-10" : "object-cover"}
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
