import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { TestimonialsCarousel } from "@/components/ui/unique-testimonial";

export function Testimonials() {
    return (
        <Section className="bg-primary-dark text-white overflow-hidden relative">
            {/* Background Pattern */}
            <div className="absolute top-0 right-0 w-1/3 h-full bg-white/5 skew-x-12 transform translate-x-1/2" />

            <Container className="relative z-10">
                <TestimonialsCarousel />
            </Container>
        </Section>
    );
}
