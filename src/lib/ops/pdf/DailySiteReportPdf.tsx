 
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
  noteBlock: {
    backgroundColor: colors.surfaceSoft,
    padding: spacing.row,
    marginTop: spacing.row,
    fontSize: typography.small,
    color: colors.body,
    lineHeight: 1.4,
  },
});

export type DailySiteReportEntry = {
  category: string;
  description: string;
  quantity?: string | null;
  notes?: string | null;
};

export type DailySiteReportPdfProps = {
  report: {
    id: string;
    report_number: string;
    report_date: string;
    weather?: string | null;
    morning_temperature?: string | null;
    afternoon_temperature?: string | null;
    site: { code: string; name: string } | null;
    submitted_at?: string | null;
    status: string;
    summary?: string | null;
    delays?: string | null;
    hse_notes?: string | null;
    visitors?: string | null;
  };
  entries: DailySiteReportEntry[];
  org: PymblePdfOrgSnapshot;
  submittedBy?: { full_name: string; role?: string | null } | null;
  generatedBy?: string | null;
};

export function DailySiteReportPdf({
  report,
  entries,
  org,
  submittedBy,
  generatedBy,
}: DailySiteReportPdfProps) {
  const safeOrg = { ...PYMBLE_ORG_FALLBACK, ...org };
  const documentKind = "Daily Site Report";
  const documentDateLabel = formatPdfDate(report.report_date);

  return (
    <Document
      author={safeOrg.legal_name}
      creator={safeOrg.legal_name}
      title={`${documentKind} ${report.report_number}`}
    >
      <Page size="A4" style={styles.page}>
        <BrandHeader
          org={safeOrg}
          documentKind={documentKind}
          documentNumber={report.report_number}
          documentDateLabel={documentDateLabel}
        />

        <TwoColumn>
          <Column>
            <SectionTitle>Site</SectionTitle>
            <Field
              label="Project / Site"
              value={
                report.site
                  ? `${report.site.code} — ${report.site.name}`
                  : "—"
              }
            />
            <Field label="Report date" value={formatPdfDate(report.report_date)} />
            <Field label="Weather" value={report.weather ?? "—"} />
            <Field
              label="Temperature (AM / PM)"
              value={`${report.morning_temperature ?? "—"} / ${report.afternoon_temperature ?? "—"}`}
            />
          </Column>
          <Column>
            <SectionTitle>Submission</SectionTitle>
            <Field label="Report number" value={report.report_number} />
            <Field label="Status" value={report.status.toUpperCase()} />
            <Field label="Submitted by" value={submittedBy?.full_name ?? "—"} />
            {submittedBy?.role ? (
              <Field label="Role" value={submittedBy.role} />
            ) : null}
            <Field
              label="Submitted at"
              value={
                report.submitted_at ? formatPdfDate(report.submitted_at) : "—"
              }
            />
          </Column>
        </TwoColumn>

        {report.summary ? (
          <View style={styles.noteBlock} wrap={false}>
            <Text>
              <Text style={[sharedStyles.fieldValue, { fontWeight: 700 }]}>
                Summary —{" "}
              </Text>
              {report.summary}
            </Text>
          </View>
        ) : null}

        <SectionTitle>Activity</SectionTitle>
        <Table
          columns={[
            { label: "Category", widthPct: 18 },
            { label: "Description", widthPct: 50 },
            { label: "Qty", widthPct: 10, align: "right" },
            { label: "Notes", widthPct: 22 },
          ]}
          rows={entries.map((entry) => [
            entry.category,
            entry.description,
            entry.quantity ?? "—",
            entry.notes ?? "—",
          ])}
        />

        {report.delays ? (
          <View style={styles.noteBlock} wrap={false}>
            <Text>
              <Text style={[sharedStyles.fieldValue, { fontWeight: 700 }]}>
                Delays —{" "}
              </Text>
              {report.delays}
            </Text>
          </View>
        ) : null}

        {report.hse_notes ? (
          <View style={styles.noteBlock} wrap={false}>
            <Text>
              <Text style={[sharedStyles.fieldValue, { fontWeight: 700 }]}>
                Health, Safety and Environment notes —{" "}
              </Text>
              {report.hse_notes}
            </Text>
          </View>
        ) : null}

        {report.visitors ? (
          <View style={styles.noteBlock} wrap={false}>
            <Text>
              <Text style={[sharedStyles.fieldValue, { fontWeight: 700 }]}>
                Visitors —{" "}
              </Text>
              {report.visitors}
            </Text>
          </View>
        ) : null}

        <SignatureRow
          slots={[
            { caption: "Site engineer", name: submittedBy?.full_name },
            { caption: "Projects Manager" },
            { caption: "Engineering Manager" },
          ]}
        />

        <PageFooter
          documentKind={documentKind}
          documentNumber={report.report_number}
          generatedBy={generatedBy ?? null}
        />
      </Page>
    </Document>
  );
}
