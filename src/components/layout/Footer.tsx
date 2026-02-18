import { Footer7 } from "@/components/ui/footer-7";

const sections = [
    {
        title: "Services",
        links: [
            { name: "Residential", href: "/services" },
            { name: "Commercial", href: "/services" },
            { name: "Healthcare", href: "/services" },
            { name: "Industrial", href: "/services" },
        ],
    },
    {
        title: "Pymble",
        links: [
            { name: "About Us", href: "/about" },
            { name: "Portfolio", href: "/projects" },
            { name: "Methodology", href: "/about" },
            { name: "Contact", href: "/contact" },
        ],
    },
    {
        title: "Connect",
        links: [
            { name: "Zambia", href: "/" },
            { name: "Build Excellence", href: "/" },
            { name: "Get in Touch", href: "/contact" },
            { name: "Privacy Policy", href: "/privacy" },
        ],
    },
];

export function Footer() {
    return (
        <Footer7
            sections={sections}
            description="Crafting superior construction solutions with quality, integrity, and client satisfaction Across Zambia. Built for excellence, driven by precision."
        />
    );
}
