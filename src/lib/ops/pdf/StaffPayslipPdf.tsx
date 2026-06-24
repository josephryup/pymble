import { Document, Page, StyleSheet, Text } from "@react-pdf/renderer";
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
import {
  formatPdfDate,
  formatPdfMoney,
  PYMBLE_ORG_FALLBACK,
  PYMBLE_PDF_THEME,
  type PymblePdfOrgSnapshot,
} from "@/lib/ops/pdf/theme";

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

export type StaffPayslipPdfProps = {
  run: {
    period_label: string;
    period_start: string;
    period_end: string;
  };
  item: {
    id: string;
    employee_number: string;
    full_name: string;
    job_title: string;
    department: string;
    nrc_number: string;
    napsa_number: string;
    basic_pay: number;
    housing_allowance: number;
    other_allowances: number;
    gross_pay: number;
    paye_amount: number;
    napsa_employee: number;
    napsa_employer: number;
    nhima_employee: number;
    nhima_employer: number;
    wcf_employer: number;
    advance_deduction: number;
    net_pay: number;
    tax_year: number | null;
    statutory_citation: string | null;
  };
  /** YTD figures across the same calendar year for the same employee. */
  ytd: {
    grossYtd: number;
    taxableYtd: number;
    paye_ytd: number;
    freePayYtd: number;
  };
  /** Leave snapshot at the period date. */
  leave: {
    rate_per_month: number;
    days_due: number;
    days_taken: number;
  };
  org: PymblePdfOrgSnapshot;
  generatedBy?: string | null;
};

export function StaffPayslipPdf({
  run,
  item,
  ytd,
  leave,
  org,
  generatedBy,
}: StaffPayslipPdfProps) {
  const safeOrg = { ...PYMBLE_ORG_FALLBACK, ...org };
  const documentKind = "Payslip";
  const documentNumber = `${run.period_label} / ${item.employee_number}`;
  const documentDateLabel = `Period ${formatPdfDate(run.period_start)} – ${formatPdfDate(run.period_end)}`;

  const totalEmployeeDeductions =
    item.paye_amount +
    item.napsa_employee +
    item.nhima_employee +
    item.advance_deduction;
  const employerTotalCost =
    item.gross_pay + item.napsa_employer + item.nhima_employer + item.wcf_employer;

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

        {/* Employee identity block — matches the PCL sample header */}
        <TwoColumn>
          <Column>
            <SectionTitle>Employee</SectionTitle>
            <Field label="Employee No." value={item.employee_number} />
            <Field label="Name" value={item.full_name} />
            <Field label="NRC No." value={item.nrc_number || "—"} />
            <Field label="Job title" value={item.job_title || "—"} />
            <Field label="Department" value={item.department || "—"} />
            <Field label="NAPSA security No." value={item.napsa_number || "—"} />
          </Column>
          <Column>
            <SectionTitle>Period</SectionTitle>
            <Field label="Payroll period" value={run.period_label} />
            <Field label="Period start" value={formatPdfDate(run.period_start)} />
            <Field label="Period end" value={formatPdfDate(run.period_end)} />
            {item.tax_year ? (
              <Field label="Tax year" value={String(item.tax_year)} />
            ) : null}
          </Column>
        </TwoColumn>

        {/* YTD + Leave block — the PCL payslip's two right/left summary rows */}
        <TwoColumn>
          <Column>
            <SectionTitle>Year to date</SectionTitle>
            <Field label="Gross pay YTD" value={formatPdfMoney(ytd.grossYtd)} />
            <Field label="Taxable YTD" value={formatPdfMoney(ytd.taxableYtd)} />
            <Field label="Free pay YTD" value={formatPdfMoney(ytd.freePayYtd)} />
            <Field label="Tax paid YTD" value={formatPdfMoney(ytd.paye_ytd)} />
          </Column>
          <Column>
            <SectionTitle>This month &amp; leave</SectionTitle>
            <Field label="Taxable this month" value={formatPdfMoney(item.gross_pay)} />
            <Field
              label="Leave rate"
              value={leave.rate_per_month.toFixed(2)}
            />
            <Field label="Leave due" value={leave.days_due.toFixed(2)} />
            <Field
              label="Leave days taken to date"
              value={leave.days_taken > 0 ? leave.days_taken.toFixed(2) : "—"}
            />
          </Column>
        </TwoColumn>

        <SectionTitle>Earnings</SectionTitle>
        <Table
          columns={[
            { label: "Description", widthPct: 65 },
            { label: "Amount (ZMW)", widthPct: 35, align: "right" },
          ]}
          rows={[
            ["Basic pay", formatPdfMoney(item.basic_pay)],
            ["Housing allowance", formatPdfMoney(item.housing_allowance)],
            ...(item.other_allowances > 0
              ? [
                  [
                    "Other allowances",
                    formatPdfMoney(item.other_allowances),
                  ] as [string, string],
                ]
              : []),
            ["Gross pay", formatPdfMoney(item.gross_pay)],
          ]}
        />

        <SectionTitle>Deductions</SectionTitle>
        <Table
          columns={[
            { label: "Description", widthPct: 65 },
            { label: "Amount (ZMW)", widthPct: 35, align: "right" },
          ]}
          rows={[
            ["Pay As You Earn (PAYE) — ZRA", formatPdfMoney(item.paye_amount)],
            ["NAPSA — Employee contribution (5%)", formatPdfMoney(item.napsa_employee)],
            ["NHIMA — Employee contribution (1%)", formatPdfMoney(item.nhima_employee)],
            ["Staff advances", formatPdfMoney(item.advance_deduction)],
            ["Total employee deductions", formatPdfMoney(totalEmployeeDeductions)],
          ]}
        />

        <TotalsBlock
          rows={[{ label: "Net pay", value: formatPdfMoney(item.net_pay), bold: true }]}
        />

        <SectionTitle>Employer Statutory Contributions</SectionTitle>
        <Text style={styles.footnote}>
          Paid by Pymble in addition to the employee&apos;s gross. Not deducted
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
            ["NHIMA — Employer contribution (1%)", formatPdfMoney(item.nhima_employer)],
            ["Workers' Compensation Fund (construction sector)", formatPdfMoney(item.wcf_employer)],
            ["Total employer cost (gross + contributions)", formatPdfMoney(employerTotalCost)],
          ]}
        />

        <SignatureRow
          slots={[
            { caption: "Prepared by — Finance" },
            { caption: "Employee acknowledgement", name: item.full_name },
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
