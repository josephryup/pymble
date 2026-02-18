"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowDown } from "lucide-react";
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
        <section ref={containerRef} className="relative h-screen w-full overflow-hidden bg-primary-dark text-white">
            {/* Cinematic Video Background */}
            <motion.div
                className="absolute inset-0 z-0 scale-105"
                style={{ y }}
            >
                <video
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="h-full w-full object-cover"
                >
                    <source src="/video/hero-bg-video.mp4" type="video/mp4" />
                </video>
                {/* Visual Overlay - Darkening and Backdrop Blur for readability */}
                <div className="absolute inset-0 bg-primary-dark/50 backdrop-blur-[2px] z-10" />
            </motion.div>

            <Container className="relative z-20 h-full flex flex-col justify-between py-12 md:py-20">
                <div className="flex-1 flex items-center">
                    <div className="max-w-4xl space-y-6">
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
                                className="font-heading text-5xl md:text-8xl lg:text-[7rem] leading-[0.9] font-bold tracking-tighter"
                                initial={{ opacity: 0, y: 40 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
                            >
                                Crafting Superior <br /> Construction Solutions <br /> Across Zambia.
                            </motion.h1>

                            <motion.p
                                className="text-white/70 max-w-xl text-body pt-8"
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
