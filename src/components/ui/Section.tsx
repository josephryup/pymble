import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
    children: React.ReactNode;
}

export const Section = forwardRef<HTMLElement, SectionProps>(({ className, children, ...props }, ref) => {
    return (
        <section
            ref={ref}
            className={cn("section-spacing", className)}
            {...props}
        >
            {children}
        </section>
    );
});

Section.displayName = "Section";
