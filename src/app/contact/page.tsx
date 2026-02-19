"use client";

import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Mail, Phone, MapPin, Send, CheckCircle2, ArrowRight } from "lucide-react";
import { useState } from "react";

export default function ContactPage() {
    const [isSubmitted, setIsSubmitted] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitted(true);
        setTimeout(() => setIsSubmitted(false), 5000);
    };

    return (
        <main className="min-h-screen bg-primary-dark text-white">
            <Section className="pt-32 pb-20 md:pt-48 md:pb-32 min-h-screen flex flex-col justify-center relative overflow-hidden">
                {/* Background Pattern/Texture (Optional) */}
                <div className="absolute inset-0 opacity-5 pointer-events-none">
                    <div className="absolute right-0 top-0 w-[500px] h-[500px] bg-accent-orange/20 blur-[100px] rounded-full mix-blend-screen" />
                    <div className="absolute left-0 bottom-0 w-[500px] h-[500px] bg-white/10 blur-[100px] rounded-full mix-blend-overlay" />
                </div>

                <Container className="relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-start">
                        {/* Left Column: Heading & Info */}
                        <div className="flex flex-col justify-between h-full space-y-12 lg:space-y-24">
                            <div>
                                <motion.span
                                    className="label-uppercase mb-8 block text-accent-orange"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                >
                                    Inquiry / Connection
                                </motion.span>
                                <motion.h1
                                    className="font-heading text-5xl md:text-7xl lg:text-8xl font-bold leading-[0.9] tracking-tighter text-white mb-8"
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.1 }}
                                >
                                    Let&apos;s Build <br /> Together.
                                </motion.h1>
                                <motion.p
                                    className="text-white/60 text-lg md:text-xl max-w-md leading-relaxed"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    Ready to start your next project? We are here to help you bring your vision to life.
                                </motion.p>
                            </div>

                            <motion.div
                                className="space-y-10"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.4 }}
                            >
                                <a href="tel:+260211123456" className="flex items-center gap-6 group">
                                    <div className="w-14 h-14 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-accent-orange group-hover:border-accent-orange group-hover:text-primary-dark transition-all duration-300">
                                        <Phone className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <span className="label-uppercase text-white/40 mb-1 block">Call Us</span>
                                        <span className="text-xl font-medium tracking-tight group-hover:text-accent-orange transition-colors">+260 211 123 456</span>
                                    </div>
                                </a>

                                <a href="mailto:hello@pymble.com" className="flex items-center gap-6 group">
                                    <div className="w-14 h-14 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-accent-orange group-hover:border-accent-orange group-hover:text-primary-dark transition-all duration-300">
                                        <Mail className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <span className="label-uppercase text-white/40 mb-1 block">Email Us</span>
                                        <span className="text-xl font-medium tracking-tight group-hover:text-accent-orange transition-colors">hello@pymble.com</span>
                                    </div>
                                </a>

                                <div className="flex items-center gap-6 group">
                                    <div className="w-14 h-14 rounded-full border border-white/10 flex items-center justify-center">
                                        <MapPin className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <span className="label-uppercase text-white/40 mb-1 block">Visit Us</span>
                                        <span className="text-xl font-medium tracking-tight">Pymble Office Complex, <br /> Lusaka, Zambia</span>
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
                                        className="mt-8 mx-auto"
                                        onClick={() => setIsSubmitted(false)}
                                    >
                                        Send another
                                    </Button>
                                </motion.div>
                            ) : (
                                <form className="space-y-6" onSubmit={handleSubmit}>
                                    <div className="flex items-center justify-between mb-8">
                                        <h3 className="font-heading text-2xl font-bold">Send a Message</h3>
                                        <ArrowRight className="w-5 h-5 opacity-20" />
                                    </div>

                                    <div className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold uppercase tracking-wider opacity-40">Full Name</label>
                                                <input
                                                    type="text"
                                                    placeholder="John Doe"
                                                    className="w-full bg-neutral-100 border-none rounded-lg px-4 py-4 font-medium focus:ring-2 focus:ring-primary-dark/5 placeholder:text-primary-dark/20 transition-all"
                                                    required
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold uppercase tracking-wider opacity-40">Email</label>
                                                <input
                                                    type="email"
                                                    placeholder="john@example.com"
                                                    className="w-full bg-neutral-100 border-none rounded-lg px-4 py-4 font-medium focus:ring-2 focus:ring-primary-dark/5 placeholder:text-primary-dark/20 transition-all"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase tracking-wider opacity-40">Subject</label>
                                            <div className="relative">
                                                <select className="w-full bg-neutral-100 border-none rounded-lg px-4 py-4 font-medium focus:ring-2 focus:ring-primary-dark/5 cursor-pointer appearance-none">
                                                    <option>I have a Residential Project</option>
                                                    <option>I have a Commercial Project</option>
                                                    <option>I have an Industrial Project</option>
                                                    <option>General Inquiry</option>
                                                </select>
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                                                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1L5 5L9 1" /></svg>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase tracking-wider opacity-40">Message</label>
                                            <textarea
                                                rows={4}
                                                placeholder="Tell us a bit about your project goals..."
                                                className="w-full bg-neutral-100 border-none rounded-lg px-4 py-4 font-medium focus:ring-2 focus:ring-primary-dark/5 placeholder:text-primary-dark/20 transition-all resize-none"
                                                required
                                            ></textarea>
                                        </div>
                                    </div>

                                    <Button className="w-full py-4 text-base bg-primary-dark text-white hover:bg-black mt-4 flex items-center justify-center gap-2 group" type="submit">
                                        Send Message
                                        <Send className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </Button>
                                </form>
                            )}
                        </motion.div>
                    </div>
                </Container>
            </Section>

            {/* Simple footer map strip */}
            <div className="h-[300px] w-full bg-neutral-900 flex items-center justify-center relative overflow-hidden group">
                <iframe
                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d123088.32860381732!2d28.2877427!3d-15.402986799999999!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x1940f5a671cfdee3%3A0x7290edbb3b5b4608!2sPymble%20construction%20limited!5e0!3m2!1sen!2szm!4v1771544197598!5m2!1sen!2szm"
                    className="absolute inset-0 w-full h-full object-cover opacity-30 grayscale group-hover:grayscale-0 transition-all duration-700 mixture-blend-overlay"
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
