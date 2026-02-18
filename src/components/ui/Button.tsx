"use client";

import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";

interface ButtonProps extends HTMLMotionProps<"button"> {
    variant?: "primary" | "secondary" | "ghost";
    children: React.ReactNode;
}

export function Button({
    className,
    variant = "primary",
    children,
    ...props
}: ButtonProps) {
    const variants = {
        primary: "bg-primary-blue text-white hover:bg-primary-dark border-transparent",
        secondary: "border-primary-dark text-primary-dark hover:bg-primary-dark hover:text-white bg-transparent border",
        ghost: "bg-transparent text-primary-dark hover:bg-soft-grey/50 border-transparent",
    };

    return (
        <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
                "px-5 py-2.5 rounded-full font-semibold uppercase tracking-wider text-sm transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary-blue focus:ring-offset-2",
                variants[variant],
                className
            )}
            {...props}
        >
            {children}
        </motion.button>
    );
}
