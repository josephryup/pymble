import { OpsContractRegisterPage } from "@/components/ops/OpsContractRegisterPage";
import type { OpsSearchParams } from "@/lib/ops/ui";

/**
 * The subcontract register. One engine, two routes (decision D2) — the kind is
 * fixed here rather than chosen in the form, which is what makes a contract
 * that mixes the two unconstructible from the UI.
 *
 * Employment contracts live at /ops/hr/contracts, in the `hr` module group.
 */
export const dynamic = "force-dynamic";

export default function Page({
  searchParams,
}: {
  searchParams?: Promise<OpsSearchParams>;
}) {
  return <OpsContractRegisterPage kind="subcontract" searchParams={searchParams} />;
}
