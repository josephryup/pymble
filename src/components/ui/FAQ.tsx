"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus } from "lucide-react";
import { Container } from "./Container";
import { Section } from "./Section";
import { cn } from "@/lib/utils";

interface FAQItem {
    question: string;
    answer: string;
}

interface FAQProps {
    items: FAQItem[];
    title?: string;
    subtitle?: string;
}

export function FAQ({ items, title = "Frequently Asked Questions", subtitle = "Common inquiries about our construction services and processes." }: FAQProps) {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    return (
        <Section className="bg-neutral-50">
            <Container>
                <div className="flex flex-col lg:flex-row gap-16 lg:gap-24">
                    <div className="lg:w-1/3">
                        <span className="label-uppercase text-accent-orange mb-6 block">(Expert Answers)</span>
                        <h2 className="font-heading text-4xl md:text-5xl font-bold text-primary-dark tracking-tighter leading-[0.9] mb-8">
                            {title}
                        </h2>
                        <p className="text-lg text-primary-dark/60 leading-relaxed font-light">
                            {subtitle}
                        </p>
                    </div>

                    <div className="lg:w-2/3 space-y-4">
                        {items.map((item, index) => {
                            const isOpen = openIndex === index;
                            return (
                                <motion.div
                                    key={index}
                                    className={cn(
                                        "rounded-2xl border transition-all duration-300 overflow-hidden",
                                        isOpen ? "bg-white border-black/10 shadow-sm" : "bg-transparent border-black/5"
                                    )}
                                >
                                    <button
                                        onClick={() => setOpenIndex(isOpen ? null : index)}
                                        className="w-full flex items-center justify-between p-6 md:p-8 text-left group"
                                    >
                                        <span className={cn(
                                            "text-lg md:text-xl font-bold tracking-tight transition-colors",
                                            isOpen ? "text-primary-dark" : "text-primary-dark/60 group-hover:text-primary-dark"
                                        )}>
                                            {item.question}
                                        </span>
                                        <div className={cn(
                                            "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                                            isOpen ? "bg-primary-dark text-white rotate-0" : "bg-black/5 text-primary-dark rotate-90"
                                        )}>
                                            {isOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                        </div>
                                    </button>

                                    <AnimatePresence>
                                        {isOpen && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.3, ease: "easeInOut" }}
                                            >
                                                <div className="px-6 md:px-8 pb-8 pt-0">
                                                    <p className="text-primary-dark/70 leading-relaxed max-w-2xl font-light">
                                                        {item.answer}
                                                    </p>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </Container>
        </Section>
    );
}
