import { OpsContractRegisterPage } from "@/components/ops/OpsContractRegisterPage";
import type { OpsSearchParams } from "@/lib/ops/ui";

/**
 * The employment contract register, under HR.
 *
 * The `hr` module group is in SENSITIVE_MODULE_GROUPS, so an IT Manager cannot
 * widen access to this from the module-access screen — only the Managing
 * Director can. That is the security reason for the move, not just tidiness.
 */
export const dynamic = "force-dynamic";

export default function Page({
  searchParams,
}: {
  searchParams?: Promise<OpsSearchParams>;
}) {
  return <OpsContractRegisterPage kind="employment" searchParams={searchParams} />;
}
