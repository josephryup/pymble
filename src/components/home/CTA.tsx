"use client";

import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { LogoCarousel } from "@/components/ui/LogoCarousel";
import Link from "next/link";
import { ArrowRight, Phone } from "lucide-react";

export function CTA() {
    return (
        <Section className="bg-white py-20 md:py-32">
            <Container>
                <div className="max-w-4xl mx-auto text-center">
                    <motion.h2
                        className="text-5xl md:text-7xl lg:text-8xl font-heading font-bold text-primary-dark mb-8 tracking-tighter leading-[0.9]"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        Let&apos;s build something extraordinary.
                    </motion.h2>

                    <motion.p
                        className="text-lg md:text-xl text-primary-dark/60 max-w-2xl mx-auto mb-12"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                    >
                        Connecting you with world-class craftsmanship <br className="hidden md:block" />
                        to scale, innovate and lead.
                    </motion.p>

                    <motion.div
                        className="flex flex-col sm:flex-row gap-4 justify-center items-center"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                    >
                        <Link href="/contact">
                            <Button
                                variant="ghost"
                                className="w-full sm:w-auto text-base px-8 py-4 h-auto flex items-center gap-2 bg-neutral-100/50 hover:bg-neutral-100 border-none lowercase"
                            >
                                <Phone className="w-4 h-4" />
                                Book a Call
                            </Button>
                        </Link>
                        <Link href="/contact">
                            <Button className="w-full sm:w-auto text-base px-10 py-4 h-auto flex items-center gap-2 bg-primary-dark hover:bg-black lowercase tracking-tight">
                                start your project
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        </Link>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.4 }}
                    >
                        <LogoCarousel />
                    </motion.div>
                </div>
            </Container>
        </Section>
    );
}
