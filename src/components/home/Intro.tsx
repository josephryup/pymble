import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";

export function Intro() {
    return (
        <Section className="bg-white">
            <Container>
                <div className="flex flex-col items-start gap-16 lg:flex-row lg:gap-32">
                    <div className="lg:w-1/2">
                        <span className="label-uppercase mb-8 block text-accent-orange">
                            Client Partnership / Trust
                        </span>
                        <h2 className="font-heading text-4xl sm:text-5xl md:text-6xl leading-[1.08] text-primary-dark">
                            We build together, combining your vision with our expertise to craft spaces that inspire.
                        </h2>
                    </div>
                    <div className="space-y-8 lg:w-1/2">
                        <p className="text-base leading-relaxed text-primary-dark/70 md:text-body">
                            At Pymble Construction, we believe that the best projects are born from collaboration.
                            We guide you through every step of the journey with transparent communication,
                            ensuring that our decades of combined expertise are focused on delivering your specific goals.
                        </p>

                        <Link
                            href="/about"
                            className="inline-flex rounded-full border border-primary-dark px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-primary-dark transition-all duration-300 hover:bg-primary-dark hover:text-white focus:outline-none focus:ring-2 focus:ring-primary-blue focus:ring-offset-2"
                        >
                            Learn More About Us
                        </Link>
                    </div>
                </div>
            </Container>
        </Section>
    );
}
