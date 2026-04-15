"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowDown } from "lucide-react";
import Image from "next/image";
import { Container } from "@/components/ui/Container";

export function Hero() {
    const containerRef = useRef(null);

    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end start"],
    });

    const y = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
    const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

    return (
        <section ref={containerRef} className="relative min-h-[100svh] w-full overflow-hidden bg-primary-dark text-white">
            <motion.div
                className="absolute inset-0 z-0 scale-105"
                style={{ y }}
            >
                <Image
                    src="/images/hero/herobg.jpg"
                    alt="Pymble Construction hero section"
                    fill
                    priority
                    className="object-cover"
                    sizes="100vw"
                />
                <div className="absolute inset-0 z-10 bg-primary-dark/70" />
                <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_top_right,rgba(255,165,0,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(34,53,221,0.16),transparent_30%)]" />
            </motion.div>

            <Container className="relative z-20 flex min-h-[100svh] flex-col justify-between py-24 md:py-20">
                <div className="flex flex-1 items-center pt-16 md:pt-0">
                    <div className="max-w-4xl space-y-5 md:space-y-6">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 1, ease: "easeOut" }}
                        >
                            <span className="label-uppercase text-accent-orange mb-6 block">
                                Pymble Construction / Excellence
                            </span>
                        </motion.div>

                        <motion.div style={{ opacity }}>
                            <motion.h1
                                className="font-heading text-4xl sm:text-5xl md:text-7xl lg:text-[7rem] leading-[0.92] font-bold tracking-tighter text-balance"
                                initial={{ opacity: 0, y: 40 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
                            >
                                Crafting Superior <br /> Construction Solutions <br /> Across Zambia.
                            </motion.h1>

                            <motion.p
                                className="max-w-xl pt-6 text-base leading-relaxed text-white/70 md:pt-8 md:text-body"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 1.2, delay: 0.6 }}
                            >
                                Every project built to last. We deliver high-end construction services driven by innovation, expertise, and precision in every architectural detail.
                            </motion.p>
                        </motion.div>
                    </div>
                </div>

                <div className="flex items-end justify-between">
                    <motion.div
                        className="hidden md:block"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1, duration: 1 }}
                    >
                        <p className="label-uppercase text-accent-orange mb-2">Featured Project</p>
                        <p className="text-xl font-medium tracking-tight">Upper North Shore Residence</p>
                    </motion.div>

                    <motion.div
                        className="flex flex-col items-center gap-4 cursor-pointer"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.2 }}
                    >
                        <span className="label-uppercase text-accent-orange">Scroll</span>
                        <motion.div
                            animate={{ y: [0, 8, 0] }}
                            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                        >
                            <ArrowDown className="w-5 h-5 text-accent-orange" />
                        </motion.div>
                    </motion.div>
                </div>
            </Container>
        </section>
    );
}
