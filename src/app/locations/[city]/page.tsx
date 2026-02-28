import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocation, locations } from "@/lib/location-data";
import LocationLandingClient from "./LocationLandingClient";

import { SITE_URL } from "@/lib/constants";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";

type Props = {
    params: Promise<{ city: string }>;
};

export async function generateStaticParams() {
    return locations.map((loc) => ({
        city: loc.slug,
    }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { city } = await params;
    const location = getLocation(city);

    if (!location) return { title: "Location Not Found" };

    const title = `Construction Company in ${location.cityName} | Pymble Construction`;
    const description = `Top-rated building and civil works contractors in ${location.cityName}, Zambia. Specialized in commercial, industrial, and government infrastructure projects.`;

    return {
        title: title,
        description: description,
        alternates: {
            canonical: `/locations/${city}`,
        },
        openGraph: {
            title: title,
            description: description,
            url: `${SITE_URL}/locations/${city}`,
            siteName: "Pymble Construction",
            images: [
                {
                    url: `${SITE_URL}/images/og-image.png`,
                    width: 1200,
                    height: 630,
                    alt: title,
                }
            ]
        },
        twitter: {
            card: "summary_large_image",
            title: title,
            description: description,
            images: [`${SITE_URL}/images/og-image.png`],
        }
    };
}

export default async function LocationPage({ params }: Props) {
    const { city } = await params;
    const location = getLocation(city);

    if (!location) {
        notFound();
    }

    return (
        <>
            <BreadcrumbSchema
                items={[
                    { name: "Home", item: "/" },
                    { name: "Locations", item: "/" },
                    { name: location.cityName, item: `/locations/${city}` }
                ]}
            />
            <LocationLandingClient location={location} />
        </>
    );
}
