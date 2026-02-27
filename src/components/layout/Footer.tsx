/**
 * Footer Component
 * ================================================
 * Uses the Footer7 base layout with Pymble-specific
 * navigation sections sourced from brand constants.
 *
 * Sections:
 * - Services: Core service offerings
 * - Company: About, portfolio, blog, resources
 * - Connect: Contact, location, legal
 *
 * Includes inline newsletter signup component below
 * the main footer grid, above the legal bar.
 *
 * Credits: Backlink to PluggedIn Digital as the
 * website designer and maintainer.
 * ================================================
 */

import { Footer7 } from "@/components/ui/footer-7";
import { COMPANY, CONTACT } from "@/lib/constants";
import { NewsletterSignup } from "@/components/ui/NewsletterSignup";

const sections = [
    {
        title: "Services",
        links: [
            { name: "Building Construction", href: "/services" },
            { name: "Renovations", href: "/services" },
            { name: "Civil Works", href: "/services" },
            { name: "Infrastructure", href: "/services" },
        ],
    },
    {
        title: "Company",
        links: [
            { name: "About Us", href: "/about" },
            { name: "Portfolio", href: "/projects" },
            { name: "Blog", href: "/blog" },
            { name: "Resources", href: "/resources" },
            { name: "Contact", href: "/contact" },
        ],
    },
    {
        title: "Connect",
        links: [
            { name: CONTACT.phone.primary, href: CONTACT.phoneHref.primary },
            { name: CONTACT.email, href: `mailto:${CONTACT.email}` },
            { name: CONTACT.address.full, href: "https://www.google.com/maps/place/Pymble+construction+limited/data=!4m2!3m1!1s0x0:0x7290edbb3b5b4608?sa=X&ved=1t:2428&ictx=111" },
        ],
    },
];

export function Footer() {
    return (
        <Footer7
            sections={sections}
            description={`${COMPANY.shortDescription} Built for excellence, driven by precision.`}
        >
            {/* Newsletter signup — inline variant for compact footer layout */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8">
                <div className="max-w-sm">
                    <NewsletterSignup
                        variant="inline"
                        heading="Newsletter"
                        description="Get project updates and construction insights delivered to your inbox."
                    />
                </div>

               
            </div>
        </Footer7>
    );
}
