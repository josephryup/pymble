 
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
  citation: {
    fontSize: typography.micro,
    color: colors.muted,
    marginTop: spacing.row,
    fontStyle: "italic",
  },
});

export type PayslipPdfProps = {
  run: {
    id: string;
    period_label: string;
    period_start: string;
    period_end: string;
  };
  item: {
    id: string;
    gross_pay: number;
    advance_deduction: number;
    paye_amount: number;
    napsa_employee: number;
    napsa_employer: number;
    wcf_employer: number;
    net_pay: number;
    tax_year: number | null;
    statutory_citation: string | null;
    /** Hours paid at the overtime rate during this run, summed across the period. */
    overtime_hours?: number;
    /** Total ZMW attributable to overtime during this run. */
    overtime_amount?: number;
  };
  worker: {
    worker_code: string;
    full_name: string;
    trade: string;
    phone?: string | null;
    momo_provider?: string | null;
    momo_number?: string | null;
  };
  org: PymblePdfOrgSnapshot;
  generatedBy?: string | null;
};

export function PayslipPdf({ run, item, worker, org, generatedBy }: PayslipPdfProps) {
  const safeOrg = { ...PYMBLE_ORG_FALLBACK, ...org };
  const documentKind = "Payslip";
  const documentNumber = `${run.period_label} / ${worker.worker_code}`;
  const documentDateLabel = `Period ${formatPdfDate(run.period_start)} – ${formatPdfDate(run.period_end)}`;

  const totalEmployeeDeductions =
    item.paye_amount + item.napsa_employee + item.advance_deduction;
  const employerTotalCost =
    item.gross_pay + item.napsa_employer + item.wcf_employer;

  return (
    <Document
      author={safeOrg.legal_name}
      creator={safeOrg.legal_name}
      title={`${documentKind} ${documentNumber}`}
    >
      <Page size="A4" style={styles.page}>
        <BrandHeader
          org={safeOrg}
          documentKind={documentKind}
          documentNumber={documentNumber}
          documentDateLabel={documentDateLabel}
        />

        <TwoColumn>
          <Column>
            <SectionTitle>Worker</SectionTitle>
            <Field label="Full name" value={worker.full_name} />
            <Field label="Worker code" value={worker.worker_code} />
            <Field label="Trade" value={worker.trade} />
            {worker.phone ? <Field label="Phone" value={worker.phone} /> : null}
            {worker.momo_provider && worker.momo_number ? (
              <Field
                label="Mobile money"
                value={`${worker.momo_provider.toUpperCase()} ${worker.momo_number}`}
              />
            ) : null}
          </Column>
          <Column>
            <SectionTitle>Period</SectionTitle>
            <Field label="Payroll run" value={run.period_label} />
            <Field
              label="Period start"
              value={formatPdfDate(run.period_start)}
            />
            <Field label="Period end" value={formatPdfDate(run.period_end)} />
            {item.tax_year ? (
              <Field label="Tax year" value={String(item.tax_year)} />
            ) : null}
          </Column>
        </TwoColumn>

        <SectionTitle>Earnings and Deductions</SectionTitle>
        <Table
          columns={[
            { label: "Description", widthPct: 65 },
            { label: "Amount (ZMW)", widthPct: 35, align: "right" },
          ]}
          rows={[
            ["Gross earnings (from approved attendance)", formatPdfMoney(item.gross_pay)],
            ...(item.overtime_hours && item.overtime_hours > 0
              ? [
                  [
                    `Of which overtime (${item.overtime_hours.toFixed(2)} hours)`,
                    formatPdfMoney(item.overtime_amount ?? 0),
                  ] as [string, string],
                ]
              : []),
            ["Pay As You Earn (PAYE) — ZRA", formatPdfMoney(item.paye_amount)],
            ["NAPSA — Employee contribution (5%)", formatPdfMoney(item.napsa_employee)],
            ["Cash advance recovery", formatPdfMoney(item.advance_deduction)],
            ["Total employee deductions", formatPdfMoney(totalEmployeeDeductions)],
          ]}
        />

        <TotalsBlock
          rows={[{ label: "Net pay", value: formatPdfMoney(item.net_pay), bold: true }]}
        />

        <SectionTitle>Employer Statutory Contributions</SectionTitle>
        <Text style={styles.footnote}>
          Paid by Pymble in addition to the worker&apos;s gross. Not deducted
          from the net above — shown for transparency on the total employment
          cost.
        </Text>
        <Table
          columns={[
            { label: "Description", widthPct: 65 },
            { label: "Amount (ZMW)", widthPct: 35, align: "right" },
          ]}
          rows={[
            ["NAPSA — Employer contribution (5%)", formatPdfMoney(item.napsa_employer)],
            ["Workers' Compensation Fund (construction sector)", formatPdfMoney(item.wcf_employer)],
            ["Total employer cost (gross + contributions)", formatPdfMoney(employerTotalCost)],
          ]}
        />

        <SignatureRow
          slots={[
            { caption: "Prepared by — Finance" },
            { caption: "Worker acknowledgement", name: worker.full_name },
          ]}
        />

        {item.statutory_citation ? (
          <Text style={styles.citation}>{item.statutory_citation}</Text>
        ) : null}

        <Text style={[sharedStyles.fieldValue, styles.footnote]} wrap={false}>
          Generated digitally by the Pymble Operations workspace.
        </Text>

        <PageFooter
          documentKind={documentKind}
          documentNumber={documentNumber}
          generatedBy={generatedBy ?? null}
        />
      </Page>
    </Document>
  );
}
