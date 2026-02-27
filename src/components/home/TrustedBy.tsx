/**
 * TrustedBy Component
 * ================================================
 * Horizontal scrolling marquee of client LOGOS.
 * Creates immediate social proof by showcasing the
 * major organizations Pymble has delivered projects for.
 *
 * Design: Logo-based infinite marquee with grayscale
 * treatment that colorizes on hover. Clients without
 * logo files are shown as styled text labels.
 *
 * Data source: TRUSTED_CLIENTS from lib/constants.ts
 * (sourced from PCL-Brochure-1.pdf project portfolio)
 * ================================================
 */

"use client";

import { motion } from "framer-motion";
import { Section } from "@/components/ui/Section";
import { TRUSTED_CLIENTS } from "@/lib/constants";
import Image from "next/image";

/** Only show clients that have logo assets */
const clientsWithLogos = TRUSTED_CLIENTS.filter(
    (c): c is typeof c & { logo: string } => "logo" in c && !!c.logo
);

export function TrustedBy() {
    return (
        <Section className="py-14 md:py-20 bg-neutral-50 border-y border-black/5 overflow-hidden">
            {/* Section label */}
            <motion.p
                className="label-uppercase text-primary-dark/30 text-center mb-12"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
            >
                Trusted by leading organizations across Zambia
            </motion.p>

            {/* Marquee ticker — double the list for seamless infinite scroll */}
            <div className="relative">
                {/* Fade edges for smooth visual blending */}
                <div className="absolute left-0 top-0 bottom-0 w-20 md:w-32 bg-gradient-to-r from-neutral-50 to-transparent z-10 pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-20 md:w-32 bg-gradient-to-l from-neutral-50 to-transparent z-10 pointer-events-none" />

                <motion.div
                    className="flex items-center gap-12 md:gap-20 whitespace-nowrap"
                    animate={{ x: ["0%", "-50%"] }}
                    transition={{
                        x: {
                            repeat: Infinity,
                            repeatType: "loop",
                            duration: 25,
                            ease: "linear",
                        },
                    }}
                >
                    {/* First set of logos */}
                    {clientsWithLogos.map((client) => (
                        <div
                            key={`a-${client.name}`}
                            className="flex-shrink-0 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-500"
                            title={client.name}
                        >
                            <Image
                                src={client.logo}
                                alt={client.name}
                                width={160}
                                height={60}
                                className="h-10 md:h-14 w-auto object-contain"
                            />
                        </div>
                    ))}

                    {/* Duplicate for seamless loop */}
                    {clientsWithLogos.map((client) => (
                        <div
                            key={`b-${client.name}`}
                            className="flex-shrink-0 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-500"
                            title={client.name}
                        >
                            <Image
                                src={client.logo}
                                alt={client.name}
                                width={160}
                                height={60}
                                className="h-10 md:h-14 w-auto object-contain"
                            />
                        </div>
                    ))}
                </motion.div>
            </div>
        </Section>
    );
}
