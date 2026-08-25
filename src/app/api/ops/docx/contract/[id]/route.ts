import { NextResponse } from "next/server";

import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { canViewOpsContractSubject } from "@/lib/ops/contract-permissions";
import { buildOpsContractDocx } from "@/lib/ops/contract-docx";
import {
  buildOpsContractMergeValues,
  fetchOpsContractById,
  renderOpsContractClauseBody,
} from "@/lib/ops/contracts";
import { logOpsServerError } from "@/lib/ops/log";
import { fetchOpsOrganizationProfile } from "@/lib/ops/organization";

/**
 * Word export of a contract — a working copy for offline editing.
 *
 * Audited like the PDF download, and more pointedly: a Word file leaves the
 * system's control entirely, so the record of who took one out is the only
 * trace that remains.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  try {
    const { profile } = await requireOpsUser();

    const contract = await fetchOpsContractById(id);
    if (!contract) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }

    if (!canViewOpsContractSubject(profile.role, contract)) {
      return NextResponse.json(
        { error: "Your role cannot download this contract." },
        { status: 403 },
      );
    }

    const orgProfile = await fetchOpsOrganizationProfile().catch(() => null);
    const org = orgProfile
      ? {
          legal_name: orgProfile.legal_name,
          trading_name: orgProfile.trading_name,
          headquarters_address: [
            orgProfile.address_line,
            orgProfile.city,
            orgProfile.country,
          ]
            .filter((part) => Boolean(part && String(part).trim()))
            .join(", "),
          tpin: orgProfile.tpin,
          email: orgProfile.email,
          phone: orgProfile.phone_primary,
        }
      : {};

    const mergeValues = buildOpsContractMergeValues({
      contract,
      orgLegalName: org.legal_name ?? "Pymble Construction Limited",
      // fetchOpsContractById attaches this only after the visibility gate, so
      // by the time it reaches the merge it is already cleared for this reader.
      // The pay tokens render "—" when it is null rather than an empty string,
      // so a missing schedule reads as missing rather than as zero.
      remuneration: contract.remuneration,
    });

    const clauses = contract.clauses.map((clause) => ({
      heading: clause.heading,
      body: renderOpsContractClauseBody(clause.body_markdown, mergeValues),
      is_customised: clause.is_customised,
    }));

    const buffer = await buildOpsContractDocx({ clauses, contract, org });

    await recordOpsAuditEvent({
      action: "contract.docx_downloaded",
      actorUserId: profile.id,
      entityId: contract.id,
      entityType: "contract",
      metadata: { contract_number: contract.contract_number, status: contract.status },
      moduleKey: "contracts",
      sourceId: contract.id,
      sourceTable: "contracts",
      summary: `${profile.full_name} exported ${contract.contract_number} as an editable Word working copy`,
    }).catch(() => null);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
          `${contract.contract_number}-working-copy.docx`,
        )}`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    logOpsServerError(error, {
      module: "contracts",
      action: "downloadContractDocx",
      entityId: id,
    });
    return NextResponse.json(
      { error: "The contract Word file could not be generated." },
      { status: 500 },
    );
  }
}
