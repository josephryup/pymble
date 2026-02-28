export type BlogPost = {
    id: number;
    slug: string;
    title: string;
    excerpt: string;
    category: string;
    date: string;
    readTime: string;
    image: string;
    content: string[];
    publishDate: string; // ISO 8601 format
    author: {
        name: string;
        role: string;
        image?: string;
    };
};

const DEFAULT_AUTHOR = {
    name: "Matimba Dominic Hatimbula",
    role: "Managing Director",
    image: "/images/team/md.jpg"
};

export const blogPosts: BlogPost[] = [
    {
        id: 1,
        slug: "importance-of-quality-construction",
        title: "The Importance of Quality Construction in Zambia's Growing Economy",
        excerpt:
            "As Zambia's economy continues to grow, the demand for high-quality construction services has never been greater. Learn why choosing the right construction partner matters.",
        category: "Industry Insights",
        date: "February 2026",
        publishDate: "2026-02-15T09:00:00+02:00",
        readTime: "5 min read",
        image:
            "https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=2076&auto=format&fit=crop",
        author: DEFAULT_AUTHOR,
        content: [
            "Zambia's construction sector has been experiencing remarkable growth, driven by increased government spending on infrastructure and a growing private sector. As the nation builds its future, the quality of construction becomes paramount — not just for aesthetics, but for safety, longevity, and economic value.",
            "At Pymble Construction Limited, we've witnessed firsthand how quality construction transforms communities. Our work with government ministries, international NGOs, and commercial clients has reinforced a fundamental truth: cutting corners today creates far greater costs tomorrow.",
            "Quality construction begins with materials. We source high-grade materials that meet international standards while supporting local suppliers wherever possible. This approach ensures structural integrity while contributing to Zambia's economic ecosystem.",
            "Equally important is craftsmanship. Our teams undergo continuous training to stay current with global construction best practices. From foundation work to finishing touches, every phase of a project receives meticulous attention to detail.",
            "For government and institutional clients, quality construction means buildings that serve their purpose for decades without excessive maintenance costs. For commercial clients, it means spaces that attract tenants and maintain property values. For all our clients, it means peace of mind.",
            "As Zambia continues its growth trajectory, investing in quality construction isn't just good practice — it's essential for sustainable development. We're proud to be part of building a stronger, more resilient Zambia.",
        ],
    },
    {
        id: 2,
        slug: "sustainable-building-practices",
        title: "Sustainable Building Practices for Modern Infrastructure",
        excerpt:
            "Discover how sustainable construction methods are shaping the future of infrastructure development in Southern Africa and reducing environmental impact.",
        category: "Sustainability",
        date: "January 2026",
        publishDate: "2026-01-20T10:00:00+02:00",
        readTime: "4 min read",
        image:
            "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=80&w=2070&auto=format&fit=crop",
        author: DEFAULT_AUTHOR,
        content: [
            "Sustainability in construction is no longer optional — it's a responsibility. As Southern Africa faces the dual challenges of rapid urbanisation and climate change, the construction industry must evolve to build infrastructure that serves both people and planet.",
            "At Pymble Construction, we're integrating sustainable practices into every phase of our projects. From site selection and preparation to material sourcing and waste management, sustainability is woven into our methodology.",
            "One key area is energy-efficient design. By incorporating natural ventilation, optimal building orientation, and energy-saving systems from the planning stage, we help our clients reduce long-term operational costs while minimising environmental impact.",
            "Water management is another critical consideration in Zambia. Our projects increasingly feature rainwater harvesting systems, efficient drainage solutions, and water-recycling facilities that make the most of this precious resource.",
            "We also prioritise local material sourcing wherever possible. This reduces transport-related emissions, supports local economies, and ensures materials are suited to Zambia's specific climate and conditions.",
            "The future of construction in Zambia lies in balancing growth with responsibility. By embracing sustainable practices today, we're building infrastructure that future generations can be proud of.",
        ],
    },
    {
        id: 3,
        slug: "choosing-construction-partner",
        title: "How to Choose the Right Construction Partner for Government Projects",
        excerpt:
            "Government and institutional projects require a unique set of capabilities. Here's what to look for when selecting a construction partner for public works.",
        category: "Guide",
        date: "December 2025",
        publishDate: "2025-12-10T08:30:00+02:00",
        readTime: "6 min read",
        image:
            "https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=2131&auto=format&fit=crop",
        author: DEFAULT_AUTHOR,
        content: [
            "Government and institutional construction projects carry unique challenges and requirements. From compliance with procurement regulations to managing complex stakeholder relationships, these projects demand a construction partner with specific expertise and proven experience.",
            "The first consideration should always be track record. A construction company's portfolio of completed government projects tells you more than any marketing brochure. Look for demonstrated experience with projects of similar scale and complexity to what you're planning.",
            "Compliance and certification matter significantly in government procurement. Ensure your construction partner holds all necessary certifications — ZPPA registration, PACRA compliance, Workers' Compensation coverage, and ZRA tax clearance. These aren't just bureaucratic requirements; they indicate a professionally managed operation.",
            "Financial stability is another critical factor. Government projects often involve phased payments, which means your construction partner needs the financial resilience to manage cash flow through sometimes lengthy payment cycles without compromising on quality or timelines.",
            "Communication and transparency should never be underestimated. The best construction partners provide regular progress reports, maintain open lines of communication, and flag potential issues before they become problems. In government projects, where accountability is paramount, this transparency is non-negotiable.",
            "Finally, consider the company's approach to local impact. Does the construction partner employ local workers? Do they source materials from local suppliers? Government projects should benefit the communities they serve, and a socially responsible construction partner contributes to this goal.",
            "At Pymble Construction Limited, we've built our reputation on delivering government and institutional projects that meet the highest standards of quality, compliance, and community benefit. Our experience with government ministries, NGOs, and institutional clients gives us a deep understanding of what these projects require — and how to deliver them successfully.",
        ],
    },
];

export const getBlogPost = (slug: string) => blogPosts.find(post => post.slug === slug);
