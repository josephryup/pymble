import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type {
  OpsContractDetail,
  OpsContractSignatoryRole,
} from "@/lib/ops/contract-types";
import { OPS_CONTRACT_SIGNATORY_LABELS } from "@/lib/ops/contract-types";
import {
  BrandHeader,
  Column,
  Field,
  PageFooter,
  SectionTitle,
  Table,
  TotalsBlock,
  TwoColumn,
  sharedStyles,
} from "@/lib/ops/pdf/components";
import {
  formatPdfDate,
  formatPdfDateTime,
  formatPdfMoney,
  PYMBLE_ORG_FALLBACK,
  PYMBLE_PDF_THEME,
  type PymblePdfOrgSnapshot,
} from "@/lib/ops/pdf/theme";

const { colors, typography, spacing, ruler } = PYMBLE_PDF_THEME;

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: spacing.page,
    paddingTop: spacing.page,
    // Room for the initials strip AND the standard footer beneath it.
    paddingBottom: spacing.page * 2,
    fontFamily: typography.family,
    fontSize: typography.body,
    color: colors.body,
  },
  partyPanel: {
    borderWidth: ruler.thin,
    borderColor: colors.border,
    padding: spacing.row,
    marginBottom: spacing.block,
  },
  partyHeading: {
    fontSize: typography.micro,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.muted,
    marginBottom: spacing.inlineSm,
  },
  partyName: {
    fontSize: typography.body,
    fontWeight: 700,
    color: colors.ink,
    marginBottom: 2,
  },
  partyLine: {
    fontSize: typography.small,
    color: colors.body,
    lineHeight: 1.4,
  },
  bodyText: {
    fontSize: typography.small,
    color: colors.body,
    lineHeight: 1.5,
  },
  clauseBlock: {
    marginBottom: spacing.block,
  },
  clauseHeading: {
    fontSize: typography.body,
    fontWeight: 700,
    color: colors.primaryDark,
    marginBottom: spacing.inlineSm,
  },
  clauseBody: {
    fontSize: typography.small,
    color: colors.body,
    lineHeight: 1.5,
  },
  scopeItem: {
    marginBottom: spacing.row,
  },
  scopeHeading: {
    fontSize: typography.small,
    fontWeight: 700,
    color: colors.ink,
  },
  customisedTag: {
    fontSize: typography.micro,
    color: colors.muted,
    fontWeight: 700,
    marginBottom: 2,
  },
  // The INT______ boxes the source instrument carries on every page. Rendered
  // `fixed` so they land on each page automatically rather than being counted
  // out by hand — the original had them dropped from at least one page.
  initialsRow: {
    position: "absolute",
    left: spacing.page,
    right: spacing.page,
    bottom: spacing.page,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  initialsText: {
    fontSize: typography.micro,
    color: colors.muted,
    letterSpacing: 0.5,
  },
  executionRow: {
    flexDirection: "row",
    gap: spacing.block,
    marginBottom: spacing.block,
  },
  executionBlock: {
    flex: 1,
    borderWidth: ruler.thin,
    borderColor: colors.border,
    padding: spacing.row,
    minHeight: 118,
  },
  executionRole: {
    fontSize: typography.micro,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.muted,
    marginBottom: spacing.inlineSm,
  },
  markImage: {
    height: 34,
    maxWidth: 150,
    objectFit: "contain",
    marginBottom: 2,
  },
  markRule: {
    borderBottomWidth: ruler.thin,
    borderBottomColor: colors.border,
    height: 34,
    marginBottom: 2,
  },
  executionName: {
    fontSize: typography.small,
    fontWeight: 700,
    color: colors.ink,
  },
  executionMeta: {
    fontSize: typography.micro,
    color: colors.muted,
    lineHeight: 1.4,
  },
  staleWarning: {
    fontSize: typography.micro,
    color: colors.primaryDark,
    backgroundColor: colors.surfaceWarning,
    padding: 3,
    marginTop: 2,
    lineHeight: 1.3,
  },
  declined: {
    fontSize: typography.micro,
    color: colors.primaryDark,
    backgroundColor: colors.surfaceDanger,
    padding: 3,
    marginTop: 2,
    lineHeight: 1.3,
  },
  draftBanner: {
    backgroundColor: colors.surfaceWarning,
    padding: spacing.row,
    marginBottom: spacing.block,
  },
  draftBannerText: {
    fontSize: typography.small,
    fontWeight: 700,
    color: colors.primaryDark,
  },
});

/**
 * One signatory as the renderer needs it. `markDataUrl` is a base64 data URL
 * resolved server-side by the download route — the image is never fetched over
 * the network, and no URL to it exists outside this render.
 */
export type ContractPdfSignatory = {
  signatoryRole: OpsContractSignatoryRole;
  status: "pending" | "signed" | "declined";
  signedName: string;
  signedTitle: string;
  signedAt: string | null;
  verificationCode: string | null;
  declineReason: string;
  markDataUrl: string | null;
  /** False when the contract changed after this signature was taken. */
  matchesCurrentDocument: boolean | null;
};

export type ContractAgreementPdfProps = {
  contract: OpsContractDetail;
  /** Clause bodies with {{merge_tokens}} already resolved. */
  clauses: Array<{
    section_key: string;
    heading: string;
    body: string;
    is_customised: boolean;
  }>;
  signatories: ContractPdfSignatory[];
  org: PymblePdfOrgSnapshot;
  generatedBy?: string | null;
  /** Show the customised-clause markers. Off for the counterparty's copy. */
  showCustomisedMarkers?: boolean;
};

function formatRoleTitle(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function ExecutionBlock({ signatory }: { signatory: ContractPdfSignatory }) {
  const label = OPS_CONTRACT_SIGNATORY_LABELS[signatory.signatoryRole];

  return (
    <View style={styles.executionBlock} wrap={false}>
      <Text style={styles.executionRole}>For &amp; on behalf of — {label}</Text>

      {signatory.status === "signed" && signatory.markDataUrl ? (
        // react-pdf <Image>, not an HTML img — there is no alt attribute.
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image src={signatory.markDataUrl} style={styles.markImage} />
      ) : (
        // An unsigned slot renders as an empty ruled line. A half-executed
        // contract must LOOK half-executed — printing a name without a mark
        // would read as signed at a glance.
        <View style={styles.markRule} />
      )}

      <Text style={styles.executionName}>
        {signatory.status === "signed" ? signatory.signedName : "Name: ______________________"}
      </Text>

      {signatory.status === "signed" ? (
        <>
          <Text style={styles.executionMeta}>
            {formatRoleTitle(signatory.signedTitle)}
          </Text>
          <Text style={styles.executionMeta}>
            Signed {formatPdfDateTime(signatory.signedAt)}
          </Text>
          {signatory.verificationCode ? (
            <Text style={styles.executionMeta}>
              Verification {signatory.verificationCode}
            </Text>
          ) : null}
          {signatory.matchesCurrentDocument === false ? (
            <Text style={styles.staleWarning}>
              Signature recorded against a different version of this document.
            </Text>
          ) : null}
        </>
      ) : signatory.status === "declined" ? (
        <Text style={styles.declined}>
          Declined to sign
          {signatory.declineReason ? ` — ${signatory.declineReason}` : ""}
        </Text>
      ) : (
        <>
          <Text style={styles.executionMeta}>Signature: ______________________</Text>
          <Text style={styles.executionMeta}>Date: ______________________</Text>
        </>
      )}
    </View>
  );
}

export function ContractAgreementPdf({
  contract,
  clauses,
  signatories,
  org,
  generatedBy,
  showCustomisedMarkers = true,
}: ContractAgreementPdfProps) {
  const resolvedOrg = { ...PYMBLE_ORG_FALLBACK, ...org };
  const counterparty = contract.counterparty_snapshot ?? {};

  const documentKind =
    contract.kind === "employment" ? "Contract of Employment" : "Works Order & Subcontract";

  const currency = contract.currency_code || "ZMW";

  const lineRows = contract.lines.map((line, index) => [
    index + 1,
    line.description,
    Number(line.quantity ?? 0).toLocaleString("en-ZM"),
    line.uom,
    formatPdfMoney(Number(line.rate ?? 0), currency),
    formatPdfMoney(Number(line.amount ?? 0), currency),
  ]);

  const totalsRows = [
    { label: "Subtotal", value: formatPdfMoney(Number(contract.subtotal ?? 0), currency) },
    // The source instrument printed "VAT (16%)" against a blank amount and a
    // total equal to the net — an ambiguity that cost a reader the answer to
    // "is VAT due?". Say which it is, explicitly, either way.
    //
    // The value stays short because TotalsBlock's value column is a fixed 110pt:
    // the full sentence wrapped to three lines and collided with the Total row.
    // The explanation goes underneath the block instead, where it has room.
    contract.vat_applicable
      ? {
          label: `VAT (${Number(contract.vat_percent ?? 0)}%)`,
          value: formatPdfMoney(Number(contract.vat_amount ?? 0), currency),
        }
      : { label: "VAT", value: "Not applicable" },
    {
      label: "Total",
      value: formatPdfMoney(Number(contract.total_value ?? 0), currency),
      bold: true,
    },
  ];

  const milestoneRows = contract.milestones.map((milestone, index) => [
    index + 1,
    milestone.label + (milestone.is_retention ? " (retention)" : ""),
    `${Number(milestone.percent ?? 0)}%`,
    formatPdfMoney(Number(milestone.amount ?? 0), currency),
    milestone.trigger_description,
    `${milestone.payable_within_days} days`,
  ]);

  const isDraft = contract.status === "draft" || contract.status === "in_review";

  return (
    <Document
      title={`${contract.contract_number} — ${contract.title}`}
      author={resolvedOrg.legal_name ?? "Pymble Construction Limited"}
    >
      <Page size="A4" style={styles.page}>
        <BrandHeader
          org={resolvedOrg}
          documentKind={documentKind}
          documentNumber={contract.contract_number}
          documentDateLabel={formatPdfDate(contract.work_order_date ?? contract.created_at)}
        />

        {isDraft ? (
          <View style={styles.draftBanner}>
            <Text style={styles.draftBannerText}>
              DRAFT — not approved, not for signature or issue.
            </Text>
          </View>
        ) : null}

        <TwoColumn>
          <Column>
            <View style={styles.partyPanel}>
              <Text style={styles.partyHeading}>From</Text>
              <Text style={styles.partyName}>
                {resolvedOrg.legal_name ?? "Pymble Construction Limited"}
              </Text>
              {resolvedOrg.headquarters_address ? (
                <Text style={styles.partyLine}>{resolvedOrg.headquarters_address}</Text>
              ) : null}
              {resolvedOrg.tpin ? (
                <Text style={styles.partyLine}>TPIN: {resolvedOrg.tpin}</Text>
              ) : null}
              {resolvedOrg.phone ? (
                <Text style={styles.partyLine}>Contact: {resolvedOrg.phone}</Text>
              ) : null}
              {resolvedOrg.email ? (
                <Text style={styles.partyLine}>Email: {resolvedOrg.email}</Text>
              ) : null}
            </View>
          </Column>
          <Column>
            <View style={styles.partyPanel}>
              <Text style={styles.partyHeading}>To</Text>
              <Text style={styles.partyName}>
                {counterparty.name || contract.counterparty_name}
              </Text>
              {counterparty.address ? (
                <Text style={styles.partyLine}>{counterparty.address}</Text>
              ) : null}
              <Text style={styles.partyLine}>TPIN: {counterparty.tpin || "—"}</Text>
              <Text style={styles.partyLine}>
                Contact: {counterparty.contact_name || "—"}
                {counterparty.contact_phone ? ` · ${counterparty.contact_phone}` : ""}
              </Text>
              <Text style={styles.partyLine}>
                Email: {counterparty.contact_email || "—"}
              </Text>
            </View>
          </Column>
        </TwoColumn>

        <TwoColumn>
          <Column>
            <Field label="Works order no." value={contract.work_order_number} />
            <Field label="Site" value={contract.site?.name ?? "—"} />
            <Field
              label="Expected start"
              value={formatPdfDate(contract.expected_start_date ?? contract.start_date)}
            />
          </Column>
          <Column>
            <Field
              label="Works order date"
              value={formatPdfDate(contract.work_order_date)}
            />
            <Field label="Duration" value={`${contract.duration_days} days`} />
            <Field
              label="Expected finish"
              value={formatPdfDate(contract.expected_finish_date ?? contract.end_date)}
            />
          </Column>
        </TwoColumn>

        {contract.preamble ? (
          <>
            <SectionTitle>Preamble</SectionTitle>
            <Text style={styles.bodyText}>{contract.preamble}</Text>
          </>
        ) : null}

        {contract.scope_items.length > 0 ? (
          <View style={{ marginTop: spacing.block }}>
            <SectionTitle>Scope of works</SectionTitle>
            {contract.scope_summary ? (
              <Text style={[styles.bodyText, { marginBottom: spacing.row }]}>
                {contract.scope_summary}
              </Text>
            ) : null}
            {contract.scope_items.map((item, index) => (
              <View key={item.id} style={styles.scopeItem} wrap={false}>
                <Text style={styles.scopeHeading}>
                  {index + 1}. {item.heading}
                </Text>
                {item.detail ? (
                  <Text style={styles.bodyText}>{item.detail}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.initialsRow} fixed>
          <Text style={styles.initialsText}>INT ____________</Text>
          <Text style={styles.initialsText}>INT ____________</Text>
        </View>
        <PageFooter
          documentKind={documentKind}
          documentNumber={contract.contract_number}
          generatedBy={generatedBy}
        />
      </Page>

      <Page size="A4" style={styles.page}>
        {lineRows.length > 0 ? (
          <>
            <SectionTitle>Value of works</SectionTitle>
            <Table
              columns={[
                { label: "S/No", widthPct: 7 },
                { label: "Description", widthPct: 41 },
                { label: "Qty", widthPct: 8, align: "right" },
                { label: "UoM", widthPct: 10 },
                { label: "Rate", widthPct: 17, align: "right" },
                { label: "Amount", widthPct: 17, align: "right" },
              ]}
              rows={lineRows}
            />
            <TotalsBlock rows={totalsRows} />
            {!contract.vat_applicable ? (
              <Text style={[styles.bodyText, { marginTop: spacing.row }]}>
                VAT is not applicable to this contract — the supplier is not VAT
                registered.
              </Text>
            ) : null}
            {contract.roe_reference ? (
              <Text style={[styles.bodyText, { marginTop: spacing.row }]}>
                ROE: {contract.roe_reference}. Payments will be made in {currency}; any
                exchange rate stated is for reference only.
              </Text>
            ) : null}
          </>
        ) : null}

        {milestoneRows.length > 0 ? (
          <View style={{ marginTop: spacing.block }}>
            <SectionTitle>Payment schedule</SectionTitle>
            <Table
              columns={[
                { label: "S/No", widthPct: 7 },
                { label: "Stage", widthPct: 26 },
                { label: "%", widthPct: 8, align: "right" },
                { label: "Amount", widthPct: 17, align: "right" },
                { label: "Trigger", widthPct: 30 },
                { label: "Payable", widthPct: 12 },
              ]}
              rows={milestoneRows}
            />
          </View>
        ) : null}

        <View style={styles.initialsRow} fixed>
          <Text style={styles.initialsText}>INT ____________</Text>
          <Text style={styles.initialsText}>INT ____________</Text>
        </View>
        <PageFooter
          documentKind={documentKind}
          documentNumber={contract.contract_number}
          generatedBy={generatedBy}
        />
      </Page>

      <Page size="A4" style={styles.page}>
        <SectionTitle>Terms and conditions</SectionTitle>
        {clauses.map((clause) => (
          <View key={clause.section_key} style={styles.clauseBlock}>
            {showCustomisedMarkers && clause.is_customised ? (
              <Text style={styles.customisedTag}>
                AMENDED FROM STANDARD TERMS
              </Text>
            ) : null}
            {clause.heading ? (
              <Text style={styles.clauseHeading}>{clause.heading}</Text>
            ) : null}
            <Text style={styles.clauseBody}>{clause.body}</Text>
          </View>
        ))}

        <View style={{ marginTop: spacing.block }} wrap={false}>
          <SectionTitle>Execution</SectionTitle>
          <View style={styles.executionRow}>
            {signatories.slice(0, 2).map((signatory) => (
              <ExecutionBlock key={signatory.signatoryRole} signatory={signatory} />
            ))}
          </View>
          {signatories.length > 2 ? (
            <View style={styles.executionRow}>
              {signatories.slice(2).map((signatory) => (
                <ExecutionBlock key={signatory.signatoryRole} signatory={signatory} />
              ))}
            </View>
          ) : null}

          <View style={sharedStyles.signatureRow}>
            <View style={sharedStyles.signatureBlock}>
              <View style={sharedStyles.signatureLine} />
              <Text style={sharedStyles.signatureCaption}>
                For &amp; on behalf of {counterparty.name || contract.counterparty_name}
              </Text>
            </View>
            <View style={sharedStyles.signatureBlock}>
              <View style={sharedStyles.signatureLine} />
              <Text style={sharedStyles.signatureCaption}>Witness</Text>
            </View>
          </View>
        </View>

        <View style={styles.initialsRow} fixed>
          <Text style={styles.initialsText}>INT ____________</Text>
          <Text style={styles.initialsText}>INT ____________</Text>
        </View>
        <PageFooter
          documentKind={documentKind}
          documentNumber={contract.contract_number}
          generatedBy={generatedBy}
        />
      </Page>
    </Document>
  );
}
