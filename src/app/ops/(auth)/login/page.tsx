import { cookies, headers } from "next/headers";
import { OpsBrandMark } from "@/components/ops/OpsBrandMark";
import { OpsLocalRolePreviewPanel } from "@/components/ops/OpsLocalRolePreviewPanel";
import { OpsLoginForm } from "@/components/ops/OpsLoginForm";
import { OPS_BRAND } from "@/lib/ops/constants";
import {
  canUseOpsLocalRolePreview,
  OPS_LOCAL_ROLE_PREVIEW_COOKIE,
  parseOpsLocalRolePreviewRole,
} from "@/lib/ops/local-role-preview";
import { firstParam, type OpsSearchParams } from "@/lib/ops/ui";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

export default async function OpsLoginPage({ searchParams }: PageProps) {
  const params = ((await searchParams) ?? {}) as OpsSearchParams;
  const headerStore = await headers();
  const canPreviewRoles = canUseOpsLocalRolePreview(headerStore.get("host"));
  const previewRole = canPreviewRoles
    ? parseOpsLocalRolePreviewRole(
        (await cookies()).get(OPS_LOCAL_ROLE_PREVIEW_COOKIE)?.value,
      )
    : null;

  return (
    <main className="ops-ui min-h-dvh bg-[#f6f7fb] px-5 py-10 text-foreground">
      <div className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-md items-center">
        <section
          aria-labelledby="ops-login-title"
          className="w-full rounded-lg border border-border bg-card p-6 shadow-sm"
        >
          <OpsBrandMark priority className="h-16 w-16 rounded-md" sizes="64px" />
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
            Pymble Operations
          </p>
          <h1
            className="mt-2 font-heading text-3xl font-bold tracking-tight text-foreground"
            id="ops-login-title"
          >
            {OPS_BRAND.name}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Sign in with your Pymble staff credentials. Access is by invitation only.
          </p>

          <OpsLoginForm initialError={firstParam(params.error)} />

          {canPreviewRoles ? (
            <OpsLocalRolePreviewPanel activeRole={previewRole} />
          ) : null}
        </section>
      </div>
    </main>
  );
}
