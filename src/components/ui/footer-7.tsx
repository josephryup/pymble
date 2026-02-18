import React from "react";
import { FaFacebook, FaInstagram, FaLinkedin, FaTwitter } from "react-icons/fa";

interface Footer7Props {
    logo?: {
        url: string;
        src: string;
        alt: string;
        title: string;
    };
    sections?: Array<{
        title: string;
        links: Array<{ name: string; href: string }>;
    }>;
    description?: string;
    socialLinks?: Array<{
        icon: React.ReactElement;
        href: string;
        label: string;
    }>;
}

const defaultSections = [
    {
        title: "Product",
        links: [
            { name: "Overview", href: "#" },
            { name: "Pricing", href: "#" },
            { name: "Marketplace", href: "#" },
            { name: "Features", href: "#" },
        ],
    },
    {
        title: "Company",
        links: [
            { name: "About", href: "#" },
            { name: "Team", href: "#" },
            { name: "Blog", href: "#" },
            { name: "Careers", href: "#" },
        ],
    },
    {
        title: "Resources",
        links: [
            { name: "Help", href: "#" },
            { name: "Sales", href: "#" },
            { name: "Advertise", href: "#" },
            { name: "Privacy", href: "#" },
        ],
    },
];

const defaultSocialLinks = [
    { icon: <FaInstagram className="size-5" />, href: "#", label: "Instagram" },
    { icon: <FaFacebook className="size-5" />, href: "#", label: "Facebook" },
    { icon: <FaTwitter className="size-5" />, href: "#", label: "Twitter" },
    { icon: <FaLinkedin className="size-5" />, href: "#", label: "LinkedIn" },
];

const defaultLegalLinks = [
    { name: "Terms and Conditions", href: "#" },
    { name: "Privacy Policy", href: "#" },
];

export const Footer7 = ({
    logo = {
        url: "/",
        src: "/logo.png",
        alt: "Pymble Construction",
        title: "Pymble Construction",
    },
    sections = defaultSections,
    description = "Crafting superior construction solutions with quality, integrity, and client satisfaction Across Zambia.",
    socialLinks = defaultSocialLinks,
    copyright = `© ${new Date().getFullYear()} Pymble Construction. All rights reserved.`,
    legalLinks = defaultLegalLinks,
}: Footer7Props & { copyright?: string; legalLinks?: typeof defaultLegalLinks }) => {
    return (
        <section className="py-16 md:py-32 bg-primary-dark text-white">
            <div className="container mx-auto px-4 md:px-8">
                <div className="flex w-full flex-col justify-between gap-10 lg:flex-row lg:items-start lg:text-left">
                    <div className="flex w-full flex-col justify-between gap-6 lg:items-start">
                        {/* Logo */}
                        <div className="flex items-center gap-2 lg:justify-start">
                            <a href={logo.url}>
                                <img
                                    src={logo.src}
                                    alt={logo.alt}
                                    title={logo.title}
                                    className="h-10 object-contain"
                                />
                            </a>
                        </div>
                        <p className="max-w-[70%] text-sm text-white/60">
                            {description}
                        </p>
                        <ul className="flex items-center space-x-6 text-white/40">
                            {socialLinks.map((social, idx) => (
                                <li key={idx} className="font-medium hover:text-accent-orange transition-colors">
                                    <a href={social.href} aria-label={social.label}>
                                        {social.icon}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="grid w-full gap-6 md:grid-cols-3 lg:gap-20">
                        {sections.map((section, sectionIdx) => (
                            <div key={sectionIdx}>
                                <h3 className="mb-4 font-bold label-uppercase text-accent-orange">{section.title}</h3>
                                <ul className="space-y-3 text-sm text-white/60">
                                    {section.links.map((link, linkIdx) => (
                                        <li
                                            key={linkIdx}
                                            className="font-medium hover:text-accent-orange transition-colors"
                                        >
                                            <a href={link.href}>{link.name}</a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="mt-16 flex flex-col justify-between gap-4 border-t border-white/10 py-8 text-xs font-medium text-white/40 md:flex-row md:items-center md:text-left">
                    <p className="order-2 lg:order-1">{copyright}</p>
                    <ul className="order-1 flex flex-col gap-2 md:order-2 md:flex-row">
                        {legalLinks.map((link, idx) => (
                            <li key={idx} className="hover:text-accent-orange transition-colors">
                                <a href={link.href}> {link.name}</a>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </section>
    );
};
