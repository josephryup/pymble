import { Hero } from "@/components/home/Hero";
import { Intro } from "@/components/home/Intro";
import { FeaturedProjects } from "@/components/home/FeaturedProjects";
import { TrustedBy } from "@/components/home/TrustedBy";
import { AboutPhilosophy } from "@/components/home/AboutPhilosophy";
import { Stats } from "@/components/home/Stats";
import { Services } from "@/components/home/Services";
import { Process } from "@/components/home/Process";
import { Testimonials } from "@/components/home/Testimonials";
import { CTA } from "@/components/home/CTA";

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
