export type Project = {
    id: number;
    slug: string;
    title: string;
    category: string;
    year: string;
    image?: string;
    video?: string;
    poster?: string;
    description: string;
    location: string;
    client: string;
    scope: string[];
    challenges?: string;
    solution?: string;
    gallery?: string[];
};

export const projectCategories = [
    "All",
    "Commercial",
    "Healthcare",
    "Hospitality",
    "Infrastructure",
    "Civil Works",
    "Residential",
];

export const projects: Project[] = [
    {
        id: 1,
        slug: "nandos-rubis-kitwe",
        title: "Nandos (Rubis) — Kitwe",
        category: "Commercial",
        year: "2026",
        image: "/images/projects/Rubis-gas-station.jpg",
        location: "Kitwe, Zambia",
        client: "Rubis Energy / Nandos Zambia",
        description: "Full construction and fit-out of a flagship Nandos outlet integrated with a Rubis service station in Kitwe. The project required high-specification interior finishes and specialized equipment installation while maintaining the fast-paced timeline of a retail environment.",
        scope: [
            "Structural modification and reinforcement",
            "Premium interior fit-out (flooring, joinery, lighting)",
            "Specialized HVAC and extraction systems",
            "Plumbing and commercial kitchen infrastructure",
            "Branding and external signage installation"
        ],
        gallery: [
            "/images/projects/Rubis-gas-station.jpg"
        ]
    },
    {
        id: 2,
        slug: "beitcure-hospital-lusaka",
        title: "BeitCure Hospital — Lusaka",
        category: "Healthcare",
        year: "2025",
        image: "/images/projects/beitcure.jpg",
        location: "Lusaka, Zambia",
        client: "BeitCure International",
        description: "Expansion and modernization of specialized healthcare facilities. This medical project demanded strict adherence to hygienic standards and precise electrical/mechanical installations for hospital departments.",
        scope: [
            "Construction of specialized medical wards",
            "Installation of hospital-grade finishes",
            "Upgrade of medical gas and oxygen systems",
            "Electrical backup and stabilizer systems",
            "Hygienic plumbing and sanitation works"
        ],
        gallery: [
            "/images/projects/beitcure.jpg"
        ]
    },
    {
        id: 3,
        slug: "longacres-matebeto-lusaka",
        title: "Longacres Matebeto — Lusaka",
        category: "Hospitality",
        year: "2025",
        image: "/images/projects/matebeto-lusaka.jpg",
        location: "Lusaka, Zambia",
        client: "Matebeto Restaurants",
        description: "A premium hospitality project in the heart of Lusaka. We delivered a modern take on traditional Zambian dining environments, focusing on open-plan spaces and durable, high-traffic finishes.",
        scope: [
            "Modern architectural design and build",
            "Outdoor dining terrace construction",
            "Commercial-grade kitchen installation",
            "Bespoke joinery and cultural decor integration",
            "Landscaping and parking infrastructure"
        ],
        gallery: [
            "/images/projects/matebeto-lusaka.jpg"
        ]
    },
    {
        id: 4,
        slug: "solidarmed-zambia-livingstone",
        title: "SolidarMed Zambia — Livingstone",
        category: "Infrastructure",
        year: "2024",
        image: "/images/projects/solidarmed.jpg",
        location: "Livingstone, Zambia",
        client: "SolidarMed",
        description: "Infrastructure development for an international medical NGO. The project involved creating functional administrative and clinical spaces designed for tropical climate efficiency.",
        scope: [
            "Administrative block construction",
            "Sustainable energy (Solar) integration",
            "Water harvesting and storage systems",
            "Climate-responsive design elements",
            "Secure storage facilities for medical supplies"
        ],
        gallery: [
            "/images/projects/solidarmed.jpg"
        ]
    },
    {
        id: 5,
        slug: "coca-cola-zambia-lusaka",
        title: "Coca-Cola Zambia — Lusaka",
        category: "Commercial",
        year: "2024",
        video: "/images/projects/coca-cola-compressed.mp4",
        poster: "/images/projects/coca-cola-poster.jpg",
        location: "Lusaka, Zambia",
        client: "Coca-Cola Beverages Zambia",
        description: "Facility upgrades and industrial civil works for Coca-Cola's primary bottling plant in Lusaka. The project required working within a high-security, active production environment without disrupting operational output.",
        scope: [
            "Industrial concrete flooring and reinforcements",
            "Drainage system upgrades for processing areas",
            "Metal structural fabrication",
            "Site safety and high-visibility marking",
            "Project management within active manufacturing zones"
        ],
        gallery: [
            "/images/projects/coca-cola-poster.jpg"
        ]
    },
    {
        id: 6,
        slug: "unhcr-accommodation-units-zambia",
        title: "UNHCR Accommodation Units",
        category: "Residential",
        year: "2024",
        image: "/images/projects/accomodation.jpg",
        location: "Various Locations, Zambia",
        client: "UNHCR / International Partners",
        description: "Construction of specialized residential units for international staff and operations. Focus on security, durability, and rapid deployment in remote areas of Zambia.",
        scope: [
            "Modular residential construction",
            "High-security perimeter works",
            "Independent power and water infrastructure",
            "Rapid site leveling and foundations",
            "Quality assurance for international standards"
        ],
        gallery: [
            "/images/projects/accomodation.jpg",
            "/images/projects/accomodation1.jpg"
        ]
    }
];

export const getProjectBySlug = (slug: string) => projects.find(p => p.slug === slug);
