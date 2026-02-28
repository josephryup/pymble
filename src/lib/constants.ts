/**
 * ============================================================
 * Pymble Construction — Brand & Contact Constants
 * ============================================================
 *
 * Single source of truth for all company information used
 * across the website. Update values here and they propagate
 * everywhere — no more hardcoded strings in components.
 *
 * Source: Client Questionnaire (26 Feb 2026)
 * Contact: Mukuka Ngulube
 * ============================================================
 */

// ─── Company Identity ──────────────────────────────────────
export const COMPANY = {
    name: "Pymble Construction",
    legalName: "Pymble Construction Limited",
    tagline: "Building Excellence Together",
    description:
        "Pymble Construction Limited is a Zambian construction company specializing in building construction, renovations, civil works, and infrastructure development for government, commercial, and institutional clients.",
    shortDescription:
        "Crafting superior construction solutions with quality, integrity, and client satisfaction across Zambia.",
    founded: "Lusaka, Zambia",
} as const;

// ─── Contact Information ───────────────────────────────────
// Primary: info@pymbleconstruction.com | +260 979 521 035
// Secondary: +260 974 998 463
export const CONTACT = {
    email: "info@pymbleconstruction.com",
    phone: {
        primary: "+260 979 521 035",
        secondary: "+260 974 998 463",
    },
    /** href-safe phone (no spaces) for <a href="tel:..."> */
    phoneHref: {
        primary: "tel:+260979521035",
        secondary: "tel:+260974998463",
    },
    address: {
        street: "Plot No. 1822 Azikiwe Road",
        city: "Lusaka",
        country: "Zambia",
        full: "Plot No. 1822 Azikiwe Road, Lusaka, Zambia",
    },
} as const;

// ─── Social Media Links ────────────────────────────────────
export const SOCIAL = {
    facebook: "https://web.facebook.com/pymblecltd",
    instagram: "https://www.instagram.com/pymblecltd/",
    linkedin: "https://www.linkedin.com/company/pymble-construction-limited/",
} as const;

// ─── Navigation Links ──────────────────────────────────────
export const NAV_LINKS = [
    { name: "Home", href: "/" },
    { name: "About", href: "/about" },
    { name: "Services", href: "/services" },
    { name: "Projects", href: "/projects" },
    { name: "Blog", href: "/blog" },
    { name: "Contact", href: "/contact" },
] as const;

// ─── Services Offered ──────────────────────────────────────
// Core service categories from client questionnaire
export const SERVICES = [
    {
        id: "building-construction",
        title: "Building Construction",
        description:
            "Complete building construction services for residential, commercial, and institutional projects. From foundations to finishing, we deliver structures built to last.",
        icon: "building",
    },
    {
        id: "renovations",
        title: "Renovations",
        description:
            "Expert renovation and remodelling services that breathe new life into existing structures while maintaining structural integrity and modern standards.",
        icon: "hammer",
    },
    {
        id: "civil-works",
        title: "Civil Works",
        description:
            "Comprehensive civil engineering works including earthworks, drainage systems, road construction, and site preparation for large-scale developments.",
        icon: "hardHat",
    },
    {
        id: "infrastructure",
        title: "Infrastructure Development",
        description:
            "Large-scale infrastructure projects for government, commercial, and institutional clients. We build the foundations that communities rely on.",
        icon: "landmark",
    },
] as const;

// ─── Additional Service Capabilities ────────────────────────
// from PCL-Brochure-1.pdf — services the company

export const ADDITIONAL_SERVICES = [
    {
        id: "prefab-buildings",
        title: "Prefab Buildings",
        description:
            "Pre-engineered and prefabricated building solutions for rapid deployment — including accommodation, classrooms, admin blocks, and container structures.",
        icon: "warehouse",
    },
    {
        id: "steel-structures",
        title: "Steel Structures",
        description:
            "Design and construction of steel-framed warehouses, industrial plants, and commercial structures with precision fabrication and assembly.",
        icon: "factory",
    },
    {
        id: "weighbridge-construction",
        title: "Weighbridge Construction",
        description:
            "Complete weighbridge installation including civil works, steel fabrication, concrete foundations, and calibration for industrial and logistics facilities.",
        icon: "scale",
    },
] as const;

// ─── Company Stats ──────────────────────────────────────────
// Real figures sourced from PCL-Brochure-1.pdf project table
export const COMPANY_STATS = {
    projectsCompleted: "45+",
    totalContractValue: "K200M+",
    majorClients: "15+",
    yearsExperience: "6+",
    ongoingProjects: "7",
} as const;

// ─── Trusted Clients ────────────────────────────────────────
// Key clients from brochure portfolio — sorted by prominence.
// Logo images stored in /public/images/clients/
export const TRUSTED_CLIENTS = [
    { name: "Coca-Cola Beverages Zambia", projects: 3, logo: "/images/clients/coca_cola.png" },
    { name: "UNHCR", projects: 1, logo: "/images/clients/unhcr.webp" },
    { name: "Ministry of Local Government", projects: 3, logo: "/images/clients/MLG.png" },
    { name: "Rubis Energy Zambia", projects: 2 },
    { name: "SADC WORKS SAL (NGO)", projects: 1 },
    { name: "SolidarMed Zambia", projects: 1, logo: "/images/clients/solidar.png" },
    { name: "Parrogate Ginneries Ltd", projects: 12, logo: "/images/clients/parrogate.png" },
    { name: "Safpack Packaging Solutions", projects: 4, logo: "/images/clients/safpack.png" },
    { name: "Oryx Energies Zambia", projects: 2, logo: "/images/clients/oryx.png" },
    { name: "Beit Cure Children's Hospital", projects: 2, logo: "/images/clients/beit.png" },
    { name: "Uno Energies Limited", projects: 1 },
    { name: "Stefanutti Stocks Zambia", projects: 1 },
] as const;

// ─── Vision & Mission ───────────────────────────────────────
// Official statements from PCL-Brochure-1.pdf — client-approved
export const VISION_MISSION = {
    vision:
        "To be the preferred construction firm in Zambia and beyond, recognized for delivering high-quality construction services and for being a company that top professionals choose to work with.",
    mission:
        "To deliver high-quality construction services and products that meet client expectations through professionalism, integrity, and a strong commitment to excellence.",
    servicesStatement:
        "We provide professional construction services across commercial, industrial, and civil works projects. Our services are delivered through structured project management, skilled workmanship, and strict adherence to quality and safety standards to ensure reliable and efficient project execution.",
} as const;

// ─── Target Audience ───────────────────────────────────────
export const TARGET_AUDIENCE = [
    "Government ministries and agencies",
    "International NGOs and development organizations",
    "Commercial and industrial companies",
    "Private institutional clients",
] as const;

// ─── Service Regions (Local SEO) ───────────────────────────
export const REGIONS = [
    { name: "Lusaka (HQ)", slug: "lusaka" },
    { name: "Kitwe (Copperbelt)", slug: "kitwe" },
    { name: "Solwezi (North-Western)", slug: "solwezi" },
    { name: "Ndola (Copperbelt)", slug: "ndola" },
    { name: "Livingstone (Southern)", slug: "livingstone" },
] as const;

export const SITE_URL = "https://pymbleconstruction.com";

// ─── SEO Defaults ──────────────────────────────────────────
export const SEO = {
    defaultTitle: `${COMPANY.name} | ${COMPANY.tagline}`,
    titleTemplate: `%s | ${COMPANY.name}`,
    defaultDescription: COMPANY.shortDescription,
    siteName: COMPANY.name,
    keywords: [
        "construction company Zambia",
        "building contractors Lusaka",
        "civil works Zambia",
        "infrastructure development Zambia",
        "commercial construction Lusaka",
        "renovation services Zambia",
        "Pymble Construction",
        "construction company Lusaka",
        "industrial construction Zambia",
        "prefab buildings Zambia",
        "steel structures Lusaka",
    ],
    locale: "en_ZM",
    type: "website",
    author: "Pymble Construction Limited",
    twitterHandle: "@pymblecltd",
} as const;

// ─── Google Maps Embed ─────────────────────────────────────
export const GOOGLE_MAPS_EMBED_URL =
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d123088.32860381732!2d28.2877427!3d-15.402986799999999!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x1940f5a671cfdee3%3A0x7290edbb3b5b4608!2sPymble%20construction%20limited!5e0!3m2!1sen!2szm!4v1771544197598!5m2!1sen!2szm";
