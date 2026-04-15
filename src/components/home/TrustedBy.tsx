import { Section } from "@/components/ui/Section";
import { TRUSTED_CLIENTS } from "@/lib/constants";
import Image from "next/image";

const clientsWithLogos = TRUSTED_CLIENTS.filter(
    (client): client is typeof client & { logo: string } => "logo" in client && Boolean(client.logo)
);

const marqueeClients = [...clientsWithLogos, ...clientsWithLogos];

export function TrustedBy() {
    return (
        <Section className="section-spacing-sm overflow-hidden border-y border-black/5 bg-neutral-50">
            <p className="label-uppercase mb-12 text-center text-primary-dark/30">
                Trusted by leading organizations across Zambia
            </p>

            <div className="relative marquee-pause">
                <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-neutral-50 to-transparent md:w-32" />
                <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-neutral-50 to-transparent md:w-32" />

                <div className="marquee-track flex items-center gap-12 whitespace-nowrap md:gap-20">
                    {marqueeClients.map((client, index) => (
                        <div
                            key={`${client.name}-${index}`}
                            className="shrink-0 opacity-50 grayscale transition-all duration-500 hover:opacity-100 hover:grayscale-0"
                            title={client.name}
                        >
                            <Image
                                src={client.logo}
                                alt={client.name}
                                width={96}
                                height={36}
                                className="h-10 w-auto object-contain md:h-14"
                                sizes="(max-width: 768px) 67px, 96px"
                            />
                        </div>
                    ))}
                </div>
            </div>
        </Section>
    );
}
