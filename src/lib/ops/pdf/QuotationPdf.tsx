import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { OpsQuotation } from "@/lib/ops/quotations";
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
  block: {
    backgroundColor: colors.surfaceSoft,
    padding: spacing.row,
    marginTop: spacing.block,
  },
  bodyText: {
    fontSize: typography.small,
    color: colors.body,
    lineHeight: 1.5,
  },
  smallNote: {
    fontSize: typography.small,
    color: colors.muted,
    marginTop: spacing.row,
    lineHeight: 1.4,
  },
  validityStrong: {
    fontSize: typography.small,
    color: colors.body,
    marginTop: spacing.row,
    lineHeight: 1.4,
  },
});

export type QuotationPdfProps = {
  quotation: OpsQuotation;
  org: PymblePdfOrgSnapshot;
  generatedBy?: string | null;
};

/**
 * Client-facing quotation, built on the shared PDF toolkit so it sits in the
 * same document family as the invoice and purchase order.
 *
 * A quotation is an offer, not a demand for payment — so unlike the invoice it
 * carries validity and acceptance blocks rather than payment instructions, and
 * the signature row is the client's to sign.
 */
export function QuotationPdf({ quotation, org, generatedBy }: QuotationPdfProps) {
  const safeOrg = { ...PYMBLE_ORG_FALLBACK, ...org };
  const documentKind = "Quotation";

  return (
    <Document
      author={safeOrg.legal_name}
      creator={safeOrg.legal_name}
      producer={safeOrg.legal_name}
      title={`${documentKind} ${quotation.quotation_number}`}
    >
      <Page size="A4" style={styles.page} wrap>
        <BrandHeader
          org={safeOrg}
          documentKind={documentKind}
          documentNumber={quotation.quotation_number}
          documentDateLabel={`Issued ${formatPdfDate(quotation.issued_on)}`}
        />

        <TwoColumn>
          <Column>
            <SectionTitle>Quotation For</SectionTitle>
            <Field label="Client" value={quotation.client_name} />
            <Field label="Attention" value={quotation.client_contact} />
            <Field label="Address" value={quotation.client_address} />
            <Field label="Email" value={quotation.client_email} />
            <Field label="Phone" value={quotation.client_phone} />
            <Field label="Client TPIN" value={quotation.client_tpin} />
          </Column>
          <Column>
            <SectionTitle>Quotation Details</SectionTitle>
            <Field label="Quotation number" value={quotation.quotation_number} />
            <Field label="Issued" value={formatPdfDate(quotation.issued_on)} />
            <Field
              label="Valid until"
              value={quotation.valid_until ? formatPdfDate(quotation.valid_until) : "On request"}
            />
            <Field label="Status" value={quotation.status.toUpperCase()} />
            <Field label="Currency" value={quotation.currency_code} />
          </Column>
        </TwoColumn>

        {quotation.title ? (
          <>
            <SectionTitle>Scope</SectionTitle>
            <Text style={styles.bodyText}>{quotation.title}</Text>
            {quotation.scope_summary ? (
              <Text style={[styles.bodyText, { marginTop: spacing.row }]}>
                {quotation.scope_summary}
              </Text>
            ) : null}
          </>
        ) : null}

        <SectionTitle>Priced Items</SectionTitle>
        <Table
          columns={[
            { label: "#", widthPct: 5, align: "center" },
            { label: "Description", widthPct: 43 },
            { label: "Quantity", widthPct: 12, align: "right" },
            { label: "Unit", widthPct: 8, align: "center" },
            { label: "Unit rate", widthPct: 16, align: "right" },
            { label: "Line total", widthPct: 16, align: "right" },
          ]}
          rows={quotation.items.map((item) => [
            String(item.line_number),
            item.specification ? `${item.description} — ${item.specification}` : item.description,
            item.quantity.toLocaleString("en-ZM", { maximumFractionDigits: 2 }),
            item.unit,
            formatPdfMoney(item.unit_rate, quotation.currency_code),
            formatPdfMoney(item.line_total, quotation.currency_code),
          ])}
        />

        <TotalsBlock
          rows={[
            {
              label: "Subtotal",
              value: formatPdfMoney(quotation.subtotal, quotation.currency_code),
            },
            {
              label: `VAT (${quotation.vat_rate}%)`,
              value: formatPdfMoney(quotation.vat_amount, quotation.currency_code),
            },
            {
              label: "Total quoted",
              value: formatPdfMoney(quotation.total_amount, quotation.currency_code),
              bold: true,
            },
          ]}
        />

        <View style={styles.block} wrap={false}>
          <SectionTitle>Terms &amp; Validity</SectionTitle>
          <Text style={styles.validityStrong}>
            {quotation.valid_until
              ? `This quotation is valid until ${formatPdfDate(quotation.valid_until)}. Prices are subject to revision after that date.`
              : "Prices quoted are subject to revision. Please confirm validity before placing an order."}
          </Text>
          {quotation.terms ? (
            <Text style={[styles.bodyText, { marginTop: spacing.row }]}>{quotation.terms}</Text>
          ) : null}
          {quotation.notes ? <Text style={styles.smallNote}>{quotation.notes}</Text> : null}
        </View>

        <SignatureRow
          slots={[{ caption: "Prepared by" }, { caption: "For and on behalf of the client" }]}
        />

        <Text style={[sharedStyles.fieldValue, styles.smallNote]}>
          This quotation is an offer only and does not constitute a contract until accepted in
          writing. Figures are quoted in {quotation.currency_code} and exclude any charges not
          expressly listed above.
        </Text>

        <PageFooter
          documentKind={documentKind}
          documentNumber={quotation.quotation_number}
          generatedBy={generatedBy ?? null}
        />
      </Page>
    </Document>
  );
}
