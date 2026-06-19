 
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
  footnote: {
    fontSize: typography.small,
    color: colors.muted,
    marginTop: spacing.row,
    lineHeight: 1.4,
  },
});

export type PurchaseOrderPdfLine = {
  item_name: string;
  specification: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  supplier_name?: string | null;
};

export type PurchaseOrderPdfProps = {
  po: {
    id: string;
    po_number: string;
    title: string;
    description: string;
    status: string;
    issued_at: string | null;
    created_at: string;
    site: { code: string; name: string } | null;
    supplier: {
      legal_name: string;
      supplier_code: string;
      contact_email?: string | null;
      contact_phone?: string | null;
      address?: string | null;
    };
    total_amount: number;
    currency_code: string;
    payment_terms?: string | null;
  };
  lines: PurchaseOrderPdfLine[];
  org: PymblePdfOrgSnapshot;
  generatedBy?: string | null;
};

export function PurchaseOrderPdf({ po, lines, org, generatedBy }: PurchaseOrderPdfProps) {
  const safeOrg = { ...PYMBLE_ORG_FALLBACK, ...org };
  const documentKind = "Purchase Order";
  const documentDateLabel = po.issued_at
    ? `Issued ${formatPdfDate(po.issued_at)}`
    : `Drafted ${formatPdfDate(po.created_at)}`;
  const total = lines.reduce((sum, line) => sum + line.line_total, 0);

  return (
    <Document
      author={safeOrg.legal_name}
      creator={safeOrg.legal_name}
      title={`${documentKind} ${po.po_number}`}
    >
      <Page size="A4" style={styles.page}>
        <BrandHeader
          org={safeOrg}
          documentKind={documentKind}
          documentNumber={po.po_number}
          documentDateLabel={documentDateLabel}
        />

        <TwoColumn>
          <Column>
            <SectionTitle>Supplier</SectionTitle>
            <Field
              label="Supplier"
              value={`${po.supplier.legal_name} (${po.supplier.supplier_code})`}
            />
            {po.supplier.contact_phone ? (
              <Field label="Phone" value={po.supplier.contact_phone} />
            ) : null}
            {po.supplier.contact_email ? (
              <Field label="Email" value={po.supplier.contact_email} />
            ) : null}
            {po.supplier.address ? (
              <Field label="Address" value={po.supplier.address} />
            ) : null}
          </Column>
          <Column>
            <SectionTitle>Order Details</SectionTitle>
            <Field label="PO number" value={po.po_number} />
            <Field label="Status" value={po.status.toUpperCase()} />
            <Field
              label="Deliver to"
              value={po.site ? `${po.site.code} — ${po.site.name}` : "—"}
            />
            <Field
              label="Payment terms"
              value={po.payment_terms ?? "Net 30 days after delivery"}
            />
          </Column>
        </TwoColumn>

        <SectionTitle>Line Items</SectionTitle>
        <Table
          columns={[
            { label: "Item", widthPct: 32 },
            { label: "Spec / supplier", widthPct: 25 },
            { label: "Qty", widthPct: 10, align: "right" },
            { label: "Unit", widthPct: 8, align: "center" },
            { label: "Unit cost", widthPct: 12, align: "right" },
            { label: "Line total", widthPct: 13, align: "right" },
          ]}
          rows={lines.map((line) => [
            line.item_name,
            [line.specification, line.supplier_name].filter(Boolean).join(" / "),
            line.quantity.toLocaleString("en-ZM", {
              maximumFractionDigits: 2,
            }),
            line.unit,
            formatPdfMoney(line.unit_cost, po.currency_code),
            formatPdfMoney(line.line_total, po.currency_code),
          ])}
        />

        <TotalsBlock
          rows={[
            {
              label: "Total order",
              value: formatPdfMoney(total, po.currency_code),
              bold: true,
            },
          ]}
        />

        <Text style={styles.footnote}>
          {po.description}
        </Text>

        <Text style={styles.footnote}>
          This Purchase Order is governed by the Pymble Construction Limited
          standard procurement terms. Goods must be delivered to the site
          named above and accompanied by a delivery note quoting the PO number.
        </Text>

        <SignatureRow
          slots={[
            { caption: "Requested by" },
            { caption: "Procurement Manager" },
            { caption: "Finance authorisation" },
          ]}
        />

        <Text style={[sharedStyles.fieldValue, styles.footnote]}>
          Generated digitally by the Pymble Operations workspace. Retain a copy
          of this document with the supplier delivery note and Goods Received
          Note for the project file.
        </Text>

        <PageFooter
          documentKind={documentKind}
          documentNumber={po.po_number}
          generatedBy={generatedBy ?? null}
        />
      </Page>
    </Document>
  );
}
