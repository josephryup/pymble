"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useState } from "react";

const logos = [
    { name: "ZRA", src: "/logos/ZRA-logo-01.png" },
    { name: "CEEC", src: "/logos/ceec-logo-1-300x300.png" },
    { name: "EIZ", src: "/logos/eiz.jpg" },
    { name: "Logo 4", src: "/logos/logo_4.png" },
    { name: "NCC", src: "/logos/ncc_logo_.webp" },
    { name: "PACRA", src: "/logos/pacra_logo.png" },
    { name: "Workers", src: "/logos/workers.png" },
    { name: "ZPPA", src: "/logos/zppa_logo.jpeg" },
];

export function LogoCarousel() {
    const [isPaused, setIsPaused] = useState(false);

    // Double the logos to create a seamless loop
    const duplicatedLogos = [...logos, ...logos, ...logos];

    return (
        <div className="w-full py-12 border-t border-black/5 mt-20 overflow-hidden">
            <div className="text-center mb-10">
                <p className="text-sm font-medium text-primary-dark/40">
                    Certification Bodies <span className    ="text-primary-dark font-bold"></span>
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
                            className="flex items-center justify-center opacity-30 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-500 hover:scale-110 shrink-0"
                        >
                            <div className="relative h-12 w-32 md:h-16 md:w-40 flex items-center justify-center">
                                <Image
                                    src={logo.src}
                                    alt={`${logo.name} logo`}
                                    fill
                                    className="object-contain"
                                    sizes="(max-width: 768px) 128px, 160px"
                                />
                            </div>
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
