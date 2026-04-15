import Image from "next/image";

const logos = [
    { name: "ZRA", src: "/logos/ZRA-logo-01.png" },
    { name: "CEEC", src: "/logos/ceec-logo-1-300x300.png" },
    { name: "EIZ", src: "/logos/eiz.jpg" },
    { name: "Logo 4", src: "/logos/logo_4.png" },
    { name: "NCC", src: "/logos/ncc_logo_.webp" },
    { name: "PACRA", src: "/logos/pacra_logo.png" },
    { name: "Workers", src: "/logos/workers.png" },
    { name: "ZPPA", src: "/logos/zppa_logo.jpeg" },
];

const duplicatedLogos = [...logos, ...logos, ...logos];

export function LogoCarousel() {
    return (
        <div className="mt-20 w-full overflow-hidden border-t border-black/5 py-12">
            <div className="mb-10 text-center">
                <p className="text-sm font-medium text-primary-dark/40">Certification Bodies</p>
            </div>

            <div className="relative overflow-hidden marquee-pause">
                <div className="marquee-track-reverse flex items-center gap-16 whitespace-nowrap px-8 md:gap-24">
                    {duplicatedLogos.map((logo, index) => (
                        <div
                            key={`${logo.name}-${index}`}
                            className="shrink-0 opacity-30 grayscale transition-all duration-500 hover:scale-110 hover:opacity-100 hover:grayscale-0"
                        >
                            <div className="relative flex h-12 w-32 items-center justify-center md:h-16 md:w-40">
                                <Image
                                    src={logo.src}
                                    alt={`${logo.name} logo`}
                                    fill
                                    className="object-contain"
                                    sizes="(max-width: 768px) 128px, 160px"
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-white to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-white to-transparent" />
            </div>
        </div>
    );
}
