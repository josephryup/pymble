"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

export function Header() {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const pathname = usePathname();
    const isHome = pathname === "/";

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 50);
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Lock body scroll when menu is open
    useEffect(() => {
        if (isMenuOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => {
            document.body.style.overflow = "unset";
        };
    }, [isMenuOpen]);

    // Header is dark/blue if: Scrolled OR Menu Open OR Not on Home Page (Inner pages need contrast against white bg)
    const showDarkHeader = isScrolled || isMenuOpen || !isHome;

    // Hamburger color: Dark if menu is open (on white bg), otherwise White
    const hamburgerColor = isMenuOpen ? "text-primary-dark" : "text-white";

    const navLinks = [
        { name: "Home", href: "/" },
        { name: "About", href: "/about" },
        { name: "Projects", href: "/projects" },
        { name: "Contact", href: "/contact" },
    ];

    return (
        <header
            className={cn(
                "fixed top-0 left-0 w-full z-50 transition-all duration-300 border-b",
                showDarkHeader && !isMenuOpen // Only show dark bg if menu is CLOSED. If open, we want transparent so it sits on top of white menu? Or just let menu cover it?
                    ? "bg-primary-dark/95 backdrop-blur-sm border-white/5 py-4 shadow-sm"
                    : "bg-transparent border-transparent py-6"
            )}
        >
            <Container className="flex items-center justify-between">
                <Link
                    href="/"
                    className="relative z-50 w-40 h-12 transition-all duration-300"
                    onClick={() => setIsMenuOpen(false)}
                >
                    <Image
                        src="/logo.png"
                        alt="Pymble Construction"
                        fill
                        className={cn(
                            "object-contain transition-all duration-300",
                            isMenuOpen && "invert brightness-0" // Make logo black/dark when menu is open (assuming logo is white)
                        )}
                        priority
                    />
                </Link>

                {/* Desktop Nav */}
                <nav className="hidden md:flex gap-8">
                    {navLinks.map((item) => (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "label-uppercase transition-colors hover:text-accent-orange",
                                "text-white/80 hover:text-white"
                            )}
                        >
                            {item.name}
                        </Link>
                    ))}
                </nav>

                {/* Mobile Hamburger */}
                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className={cn(
                        "md:hidden relative z-50 p-2 hover:text-accent-orange transition-colors",
                        hamburgerColor
                    )}
                    aria-label="Toggle Menu"
                >
                    <div className="w-8 h-8 flex flex-col justify-center items-end gap-1.5">
                        <motion.span
                            animate={{ rotate: isMenuOpen ? 45 : 0, y: isMenuOpen ? 8 : 0 }}
                            className="w-8 h-0.5 bg-current block origin-center"
                        />
                        <motion.span
                            animate={{ opacity: isMenuOpen ? 0 : 1 }}
                            className="w-6 h-0.5 bg-current block"
                        />
                        <motion.span
                            animate={{ rotate: isMenuOpen ? -45 : 0, y: isMenuOpen ? -8 : 0, width: isMenuOpen ? "2rem" : "1rem" }}
                            className="w-4 h-0.5 bg-current block origin-center"
                        />
                    </div>
                </button>
            </Container>

            {/* Mobile Menu Overlay */}
            <AnimatePresence>
                {isMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: "-100%" }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: "-100%" }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        className="fixed inset-0 bg-white z-40 flex flex-col pt-32 pb-10 px-6 md:hidden overflow-y-auto"
                    >
                        <div className="flex flex-col justify-between h-full">
                            {/* Navigation Links */}
                            <nav className="flex flex-col gap-6">
                                {navLinks.map((item, index) => (
                                    <motion.div
                                        key={item.name}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.2 + index * 0.1, duration: 0.5 }}
                                    >
                                        <Link
                                            href={item.href}
                                            onClick={() => setIsMenuOpen(false)}
                                            className="font-heading text-4xl font-bold text-primary-dark hover:text-accent-orange transition-colors block"
                                        >
                                            {item.name}
                                        </Link>
                                    </motion.div>
                                ))}
                            </nav>

                            {/* Menu Footer */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.6 }}
                                className="space-y-6 mt-12 border-t border-black/10 pt-8"
                            >
                                <div>
                                    <p className="label-uppercase text-accent-orange mb-2">Get in Touch</p>
                                    <p className="text-primary-dark/80 text-lg">info@pymbleconstruction.com</p>
                                    <p className="text-primary-dark/80 text-lg">+260 977 123 456</p>
                                </div>
                                <div>
                                    <p className="label-uppercase text-accent-orange mb-2">Location</p>
                                    <p className="text-primary-dark/80 text-lg">Lusaka, Zambia</p>
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    );
}
