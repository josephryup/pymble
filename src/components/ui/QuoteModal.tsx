"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, CheckCircle2, Loader2 } from "lucide-react";
import { CONTACT } from "@/lib/constants";

interface QuoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    serviceName: string;
}

export function QuoteModal({ isOpen, onClose, serviceName }: QuoteModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

    useEffect(() => {
        if (isOpen) {
            setIsSubmitted(false);
            setError(null);
        }
    }, [isOpen, serviceName]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            const formData = new FormData(e.currentTarget);
            const payload = {
                name: formData.get("name"),
                email: formData.get("email"),
                phone: formData.get("phone"),
                company: formData.get("company"),
                budget: formData.get("budget"),
                service: formData.get("service"),
                message: formData.get("message"),
                website: formData.get("website"),
            };

            const response = await fetch("/api/quote", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                setIsSubmitted(true);
                (e.target as HTMLFormElement).reset();
            } else {
                const data = await response.json().catch(() => null);
                setError(data?.error || "Something went wrong. Please try again or call us directly.");
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
                    <motion.div
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />

                    <motion.div
                        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg overflow-y-auto bg-white shadow-2xl"
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                        <div className="flex min-h-full flex-col p-8 md:p-12">
                            <div className="mb-10 flex items-center justify-between">
                                <div>
                                    <span className="label-uppercase mb-1 block text-[10px] text-accent-orange">
                                        Quote Request
                                    </span>
                                    <h2 className="font-heading text-2xl font-bold text-primary-dark md:text-3xl">
                                        {serviceName}
                                    </h2>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-primary-dark/40 transition-colors hover:border-black/20 hover:text-primary-dark"
                                    aria-label="Close quote modal"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {isSubmitted ? (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex flex-1 flex-col items-center justify-center py-16 text-center"
                                >
                                    <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10 text-green-600">
                                        <CheckCircle2 className="h-10 w-10" strokeWidth={2} />
                                    </div>
                                    <h3 className="mb-3 text-2xl font-bold text-primary-dark">
                                        Quote Request Sent!
                                    </h3>
                                    <p className="mb-2 text-primary-dark/50">
                                        We&apos;ve received your {serviceName.toLowerCase()} inquiry.
                                    </p>
                                    <p className="mb-8 text-primary-dark/50">
                                        Our team will get back to you within 24 hours.
                                    </p>
                                    <button
                                        onClick={onClose}
                                        className="rounded-full bg-primary-dark px-8 py-3 font-medium text-white transition-colors hover:bg-black"
                                    >
                                        Done
                                    </button>
                                </motion.div>
                            ) : (
                                <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
                                    <input type="hidden" name="service" value={serviceName} />
                                    <input
                                        type="text"
                                        name="website"
                                        tabIndex={-1}
                                        autoComplete="off"
                                        className="hidden"
                                        aria-hidden="true"
                                    />

                                    {error && (
                                        <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                                            {error}
                                        </div>
                                    )}

                                    <div className="flex-1 space-y-5">
                                        <div className="space-y-2">
                                            <label htmlFor="quote-name" className="text-xs font-bold uppercase tracking-wider text-primary-dark/40">
                                                Full Name *
                                            </label>
                                            <input
                                                id="quote-name"
                                                type="text"
                                                name="name"
                                                placeholder="Your full name"
                                                className="w-full rounded-xl border border-black/5 bg-neutral-50 px-4 py-3.5 font-medium text-primary-dark outline-none transition-all placeholder:text-primary-dark/20 focus:border-accent-orange/50 focus:ring-2 focus:ring-accent-orange/20"
                                                required
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label htmlFor="quote-email" className="text-xs font-bold uppercase tracking-wider text-primary-dark/40">
                                                Email Address *
                                            </label>
                                            <input
                                                id="quote-email"
                                                type="email"
                                                name="email"
                                                placeholder="you@company.com"
                                                className="w-full rounded-xl border border-black/5 bg-neutral-50 px-4 py-3.5 font-medium text-primary-dark outline-none transition-all placeholder:text-primary-dark/20 focus:border-accent-orange/50 focus:ring-2 focus:ring-accent-orange/20"
                                                required
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label htmlFor="quote-phone" className="text-xs font-bold uppercase tracking-wider text-primary-dark/40">
                                                Phone Number *
                                            </label>
                                            <input
                                                id="quote-phone"
                                                type="tel"
                                                name="phone"
                                                placeholder="+260 9XX XXX XXX"
                                                className="w-full rounded-xl border border-black/5 bg-neutral-50 px-4 py-3.5 font-medium text-primary-dark outline-none transition-all placeholder:text-primary-dark/20 focus:border-accent-orange/50 focus:ring-2 focus:ring-accent-orange/20"
                                                required
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label htmlFor="quote-company" className="text-xs font-bold uppercase tracking-wider text-primary-dark/40">
                                                Company / Organization
                                            </label>
                                            <input
                                                id="quote-company"
                                                type="text"
                                                name="company"
                                                placeholder="Optional"
                                                className="w-full rounded-xl border border-black/5 bg-neutral-50 px-4 py-3.5 font-medium text-primary-dark outline-none transition-all placeholder:text-primary-dark/20 focus:border-accent-orange/50 focus:ring-2 focus:ring-accent-orange/20"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label htmlFor="quote-message" className="text-xs font-bold uppercase tracking-wider text-primary-dark/40">
                                                Project Description *
                                            </label>
                                            <textarea
                                                id="quote-message"
                                                name="message"
                                                rows={4}
                                                placeholder={`Describe your ${serviceName.toLowerCase()} project - scope, location, timeline...`}
                                                className="w-full resize-none rounded-xl border border-black/5 bg-neutral-50 px-4 py-3.5 font-medium text-primary-dark outline-none transition-all placeholder:text-primary-dark/20 focus:border-accent-orange/50 focus:ring-2 focus:ring-accent-orange/20"
                                                required
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label htmlFor="quote-budget" className="text-xs font-bold uppercase tracking-wider text-primary-dark/40">
                                                Estimated Budget Range
                                            </label>
                                            <select
                                                id="quote-budget"
                                                name="budget"
                                                className="w-full cursor-pointer appearance-none rounded-xl border border-black/5 bg-neutral-50 px-4 py-3.5 font-medium text-primary-dark outline-none transition-all focus:border-accent-orange/50 focus:ring-2 focus:ring-accent-orange/20"
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

                                    <div className="mt-8 border-t border-black/5 pt-6">
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-accent-orange py-4 font-bold text-primary-dark transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <Loader2 className="h-5 w-5 animate-spin" />
                                                    Sending Request...
                                                </>
                                            ) : (
                                                <>
                                                    <Send className="h-5 w-5" />
                                                    Request a Quote
                                                </>
                                            )}
                                        </button>
                                        <p className="mt-4 text-center text-xs text-primary-dark/30">
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
