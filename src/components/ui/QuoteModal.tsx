/**
 * Service Quote Request Modal
 * ================================================
 * A slide-in modal form for requesting a quote for a
 * specific service. Opens when user clicks "Request a
 * Quote" on a service card.
 *
 * The service name is pre-selected so the enquiry is
 * already contextual — better conversion than a generic
 * contact form.
 *
 * Submission: Web3Forms API (same as contact/newsletter).
 * Design: White modal on dark overlay, brand-consistent.
 * ================================================
 */

"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, CheckCircle2, Loader2 } from "lucide-react";
import { CONTACT } from "@/lib/constants";

interface QuoteModalProps {
    /** Whether the modal is open */
    isOpen: boolean;
    /** Close handler */
    onClose: () => void;
    /** Pre-selected service name */
    serviceName: string;
}

export function QuoteModal({ isOpen, onClose, serviceName }: QuoteModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Lock body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    // Reset state when modal opens with new service
    useEffect(() => {
        if (isOpen) {
            setIsSubmitted(false);
            setError(null);
        }
    }, [isOpen, serviceName]);

    /**
     * Submit quote request via Web3Forms.
     * Includes the service name so the client knows
     * which service the enquiry is about.
     */
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            const formData = new FormData(e.currentTarget);
            const response = await fetch("https://api.web3forms.com/submit", {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            if (data.success) {
                setIsSubmitted(true);
            } else {
                setError("Something went wrong. Please try again or call us directly.");
            }
        } catch {
            setError("Network error. Please check your connection and try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop overlay */}
                    <motion.div
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />

                    {/* Modal panel — slides in from right on desktop, bottom on mobile */}
                    <motion.div
                        className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white z-50 overflow-y-auto shadow-2xl"
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                        <div className="p-8 md:p-12 min-h-full flex flex-col">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-10">
                                <div>
                                    <span className="label-uppercase text-accent-orange text-[10px] mb-1 block">
                                        Quote Request
                                    </span>
                                    <h2 className="font-heading text-2xl md:text-3xl font-bold text-primary-dark">
                                        {serviceName}
                                    </h2>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="w-10 h-10 rounded-full border border-black/10 flex items-center justify-center text-primary-dark/40 hover:text-primary-dark hover:border-black/20 transition-colors"
                                    aria-label="Close quote modal"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {isSubmitted ? (
                                /* ── Success State ── */
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="text-center py-16 flex-1 flex flex-col items-center justify-center"
                                >
                                    <div className="w-20 h-20 bg-green-500/10 text-green-600 rounded-full flex items-center justify-center mx-auto mb-8">
                                        <CheckCircle2 className="w-10 h-10" strokeWidth={2} />
                                    </div>
                                    <h3 className="text-2xl font-bold text-primary-dark mb-3">
                                        Quote Request Sent!
                                    </h3>
                                    <p className="text-primary-dark/50 mb-2">
                                        We&apos;ve received your {serviceName.toLowerCase()} inquiry.
                                    </p>
                                    <p className="text-primary-dark/50 mb-8">
                                        Our team will get back to you within 24 hours.
                                    </p>
                                    <button
                                        onClick={onClose}
                                        className="bg-primary-dark text-white px-8 py-3 rounded-full font-medium hover:bg-black transition-colors"
                                    >
                                        Done
                                    </button>
                                </motion.div>
                            ) : (
                                /* ── Quote Form ── */
                                <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
                                    {/* Web3Forms hidden fields */}
                                    <input type="hidden" name="access_key" value="YOUR_WEB3FORMS_ACCESS_KEY" />
                                    <input type="hidden" name="subject" value={`Quote Request: ${serviceName} — Pymble Construction`} />
                                    <input type="hidden" name="from_name" value="Pymble Construction Quote" />
                                    <input type="hidden" name="service" value={serviceName} />

                                    {error && (
                                        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm mb-6">
                                            {error}
                                        </div>
                                    )}

                                    <div className="space-y-5 flex-1">
                                        {/* Name */}
                                        <div className="space-y-2">
                                            <label htmlFor="quote-name" className="text-xs font-bold uppercase tracking-wider text-primary-dark/40">
                                                Full Name *
                                            </label>
                                            <input
                                                id="quote-name"
                                                type="text"
                                                name="name"
                                                placeholder="Your full name"
                                                className="w-full bg-neutral-50 border border-black/5 rounded-xl px-4 py-3.5 font-medium text-primary-dark focus:ring-2 focus:ring-accent-orange/20 focus:border-accent-orange/50 placeholder:text-primary-dark/20 transition-all outline-none"
                                                required
                                            />
                                        </div>

                                        {/* Email */}
                                        <div className="space-y-2">
                                            <label htmlFor="quote-email" className="text-xs font-bold uppercase tracking-wider text-primary-dark/40">
                                                Email Address *
                                            </label>
                                            <input
                                                id="quote-email"
                                                type="email"
                                                name="email"
                                                placeholder="you@company.com"
                                                className="w-full bg-neutral-50 border border-black/5 rounded-xl px-4 py-3.5 font-medium text-primary-dark focus:ring-2 focus:ring-accent-orange/20 focus:border-accent-orange/50 placeholder:text-primary-dark/20 transition-all outline-none"
                                                required
                                            />
                                        </div>

                                        {/* Phone */}
                                        <div className="space-y-2">
                                            <label htmlFor="quote-phone" className="text-xs font-bold uppercase tracking-wider text-primary-dark/40">
                                                Phone Number *
                                            </label>
                                            <input
                                                id="quote-phone"
                                                type="tel"
                                                name="phone"
                                                placeholder="+260 9XX XXX XXX"
                                                className="w-full bg-neutral-50 border border-black/5 rounded-xl px-4 py-3.5 font-medium text-primary-dark focus:ring-2 focus:ring-accent-orange/20 focus:border-accent-orange/50 placeholder:text-primary-dark/20 transition-all outline-none"
                                                required
                                            />
                                        </div>

                                        {/* Company / Organization */}
                                        <div className="space-y-2">
                                            <label htmlFor="quote-company" className="text-xs font-bold uppercase tracking-wider text-primary-dark/40">
                                                Company / Organization
                                            </label>
                                            <input
                                                id="quote-company"
                                                type="text"
                                                name="company"
                                                placeholder="Optional"
                                                className="w-full bg-neutral-50 border border-black/5 rounded-xl px-4 py-3.5 font-medium text-primary-dark focus:ring-2 focus:ring-accent-orange/20 focus:border-accent-orange/50 placeholder:text-primary-dark/20 transition-all outline-none"
                                            />
                                        </div>

                                        {/* Project Description */}
                                        <div className="space-y-2">
                                            <label htmlFor="quote-message" className="text-xs font-bold uppercase tracking-wider text-primary-dark/40">
                                                Project Description *
                                            </label>
                                            <textarea
                                                id="quote-message"
                                                name="message"
                                                rows={4}
                                                placeholder={`Describe your ${serviceName.toLowerCase()} project — scope, location, timeline...`}
                                                className="w-full bg-neutral-50 border border-black/5 rounded-xl px-4 py-3.5 font-medium text-primary-dark focus:ring-2 focus:ring-accent-orange/20 focus:border-accent-orange/50 placeholder:text-primary-dark/20 transition-all outline-none resize-none"
                                                required
                                            ></textarea>
                                        </div>

                                        {/* Budget Range */}
                                        <div className="space-y-2">
                                            <label htmlFor="quote-budget" className="text-xs font-bold uppercase tracking-wider text-primary-dark/40">
                                                Estimated Budget Range
                                            </label>
                                            <select
                                                id="quote-budget"
                                                name="budget"
                                                className="w-full bg-neutral-50 border border-black/5 rounded-xl px-4 py-3.5 font-medium text-primary-dark focus:ring-2 focus:ring-accent-orange/20 focus:border-accent-orange/50 transition-all outline-none appearance-none cursor-pointer"
                                            >
                                                <option value="">Select a range (optional)</option>
                                                <option value="Under K500,000">Under K500,000</option>
                                                <option value="K500,000 - K2,000,000">K500,000 - K2,000,000</option>
                                                <option value="K2,000,000 - K10,000,000">K2,000,000 - K10,000,000</option>
                                                <option value="Over K10,000,000">Over K10,000,000</option>
                                                <option value="Not sure yet">Not sure yet</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Footer with submit + contact info */}
                                    <div className="mt-8 pt-6 border-t border-black/5">
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="w-full bg-accent-orange hover:bg-amber-500 text-primary-dark font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    Sending Request...
                                                </>
                                            ) : (
                                                <>
                                                    <Send className="w-5 h-5" />
                                                    Request a Quote
                                                </>
                                            )}
                                        </button>
                                        <p className="text-primary-dark/30 text-xs text-center mt-4">
                                            Or call us directly at{" "}
                                            <a href={CONTACT.phoneHref.primary} className="text-accent-orange hover:underline">
                                                {CONTACT.phone.primary}
                                            </a>
                                        </p>
                                    </div>
                                </form>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
