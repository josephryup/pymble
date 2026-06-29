
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

export type MaterialRequestPoLine = {
  item_name: string;
  specification: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  supplier_name?: string | null;
};

export type MaterialRequestPurchaseOrderPdfProps = {
  po: {
    po_number: string;
    request_number: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    needed_by: string | null;
    priced_at: string | null;
    approved_at: string | null;
    created_at: string;
    site: { code: string; name: string } | null;
    currency_code: string;
  };
  lines: MaterialRequestPoLine[];
  suppliers: string[];
  org: PymblePdfOrgSnapshot;
  requestedBy?: { full_name: string; role: string | null } | null;
  generatedBy?: string | null;
};

export function MaterialRequestPurchaseOrderPdf({
  po,
  lines,
  suppliers,
  org,
  requestedBy,
  generatedBy,
}: MaterialRequestPurchaseOrderPdfProps) {
  const safeOrg = { ...PYMBLE_ORG_FALLBACK, ...org };
  const documentKind = "Purchase Order";
  const documentDateLabel = po.approved_at
    ? `Approved ${formatPdfDate(po.approved_at)}`
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
            <SectionTitle>Order Details</SectionTitle>
            <Field label="PO number" value={po.po_number} />
            <Field label="Material request" value={po.request_number} />
            <Field label="Status" value={po.status.replace(/_/g, " ").toUpperCase()} />
            <Field label="Priority" value={po.priority.toUpperCase()} />
            <Field
              label="Deliver to"
              value={po.site ? `${po.site.code} — ${po.site.name}` : "General / office"}
            />
            <Field
              label="Needed by"
              value={po.needed_by ? formatPdfDate(po.needed_by) : "—"}
            />
          </Column>
          <Column>
            <SectionTitle>Authorisation</SectionTitle>
            <Field
              label="Priced"
              value={po.priced_at ? formatPdfDate(po.priced_at) : "—"}
            />
            <Field
              label="Finance approved"
              value={po.approved_at ? formatPdfDate(po.approved_at) : "—"}
            />
            {requestedBy ? (
              <Field
                label="Requested by"
                value={`${requestedBy.full_name}${requestedBy.role ? ` (${requestedBy.role.replace(/_/g, " ")})` : ""}`}
              />
            ) : null}
            <Field
              label="Suppliers"
              value={suppliers.length > 0 ? suppliers.join(", ") : "See line items"}
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

        {po.description ? <Text style={styles.footnote}>{po.description}</Text> : null}

        <Text style={styles.footnote}>
          This Purchase Order is raised against an approved material request and
          is governed by the Pymble Construction Limited standard procurement
          terms. Goods must be delivered to the site named above and accompanied
          by a delivery note quoting this PO number.
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
