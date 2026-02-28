"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { QuoteModal } from "@/components/ui/QuoteModal";
import Link from "next/link";
import {
    Building2,
    Hammer,
    HardHat,
    Landmark,
    Warehouse,
    Factory,
    Scale,
    ArrowRight,
    CheckCircle2,
    Download,
    FileText,
} from "lucide-react";
import { SERVICES, ADDITIONAL_SERVICES } from "@/lib/constants";

/** Map icon strings from constants to Lucide components */
const iconMap: Record<string, React.ElementType> = {
    building: Building2,
    hammer: Hammer,
    hardHat: HardHat,
    landmark: Landmark,
    warehouse: Warehouse,
    factory: Factory,
    scale: Scale,
};

/**
 * Key capabilities for each service — displayed as a checklist.
 * Organized by service ID to keep data close to presentation.
 */
const serviceCapabilities: Record<string, string[]> = {
    "building-construction": [
        "Commercial & institutional buildings",
        "Residential developments",
        "Warehouses & industrial facilities",
        "Prefab & PEB building construction",
        "Steel structure fabrication & assembly",
        "Project management & oversight",
        "Quality assurance & compliance",
    ],
    renovations: [
        "Structural renovations & upgrades",
        "Interior fit-outs & remodelling",
        "Service station renovations",
        "Building maintenance programs",
        "Heritage restoration",
        "Energy efficiency improvements",
    ],
    "civil-works": [
        "Earthworks & excavation",
        "Drainage systems & foundations",
        "Road construction & rehabilitation",
        "Weighbridge construction & installation",
        "Concrete paving & road marking",
        "Site preparation & clearing",
        "Surveying services",
    ],
    infrastructure: [
        "Government infrastructure projects",
        "Service station & filling station construction",
        "Institutional facility development",
        "Public works & utilities",
        "Electrical substation construction",
        "Bridge & water infrastructure",
        "Large-scale development programs",
    ],
};

import { FAQ } from "@/components/ui/FAQ";

const faqItems = [
    {
        question: "What areas of Zambia does Pymble Construction serve?",
        answer: "While headquartered in Lusaka, we operate nationwide across all 10 provinces. Our active network includes major projects in the Copperbelt hub (Kitwe & Ndola), the mining regions of Solwezi, and Southern Province centers like Livingstone."
    },
    {
        question: "Do you handle both commercial and residential projects?",
        answer: "Yes. Pymble Construction is a multi-disciplinary firm. We specialize in large-scale commercial facilities, industrial warehouses, and infrastructure for international NGOs, while also delivering premium, high-end residential developments."
    },
    {
        question: "Is Pymble Construction officially certified for government projects?",
        answer: "Absolutely. We are a fully registered Zambian entity with all necessary legal and professional certifications, including PACRA and ZRA. We are high-ranking members of relevant construction councils, ensuring we meet all prerequisites for government, institutional, and stakeholder tenders."
    },
    {
        question: "How do I request a formal project quote?",
        answer: "You can initiate a request directly through this website using any 'Request a Quote' button. Alternatively, you can reach out via our Contact page or WhatsApp. Our project management team typically provides an initial assessment within 24–48 hours."
    },
    {
        question: "What safety and quality standards do you follow?",
        answer: "Safety and quality are our non-negotiables. Following official Zambian safety regulations and international building codes, we implement rigorous site-level management. Every project undergoes technical quality checks at each stage of the 6-step journey."
    }
];

export default function ServicesClient() {
    const [quoteService, setQuoteService] = useState<string | null>(null);

    return (
        <main className="min-h-screen bg-white">
            {/* Per-service quote request modal */}
            <QuoteModal
                isOpen={!!quoteService}
                onClose={() => setQuoteService(null)}
                serviceName={quoteService || ""}
            />
            {/* ── Hero Section ── */}
            <Section className="pt-32 pb-16 md:pt-48 md:pb-24 bg-primary-dark text-white relative overflow-hidden">
                {/* Ambient background glow */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute right-0 top-0 w-[600px] h-[600px] bg-accent-orange/10 blur-[150px] rounded-full" />
                    <div className="absolute left-0 bottom-0 w-[400px] h-[400px] bg-primary-blue/10 blur-[120px] rounded-full" />
                </div>

                <Container className="relative z-10">
                    <motion.span
                        className="label-uppercase mb-8 block text-accent-orange"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        What We Do
                    </motion.span>
                    <motion.h1
                        className="font-heading text-5xl md:text-7xl lg:text-8xl font-bold leading-[0.9] tracking-tighter mb-8"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        Our Services.
                    </motion.h1>
                    <motion.p
                        className="text-white/60 text-lg md:text-xl max-w-2xl leading-relaxed"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        From building construction to large-scale infrastructure development,
                        we deliver high-quality projects with technical excellence and client
                        satisfaction at the core of everything we do.
                    </motion.p>
                </Container>
            </Section>

            {/* ── Service Cards ── */}
            {SERVICES.map((service, index) => {
                const Icon = iconMap[service.icon] || Building2;
                const capabilities = serviceCapabilities[service.id] || [];
                const isEven = index % 2 === 0;

                return (
                    <Section
                        key={service.id}
                        className={`py-20 md:py-32 ${isEven ? "bg-white" : "bg-neutral-50/50"}`}
                    >
                        <Container>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
                                {/* Service Info — alternates left/right */}
                                <motion.div
                                    className={isEven ? "lg:order-1" : "lg:order-2"}
                                    initial={{ opacity: 0, x: isEven ? -30 : 30 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.6 }}
                                >
                                    {/* Service number badge */}
                                    <span className="label-uppercase text-accent-orange mb-6 block">
                                        {String(index + 1).padStart(2, "0")} / {SERVICES.length.toString().padStart(2, "0")}
                                    </span>

                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-14 h-14 rounded-2xl bg-primary-dark flex items-center justify-center text-accent-orange">
                                            <Icon className="w-7 h-7" />
                                        </div>
                                        <h2 className="font-heading text-3xl md:text-4xl lg:text-5xl font-bold text-primary-dark tracking-tight">
                                            {service.title}
                                        </h2>
                                    </div>

                                    <p className="text-primary-dark/60 text-lg leading-relaxed mb-8 max-w-lg">
                                        {service.description}
                                    </p>

                                    {/* Capabilities Checklist */}
                                    <ul className="space-y-3 mb-10">
                                        {capabilities.map((cap, i) => (
                                            <motion.li
                                                key={i}
                                                className="flex items-center gap-3 text-primary-dark/70"
                                                initial={{ opacity: 0, x: -10 }}
                                                whileInView={{ opacity: 1, x: 0 }}
                                                viewport={{ once: true }}
                                                transition={{ delay: i * 0.05 }}
                                            >
                                                <CheckCircle2 className="w-5 h-5 text-accent-orange flex-shrink-0" />
                                                <span>{cap}</span>
                                            </motion.li>
                                        ))}
                                    </ul>

                                    <Button
                                        className="bg-primary-dark hover:bg-black text-white px-8 py-4 h-auto flex items-center gap-2 group"
                                        onClick={() => setQuoteService(service.title)}
                                    >
                                        Request a Quote
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </Button>
                                </motion.div>

                                {/* Visual element — Geometric pattern card */}
                                <motion.div
                                    className={`${isEven ? "lg:order-2" : "lg:order-1"} relative`}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.6, delay: 0.2 }}
                                >
                                    <div className="aspect-square bg-primary-dark rounded-3xl relative overflow-hidden">
                                        {/* Geometric pattern background */}
                                        <div className="absolute inset-0 opacity-10">
                                            <div className="absolute top-8 left-8 w-32 h-32 border-2 border-accent-orange rounded-2xl rotate-12" />
                                            <div className="absolute bottom-12 right-12 w-48 h-48 border border-white/30 rounded-full" />
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border border-primary-blue/30 rounded-3xl rotate-45" />
                                        </div>

                                        {/* Large icon centered */}
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <Icon className="w-32 h-32 text-accent-orange/20" />
                                        </div>

                                        {/* Service number overlay */}
                                        <div className="absolute bottom-8 left-8">
                                            <span className="text-8xl font-heading font-bold text-white/5">
                                                {String(index + 1).padStart(2, "0")}
                                            </span>
                                        </div>
                                    </div>
                                </motion.div>
                            </div>
                        </Container>
                    </Section>
                );
            })}

            {/* ── Additional Capabilities Section ── */}
            <Section className="py-20 md:py-28 bg-primary-dark text-white relative overflow-hidden">
                {/* Ambient glow */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute right-0 bottom-0 w-[500px] h-[500px] bg-accent-orange/5 blur-[150px] rounded-full" />
                </div>

                <Container className="relative z-10">
                    <motion.div
                        className="text-center mb-16"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <span className="label-uppercase text-accent-orange mb-4 block">
                            Specialized Services
                        </span>
                        <h2 className="font-heading text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
                            Additional Capabilities
                        </h2>
                        <p className="text-white/50 text-lg max-w-2xl mx-auto">
                            Beyond our core services, we deliver specialized construction
                            solutions for industrial and commercial clients.
                        </p>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                        {ADDITIONAL_SERVICES.map((service, index) => {
                            const Icon = iconMap[service.icon] || Building2;
                            return (
                                <motion.div
                                    key={service.id}
                                    className="bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-colors group"
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: index * 0.1 }}
                                >
                                    <div className="w-14 h-14 rounded-2xl bg-accent-orange/10 flex items-center justify-center text-accent-orange mb-6">
                                        <Icon className="w-7 h-7" />
                                    </div>
                                    <h3 className="font-heading text-xl md:text-2xl font-bold mb-3 tracking-tight">
                                        {service.title}
                                    </h3>
                                    <p className="text-white/50 text-sm leading-relaxed mb-6">
                                        {service.description}
                                    </p>
                                    <Button
                                        className="bg-white/10 hover:bg-accent-orange hover:text-primary-dark text-white border border-white/10 px-6 py-3 h-auto text-sm flex items-center gap-2 group/btn transition-all"
                                        onClick={() => setQuoteService(service.title)}
                                    >
                                        Request a Quote
                                        <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-0.5 transition-transform" />
                                    </Button>
                                </motion.div>
                            );
                        })}
                    </div>
                </Container>
            </Section>

            {/* ── Brochure Download CTA ── */}
            <Section className="py-16 md:py-20 bg-neutral-50">
                <Container>
                    <motion.div
                        className="bg-white rounded-3xl border border-black/5 p-8 md:p-12 flex flex-col md:flex-row items-center gap-8 md:gap-12 shadow-sm"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        {/* Icon */}
                        <div className="w-20 h-20 rounded-2xl bg-primary-dark flex items-center justify-center flex-shrink-0">
                            <FileText className="w-10 h-10 text-accent-orange" />
                        </div>

                        {/* Text */}
                        <div className="flex-1 text-center md:text-left">
                            <h3 className="font-heading text-2xl md:text-3xl font-bold text-primary-dark mb-2 tracking-tight">
                                Company Profile & Brochure
                            </h3>
                            <p className="text-primary-dark/50 text-sm md:text-base max-w-lg">
                                Download our full company profile with our complete project
                                portfolio, service capabilities, and client references.
                            </p>
                        </div>

                        {/* Download button */}
                        <a
                            href="/PCL-Brochure-1.pdf"
                            download
                            className="inline-flex items-center gap-2 bg-primary-dark hover:bg-black text-white font-bold px-8 py-4 rounded-full transition-colors whitespace-nowrap group flex-shrink-0"
                        >
                            <Download className="w-5 h-5" />
                            Download PDF
                        </a>
                    </motion.div>
                </Container>
            </Section>

            {/* ── FAQ Section ── */}
            <FAQ items={faqItems} />

            {/* ── CTA Section ── */}
            <Section className="py-20 md:py-32 bg-primary-dark text-white text-center">
                <Container>
                    <motion.h2
                        className="font-heading text-4xl md:text-6xl lg:text-7xl font-bold tracking-tighter mb-6"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        Ready to start <br /> your project?
                    </motion.h2>
                    <motion.p
                        className="text-white/60 text-lg md:text-xl max-w-xl mx-auto mb-10"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                    >
                        Contact us today for a free consultation and project quote.
                        We're ready to build your vision.
                    </motion.p>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                    >
                        <Link href="/contact">
                            <Button className="bg-accent-orange hover:bg-amber-600 text-primary-dark px-10 py-4 h-auto text-base font-bold flex items-center gap-2 mx-auto group">
                                Contact Us
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </Link>
                    </motion.div>
                </Container>
            </Section>
        </main>
    );
}
