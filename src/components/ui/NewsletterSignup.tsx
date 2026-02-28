/**
 * Newsletter Signup Component
 * ================================================
 * Reusable email capture component for newsletter signups.
 * Can be placed in the footer, blog pages, or as a
 * standalone section.
 *
 * Submission: Uses Web3Forms API (same as contact form).
 * The hidden "subject" field differentiates newsletter
 * signups from regular contact submissions.
 *
 * Variants:
 * - "inline" (default): Compact horizontal layout for footer
 * - "section": Full-width standalone section with more copy
 *
 * Brand: Dark background with accent orange submit button.
 * ================================================
 */

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

interface NewsletterSignupProps {
    /** Layout variant */
    variant?: "inline" | "section";
    /** Optional heading override */
    heading?: string;
    /** Optional description override */
    description?: string;
}

export function NewsletterSignup({
    variant = "inline",
    heading,
    description,
}: NewsletterSignupProps) {
    const [email, setEmail] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Newsletter submission handler
     * Sends to Web3Forms with a distinct subject line so
     * submissions can be filtered from regular contact inquiries.
     *
     * Set NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY in your .env file.
     * Alternatively, integrate with Mailchimp/ConvertKit API.
     */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        // Basic email validation
        if (!email || !email.includes("@")) {
            setError("Please enter a valid email address.");
            setIsSubmitting(false);
            return;
        }

        try {
            const formData = new FormData();
            formData.append("access_key", process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY || "");
            formData.append("subject", "Newsletter Subscription — Pymble Construction");
            formData.append("from_name", "Pymble Newsletter");
            formData.append("email", email);
            formData.append("message", `New newsletter subscription from: ${email}`);

            const response = await fetch("https://api.web3forms.com/submit", {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            if (data.success) {
                setIsSubscribed(true);
                setEmail("");
            } else {
                setError("Something went wrong. Please try again.");
            }
        } catch {
            setError("Network error. Please check your connection.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── Section variant: Full-width standalone section ──
    if (variant === "section") {
        return (
            <motion.section
                className="py-20 md:py-28 bg-primary-dark relative overflow-hidden"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
            >
                {/* Ambient glow */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute right-1/4 top-0 w-[400px] h-[400px] bg-accent-orange/5 blur-[120px] rounded-full" />
                    <div className="absolute left-1/4 bottom-0 w-[300px] h-[300px] bg-primary-blue/5 blur-[100px] rounded-full" />
                </div>

                <div className="container mx-auto px-4 md:px-8 relative z-10 text-center">
                    {/* Icon */}
                    <div className="w-16 h-16 rounded-2xl bg-accent-orange/10 flex items-center justify-center mx-auto mb-8">
                        <Mail className="w-8 h-8 text-accent-orange" />
                    </div>

                    <h2 className="font-heading text-3xl md:text-5xl font-bold text-white tracking-tight mb-4">
                        {heading || "Stay In The Loop"}
                    </h2>
                    <p className="text-white/50 text-lg max-w-lg mx-auto mb-10">
                        {description ||
                            "Get construction insights, project updates, and industry news delivered to your inbox."}
                    </p>

                    {isSubscribed ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex items-center justify-center gap-3 text-green-400"
                        >
                            <CheckCircle2 className="w-6 h-6" />
                            <span className="text-lg font-medium">You&apos;re subscribed! Thank you.</span>
                        </motion.div>
                    ) : (
                        <form
                            onSubmit={handleSubmit}
                            className="flex flex-col sm:flex-row items-center gap-3 max-w-md mx-auto"
                        >
                            <div className="relative flex-1 w-full">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                                <input
                                    type="email"
                                    name="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="your@email.com"
                                    className="w-full bg-white/5 border border-white/10 rounded-full pl-12 pr-4 py-4 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-accent-orange/50 focus:border-accent-orange/50 transition-all"
                                    required
                                    aria-label="Email address"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="bg-accent-orange hover:bg-amber-500 text-primary-dark font-bold px-8 py-4 rounded-full transition-colors flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed group w-full sm:w-auto justify-center"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Subscribing...
                                    </>
                                ) : (
                                    <>
                                        Subscribe
                                        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                                    </>
                                )}
                            </button>
                        </form>
                    )}

                    {error && (
                        <p className="text-red-400 text-sm mt-4">{error}</p>
                    )}

                    <p className="text-white/20 text-xs mt-6">
                        No spam, ever. Unsubscribe anytime.
                    </p>
                </div>
            </motion.section>
        );
    }

    // ── Inline variant: Compact layout for footer ──
    return (
        <div className="w-full">
            <h3 className="font-heading text-sm font-bold uppercase tracking-wider text-accent-orange mb-4">
                {heading || "Newsletter"}
            </h3>
            <p className="text-white/40 text-sm mb-4 leading-relaxed">
                {description || "Get project updates and industry insights."}
            </p>

            {isSubscribed ? (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 text-green-400 text-sm"
                >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Subscribed!</span>
                </motion.div>
            ) : (
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <input
                        type="email"
                        name="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-accent-orange/50 transition-all min-w-0"
                        required
                        aria-label="Email address for newsletter"
                    />
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="bg-accent-orange hover:bg-amber-500 text-primary-dark font-bold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 text-sm disabled:opacity-50 flex-shrink-0"
                        aria-label="Subscribe to newsletter"
                    >
                        {isSubmitting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <ArrowRight className="w-4 h-4" />
                        )}
                    </button>
                </form>
            )}

            {error && (
                <p className="text-red-400 text-xs mt-2">{error}</p>
            )}
        </div>
    );
}
