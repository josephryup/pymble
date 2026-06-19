 
import { Document, Page, StyleSheet, Text } from "@react-pdf/renderer";
import type { OpsMaterialRequestSummary } from "@/lib/ops/material-requests";
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

export type MaterialRequestPdfProps = {
  request: OpsMaterialRequestSummary;
  org: PymblePdfOrgSnapshot;
  requestedBy?: { full_name: string; role?: string | null } | null;
  generatedBy?: string | null;
};

export function MaterialRequestPdf({
  request,
  org,
  requestedBy,
  generatedBy,
}: MaterialRequestPdfProps) {
  const safeOrg = { ...PYMBLE_ORG_FALLBACK, ...org };
  const documentKind = "Material Request";
  const documentDateLabel = `Raised ${formatPdfDate(request.created_at)}`;
  const estimatedTotal = request.estimated_total;
  const actualTotal = request.actual_total;
  const showActuals = actualTotal > 0;

  return (
    <Document
      author={safeOrg.legal_name}
      creator={safeOrg.legal_name}
      title={`${documentKind} ${request.request_number}`}
    >
      <Page size="A4" style={styles.page}>
        <BrandHeader
          org={safeOrg}
          documentKind={documentKind}
          documentNumber={request.request_number}
          documentDateLabel={documentDateLabel}
        />

        <TwoColumn>
          <Column>
            <SectionTitle>Request Details</SectionTitle>
            <Field label="Title" value={request.title} />
            <Field label="Description" value={request.description} />
            <Field
              label="Site"
              value={
                request.site
                  ? `${request.site.code} — ${request.site.name}`
                  : "—"
              }
            />
            <Field
              label="Needed by"
              value={
                request.needed_by ? formatPdfDate(request.needed_by) : "—"
              }
            />
            <Field label="Priority" value={request.priority.toUpperCase()} />
          </Column>
          <Column>
            <SectionTitle>Workflow Status</SectionTitle>
            <Field label="Request number" value={request.request_number} />
            <Field label="Status" value={request.status.toUpperCase()} />
            <Field
              label="Raised by"
              value={
                requestedBy?.full_name ?? "—"
              }
            />
            {requestedBy?.role ? (
              <Field label="Role" value={requestedBy.role} />
            ) : null}
            <Field
              label="Submitted"
              value={
                request.approved_at ? formatPdfDate(request.approved_at) : "—"
              }
            />
            <Field
              label="Priced"
              value={request.priced_at ? formatPdfDate(request.priced_at) : "—"}
            />
          </Column>
        </TwoColumn>

        <SectionTitle>Line Items</SectionTitle>
        <Table
          columns={[
            { label: "#", widthPct: 4, align: "center" },
            { label: "Item", widthPct: 26 },
            { label: "Specification / supplier", widthPct: 30 },
            { label: "Qty", widthPct: 10, align: "right" },
            { label: "Unit", widthPct: 8, align: "center" },
            {
              label: showActuals ? "Actual cost" : "Estimate",
              widthPct: 22,
              align: "right",
            },
          ]}
          rows={request.items.map((item) => [
            item.line_number,
            item.item_name,
            [item.specification, item.supplier_name].filter(Boolean).join(" / "),
            item.quantity.toLocaleString("en-ZM", {
              maximumFractionDigits: 2,
            }),
            item.unit,
            showActuals && item.actual_total > 0
              ? formatPdfMoney(item.actual_total)
              : formatPdfMoney(item.estimated_total),
          ])}
        />

        <TotalsBlock
          rows={[
            {
              label: "Estimated total",
              value: formatPdfMoney(estimatedTotal),
            },
            ...(showActuals
              ? [
                  {
                    label: "Actual procurement cost",
                    value: formatPdfMoney(actualTotal),
                    bold: true,
                  },
                ]
              : []),
          ]}
        />

        <Text style={styles.note}>
          Each line nominates its own supplier (per the Pymble per-item
          supplier model). Lines without a nominated supplier require
          procurement to source one before a Purchase Order can be raised.
        </Text>

        <SignatureRow
          slots={[
            { caption: "Raised by", name: requestedBy?.full_name },
            { caption: "Operations Manager" },
            { caption: "Procurement Manager" },
            { caption: "Finance approval" },
          ]}
        />

        <PageFooter
          documentKind={documentKind}
          documentNumber={request.request_number}
          generatedBy={generatedBy ?? null}
        />

        <Text style={[sharedStyles.fieldValue, styles.note]} wrap={false}>
          Document generated digitally by the Pymble Operations workspace.
        </Text>
      </Page>
    </Document>
  );
}
