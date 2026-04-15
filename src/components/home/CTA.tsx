import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { LogoCarousel } from "@/components/ui/LogoCarousel";
import { ArrowRight, Phone } from "lucide-react";

export function CTA() {
    return (
        <Section className="section-spacing-lg bg-white">
            <Container>
                <div className="mx-auto max-w-4xl text-center">
                    <h2 className="mb-8 font-heading text-5xl font-bold leading-[0.9] tracking-tighter text-primary-dark md:text-7xl lg:text-8xl">
                        Let&apos;s build something extraordinary.
                    </h2>

                    <p className="mx-auto mb-12 max-w-2xl text-lg text-primary-dark/60 md:text-xl">
                        Connecting you with world-class craftsmanship <br className="hidden md:block" />
                        to scale, innovate and lead.
                    </p>

                    <div className="flex items-center justify-center gap-4 flex-col sm:flex-row">
                        <Link
                            href="/contact"
                            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-neutral-100/50 px-8 py-4 text-base font-semibold lowercase text-primary-dark transition-all duration-300 hover:bg-neutral-100 sm:w-auto"
                        >
                            <Phone className="h-4 w-4" />
                            Book a Call
                        </Link>
                        <Link
                            href="/contact"
                            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary-dark px-10 py-4 text-base font-semibold lowercase tracking-tight text-white transition-all duration-300 hover:bg-black sm:w-auto"
                        >
                            Start your Project
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>

                    <LogoCarousel />
                </div>
            </Container>
        </Section>
    );
}
