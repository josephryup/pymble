"use client";

import { motion } from "framer-motion";
import { useState } from "react";

const logos = [
    { name: "Supabase" },
    { name: "OpenAI" },
    { name: "Vercel" },
    { name: "GitHub" },
    { name: "Claude" },
    { name: "Clerk" },
    { name: "NVIDIA" },
    { name: "Turso" },
];

export function LogoCarousel() {
    const [isPaused, setIsPaused] = useState(false);

    // Double the logos to create a seamless loop
    const duplicatedLogos = [...logos, ...logos, ...logos];

    return (
        <div className="w-full py-12 border-t border-black/5 mt-20 overflow-hidden">
            <div className="text-center mb-10">
                <p className="text-sm font-medium text-primary-dark/40">
                    Trusted by <span className="text-primary-dark font-bold">experts</span>
                </p>
            </div>

            <div
                className="relative flex overflow-hidden group"
                onMouseEnter={() => setIsPaused(true)}
                onMouseLeave={() => setIsPaused(false)}
            >
                <motion.div
                    className="flex whitespace-nowrap gap-16 md:gap-24 items-center px-8"
                    animate={{ x: isPaused ? undefined : ["0%", "-33.33%"] }}
                    transition={{
                        x: {
                            repeat: Infinity,
                            repeatType: "loop",
                            duration: 30,
                            ease: "linear",
                        },
                    }}
                >
                    {duplicatedLogos.map((logo, idx) => (
                        <div
                            key={`${logo.name}-${idx}`}
                            className="flex items-center justify-center opacity-30 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-500 hover:scale-110"
                        >
                            <span className="font-heading font-bold text-xl md:text-2xl tracking-tighter text-primary-dark">
                                {logo.name}
                            </span>
                        </div>
                    ))}
                </motion.div>

                {/* Gradient Masks */}
                <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
                <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
            </div>
        </div>
    );
}
