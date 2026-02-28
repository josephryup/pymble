"use client";

import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Mail, Phone, MapPin, Send, CheckCircle2, ArrowRight } from "lucide-react";
import { useState } from "react";
import { CONTACT, GOOGLE_MAPS_EMBED_URL } from "@/lib/constants";

export default function ContactClient() {
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
                (e.target as HTMLFormElement).reset();
            } else {
                setError("Something went wrong. Please try again or contact us directly.");
            }
        } catch {
            setError("Network error. Please check your connection and try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="min-h-screen bg-primary-dark text-white">
            <Section className="pt-32 pb-20 md:pt-48 md:pb-32 min-h-screen flex flex-col justify-center relative overflow-hidden">
                {/* Background Pattern/Texture — Ambient glow effects */}
                <div className="absolute inset-0 opacity-5 pointer-events-none">
                    <div className="absolute right-0 top-0 w-[500px] h-[500px] bg-accent-orange/20 blur-[100px] rounded-full mix-blend-screen" />
                    <div className="absolute left-0 bottom-0 w-[500px] h-[500px] bg-white/10 blur-[100px] rounded-full mix-blend-overlay" />
                </div>

                <Container className="relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-start">
                        {/* Left Column: Heading & Contact Info */}
                        <div className="flex flex-col justify-between h-full space-y-12 lg:space-y-24">
                            <div>
                                <motion.span
                                    className="label-uppercase mb-8 block text-accent-orange"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                >
                                    Inquiry / Connection
                                </motion.span>
                                <h1 className="font-heading text-5xl md:text-7xl lg:text-8xl font-bold leading-[0.9] tracking-tighter text-white mb-8">
                                    Let&apos;s Build <br /> Together.
                                </h1>
                                <motion.p
                                    className="text-white/60 text-lg md:text-xl max-w-md leading-relaxed"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    Ready to start your next project? We are here to help you bring your vision to life.
                                </motion.p>
                            </div>

                            {/* Contact Details — Sourced from centralized constants */}
                            <motion.div
                                className="space-y-10"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.4 }}
                            >
                                {/* Primary Phone */}
                                <a href={CONTACT.phoneHref.primary} className="flex items-center gap-6 group">
                                    <div className="w-14 h-14 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-accent-orange group-hover:border-accent-orange group-hover:text-primary-dark transition-all duration-300">
                                        <Phone className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <span className="label-uppercase text-white/40 mb-1 block">Call Us</span>
                                        <span className="text-xl font-medium tracking-tight group-hover:text-accent-orange transition-colors">{CONTACT.phone.primary}</span>
                                    </div>
                                </a>

                                {/* Email */}
                                <a href={`mailto:${CONTACT.email}`} className="flex items-center gap-6 group">
                                    <div className="w-14 h-14 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-accent-orange group-hover:border-accent-orange group-hover:text-primary-dark transition-all duration-300">
                                        <Mail className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <span className="label-uppercase text-white/40 mb-1 block">Email Us</span>
                                        <span className="text-xl font-medium tracking-tight group-hover:text-accent-orange transition-colors">{CONTACT.email}</span>
                                    </div>
                                </a>

                                {/* Location */}
                                <div className="flex items-center gap-6 group">
                                    <div className="w-14 h-14 rounded-full border border-white/10 flex items-center justify-center">
                                        <MapPin className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <span className="label-uppercase text-white/40 mb-1 block">Visit Us</span>
                                        <span className="text-xl font-medium tracking-tight">{CONTACT.address.full}</span>
                                    </div>
                                </div>
                            </motion.div>
                        </div>

                        {/* Right Column: High-Contrast Form Card */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 }}
                            className="bg-white rounded-3xl p-8 md:p-12 text-primary-dark shadow-2xl relative"
                        >
                            {isSubmitted ? (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="text-center py-20"
                                >
                                    <div className="w-20 h-20 bg-green-500/10 text-green-600 rounded-full flex items-center justify-center mx-auto mb-8">
                                        <CheckCircle2 className="w-10 h-10" strokeWidth={2} />
                                    </div>
                                    <h3 className="text-3xl font-bold mb-4">Message Sent.</h3>
                                    <p className="opacity-60">We will be in touch shortly.</p>
                                    <Button
                                        variant="ghost"
                                        className="mt-8 mx-auto text-primary-dark border-primary-dark/10 hover:bg-neutral-100"
                                        onClick={() => setIsSubmitted(false)}
                                    >
                                        Send another
                                    </Button>
                                </motion.div>
                            ) : (
                                <form className="space-y-6" onSubmit={handleSubmit}>
                                    <input type="hidden" name="access_key" value={process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY || ""} />
                                    <input type="hidden" name="subject" value="New Inquiry — Pymble Construction Website" />
                                    <input type="hidden" name="from_name" value="Pymble Construction Website" />

                                    <div className="flex items-center justify-between mb-8">
                                        <h3 className="font-heading text-2xl font-bold">Send a Message</h3>
                                        <ArrowRight className="w-5 h-5 opacity-20" />
                                    </div>

                                    {error && (
                                        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                                            {error}
                                        </div>
                                    )}

                                    <div className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label htmlFor="contact-name" className="text-xs font-bold uppercase tracking-wider opacity-40">Full Name</label>
                                                <input
                                                    id="contact-name"
                                                    type="text"
                                                    name="name"
                                                    placeholder="Your full name"
                                                    className="w-full bg-neutral-100 border-none rounded-lg px-4 py-4 font-medium focus:ring-2 focus:ring-primary-dark/5 placeholder:text-primary-dark/20 transition-all text-primary-dark"
                                                    required
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label htmlFor="contact-email" className="text-xs font-bold uppercase tracking-wider opacity-40">Email</label>
                                                <input
                                                    id="contact-email"
                                                    type="email"
                                                    name="email"
                                                    placeholder="you@example.com"
                                                    className="w-full bg-neutral-100 border-none rounded-lg px-4 py-4 font-medium focus:ring-2 focus:ring-primary-dark/5 placeholder:text-primary-dark/20 transition-all text-primary-dark"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label htmlFor="contact-phone" className="text-xs font-bold uppercase tracking-wider opacity-40">Phone Number</label>
                                            <input
                                                id="contact-phone"
                                                type="tel"
                                                name="phone"
                                                placeholder="+260 9XX XXX XXX"
                                                className="w-full bg-neutral-100 border-none rounded-lg px-4 py-4 font-medium focus:ring-2 focus:ring-primary-dark/5 placeholder:text-primary-dark/20 transition-all text-primary-dark"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label htmlFor="contact-subject" className="text-xs font-bold uppercase tracking-wider opacity-40">Subject</label>
                                            <div className="relative">
                                                <select
                                                    id="contact-subject"
                                                    name="project_type"
                                                    className="w-full bg-neutral-100 border-none rounded-lg px-4 py-4 font-medium focus:ring-2 focus:ring-primary-dark/5 cursor-pointer appearance-none text-primary-dark"
                                                >
                                                    <option>Building Construction Inquiry</option>
                                                    <option>Renovation Project</option>
                                                    <option>Civil Works Inquiry</option>
                                                    <option>Infrastructure Development</option>
                                                    <option>General Inquiry</option>
                                                </select>
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40 text-primary-dark">
                                                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1L5 5L9 1" /></svg>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label htmlFor="contact-message" className="text-xs font-bold uppercase tracking-wider opacity-40">Message</label>
                                            <textarea
                                                id="contact-message"
                                                name="message"
                                                rows={4}
                                                placeholder="Tell us about your project goals..."
                                                className="w-full bg-neutral-100 border-none rounded-lg px-4 py-4 font-medium focus:ring-2 focus:ring-primary-dark/5 placeholder:text-primary-dark/20 transition-all resize-none text-primary-dark"
                                                required
                                            ></textarea>
                                        </div>
                                    </div>

                                    <Button
                                        className="w-full py-4 text-base bg-primary-dark text-white hover:bg-black mt-4 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                                        type="submit"
                                        disabled={isSubmitting}
                                    >
                                        {isSubmitting ? "Sending..." : "Send Message"}
                                        <Send className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </Button>
                                </form>
                            )}
                        </motion.div>
                    </div>
                </Container>
            </Section>

            {/* Google Maps — Embed URL from centralized constants */}
            <div className="h-[300px] w-full bg-neutral-900 flex items-center justify-center relative overflow-hidden group">
                <iframe
                    src={GOOGLE_MAPS_EMBED_URL}
                    className="absolute inset-0 w-full h-full object-cover opacity-30 grayscale group-hover:grayscale-0 transition-all duration-700 mix-blend-overlay"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                />
                <div className="relative z-10 bg-primary-dark/80 backdrop-blur-sm px-8 py-4 rounded-full border border-white/10 transform translate-y-8 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                    <span className="label-uppercase text-white tracking-widest text-xs">View on Google Maps</span>
                </div>
            </div>
        </main>
    );
}
