"use client";

import { motion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { useState } from "react";
import { cn } from "@/lib/utils";

const steps = [
    {
        id: "01",
        title: "Sketch Design",
        description: "Initial concepts and layout studies to explore the potential of your site and vision.",
        image: "/images/process/sketch.webp"
    },
    {
        id: "02",
        title: "Design Development",
        description: "Refining the selected concept with technical details, materials, and spatial planning.",
        image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=2070&auto=format&fit=crop"
    },
    {
        id: "03",
        title: "Development Application",
        description: "Preparation and submission of all necessary documents for local council approvals.",
        image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop"
    },
    {
        id: "04",
        title: "Interior Design",
        description: "Tailoring the internal experience through custom joinery, finishes, and lighting design.",
        image: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?q=80&w=2000&auto=format&fit=crop"
    },
    {
        id: "05",
        title: "Building approval plans + documentation",
        description: "Detailed construction documentation and engineering coordination for building certification.",
        image: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=80&w=2070&auto=format&fit=crop"
    },
    {
        id: "06",
        title: "Construction plans + documentation",
        description: "Final specialized drawings and specifications to guide the build with absolute precision.",
        image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=2070&auto=format&fit=crop"
    },
];

import Image from "next/image";

export function Process() {
    const [activeStep, setActiveStep] = useState(steps[0]);

    return (
        <Section className="bg-white border-t border-black/5 overflow-hidden min-h-0 md:min-h-screen flex flex-col justify-center">
            <Container>
                <div className="flex flex-col lg:flex-row gap-12 lg:gap-24 items-start">
                    {/* Left Column: Image + List */}
                    <div className="w-full lg:w-1/2 flex flex-col gap-10 order-2 lg:order-1">
                        <motion.div
                            key={activeStep.id}
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.6 }}
                            className="relative aspect-[16/9] w-full overflow-hidden rounded-sm"
                        >
                            <Image
                                src={activeStep.image}
                                alt={activeStep.title}
                                fill
                                className="object-cover"
                            />
                        </motion.div>

                        <div className="space-y-0 max-w-lg">
                            {steps.map((step) => (
                                <div
                                    key={step.id}
                                    onMouseEnter={() => setActiveStep(step)}
                                    className={cn(
                                        "group flex items-center gap-6 py-3 border-b border-black/5 cursor-pointer transition-all duration-300",
                                        activeStep.id === step.id ? "opacity-100" : "opacity-30 hover:opacity-100"
                                    )}
                                >
                                    <span className="text-[11px] font-mono tracking-widest text-primary-dark uppercase">
                                        ({step.id})
                                    </span>
                                    <h3 className="text-sm md:text-base font-bold tracking-tight text-primary-dark uppercase">
                                        {step.title}
                                    </h3>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right Column: Statement Typography */}
                    <div className="w-full lg:w-1/2 flex flex-col gap-8 pt-0 order-1 lg:order-2">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 1 }}
                        >
                            <span className="label-uppercase mb-6 block text-accent-orange">
                                Methodology / 6-Stage Journey
                            </span>
                            <h2 className="font-heading text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold leading-[1.1] tracking-tighter text-primary-dark mb-8">
                                Our approach at Pymble <br />
                                is designed to make your journey <br />
                                from concept to completion as <br />
                                smooth and enjoyable as possible.
                            </h2>

                            <div className="max-w-xl">
                                <p className="font-heading text-xl md:text-2xl lg:text-3xl font-bold leading-[1.2] tracking-tighter text-primary-dark opacity-60">
                                    With our 6-stage process, we <br />
                                    prioritise clarity, collaboration, and <br />
                                    your unique vision.
                                </p>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </Container>
        </Section>
    );
}
