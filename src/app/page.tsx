import dynamic from "next/dynamic";
import { Hero } from "@/components/home/Hero";
import { Intro } from "@/components/home/Intro";
import { TrustedBy } from "@/components/home/TrustedBy";
import { CTA } from "@/components/home/CTA";

const FeaturedProjects = dynamic(
  () => import("@/components/home/FeaturedProjects").then((mod) => mod.FeaturedProjects)
);
const Stats = dynamic(
  () => import("@/components/home/Stats").then((mod) => mod.Stats)
);
const AboutPhilosophy = dynamic(
  () => import("@/components/home/AboutPhilosophy").then((mod) => mod.AboutPhilosophy)
);
const Services = dynamic(
  () => import("@/components/home/Services").then((mod) => mod.Services)
);
const Process = dynamic(
  () => import("@/components/home/Process").then((mod) => mod.Process)
);
const Testimonials = dynamic(
  () => import("@/components/home/Testimonials").then((mod) => mod.Testimonials)
);

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <Hero />
      <Intro />
      <TrustedBy />
      <FeaturedProjects />
      <Stats />
      <AboutPhilosophy />
      <Services />
      <Process />
      <Testimonials />
      <CTA />
    </main>
  );
}
