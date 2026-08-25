import { OpsContractDetailPage } from "@/components/ops/OpsContractDetailPage";
import type { OpsSearchParams } from "@/lib/ops/ui";

/**
 * An employment contract. A subcontract reaching this route is forwarded to
 * /ops/contracts/[id] rather than 404ing.
 */
export const dynamic = "force-dynamic";

export default function Page({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string }>;
  searchParams?: Promise<OpsSearchParams>;
}) {
  return (
    <OpsContractDetailPage
      kind="employment"
      params={params}
      searchParams={searchParams}
    />
  );
}
