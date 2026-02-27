/**
 * WhatsApp Floating Button
 * ================================================
 * Fixed position CTA button in the bottom-right corner.
 * Clicking opens a WhatsApp chat with Pymble's number
 * pre-filled with a greeting message.
 *
 * This is industry standard for businesses in Zambia
 * and Southern Africa — most clients prefer WhatsApp
 * for initial project inquiries.
 *
 * Brand: Uses accent-orange on hover for consistency.
 * ================================================
 */

"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CONTACT } from "@/lib/constants";

/** WhatsApp link with pre-filled message (remove spaces/special chars from phone) */
const WHATSAPP_NUMBER = CONTACT.phone.primary.replace(/[\s+]/g, "");
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    "Hello Pymble Construction! I'm interested in learning more about your services."
)}`;

export function WhatsAppButton() {
    const [isVisible, setIsVisible] = useState(false);
    const [isTooltipVisible, setIsTooltipVisible] = useState(false);

    // Show button after a short delay so it doesn't compete with initial page load
    useEffect(() => {
        const timer = setTimeout(() => setIsVisible(true), 2000);
        return () => clearTimeout(timer);
    }, []);

    // Show tooltip after 5 seconds to draw attention
    useEffect(() => {
        const timer = setTimeout(() => setIsTooltipVisible(true), 5000);
        // Auto-hide tooltip after 8 seconds
        const hideTimer = setTimeout(() => setIsTooltipVisible(false), 13000);
        return () => {
            clearTimeout(timer);
            clearTimeout(hideTimer);
        };
    }, []);

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    className="fixed bottom-6 right-6 z-50 flex items-center gap-3"
                    initial={{ opacity: 0, scale: 0.5, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                    {/* Tooltip bubble */}
                    <AnimatePresence>
                        {isTooltipVisible && (
                            <motion.div
                                initial={{ opacity: 0, x: 10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                className="bg-white text-primary-dark text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg border border-black/5 whitespace-nowrap hidden md:block"
                            >
                                Chat with us on WhatsApp
                                {/* Triangle pointer */}
                                <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white rotate-45 border-r border-b border-black/5" />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* WhatsApp button */}
                    <a
                        href={WHATSAPP_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Chat with us on WhatsApp"
                        className="group relative"
                        onClick={() => setIsTooltipVisible(false)}
                    >
                        {/* Pulse ring animation */}
                        <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-20" />

                        <div className="relative w-14 h-14 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 group-hover:scale-110">
                            {/* WhatsApp SVG icon */}
                            <svg
                                viewBox="0 0 24 24"
                                fill="white"
                                className="w-7 h-7"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                            </svg>
                        </div>
                    </a>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
