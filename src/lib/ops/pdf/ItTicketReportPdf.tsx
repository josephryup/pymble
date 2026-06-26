
import { Document, Page, StyleSheet, Text } from "@react-pdf/renderer";
import {
  IT_TICKET_CATEGORY_LABELS,
  IT_TICKET_PRIORITY_LABELS,
  IT_TICKET_STATUS_LABELS,
} from "@/lib/ops/it-helpdesk-labels";
import type { OpsItTicketSummary } from "@/lib/ops/it-tickets";
import {
  formatPdfDate,
  PYMBLE_ORG_FALLBACK,
  PYMBLE_PDF_THEME,
  type PymblePdfOrgSnapshot,
} from "@/lib/ops/pdf/theme";
import { BrandHeader, PageFooter, SectionTitle, Table, sharedStyles } from "@/lib/ops/pdf/components";

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
  summary: {
    fontSize: typography.small,
    color: colors.muted,
    marginBottom: spacing.block,
  },
});

export type ItTicketReportPdfProps = {
  generatedBy?: string | null;
  org: PymblePdfOrgSnapshot;
  tickets: OpsItTicketSummary[];
};

export function ItTicketReportPdf({ generatedBy, org, tickets }: ItTicketReportPdfProps) {
  const safeOrg = { ...PYMBLE_ORG_FALLBACK, ...org };
  const documentKind = "IT Help Desk Report";
  const documentNumber = `TKT-${formatPdfDate(new Date().toISOString())}`;

  const rows = tickets.map((ticket) => [
    ticket.ticket_ref,
    ticket.title,
    IT_TICKET_CATEGORY_LABELS[ticket.category],
    IT_TICKET_PRIORITY_LABELS[ticket.priority],
    IT_TICKET_STATUS_LABELS[ticket.status],
    ticket.requester?.full_name ?? "—",
    ticket.assignee?.full_name ?? "Unassigned",
  ]);

  return (
    <Document title={documentKind}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <BrandHeader
          org={safeOrg}
          documentKind={documentKind}
          documentNumber={documentNumber}
          documentDateLabel={`Generated ${formatPdfDate(new Date().toISOString())}`}
        />
        <SectionTitle>Open tickets</SectionTitle>
        <Text style={styles.summary}>{tickets.length} open ticket{tickets.length === 1 ? "" : "s"}</Text>
        {tickets.length === 0 ? (
          <Text style={sharedStyles.fieldValue}>The help-desk queue is clear.</Text>
        ) : (
          <Table
            columns={[
              { label: "Ref", widthPct: 14 },
              { label: "Title", widthPct: 26 },
              { label: "Category", widthPct: 13 },
              { label: "Priority", widthPct: 10 },
              { label: "Status", widthPct: 13 },
              { label: "Requester", widthPct: 12 },
              { label: "Assignee", widthPct: 12 },
            ]}
            rows={rows}
          />
        )}
        <PageFooter documentKind={documentKind} documentNumber={documentNumber} generatedBy={generatedBy} />
      </Page>
    </Document>
  );
}
