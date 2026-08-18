import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type {
  OpsContractDetail,
  OpsContractSignatoryRole,
} from "@/lib/ops/contract-types";
import { OPS_CONTRACT_SIGNATORY_LABELS } from "@/lib/ops/contract-types";
import { PageFooter, Table } from "@/lib/ops/pdf/components";
import {
  formatPdfDate,
  formatPdfDateTime,
  formatPdfMoney,
  PYMBLE_LOGO_DATA_URL,
  PYMBLE_ORG_FALLBACK,
  PYMBLE_PDF_THEME,
  type PymblePdfOrgSnapshot,
} from "@/lib/ops/pdf/theme";

const { colors, typography, spacing, ruler } = PYMBLE_PDF_THEME;

/**
 * A contract has to read as an instrument, not as a report. Four things drive
 * the layout, and each replaces something the first version got wrong:
 *
 *  1. It opens by naming the PARTIES, the way the source instrument did
 *     ("CONTRACT AGREEMENT BETWEEN … AND …"). The first version led with a
 *     reference number, which is what a delivery note leads with. The number
 *     is administrative; who is bound is the point of the document.
 *
 *  2. Labels are set at 6.5pt with 0.4 tracking, not 7pt with 1.0. At small
 *     sizes wide tracking stops reading as emphasis and starts reading as
 *     damage — "W O R K S  O R D E R  D A T E" costs a reader real effort.
 *
 *  3. Facts sit in a ruled strip rather than a ragged two-column list, so
 *     "duration" and "expected finish" can be found rather than hunted.
 *
 *  4. Clauses are NUMBERED. A contract whose terms cannot be cross-referenced
 *     in a later letter is not much use in a dispute.
 */

const LABEL = {
  fontSize: 6.5,
  textTransform: "uppercase" as const,
  letterSpacing: 0.4,
  color: colors.muted,
};

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: spacing.page,
    paddingTop: spacing.page,
    // Room for the initials strip AND the footer beneath it.
    paddingBottom: spacing.page * 2,
    fontFamily: typography.family,
    fontSize: typography.body,
    color: colors.body,
  },

  // --- letterhead -----------------------------------------------------------
  letterhead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandLogo: { width: 40, height: 30, objectFit: "contain" },
  brandName: {
    fontSize: 14,
    fontWeight: 700,
    color: colors.primary,
    letterSpacing: 0.2,
  },
  brandLine: { fontSize: typography.micro, color: colors.muted, marginTop: 1.5 },
  docMeta: { alignItems: "flex-end" },
  docKind: { ...LABEL, fontWeight: 700 },
  docNumber: {
    fontSize: 12,
    fontWeight: 700,
    color: colors.ink,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  // A single hairline under the letterhead does the separating; the earlier
  // 1pt primary rule competed with the headings below it.
  headRule: {
    borderBottomWidth: ruler.medium,
    borderBottomColor: colors.primary,
    marginTop: spacing.row,
    marginBottom: spacing.block,
  },

  // --- title block ----------------------------------------------------------
  titleBlock: {
    borderWidth: ruler.thin,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft,
    paddingVertical: 12,
    paddingHorizontal: spacing.block,
    marginBottom: spacing.block,
    alignItems: "center",
  },
  titleKind: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.primaryDark,
  },
  titleJoin: {
    ...LABEL,
    marginTop: 6,
    marginBottom: 2,
  },
  titleParty: {
    fontSize: 12,
    fontWeight: 700,
    color: colors.ink,
    textAlign: "center",
  },
  titleSubject: {
    fontSize: typography.small,
    color: colors.body,
    textAlign: "center",
    marginTop: 9,
    paddingTop: 8,
    borderTopWidth: ruler.thin,
    borderTopColor: colors.border,
    lineHeight: 1.45,
  },

  // --- ruled fact strip -----------------------------------------------------
  factStrip: {
    flexDirection: "row",
    borderWidth: ruler.thin,
    borderColor: colors.border,
  },
  // The second row shares the first row's bottom edge instead of drawing its
  // own top edge — otherwise the strip reads as two detached boxes with a gap,
  // which is what it looked like before.
  factStripJoin: {
    borderTopWidth: 0,
    marginBottom: spacing.block,
  },
  factCell: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderLeftWidth: ruler.thin,
    borderLeftColor: colors.border,
  },
  factCellFirst: { borderLeftWidth: 0 },
  factValue: {
    fontSize: typography.small,
    fontWeight: 700,
    color: colors.ink,
    marginTop: 2,
  },

  // --- parties --------------------------------------------------------------
  partyRow: { flexDirection: "row", gap: spacing.block, marginBottom: spacing.block },
  partyPanel: {
    flex: 1,
    borderWidth: ruler.thin,
    borderColor: colors.border,
    padding: 10,
  },
  // The counterparty gets the accent edge: on a signed contract the question
  // a reader arrives with is "who is the other side?".
  partyPanelAccent: {
    borderLeftWidth: 2.5,
    borderLeftColor: colors.accent,
  },
  partyName: {
    fontSize: 10.5,
    fontWeight: 700,
    color: colors.ink,
    marginTop: 3,
    marginBottom: 3,
  },
  partyLine: { fontSize: typography.micro, color: colors.body, lineHeight: 1.5 },

  // --- sections -------------------------------------------------------------
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: spacing.block,
    marginBottom: spacing.row,
  },
  sectionTick: {
    width: 3,
    height: 11,
    backgroundColor: colors.primary,
  },
  sectionTitle: {
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.primaryDark,
  },
  bodyText: { fontSize: typography.small, color: colors.body, lineHeight: 1.55 },

  scopeItem: { flexDirection: "row", gap: 7, marginBottom: 7 },
  scopeNo: {
    fontSize: typography.small,
    fontWeight: 700,
    color: colors.primary,
    width: 14,
  },
  scopeHeading: { fontSize: typography.small, fontWeight: 700, color: colors.ink },

  // --- clauses --------------------------------------------------------------
  clause: { marginBottom: 11 },
  clauseHead: { flexDirection: "row", gap: 7, marginBottom: 3 },
  clauseNo: {
    fontSize: typography.small,
    fontWeight: 700,
    color: colors.primary,
    width: 16,
  },
  clauseHeading: {
    fontSize: typography.small,
    fontWeight: 700,
    color: colors.primaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    flex: 1,
  },
  clauseBody: {
    fontSize: typography.small,
    color: colors.body,
    lineHeight: 1.55,
    marginLeft: 23,
  },
  amendedTag: {
    fontSize: 6,
    fontWeight: 700,
    letterSpacing: 0.6,
    color: colors.primaryDark,
    backgroundColor: colors.surfaceWarning,
    paddingVertical: 1.5,
    paddingHorizontal: 4,
    marginLeft: 23,
    marginBottom: 3,
    alignSelf: "flex-start",
  },

  // --- totals ---------------------------------------------------------------
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end" },
  totalsBox: {
    width: 250,
    borderWidth: ruler.thin,
    borderColor: colors.border,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderTopWidth: ruler.thin,
    borderTopColor: colors.border,
  },
  totalsRowFirst: { borderTopWidth: 0 },
  totalsGrand: { backgroundColor: colors.primary },
  totalsLabel: { fontSize: typography.small, color: colors.muted },
  totalsValue: { fontSize: typography.small, color: colors.ink },
  totalsGrandText: { fontSize: typography.body, fontWeight: 700, color: colors.white },
  note: {
    fontSize: typography.micro,
    color: colors.muted,
    marginTop: spacing.row,
    lineHeight: 1.5,
  },

  // --- execution ------------------------------------------------------------
  execRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  execBlock: {
    flex: 1,
    borderWidth: ruler.thin,
    borderColor: colors.border,
    padding: 9,
    minHeight: 112,
  },
  execRole: { ...LABEL, fontWeight: 700, marginBottom: 5 },
  markImage: { height: 30, maxWidth: 130, objectFit: "contain" },
  markSlot: { height: 30, justifyContent: "flex-end" },
  markRule: { borderBottomWidth: ruler.thin, borderBottomColor: colors.ink },
  execName: {
    fontSize: typography.small,
    fontWeight: 700,
    color: colors.ink,
    marginTop: 4,
  },
  execMeta: { fontSize: 6.5, color: colors.muted, lineHeight: 1.5 },
  execFlag: {
    fontSize: 6,
    color: colors.primaryDark,
    backgroundColor: colors.surfaceWarning,
    padding: 3,
    marginTop: 3,
    lineHeight: 1.4,
  },
  execFlagDanger: {
    fontSize: 6,
    color: colors.primaryDark,
    backgroundColor: colors.surfaceDanger,
    padding: 3,
    marginTop: 3,
    lineHeight: 1.4,
  },

  // --- page furniture -------------------------------------------------------
  initialsRow: {
    position: "absolute",
    left: spacing.page,
    right: spacing.page,
    bottom: spacing.page,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  initialsText: { fontSize: 6.5, color: colors.muted, letterSpacing: 0.4 },

  banner: { padding: 7, marginBottom: spacing.block },
  bannerDraft: { backgroundColor: colors.surfaceWarning },
  bannerReview: { backgroundColor: colors.surfaceDanger },
  bannerText: { fontSize: typography.small, fontWeight: 700, color: colors.primaryDark },
});

export type ContractPdfSignatory = {
  signatoryRole: OpsContractSignatoryRole;
  status: "pending" | "signed" | "declined";
  signedName: string;
  signedTitle: string;
  signedAt: string | null;
  verificationCode: string | null;
  declineReason: string;
  /** Base64 data URL resolved server-side; never fetched over the network. */
  markDataUrl: string | null;
  matchesCurrentDocument: boolean | null;
};

export type ContractAgreementPdfProps = {
  clauses: Array<{
    section_key: string;
    heading: string;
    body: string;
    is_customised: boolean;
  }>;
  contract: OpsContractDetail;
  generatedBy?: string | null;
  org: PymblePdfOrgSnapshot;
  signatories: ContractPdfSignatory[];
  showCustomisedMarkers?: boolean;
};

function formatRoleTitle(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function Label({ children }: { children: string }) {
  return <Text style={LABEL}>{children}</Text>;
}

function SectionHead({ children }: { children: string }) {
  return (
    <View style={styles.sectionHead} wrap={false}>
      <View style={styles.sectionTick} />
      <Text style={styles.sectionTitle}>{children}</Text>
    </View>
  );
}

function Fact({ first, label, value }: { first?: boolean; label: string; value: string }) {
  return (
    <View style={[styles.factCell, ...(first ? [styles.factCellFirst] : [])]}>
      <Label>{label}</Label>
      <Text style={styles.factValue}>{value || "—"}</Text>
    </View>
  );
}

function Letterhead({
  contract,
  documentKind,
  org,
}: {
  contract: OpsContractDetail;
  documentKind: string;
  org: PymblePdfOrgSnapshot;
}) {
  return (
    <>
      <View style={styles.letterhead}>
        <View style={styles.brandRow}>
          {PYMBLE_LOGO_DATA_URL ? (
            // react-pdf <Image>, not an HTML img — there is no alt attribute.
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={PYMBLE_LOGO_DATA_URL} style={styles.brandLogo} />
          ) : null}
          <View>
            <Text style={styles.brandName}>
              {org.legal_name ?? "Pymble Construction Limited"}
            </Text>
            {org.headquarters_address ? (
              <Text style={styles.brandLine}>{org.headquarters_address}</Text>
            ) : null}
            <Text style={styles.brandLine}>
              {[org.tpin ? `TPIN ${org.tpin}` : null, org.phone, org.email]
                .filter(Boolean)
                .join("   ·   ")}
            </Text>
          </View>
        </View>
        <View style={styles.docMeta}>
          <Text style={styles.docKind}>{documentKind}</Text>
          <Text style={styles.docNumber}>{contract.contract_number}</Text>
          <Text style={styles.execMeta}>
            {formatPdfDate(contract.work_order_date ?? contract.created_at)}
          </Text>
        </View>
      </View>
      <View style={styles.headRule} />
    </>
  );
}

function ExecutionBlock({ signatory }: { signatory: ContractPdfSignatory }) {
  const label = OPS_CONTRACT_SIGNATORY_LABELS[signatory.signatoryRole];
  const signed = signatory.status === "signed";

  return (
    <View style={styles.execBlock} wrap={false}>
      <Text style={styles.execRole}>{label}</Text>

      {signed && signatory.markDataUrl ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image src={signatory.markDataUrl} style={styles.markImage} />
      ) : (
        // An unsigned slot is an empty ruled line. A half-executed contract has
        // to LOOK half-executed — a printed name with no mark reads as signed
        // at a glance, which is the one misreading that matters here.
        <View style={styles.markSlot}>
          <View style={styles.markRule} />
        </View>
      )}

      <Text style={styles.execName}>
        {signed ? signatory.signedName : "Name"}
      </Text>

      {signed ? (
        <>
          <Text style={styles.execMeta}>{formatRoleTitle(signatory.signedTitle)}</Text>
          <Text style={styles.execMeta}>
            {formatPdfDateTime(signatory.signedAt)}
          </Text>
          {signatory.verificationCode ? (
            <Text style={styles.execMeta}>Ref {signatory.verificationCode}</Text>
          ) : null}
          {signatory.matchesCurrentDocument === false ? (
            <Text style={styles.execFlagDanger}>
              Signed against a different version of this document.
            </Text>
          ) : null}
        </>
      ) : signatory.status === "declined" ? (
        <Text style={styles.execFlagDanger}>
          Declined{signatory.declineReason ? ` — ${signatory.declineReason}` : ""}
        </Text>
      ) : (
        <>
          <Text style={styles.execMeta}>Signature ______________________</Text>
          <Text style={styles.execMeta}>Date ______________________</Text>
        </>
      )}
    </View>
  );
}

function PageFurniture({
  contract,
  documentKind,
  generatedBy,
}: {
  contract: OpsContractDetail;
  documentKind: string;
  generatedBy?: string | null;
}) {
  return (
    <>
      {/* Fixed, so the initial boxes land on every page automatically. The
          source instrument counted them out by hand and missed a page. */}
      <View style={styles.initialsRow} fixed>
        <Text style={styles.initialsText}>INITIAL ____________</Text>
        <Text style={styles.initialsText}>INITIAL ____________</Text>
      </View>
      <PageFooter
        documentKind={documentKind}
        documentNumber={contract.contract_number}
        generatedBy={generatedBy}
      />
    </>
  );
}

export function ContractAgreementPdf({
  clauses,
  contract,
  generatedBy,
  org,
  showCustomisedMarkers = true,
  signatories,
}: ContractAgreementPdfProps) {
  const resolvedOrg = { ...PYMBLE_ORG_FALLBACK, ...org };
  const counterparty = contract.counterparty_snapshot ?? {};
  const counterpartyName = counterparty.name || contract.counterparty_name;
  const currency = contract.currency_code || "ZMW";

  const documentKind =
    contract.kind === "employment" ? "Contract of Employment" : "Works Order & Subcontract";
  const titleKind =
    contract.kind === "employment" ? "Contract of Employment" : "Contract Agreement";

  const isDraft = contract.status === "draft" || contract.status === "in_review";

  const lineRows = contract.lines.map((line, index) => [
    index + 1,
    line.description,
    Number(line.quantity ?? 0).toLocaleString("en-ZM"),
    line.uom,
    formatPdfMoney(Number(line.rate ?? 0), currency),
    formatPdfMoney(Number(line.amount ?? 0), currency),
  ]);

  const milestoneRows = contract.milestones.map((milestone, index) => [
    index + 1,
    // Only tag it when the label does not already say so — a stage actually
    // named "Retention" was rendering as "Retention (retention)".
    milestone.is_retention && !/retention/i.test(milestone.label)
      ? `${milestone.label}  (retention)`
      : milestone.label,
    `${Number(milestone.percent ?? 0)}%`,
    formatPdfMoney(Number(milestone.amount ?? 0), currency),
    milestone.trigger_description,
    `${milestone.payable_within_days} days`,
  ]);

  return (
    <Document
      author={resolvedOrg.legal_name ?? "Pymble Construction Limited"}
      title={`${contract.contract_number} — ${contract.title}`}
    >
      {/* ---------------------------------------------------------------- */}
      {/* Page 1 — who, what, when                                          */}
      {/* ---------------------------------------------------------------- */}
      <Page size="A4" style={styles.page}>
        <Letterhead contract={contract} documentKind={documentKind} org={resolvedOrg} />

        {isDraft ? (
          <View style={[styles.banner, styles.bannerDraft]}>
            <Text style={styles.bannerText}>
              DRAFT — not approved, not for signature or issue.
            </Text>
          </View>
        ) : null}

        {contract.template_requires_legal_review ? (
          <View style={[styles.banner, styles.bannerReview]}>
            <Text style={styles.bannerText}>
              UNREVIEWED WORDING — this template has not been checked by counsel
              and must not be issued or signed.
            </Text>
          </View>
        ) : null}

        {/* The parties, named first. This is what the source instrument opened
            with, and it is the question a reader actually arrives with. */}
        <View style={styles.titleBlock}>
          <Text style={styles.titleKind}>{titleKind}</Text>
          <Text style={styles.titleJoin}>Between</Text>
          <Text style={styles.titleParty}>
            {resolvedOrg.legal_name ?? "Pymble Construction Limited"}
          </Text>
          <Text style={styles.titleJoin}>And</Text>
          <Text style={styles.titleParty}>{counterpartyName}</Text>

          {/* The subject belongs inside the title block, under a rule — it is
              what the parties are agreeing about, not a stray caption. */}
          {contract.title ? (
            <Text style={styles.titleSubject}>{contract.title}</Text>
          ) : null}
        </View>

        <View style={styles.factStrip}>
          <Fact first label="Works order no." value={contract.work_order_number} />
          <Fact label="Dated" value={formatPdfDate(contract.work_order_date)} />
          <Fact label="Site" value={contract.site?.name ?? "—"} />
          <Fact label="Duration" value={`${contract.duration_days} days`} />
        </View>
        <View style={[styles.factStrip, styles.factStripJoin]}>
          <Fact
            first
            label="Expected start"
            value={formatPdfDate(contract.expected_start_date ?? contract.start_date)}
          />
          <Fact
            label="Expected finish"
            value={formatPdfDate(contract.expected_finish_date ?? contract.end_date)}
          />
          <Fact label="Payment terms" value={`${contract.payment_terms_days} days`} />
          <Fact
            label="Contract value"
            value={formatPdfMoney(Number(contract.total_value ?? 0), currency)}
          />
        </View>

        <View style={styles.partyRow}>
          <View style={styles.partyPanel}>
            <Label>The Client</Label>
            <Text style={styles.partyName}>
              {resolvedOrg.legal_name ?? "Pymble Construction Limited"}
            </Text>
            {resolvedOrg.headquarters_address ? (
              <Text style={styles.partyLine}>{resolvedOrg.headquarters_address}</Text>
            ) : null}
            <Text style={styles.partyLine}>TPIN: {resolvedOrg.tpin || "—"}</Text>
            <Text style={styles.partyLine}>Contact: {resolvedOrg.phone || "—"}</Text>
            <Text style={styles.partyLine}>Email: {resolvedOrg.email || "—"}</Text>
          </View>
          <View style={[styles.partyPanel, styles.partyPanelAccent]}>
            <Label>
              {contract.kind === "employment" ? "The Employee" : "The Contractor"}
            </Label>
            <Text style={styles.partyName}>{counterpartyName}</Text>
            <Text style={styles.partyLine}>{counterparty.address || "Address: —"}</Text>
            <Text style={styles.partyLine}>TPIN: {counterparty.tpin || "—"}</Text>
            <Text style={styles.partyLine}>
              Contact: {counterparty.contact_name || "—"}
              {counterparty.contact_phone ? `  ·  ${counterparty.contact_phone}` : ""}
            </Text>
            <Text style={styles.partyLine}>
              Email: {counterparty.contact_email || "—"}
            </Text>
          </View>
        </View>

        {contract.preamble ? (
          <>
            <SectionHead>Recitals</SectionHead>
            <Text style={styles.bodyText}>{contract.preamble}</Text>
          </>
        ) : null}

        {contract.scope_items.length > 0 ? (
          <>
            <SectionHead>Scope of works</SectionHead>
            {contract.scope_summary ? (
              <Text style={[styles.bodyText, { marginBottom: spacing.row }]}>
                {contract.scope_summary}
              </Text>
            ) : null}
            {contract.scope_items.map((item, index) => (
              <View key={item.id} style={styles.scopeItem} wrap={false}>
                <Text style={styles.scopeNo}>{index + 1}.</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scopeHeading}>{item.heading}</Text>
                  {item.detail ? (
                    <Text style={styles.bodyText}>{item.detail}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </>
        ) : null}

        <PageFurniture
          contract={contract}
          documentKind={documentKind}
          generatedBy={generatedBy}
        />
      </Page>

      {/* ---------------------------------------------------------------- */}
      {/* Page 2 — the money                                                */}
      {/* ---------------------------------------------------------------- */}
      {lineRows.length > 0 || milestoneRows.length > 0 ? (
        <Page size="A4" style={styles.page}>
          <Letterhead contract={contract} documentKind={documentKind} org={resolvedOrg} />

          {lineRows.length > 0 ? (
            <>
              <SectionHead>Value of works</SectionHead>
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

              <View style={styles.totalsWrap}>
                <View style={styles.totalsBox}>
                  <View style={[styles.totalsRow, styles.totalsRowFirst]}>
                    <Text style={styles.totalsLabel}>Subtotal</Text>
                    <Text style={styles.totalsValue}>
                      {formatPdfMoney(Number(contract.subtotal ?? 0), currency)}
                    </Text>
                  </View>
                  <View style={styles.totalsRow}>
                    <Text style={styles.totalsLabel}>
                      {contract.vat_applicable
                        ? `VAT at ${Number(contract.vat_percent ?? 0)}%`
                        : "VAT"}
                    </Text>
                    <Text style={styles.totalsValue}>
                      {contract.vat_applicable
                        ? formatPdfMoney(Number(contract.vat_amount ?? 0), currency)
                        : "Not applicable"}
                    </Text>
                  </View>
                  <View style={[styles.totalsRow, styles.totalsGrand]}>
                    <Text style={styles.totalsGrandText}>Total</Text>
                    <Text style={styles.totalsGrandText}>
                      {formatPdfMoney(Number(contract.total_value ?? 0), currency)}
                    </Text>
                  </View>
                </View>
              </View>

              {!contract.vat_applicable ? (
                <Text style={styles.note}>
                  VAT is not applicable to this contract — the supplier is not VAT
                  registered.
                </Text>
              ) : null}
              {contract.roe_reference ? (
                <Text style={styles.note}>
                  Exchange rate reference: {contract.roe_reference}. Payment is made in{" "}
                  {currency}; any rate stated is for reference only.
                </Text>
              ) : null}
            </>
          ) : null}

          {milestoneRows.length > 0 ? (
            <>
              <SectionHead>Payment schedule</SectionHead>
              <Table
                columns={[
                  { label: "S/No", widthPct: 7 },
                  { label: "Stage", widthPct: 26 },
                  { label: "%", widthPct: 8, align: "right" },
                  { label: "Amount", widthPct: 17, align: "right" },
                  // This column holds the trigger, not a date. Labelling it
                  // "Certified on" implied a date that is not there.
                  { label: "Payable on", widthPct: 30 },
                  { label: "Terms", widthPct: 12 },
                ]}
                rows={milestoneRows}
              />
              <Text style={styles.note}>
                Retention of {Number(contract.retention_percent ?? 0)}% is held for{" "}
                {contract.defects_liability_months} month
                {contract.defects_liability_months === 1 ? "" : "s"} after completion
                against defects.
              </Text>
            </>
          ) : null}

          <PageFurniture
            contract={contract}
            documentKind={documentKind}
            generatedBy={generatedBy}
          />
        </Page>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Page 3 — the terms, and execution                                 */}
      {/* ---------------------------------------------------------------- */}
      <Page size="A4" style={styles.page}>
        <Letterhead contract={contract} documentKind={documentKind} org={resolvedOrg} />

        <SectionHead>Terms and conditions</SectionHead>

        {clauses.map((clause, index) => (
          <View key={clause.section_key} style={styles.clause}>
            <View style={styles.clauseHead} wrap={false}>
              <Text style={styles.clauseNo}>{index + 1}.</Text>
              <Text style={styles.clauseHeading}>
                {clause.heading || clause.section_key.replace(/_/g, " ")}
              </Text>
            </View>
            {showCustomisedMarkers && clause.is_customised ? (
              <Text style={styles.amendedTag}>AMENDED FROM STANDARD TERMS</Text>
            ) : null}
            <Text style={styles.clauseBody}>{clause.body}</Text>
          </View>
        ))}

        <View wrap={false}>
          <SectionHead>Execution</SectionHead>
          <Text style={[styles.note, { marginTop: 0, marginBottom: spacing.row }]}>
            Signed for and on behalf of the parties on the dates shown.
          </Text>

          <View style={styles.execRow}>
            {signatories.slice(0, 3).map((signatory) => (
              <ExecutionBlock key={signatory.signatoryRole} signatory={signatory} />
            ))}
          </View>

          <View style={styles.execRow}>
            <View style={styles.execBlock}>
              <Text style={styles.execRole}>
                For &amp; on behalf of {counterpartyName}
              </Text>
              <View style={styles.markSlot}>
                <View style={styles.markRule} />
              </View>
              <Text style={styles.execName}>Name</Text>
              <Text style={styles.execMeta}>Signature ______________________</Text>
              <Text style={styles.execMeta}>Date ______________________</Text>
            </View>
            <View style={styles.execBlock}>
              <Text style={styles.execRole}>Witness</Text>
              <View style={styles.markSlot}>
                <View style={styles.markRule} />
              </View>
              <Text style={styles.execName}>Name</Text>
              <Text style={styles.execMeta}>Signature ______________________</Text>
              <Text style={styles.execMeta}>Date ______________________</Text>
            </View>
          </View>
        </View>

        <PageFurniture
          contract={contract}
          documentKind={documentKind}
          generatedBy={generatedBy}
        />
      </Page>
    </Document>
  );
}
