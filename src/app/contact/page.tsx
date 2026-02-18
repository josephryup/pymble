"use client";

import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Mail, Phone, MapPin, Send, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export default function ContactPage() {
    const [isSubmitted, setIsSubmitted] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitted(true);
        setTimeout(() => setIsSubmitted(false), 5000);
    };

    return (
        <main className="min-h-screen bg-white">
            <Section className="pt-32 pb-20 md:pt-48 md:pb-32">
                <Container>
                    <div className="max-w-4xl">
                        <motion.span
                            className="label-uppercase mb-8 block opacity-60"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            Inquiry / Connection
                        </motion.span>
                        <motion.h1
                            className="font-heading text-5xl md:text-8xl lg:text-[7.5rem] font-bold leading-[0.85] tracking-tighter text-primary-dark mb-16"
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            Let&apos;s Build <br /> Together.
                        </motion.h1>
                    </div>
                </Container>
            </Section>

            <Section>
                <Container>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
                        {/* Contact Form */}
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                        >
                            {isSubmitted ? (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="bg-neutral-50 border border-black/5 rounded-3xl p-16 text-center"
                                >
                                    <div className="w-20 h-20 bg-primary-dark text-white rounded-full flex items-center justify-center mx-auto mb-8">
                                        <CheckCircle2 className="w-10 h-10" strokeWidth={2} />
                                    </div>
                                    <h3 className="text-3xl font-bold text-primary-dark mb-4">Message Sent.</h3>
                                    <p className="label-uppercase opacity-40">We will respond within 24 hours.</p>
                                </motion.div>
                            ) : (
                                <form className="space-y-8" onSubmit={handleSubmit}>
                                    <div className="space-y-8">
                                        <div className="space-y-4">
                                            <label className="label-uppercase mb-4 block">Full Name</label>
                                            <input
                                                type="text"
                                                placeholder="Enter your name"
                                                className="w-full bg-neutral-50 border border-black/5 rounded-xl px-6 py-6 focus:outline-none focus:ring-1 focus:ring-primary-dark/10 focus:border-primary-dark/20 focus:bg-white transition-all"
                                                required
                                            />
                                        </div>
                                        <div className="space-y-4">
                                            <label className="label-uppercase mb-4 block">Email Address</label>
                                            <input
                                                type="email"
                                                placeholder="Enter your email"
                                                className="w-full bg-neutral-50 border border-black/5 rounded-xl px-6 py-6 focus:outline-none focus:ring-1 focus:ring-primary-dark/10 focus:border-primary-dark/20 focus:bg-white transition-all"
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <label className="label-uppercase mb-4 block">Subject</label>
                                        <div className="relative">
                                            <select className="w-full bg-neutral-50 border border-black/5 rounded-xl px-6 py-6 focus:outline-none focus:ring-1 focus:ring-primary-dark/10 focus:border-primary-dark/20 focus:bg-white transition-all appearance-none cursor-pointer">
                                                <option>Residential Inquiry</option>
                                                <option>Commercial Inquiry</option>
                                                <option>General Support</option>
                                                <option>Other</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <label className="label-uppercase mb-4 block">Your Message</label>
                                        <textarea
                                            rows={8}
                                            placeholder="Tell us about your project"
                                            className="w-full bg-neutral-50 border border-black/5 rounded-xl px-6 py-6 focus:outline-none focus:ring-1 focus:ring-primary-dark/10 focus:border-primary-dark/20 focus:bg-white transition-all resize-none"
                                            required
                                        ></textarea>
                                    </div>
                                    <Button className="w-full flex items-center justify-center gap-2 py-5" type="submit">
                                        Send Message
                                        <Send className="w-5 h-5" strokeWidth={2} />
                                    </Button>
                                </form>
                            )}
                        </motion.div>

                        {/* Contact Info */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2 }}
                            className="bg-primary-dark text-white rounded-3xl p-10 md:p-16 flex flex-col justify-between"
                        >
                            <div className="space-y-12">
                                <div>
                                    <h3 className="text-3xl font-bold mb-12">Office / Info</h3>
                                    <div className="space-y-10">
                                        <a href="tel:+61234567890" className="flex items-center gap-6 text-white/50 hover:text-white transition-all group">
                                            <div className="w-16 h-16 rounded-full border border-white/5 flex items-center justify-center group-hover:bg-white group-hover:text-primary-dark transition-all duration-500">
                                                <Phone className="w-6 h-6" strokeWidth={2} />
                                            </div>
                                            <span className="label-uppercase opacity-100">+260 211 123 456</span>
                                        </a>
                                        <a href="mailto:hello@pymbleconstruction.com" className="flex items-center gap-6 text-white/50 hover:text-white transition-all group">
                                            <div className="w-16 h-16 rounded-full border border-white/5 flex items-center justify-center group-hover:bg-white group-hover:text-primary-dark transition-all duration-500">
                                                <Mail className="w-6 h-6" strokeWidth={2} />
                                            </div>
                                            <span className="label-uppercase opacity-100 text-sm">hello@pymbleconstruction.com</span>
                                        </a>
                                        <div className="flex items-center gap-6 text-white/50 group">
                                            <div className="w-16 h-16 rounded-full border border-white/5 flex items-center justify-center">
                                                <MapPin className="w-6 h-6" strokeWidth={2} />
                                            </div>
                                            <span className="label-uppercase opacity-100 text-sm leading-relaxed">Pymble Office Complex, <br /> Lusaka, Zambia</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-xl font-bold mb-6">Social</h3>
                                    <div className="flex gap-4">
                                        {["Instagram", "LinkedIn", "Facebook"].map((social) => (
                                            <a
                                                key={social}
                                                href="#"
                                                className="px-4 py-2 rounded-full border border-white/10 text-caption hover:bg-white hover:text-primary-dark transition-all"
                                            >
                                                {social}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </Container>
            </Section>

            {/* Map Placeholder */}
            <Section className="pb-0">
                <div className="h-[400px] bg-neutral-100 flex items-center justify-center">
                    <p className="text-primary-dark/40 font-mono text-caption tracking-widest uppercase">Interactive Map Coming Soon</p>
                </div>
            </Section>
        </main>
    );
}
