import { Metadata } from "next";
import ContactClient from "./ContactClient";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";

export const metadata: Metadata = {
    title: "Contact Us | Get a Construction Quote in Zambia",
    description: "Ready to start your project? Contact Pymble Construction today. We're based in Lusaka and serve clients across Zambia with high-quality building and civil works.",
    alternates: {
        canonical: "/contact",
    },
};

export default function ContactPage() {
    return (
        <>
            <BreadcrumbSchema
                items={[
                    { name: "Home", item: "/" },
                    { name: "Contact", item: "/contact" }
                ]}
            />
            <ContactClient />
        </>
    );
}
