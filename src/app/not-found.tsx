import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { HardHat, ArrowLeft, Home } from "lucide-react";

export default function NotFound() {
    return (
        <main className="min-h-screen bg-primary-dark text-white flex flex-col justify-center">
            <Section className="py-20">
                <Container className="text-center">
                    {/* Visual 404 Area */}
                    <div className="relative mb-12">
                        <h1 className="font-heading text-[15rem] md:text-[20rem] font-bold leading-none tracking-tighter opacity-5 select-none text-white overflow-hidden">
                            404
                        </h1>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <div className="w-20 h-20 bg-accent-orange/10 rounded-2xl flex items-center justify-center mb-8 animate-bounce">
                                <HardHat className="w-10 h-10 text-accent-orange" />
                            </div>
                            <h2 className="font-heading text-4xl md:text-5xl font-bold mb-4 tracking-tight">
                                Under Construction?
                            </h2>
                            <p className="text-white/60 text-lg md:text-xl max-w-md mx-auto">
                                The page you are looking for doesn&apos;t exist or is currently being restructured.
                            </p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link href="/">
                            <Button className="bg-accent-orange hover:bg-amber-600 text-primary-dark font-bold px-8 py-4 h-auto flex items-center gap-2">
                                <Home className="w-4 h-4" />
                                Back to Headquarters
                            </Button>
                        </Link>
                        <Link href="/projects">
                            <Button variant="ghost" className="text-white border-white/10 hover:bg-white/5 font-bold px-8 py-4 h-auto flex items-center gap-2">
                                <ArrowLeft className="w-4 h-4" />
                                View Portfolio
                            </Button>
                        </Link>
                    </div>
                </Container>
            </Section>
        </main>
    );
}
