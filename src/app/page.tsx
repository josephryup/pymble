import { Hero } from "@/components/home/Hero";
import { Intro } from "@/components/home/Intro";
import { FeaturedProjects } from "@/components/home/FeaturedProjects";
import { AboutPhilosophy } from "@/components/home/AboutPhilosophy";
import { Services } from "@/components/home/Services";
import { Process } from "@/components/home/Process";
import { Testimonials } from "@/components/home/Testimonials";
import { CTA } from "@/components/home/CTA";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      <Hero />
      <Intro />
      <FeaturedProjects />
      <AboutPhilosophy />
      <Services />
      <Process />
      <Testimonials />
      <CTA />
    </main>
  );
}
