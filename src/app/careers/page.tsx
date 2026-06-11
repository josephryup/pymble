import type { Metadata } from "next";
import { BreadcrumbSchema } from "@/components/seo/BreadcrumbSchema";
import { COMPANY, SITE_URL } from "@/lib/constants";
import { fetchPublishedJobPostings, type OpsJobPosting } from "@/lib/ops/recruitment";
import { CareersApplyForm } from "./CareersApplyForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Careers | Join Pymble Construction in Zambia",
  description:
    "Explore current job openings at Pymble Construction and apply online. We build careers across construction, engineering, procurement, HSE, finance, and administration in Zambia.",
  keywords: [
    "Pymble Construction careers",
    "construction jobs Zambia",
    "construction vacancies Lusaka",
    "civil engineering jobs Zambia",
  ],
  alternates: { canonical: "/careers" },
  openGraph: {
    title: "Careers | Join Pymble Construction in Zambia",
    description:
      "Explore current job openings at Pymble Construction and apply online.",
    url: `${SITE_URL}/careers`,
    siteName: COMPANY.name,
    type: "website",
  },
};

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: "Full time",
  fixed_term: "Fixed term",
  casual: "Casual",
  contractor: "Contractor",
  intern: "Intern",
};

async function getPostings(): Promise<OpsJobPosting[]> {
  try {
    return await fetchPublishedJobPostings();
  } catch {
    // If the database/env is unavailable, show the page with no openings
    // rather than failing the whole route.
    return [];
  }
}

function PostingBlock({ posting }: { posting: OpsJobPosting }) {
  return (
    <article
      className="rounded-2xl border border-primary-dark/10 bg-white p-6 shadow-sm md:p-8"
      id={`role-${posting.id}`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3 className="font-heading text-2xl font-bold text-primary-dark">{posting.title}</h3>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-primary-blue/10 px-3 py-1 font-semibold text-primary-blue">
              {EMPLOYMENT_TYPE_LABELS[posting.employment_type] ?? posting.employment_type}
            </span>
            {posting.department ? (
              <span className="rounded-full bg-primary-dark/[0.05] px-3 py-1 font-semibold text-primary-dark/70">
                {posting.department}
              </span>
            ) : null}
            {posting.location ? (
              <span className="rounded-full bg-primary-dark/[0.05] px-3 py-1 font-semibold text-primary-dark/70">
                {posting.location}
              </span>
            ) : null}
            {posting.salary_range ? (
              <span className="rounded-full bg-primary-dark/[0.05] px-3 py-1 font-semibold text-primary-dark/70">
                {posting.salary_range}
              </span>
            ) : null}
          </div>
        </div>
        <a
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-accent-orange px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-orange/90"
          href="#apply"
        >
          Apply now
        </a>
      </div>

      {posting.summary ? (
        <p className="mt-4 text-base leading-7 text-primary-dark/75">{posting.summary}</p>
      ) : null}

      <div className="mt-5 grid gap-6 md:grid-cols-2">
        {posting.description ? (
          <div className="md:col-span-2">
            <h4 className="text-sm font-bold uppercase tracking-[0.12em] text-primary-dark/50">
              About the role
            </h4>
            <p className="mt-2 whitespace-pre-line text-base leading-7 text-primary-dark/75">
              {posting.description}
            </p>
          </div>
        ) : null}
        {posting.responsibilities ? (
          <div>
            <h4 className="text-sm font-bold uppercase tracking-[0.12em] text-primary-dark/50">
              Responsibilities
            </h4>
            <p className="mt-2 whitespace-pre-line text-base leading-7 text-primary-dark/75">
              {posting.responsibilities}
            </p>
          </div>
        ) : null}
        {posting.requirements ? (
          <div>
            <h4 className="text-sm font-bold uppercase tracking-[0.12em] text-primary-dark/50">
              Requirements
            </h4>
            <p className="mt-2 whitespace-pre-line text-base leading-7 text-primary-dark/75">
              {posting.requirements}
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default async function CareersPage() {
  const postings = await getPostings();

  return (
    <main className="bg-[#f6f7fb] text-primary-dark">
      <BreadcrumbSchema items={[{ name: "Home", item: "/" }, { name: "Careers", item: "/careers" }]} />

      <section className="bg-primary-dark px-5 py-16 text-white md:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-orange">
            Careers
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight md:text-5xl">
            Build your career with {COMPANY.name}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-white/80">
            We deliver construction, civil works, and engineering across Zambia. Explore our current
            openings and apply online — we review every application.
          </p>
        </div>
      </section>

      <section className="px-5 py-12 md:py-16">
        <div className="mx-auto max-w-5xl space-y-6">
          <h2 className="font-heading text-2xl font-bold text-primary-dark md:text-3xl">
            Open positions
          </h2>

          {postings.length > 0 ? (
            <div className="space-y-5">
              {postings.map((posting) => (
                <PostingBlock key={posting.id} posting={posting} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-primary-dark/10 bg-white p-8 text-center md:p-12">
              <h3 className="font-heading text-xl font-bold text-primary-dark">
                No open positions right now
              </h3>
              <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-primary-dark/70">
                We are not advertising specific roles at the moment, but we are always glad to hear
                from talented people. Send us a general application below and we will keep your
                details on file.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="px-5 pb-20" id="apply">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-primary-dark/10 bg-white p-6 shadow-sm md:p-10">
            <h2 className="font-heading text-2xl font-bold text-primary-dark md:text-3xl">
              Apply online
            </h2>
            <p className="mt-3 text-base leading-7 text-primary-dark/70">
              Complete the form below and attach your CV. Fields marked with * are required.
            </p>
            <CareersApplyForm
              postings={postings.map((posting) => ({ id: posting.id, title: posting.title }))}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
