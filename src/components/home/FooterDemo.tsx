import { Footer7 } from "@/components/ui/footer-7";

const sections = [
    {
        title: "Services",
        links: [
            { name: "Residential", href: "/services" },
            { name: "Commercial", href: "/services" },
            { name: "Healthcare", href: "/services" },
            { name: "Renovation", href: "/services" },
        ],
    },
    {
        title: "Pymble",
        links: [
            { name: "Our Story", href: "/about" },
            { name: "Methodology", href: "/about" },
            { name: "Projects", href: "/projects" },
            { name: "Contact", href: "/contact" },
        ],
    },
    {
        title: "Global",
        links: [
            { name: "Zambia", href: "/" },
            { name: "Excellence", href: "/" },
            { name: "Building", href: "/" },
            { name: "Precision", href: "/" },
        ],
    },
];

const DemoOne = () => {
    return (
        <Footer7 sections={sections} />
    );
};

export { DemoOne };
