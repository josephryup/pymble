"use client";

import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";

export function Intro() {
    return (
        <Section className="bg-white">
            <Container>
                <div className="flex flex-col lg:flex-row gap-16 lg:gap-32 items-start">
                    <div className="lg:w-1/2">
                        <motion.span
                            className="label-uppercase mb-8 block text-accent-orange"
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                        >
                            Client Partnership / Trust
                        </motion.span>
                        <motion.h2
                            className="font-heading text-5xl md:text-6xl leading-[1.1] text-primary-dark"
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6 }}
                        >
                            We build together, combining your vision with our expertise to craft spaces that inspire.
                        </motion.h2>
                    </div>
                    <div className="lg:w-1/2 space-y-8">
                        <motion.p
                            className="text-primary-dark/70 text-body"
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                        >
                            At Pymble Construction, we believe that the best projects are born from collaboration.
                            We guide you through every step of the journey with transparent communication,
                            ensuring that our decades of combined expertise are focused on delivering your specific goals.
                        </motion.p>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6, delay: 0.4 }}
                        >
                            <Button variant="secondary">Learn More About Us</Button>
                        </motion.div>
                    </div>
                </div>
            </Container>
        </Section>
    );
}
