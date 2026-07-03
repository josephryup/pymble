import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  formatPdfDate,
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
  noteBlock: {
    backgroundColor: colors.surfaceSoft,
    padding: spacing.row,
    marginTop: spacing.row,
    fontSize: typography.small,
    color: colors.body,
    lineHeight: 1.4,
  },
});

export type DepartmentReportPdfMetricRow = {
  label: string;
  value: string;
  /** e.g. "+3 vs previous (+12%)" — empty when no comparison exists. */
  change: string;
};

export type DepartmentReportPdfSection = {
  label: string;
  value: string;
};

export type DepartmentReportPdfProps = {
  report: {
    id: string;
    title: string;
    departmentLabel: string;
    /** Compact tag for the header/footer, e.g. "HSE · JUN 2026". */
    documentTag: string;
    period: string;
    period_start_date: string;
    period_end_date: string;
    status: string;
    submitted_at: string | null;
    reviewed_at: string | null;
    review_notes: string;
  };
  metrics: DepartmentReportPdfMetricRow[];
  sections: DepartmentReportPdfSection[];
  narrative: string;
  comparedWith: string | null;
  org: PymblePdfOrgSnapshot;
  submittedBy: { full_name: string; role?: string | null } | null;
  reviewedBy: { full_name: string; role?: string | null } | null;
  generatedBy?: string | null;
};

export function DepartmentReportPdf({
  report,
  metrics,
  sections,
  narrative,
  comparedWith,
  org,
  submittedBy,
  reviewedBy,
  generatedBy,
}: DepartmentReportPdfProps) {
  const safeOrg = { ...PYMBLE_ORG_FALLBACK, ...org };
  const documentKind = "Department Report";
  // Kept short — a long label overlaps the company name in the brand header.
  const documentNumber = report.documentTag;

  return (
    <Document
      author={safeOrg.legal_name}
      creator={safeOrg.legal_name}
      title={`${documentKind} — ${report.title}`}
    >
      <Page size="A4" style={styles.page}>
        <BrandHeader
          org={safeOrg}
          documentKind={documentKind}
          documentNumber={documentNumber}
          documentDateLabel={formatPdfDate(report.period_end_date)}
        />

        <TwoColumn>
          <Column>
            <SectionTitle>Report</SectionTitle>
            <Field label="Title" value={report.title} />
            <Field label="Department" value={report.departmentLabel} />
            <Field
              label="Period"
              value={`${formatPdfDate(report.period_start_date)} — ${formatPdfDate(report.period_end_date)}`}
            />
          </Column>
          <Column>
            <SectionTitle>Workflow</SectionTitle>
            <Field label="Status" value={report.status.replace("_", " ").toUpperCase()} />
            <Field
              label="Submitted"
              value={
                submittedBy
                  ? `${submittedBy.full_name}${report.submitted_at ? ` on ${formatPdfDate(report.submitted_at)}` : ""}`
                  : "—"
              }
            />
            <Field
              label="Reviewed"
              value={
                reviewedBy
                  ? `${reviewedBy.full_name}${report.reviewed_at ? ` on ${formatPdfDate(report.reviewed_at)}` : ""}`
                  : "—"
              }
            />
          </Column>
        </TwoColumn>

        {metrics.length > 0 ? (
          <View>
            <SectionTitle>
              {comparedWith ? `Key figures (vs ${comparedWith})` : "Key figures"}
            </SectionTitle>
            <Table
              columns={[
                { label: "Metric", widthPct: 46 },
                { label: "Value", widthPct: 24, align: "right" },
                { label: "Change", widthPct: 30, align: "right" },
              ]}
              rows={metrics.map((metric) => [metric.label, metric.value, metric.change || "—"])}
            />
          </View>
        ) : null}

        {sections.length > 0 ? (
          sections.map((section) => (
            <View key={section.label} wrap={false}>
              <SectionTitle>{section.label}</SectionTitle>
              <View style={styles.noteBlock}>
                <Text>{section.value}</Text>
              </View>
            </View>
          ))
        ) : (
          <View>
            <SectionTitle>Narrative</SectionTitle>
            <View style={styles.noteBlock}>
              <Text>{narrative || "(no narrative provided)"}</Text>
            </View>
          </View>
        )}

        {report.review_notes ? (
          <View>
            <SectionTitle>Leadership review notes</SectionTitle>
            <View style={styles.noteBlock}>
              <Text>{report.review_notes}</Text>
            </View>
          </View>
        ) : null}

        <SignatureRow
          slots={[
            { caption: "Prepared by", name: submittedBy?.full_name ?? undefined },
            { caption: "Reviewed by", name: reviewedBy?.full_name ?? undefined },
          ]}
        />

        <PageFooter
          documentKind={documentKind}
          documentNumber={report.documentTag}
          generatedBy={generatedBy ?? undefined}
        />
      </Page>
    </Document>
  );
}
