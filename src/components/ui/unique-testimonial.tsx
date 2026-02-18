"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import Image from "next/image"

const testimonials = [
    {
        id: 1,
        quote: "The quality of work is exceptional. They delivered more than we expected.",
        author: "Mwiinga Chiwan",
        role: "Procurement Officer",
        image: "/images/testimonials/testimonial 1.webp", // photo
    },
    {
        id: 2,
        quote: "Simply brilliant. Nothing else compares.",
        author: "Marcus Johnson",
        role: "Engineer at Vercel",
        image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=1374&auto=format&fit=crop", // Professional man headshot
    },
    {
        id: 3,
        quote: "The attention to detail is unmatched.",
        author: "Elena Rodriguez",
        role: "Founder at Craft",
        image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=1528&auto=format&fit=crop", // Professional woman headshot
    },
]

export function TestimonialsCarousel() {
    const [activeIndex, setActiveIndex] = useState(0)
    const [isAnimating, setIsAnimating] = useState(false)
    const [displayedQuote, setDisplayedQuote] = useState(testimonials[0].quote)
    const [displayedRole, setDisplayedRole] = useState(testimonials[0].role)
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

    const handleSelect = (index: number) => {
        if (index === activeIndex || isAnimating) return
        setIsAnimating(true)

        setTimeout(() => {
            setDisplayedQuote(testimonials[index].quote)
            setDisplayedRole(testimonials[index].role)
            setActiveIndex(index)
            setTimeout(() => setIsAnimating(false), 400)
        }, 200)
    }

    return (
        <div className="flex flex-col items-center gap-10 py-16">
            {/* Quote Container */}
            <div className="relative px-8">
                <span className="absolute -left-2 -top-6 text-7xl font-sans text-white/[0.06] select-none pointer-events-none">
                    &quot;
                </span>

                <p
                    className={cn(
                        "text-2xl md:text-3xl lg:text-5xl font-heading font-light text-white text-center max-w-3xl leading-relaxed transition-all duration-400 ease-out",
                        isAnimating ? "opacity-0 blur-sm scale-[0.98]" : "opacity-100 blur-0 scale-100",
                    )}
                >
                    {displayedQuote}
                </p>

                <span className="absolute -right-2 -bottom-8 text-7xl font-sans text-white/[0.06] select-none pointer-events-none">
                    &quot;
                </span>
            </div>

            <div className="flex flex-col items-center gap-6 mt-2">
                {/* Role text */}
                <p
                    className={cn(
                        "text-xs label-uppercase text-white/60 tracking-[0.2em] transition-all duration-500 ease-out",
                        isAnimating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0",
                    )}
                >
                    {displayedRole}
                </p>

                <div className="flex items-center justify-center gap-2">
                    {testimonials.map((testimonial, index) => {
                        const isActive = activeIndex === index
                        const isHovered = hoveredIndex === index && !isActive
                        const showName = isActive || isHovered

                        return (
                            <button
                                key={testimonial.id}
                                onClick={() => handleSelect(index)}
                                onMouseEnter={() => setHoveredIndex(index)}
                                onMouseLeave={() => setHoveredIndex(null)}
                                className={cn(
                                    "relative flex items-center gap-0 rounded-full cursor-pointer overflow-hidden",
                                    "transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]",
                                    isActive ? "bg-white shadow-lg" : "bg-transparent hover:bg-white/10",
                                    showName ? "pr-4 pl-2 py-2" : "p-0.5",
                                )}
                            >
                                {/* Avatar with smooth ring animation */}
                                <div className="relative flex-shrink-0">
                                    <Image
                                        src={testimonial.image || "/placeholder.svg"}
                                        alt={testimonial.author}
                                        width={32}
                                        height={32}
                                        className={cn(
                                            "rounded-full object-cover",
                                            "transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]",
                                            isActive ? "ring-2 ring-primary-dark/30" : "ring-0",
                                            !isActive && "hover:scale-105",
                                        )}
                                    />
                                </div>

                                <div
                                    className={cn(
                                        "grid transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]",
                                        showName ? "grid-cols-[1fr] opacity-100 ml-2" : "grid-cols-[0fr] opacity-0 ml-0",
                                    )}
                                >
                                    <div className="overflow-hidden">
                                        <span
                                            className={cn(
                                                "text-sm font-medium whitespace-nowrap block",
                                                "transition-colors duration-300",
                                                isActive ? "text-primary-dark" : "text-white",
                                            )}
                                        >
                                            {testimonial.author}
                                        </span>
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
