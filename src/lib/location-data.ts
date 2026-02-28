export type LocationPage = {
    slug: string;
    cityName: string;
    fullName: string;
    description: string;
    heroImage: string;
    keyPoints: string[];
    localProjects: string[]; // slugs of projects
};

export const locations: LocationPage[] = [
    {
        slug: "lusaka",
        cityName: "Lusaka",
        fullName: "Lusaka Headquarters & Central Operations",
        description: "As our primary headquarters, Pymble Construction delivers comprehensive building and civil works across the capital. From commercial high-rises to institutional infrastructure, we are Lusaka's trusted partner for excellence.",
        heroImage: "/images/locations/lusaka.jpg",
        keyPoints: [
            "National Headquarters",
            "Full-scale plant and equipment base",
            "Specialized in Government & NGO projects",
            "Rapid response maintenance teams"
        ],
        localProjects: ["beitcure-hospital-lusaka", "longacres-matebeto-lusaka"]
    },
    {
        slug: "kitwe",
        cityName: "Kitwe",
        fullName: "Copperbelt Operations Hub — Kitwe",
        description: "Strategic industrial and commercial construction services in the heart of the Copperbelt. We support the regional economy with robust infrastructure and high-spec retail developments.",
        heroImage: "/images/locations/kitwe.jpg",
        keyPoints: [
            "Copperbelt regional focus",
            "Industrial warehouse expertise",
            "Retail and service station specialists",
            "Local procurement network"
        ],
        localProjects: ["nandos-rubis-kitwe"]
    },
    {
        slug: "solwezi",
        cityName: "Solwezi",
        fullName: "Mining & Industrial Excellence — Solwezi",
        description: "Supporting the mining sector in the North-Western province with specialized civil engineering and industrial construction solutions built for high-performance environments.",
        heroImage: "/images/locations/solwezi.jpg",
        keyPoints: [
            "Proximity to major mine sites",
            "Specialized industrial civil works",
            "Housing and staff accommodation infrastructure",
            "Heavy-duty steel structure capability"
        ],
        localProjects: []
    },
    {
        slug: "ndola",
        cityName: "Ndola",
        fullName: "Industrial & Commercial Hub — Ndola",
        description: "As a major commercial center in the Copperbelt, Ndola requires high-standards of industrial construction. Pymble Construction provides the expertise needed for warehouses, commercial units, and infrastructure.",
        heroImage: "/images/locations/ndola.jpg",
        keyPoints: [
            "Industrial infrastructure focus",
            "Warehouse design & construction",
            "Strategic road and drainage works",
            "Proximity to regional trade routes"
        ],
        localProjects: []
    },
    {
        slug: "livingstone",
        cityName: "Livingstone",
        fullName: "Southern Province & Tourism Infrastructure — Livingstone",
        description: "Specialized construction services for Southern Zambia, focusing on tourism-related infrastructure, institutional buildings, and public works in Livingstone and surrounding areas.",
        heroImage: "/images/locations/livingstone.jpg",
        keyPoints: [
            "Tourism infrastructure specialists",
            "Sustainable building focus",
            "Hospitality & colonial renovation expertise",
            "Regional development support"
        ],
        localProjects: []
    }
];

export const getLocation = (slug: string) => locations.find(l => l.slug === slug);
