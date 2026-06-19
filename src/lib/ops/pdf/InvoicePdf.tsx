 
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { OpsInvoice } from "@/lib/ops/invoices";
import {
  formatPdfDate,
  formatPdfMoney,
  PYMBLE_ORG_FALLBACK,
  PYMBLE_PDF_THEME,
} from "@/lib/ops/pdf/theme";
import {
  BrandHeader,
  Column,
  Field,
  PageFooter,
  sharedStyles,
  SectionTitle,
  SignatureRow,
  Table,
  TotalsBlock,
  TwoColumn,
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
  bankBlock: {
    backgroundColor: colors.surfaceSoft,
    padding: spacing.row,
    marginTop: spacing.block,
  },
  bankRow: {
    flexDirection: "row",
    gap: spacing.block,
  },
  bankCol: {
    flex: 1,
  },
  smallNote: {
    fontSize: typography.small,
    color: colors.muted,
    marginTop: spacing.row,
    lineHeight: 1.4,
  },
});

export type InvoicePdfLine = {
  description: string;
  quantity: number;
  unit: string;
  unit_rate: number;
  total: number;
};

export type InvoiceOrgSnapshot = {
  legal_name?: string;
  trading_name?: string | null;
  headquarters_address?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  tpin?: string | null;
  vat_registration_number?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_branch?: string | null;
  bank_swift?: string | null;
};

export type InvoicePdfApproval = {
  caption: string;
  name?: string | null;
};

export type InvoicePdfProps = {
  invoice: OpsInvoice;
  lines: InvoicePdfLine[];
  org: InvoiceOrgSnapshot;
  approvals?: InvoicePdfApproval[];
  generatedBy?: string | null;
  paymentTerms?: string;
};

export function InvoicePdf({
  invoice,
  lines,
  org,
  approvals,
  generatedBy,
  paymentTerms = "Net 30 days from invoice date",
}: InvoicePdfProps) {
  const safeOrg = { ...PYMBLE_ORG_FALLBACK, ...org };
  const documentKind = "Tax Invoice";
  const documentDateLabel = `Issued ${formatPdfDate(invoice.issued_at)}`;
  const vatRate = invoice.subtotal > 0
    ? Math.round((invoice.vat_amount / invoice.subtotal) * 100)
    : 0;
  const approvalSlots: InvoicePdfApproval[] = approvals && approvals.length > 0
    ? approvals
    : [
        { caption: "Prepared by" },
        { caption: "Approved by" },
        { caption: "Authorised signatory" },
      ];

  return (
    <Document
      author={safeOrg.legal_name}
      creator={safeOrg.legal_name}
      producer={safeOrg.legal_name}
      title={`${documentKind} ${invoice.invoice_number}`}
    >
      <Page size="A4" style={styles.page} wrap>
        <BrandHeader
          org={safeOrg}
          documentKind={documentKind}
          documentNumber={invoice.invoice_number}
          documentDateLabel={documentDateLabel}
        />

        <TwoColumn>
          <Column>
            <SectionTitle>Bill To</SectionTitle>
            <Field label="Client" value={invoice.client_name} />
            <Field
              label="Client TPIN"
              value={invoice.tpin ?? ""}
            />
            <Field
              label="Project / Site"
              value={
                invoice.site
                  ? `${invoice.site.code} — ${invoice.site.name}`
                  : ""
              }
            />
            {invoice.boq ? (
              <Field
                label="Linked Bill of Quantities"
                value={invoice.boq.title}
              />
            ) : null}
          </Column>
          <Column>
            <SectionTitle>Invoice Details</SectionTitle>
            <Field label="Invoice number" value={invoice.invoice_number} />
            <Field label="Issued" value={formatPdfDate(invoice.issued_at)} />
            <Field label="Status" value={invoice.status.toUpperCase()} />
            <Field label="Payment terms" value={paymentTerms} />
          </Column>
        </TwoColumn>

        <SectionTitle>Line Items</SectionTitle>
        <Table
          columns={[
            { label: "Description", widthPct: 50 },
            { label: "Quantity", widthPct: 12, align: "right" },
            { label: "Unit", widthPct: 8, align: "center" },
            { label: "Unit rate", widthPct: 15, align: "right" },
            { label: "Line total", widthPct: 15, align: "right" },
          ]}
          rows={lines.map((line) => [
            line.description,
            line.quantity.toLocaleString("en-ZM", {
              maximumFractionDigits: 2,
            }),
            line.unit,
            formatPdfMoney(line.unit_rate),
            formatPdfMoney(line.total),
          ])}
        />

        <TotalsBlock
          rows={[
            { label: "Subtotal", value: formatPdfMoney(invoice.subtotal) },
            {
              label: `VAT (${vatRate}%)`,
              value: formatPdfMoney(invoice.vat_amount),
            },
            {
              label: "Total due",
              value: formatPdfMoney(invoice.total_amount),
              bold: true,
            },
          ]}
        />

        {safeOrg.bank_name ? (
          <View style={styles.bankBlock} wrap={false}>
            <SectionTitle>Payment Instructions</SectionTitle>
            <View style={styles.bankRow}>
              <View style={styles.bankCol}>
                <Field label="Bank" value={safeOrg.bank_name ?? ""} />
                <Field
                  label="Account name"
                  value={safeOrg.bank_account_name ?? ""}
                />
                <Field
                  label="Account number"
                  value={safeOrg.bank_account_number ?? ""}
                />
              </View>
              <View style={styles.bankCol}>
                <Field label="Branch" value={safeOrg.bank_branch ?? ""} />
                <Field label="SWIFT / BIC" value={safeOrg.bank_swift ?? ""} />
              </View>
            </View>
            <Text style={styles.smallNote}>
              Reference your payment with the invoice number above. Settlement
              of partial amounts requires written approval from Pymble Finance.
            </Text>
          </View>
        ) : null}

        <SignatureRow slots={approvalSlots} />

        <Text style={[sharedStyles.fieldValue, styles.smallNote]}>
          This is a computer-generated tax invoice in line with the Zambia
          Revenue Authority Value Added Tax requirements. No physical signature
          is required for validity, but the signatures above confirm internal
          authorisation.
        </Text>

        <PageFooter
          documentKind={documentKind}
          documentNumber={invoice.invoice_number}
          generatedBy={generatedBy ?? null}
        />
      </Page>
    </Document>
  );
}
