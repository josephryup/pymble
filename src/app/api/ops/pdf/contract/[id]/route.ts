import { NextResponse } from "next/server";

import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { requireOpsUser } from "@/lib/ops/auth";
import { canViewOpsContractSubject } from "@/lib/ops/contract-permissions";
import {
  hashOpsContractContent,
  loadOpsContractSignatoriesForRender,
} from "@/lib/ops/contract-signatures";
import {
  buildOpsContractMergeValues,
  fetchOpsContractById,
  renderOpsContractClauseBody,
  toOpsContractSignableContent,
} from "@/lib/ops/contracts";
import { logOpsServerError } from "@/lib/ops/log";
import { fetchOpsOrganizationProfile } from "@/lib/ops/organization";
import { ContractAgreementPdf } from "@/lib/ops/pdf/ContractAgreementPdf";
import { pdfResponseHeaders, renderPdfDocument } from "@/lib/ops/pdf/render";

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

    // fetchOpsContractById already applies the subject gate and returns null for
    // a role that cannot see pay. Re-checking here is cheap and means the rule
    // survives someone later making that fetcher more permissive.
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
      section_key: clause.section_key,
      heading: clause.heading,
      body: renderOpsContractClauseBody(clause.body_markdown, mergeValues),
      is_customised: clause.is_customised,
    }));

    // Hash the contract as it stands now, then compare each stored signature
    // against it. A signature taken before an edit renders with a warning
    // instead of silently implying assent to wording nobody agreed to.
    const currentHash = hashOpsContractContent(toOpsContractSignableContent(contract));
    const signatories = await loadOpsContractSignatoriesForRender(
      contract.id,
      currentHash,
    );

    const pdf = await renderPdfDocument(
      ContractAgreementPdf({
        clauses,
        contract,
        generatedBy: profile.full_name,
        org,
        signatories,
      }),
    );

    await recordOpsAuditEvent({
      action: "contract.pdf_downloaded",
      actorUserId: profile.id,
      entityId: contract.id,
      entityType: "contract",
      metadata: { contract_number: contract.contract_number, status: contract.status },
      moduleKey: "contracts",
      sourceId: contract.id,
      sourceTable: "contracts",
      summary: `${profile.full_name} downloaded ${contract.contract_number} as PDF`,
    }).catch(() => null);

    return new NextResponse(new Uint8Array(pdf), {
      headers: pdfResponseHeaders(`${contract.contract_number}.pdf`),
    });
  } catch (error) {
    logOpsServerError(error, {
      module: "contracts",
      action: "downloadContractPdf",
      entityId: id,
    });
    return NextResponse.json(
      { error: "The contract PDF could not be generated." },
      { status: 500 },
    );
  }
}
