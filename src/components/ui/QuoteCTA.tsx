/**
 * Request a Quote — Floating CTA Bar
 * ================================================
 * A persistent lead-generation bar that appears at the
 * bottom of the viewport after the user scrolls past
 * the hero section. Provides a quick-action CTA to
 * request a quote without navigating away.
 *
 * Behavior:
 * - Hidden by default, appears after scrolling 600px
 * - Minimizable (user can dismiss it, it shrinks to icon)
 * - Opens an inline mini-form or links to /contact
 *
 * Brand: Primary dark background with accent orange CTA.
 * ================================================
 */

"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, X, FileText } from "lucide-react";
import Link from "next/link";

export function QuoteCTA() {
    const [isVisible, setIsVisible] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);

    // Show the CTA bar after user scrolls 600px
    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 600) {
                setIsVisible(true);
            } else {
                setIsVisible(false);
            }
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Don't render if user dismissed it
    if (isDismissed) {
        return (
            /* Minimized state — small floating icon to re-open */
            <motion.button
                className="fixed bottom-6 left-6 z-40 w-12 h-12 bg-accent-orange text-primary-dark rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                onClick={() => setIsDismissed(false)}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                title="Request a Quote"
                aria-label="Open quote request"
            >
                <FileText className="w-5 h-5" />
            </motion.button>
        );
    }

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    className="fixed bottom-0 left-0 right-0 z-40"
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                    {/* ── CTA Bar ── */}
                    <div className="bg-primary-dark/95 backdrop-blur-md border-t border-white/10 shadow-2xl">
                        <div className="container mx-auto px-4 md:px-8 py-4 flex items-center justify-between gap-4">
                            {/* Left: Message */}
                            <div className="hidden md:flex items-center gap-4 flex-1">
                                <div className="w-10 h-10 rounded-xl bg-accent-orange/10 flex items-center justify-center flex-shrink-0">
                                    <FileText className="w-5 h-5 text-accent-orange" />
                                </div>
                                <div>
                                    <p className="text-white font-medium text-sm">
                                        Ready to start your project?
                                    </p>
                                    <p className="text-white/50 text-xs">
                                        Get a free quote from our construction experts.
                                    </p>
                                </div>
                            </div>

                            {/* Mobile: Shorter message */}
                            <div className="flex md:hidden items-center gap-3 flex-1">
                                <FileText className="w-5 h-5 text-accent-orange flex-shrink-0" />
                                <p className="text-white font-medium text-sm">
                                    Get a free project quote
                                </p>
                            </div>

                            {/* Right: CTA Button + Dismiss */}
                            <div className="flex items-center gap-3">
                                <Link
                                    href="/contact"
                                    className="inline-flex items-center gap-2 bg-accent-orange hover:bg-amber-500 text-primary-dark font-bold text-sm px-6 py-3 rounded-full transition-colors whitespace-nowrap group"
                                >
                                    Request a Quote
                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                                </Link>
                                <button
                                    onClick={() => setIsDismissed(true)}
                                    className="text-white/30 hover:text-white/60 transition-colors p-1"
                                    aria-label="Dismiss quote bar"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
