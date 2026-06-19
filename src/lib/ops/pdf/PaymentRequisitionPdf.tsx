 
import { Document, Page, StyleSheet, Text } from "@react-pdf/renderer";
import {
  formatPdfDate,
  formatPdfMoney,
  PYMBLE_ORG_FALLBACK,
  PYMBLE_PDF_THEME,
  type PymblePdfOrgSnapshot,
} from "@/lib/ops/pdf/theme";
import {
  BrandHeader,
  Column,
  Field,
  PageFooter,
  SectionTitle,
  SignatureRow,
  Table,
  TotalsBlock,
  TwoColumn,
  sharedStyles,
} from "@/lib/ops/pdf/components";

const { colors, typography, spacing } = PYMBLE_PDF_THEME;

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: spacing.page,
    paddingTop: spacing.page,
    paddingBottom: spacing.page * 1.5,
    fontFamily: typography.family,
    fontSize: typography.body,
    color: colors.body,
  },
  note: {
    fontSize: typography.small,
    color: colors.muted,
    marginTop: spacing.row,
    lineHeight: 1.4,
  },
});

export type PaymentRequisitionLine = {
  item_no: number;
  description: string;
  quantity: number;
  unit_of_measure: string;
  unit_price: number;
  total: number;
  supplier_name: string;
  bank_name?: string | null;
  account_name?: string | null;
  account_number?: string | null;
  branch?: string | null;
  swift_code?: string | null;
};

export type PaymentRequisitionPdfProps = {
  /**
   * Header fields used by procurement to identify the requisition. Matches
   * the paper form columns from Pymble's existing procurement workflow.
   */
  header: {
    requisition_number: string;
    project_name: string;
    site_name: string;
    raised_date: string;
    raised_by?: string | null;
  };
  lines: PaymentRequisitionLine[];
  org: PymblePdfOrgSnapshot;
  generatedBy?: string | null;
  status?: string;
};

export function PaymentRequisitionPdf({
  header,
  lines,
  org,
  generatedBy,
  status = "DRAFT",
}: PaymentRequisitionPdfProps) {
  const safeOrg = { ...PYMBLE_ORG_FALLBACK, ...org };
  const documentKind = "Procurement Requisition";
  const documentDateLabel = `Raised ${formatPdfDate(header.raised_date)}`;
  const grandTotal = lines.reduce((sum, line) => sum + line.total, 0);

  return (
    <Document
      author={safeOrg.legal_name}
      creator={safeOrg.legal_name}
      title={`${documentKind} ${header.requisition_number}`}
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <BrandHeader
          org={safeOrg}
          documentKind={documentKind}
          documentNumber={header.requisition_number}
          documentDateLabel={documentDateLabel}
        />

        <TwoColumn>
          <Column>
            <SectionTitle>Project</SectionTitle>
            <Field label="Project name" value={header.project_name} />
            <Field label="Site" value={header.site_name} />
          </Column>
          <Column>
            <SectionTitle>Request</SectionTitle>
            <Field label="Requisition number" value={header.requisition_number} />
            <Field label="Date" value={formatPdfDate(header.raised_date)} />
            <Field label="Raised by" value={header.raised_by ?? "—"} />
            <Field label="Status" value={status.toUpperCase()} />
          </Column>
        </TwoColumn>

        <SectionTitle>Items and Supplier Banking Details</SectionTitle>
        <Table
          columns={[
            { label: "Item No.", widthPct: 4, align: "center" },
            { label: "Description", widthPct: 18 },
            { label: "Qty", widthPct: 5, align: "right" },
            { label: "Unit", widthPct: 5, align: "center" },
            { label: "Unit Price (K)", widthPct: 9, align: "right" },
            { label: "Total (K)", widthPct: 9, align: "right" },
            { label: "Supplier", widthPct: 12 },
            { label: "Bank", widthPct: 9 },
            { label: "Account name", widthPct: 11 },
            { label: "Account number", widthPct: 9 },
            { label: "Branch", widthPct: 5 },
            { label: "SWIFT", widthPct: 4 },
          ]}
          rows={lines.map((line) => [
            line.item_no,
            line.description,
            line.quantity.toLocaleString("en-ZM", {
              maximumFractionDigits: 2,
            }),
            line.unit_of_measure,
            formatPdfMoney(line.unit_price, ""),
            formatPdfMoney(line.total, ""),
            line.supplier_name,
            line.bank_name ?? "",
            line.account_name ?? "",
            line.account_number ?? "",
            line.branch ?? "",
            line.swift_code ?? "",
          ])}
        />

        <TotalsBlock
          rows={[
            {
              label: "Grand Total",
              value: formatPdfMoney(grandTotal),
              bold: true,
            },
          ]}
        />

        <Text style={styles.note}>
          Supplier banking details must match the supplier master list entry
          where one exists. Free-text suppliers must be added to the master list
          before a Purchase Order can be issued against them.
        </Text>

        <SignatureRow
          slots={[
            { caption: "Raised by", name: header.raised_by },
            { caption: "Operations Manager" },
            { caption: "Procurement Manager" },
            { caption: "Finance Manager" },
            { caption: "Managing Director" },
          ]}
        />

        <PageFooter
          documentKind={documentKind}
          documentNumber={header.requisition_number}
          generatedBy={generatedBy ?? null}
        />

        <Text style={[sharedStyles.fieldValue, styles.note]} wrap={false}>
          Generated digitally by the Pymble Operations workspace.
        </Text>
      </Page>
    </Document>
  );
}
