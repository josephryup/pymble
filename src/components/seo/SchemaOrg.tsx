import { SITE_URL, COMPANY, CONTACT, SOCIAL, REGIONS, SERVICES } from "@/lib/constants";

export function SchemaOrg() {
    const jsonLd = {
        "@context": "https://schema.org",
        "@id": `${SITE_URL}/#organization`,
        "@type": "ConstructionBusiness",
        "name": COMPANY.name,
        "alternateName": COMPANY.legalName,
        "description": COMPANY.description,
        "url": SITE_URL,
        "logo": {
            "@type": "ImageObject",
            "@id": `${SITE_URL}/#logo`,
            "url": `${SITE_URL}/logo.png`,
            "contentUrl": `${SITE_URL}/logo.png`,
            "width": 512,
            "height": 512,
            "caption": COMPANY.name
        },
        "image": `${SITE_URL}/images/og-image.png`,
        "sameAs": [
            SOCIAL.facebook,
            SOCIAL.instagram,
            SOCIAL.linkedin
        ],
        "address": {
            "@type": "PostalAddress",
            "streetAddress": CONTACT.address.street,
            "addressLocality": CONTACT.address.city,
            "addressRegion": "Lusaka Province",
            "postalCode": "10101",
            "addressCountry": "ZM"
        },
        "geo": {
            "@type": "GeoCoordinates",
            "latitude": -15.4167,
            "longitude": 28.2833
        },
        "telephone": CONTACT.phone.primary,
        "email": CONTACT.email,
        "priceRange": "$$$",
        "hasMap": "https://www.google.com/maps/place/Pymble+construction+limited/data=!4m2!3m1!1s0x0:0x7290edbb3b5b4608",
        "areaServed": REGIONS.map(region => ({
            "@type": "AdministrativeArea",
            "name": region.name
        })),
        "knowsAbout": [
            ...SERVICES.map(s => s.title),
            "General Building Construction",
            "Civil Engineering",
            "Industrial Infrastructure",
            "Zambian Building Regulations",
            "Project Management"
        ],
        "founder": {
            "@type": "Person",
            "name": "Matimba Dominic Hatimbula"
        },
        "openingHoursSpecification": {
            "@type": "OpeningHoursSpecification",
            "dayOfWeek": [
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday"
            ],
            "opens": "08:00",
            "closes": "17:00"
        },
        "potentialAction": {
            "@type": "ReserveAction",
            "target": {
                "@type": "EntryPoint",
                "urlTemplate": `${SITE_URL}/contact`,
                "actionPlatform": [
                    "http://schema.org/DesktopWebPlatform",
                    "http://schema.org/MobileWebPlatform"
                ]
            },
            "result": {
                "@type": "Quote",
                "name": "Construction Quote"
            }
        }
    };

    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
    );
}
