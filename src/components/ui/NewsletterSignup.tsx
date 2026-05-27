"use client";

import { type FormEvent, useId, useState } from "react";
import { AlertCircle, CheckCircle2, Mail, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";

type NewsletterSignupProps = {
    variant?: "inline" | "section";
    heading?: string;
    description?: string;
    className?: string;
};

type SubmitState = "idle" | "loading" | "success" | "error";

export function NewsletterSignup({
    variant = "section",
    heading = "Stay Updated",
    description = "Get project updates and construction insights delivered to your inbox.",
    className,
}: NewsletterSignupProps) {
    const [email, setEmail] = useState("");
    const [website, setWebsite] = useState("");
    const [status, setStatus] = useState<SubmitState>("idle");
    const [message, setMessage] = useState("");
    const emailId = useId();

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const trimmedEmail = email.trim();

        if (!trimmedEmail) {
            setStatus("error");
            setMessage("Please enter your email address.");
            return;
        }

        setStatus("loading");
        setMessage("");

        try {
            const response = await fetch("/api/newsletter", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email: trimmedEmail, website }),
            });

            const result = (await response.json()) as { error?: string };

            if (!response.ok) {
                throw new Error(result.error || "We could not add you right now.");
            }

            setStatus("success");
            setMessage("Thanks. You are on the list.");
            setEmail("");
            setWebsite("");
        } catch (error) {
            setStatus("error");
            setMessage(error instanceof Error ? error.message : "We could not add you right now.");
        }
    }

    const form = (
        <form
            onSubmit={handleSubmit}
            className={cn(
                "w-full",
                variant === "inline" ? "space-y-3" : "mx-auto max-w-2xl space-y-4",
                className
            )}
        >
            <input
                className="hidden"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                aria-hidden="true"
            />

            <div
                className={cn(
                    "flex w-full flex-col gap-3 sm:flex-row",
                    variant === "inline" && "sm:flex-col lg:flex-row"
                )}
            >
                <label className="sr-only" htmlFor={emailId}>
                    Email address
                </label>
                <div className="relative flex-1">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-current opacity-40" />
                    <input
                        id={emailId}
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="Email address"
                        autoComplete="email"
                        disabled={status === "loading"}
                        className={cn(
                            "h-12 w-full rounded-full border bg-white pl-11 pr-4 text-sm font-medium text-primary-dark outline-none transition-all placeholder:text-primary-dark/30 focus:ring-2",
                            variant === "inline"
                                ? "border-white/10 focus:border-accent-orange focus:ring-accent-orange/20"
                                : "border-black/10 focus:border-primary-dark focus:ring-primary-dark/10"
                        )}
                    />
                </div>

                <button
                    type="submit"
                    disabled={status === "loading"}
                    className={cn(
                        "inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        "bg-accent-orange text-primary-dark hover:bg-amber-500"
                    )}
                >
                    {status === "loading" ? "Joining" : "Join"}
                    <Send className="h-4 w-4" />
                </button>
            </div>

            <p
                className={cn(
                    "flex min-h-5 items-center gap-2 text-sm",
                    status === "success" && "text-emerald-400",
                    status === "error" && "text-red-300",
                    status === "idle" && "text-white/40"
                )}
                aria-live="polite"
            >
                {status === "success" && <CheckCircle2 className="h-4 w-4" />}
                {status === "error" && <AlertCircle className="h-4 w-4" />}
                {message || "No spam. Just useful updates from our team."}
            </p>
        </form>
    );

    if (variant === "inline") {
        return (
            <div className="text-white">
                <p className="label-uppercase mb-3 text-accent-orange">{heading}</p>
                <p className="mb-5 text-sm leading-relaxed text-white/60">{description}</p>
                {form}
            </div>
        );
    }

    return (
        <Section className="bg-primary-dark text-white">
            <Container className="text-center">
                <p className="label-uppercase mb-4 block text-accent-orange">Newsletter</p>
                <h2 className="mx-auto mb-5 max-w-3xl font-heading text-3xl font-bold tracking-tight text-white md:text-5xl">
                    {heading}
                </h2>
                <p className="mx-auto mb-10 max-w-2xl text-base leading-relaxed text-white/60 md:text-lg">
                    {description}
                </p>
                {form}
            </Container>
        </Section>
    );
}
