import { OpsLoginForm } from "@/components/ops/OpsLoginForm";
import { OPS_BRAND } from "@/lib/ops/constants";
import { firstParam, type OpsSearchParams } from "@/lib/ops/ui";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

export default async function OpsLoginPage({ searchParams }: PageProps) {
  const params = ((await searchParams) ?? {}) as OpsSearchParams;

  return (
    <main className="ops-ui min-h-screen bg-[#f6f7fb] px-5 py-10 text-primary-dark">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <section
          aria-labelledby="ops-login-title"
          className="w-full rounded-lg border border-primary-dark/10 bg-white p-6 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
            Pymble Operations
          </p>
          <h1
            className="mt-2 font-heading text-3xl font-bold tracking-tight text-primary-dark"
            id="ops-login-title"
          >
            {OPS_BRAND.name}
          </h1>
          <p className="mt-3 text-sm leading-6 text-primary-dark/65">
            Sign in with your Pymble staff credentials. Access is by invitation only.
          </p>

          <OpsLoginForm initialError={firstParam(params.error)} />
        </section>
      </div>
    </main>
  );
}
