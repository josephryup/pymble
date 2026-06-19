 
import { Text, View, StyleSheet } from "@react-pdf/renderer";
import { PYMBLE_PDF_THEME, formatPdfDateTime } from "@/lib/ops/pdf/theme";

const { colors, typography, spacing, ruler } = PYMBLE_PDF_THEME;

const sharedStyles = StyleSheet.create({
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.block,
    paddingBottom: spacing.row,
    borderBottomWidth: ruler.medium,
    borderBottomColor: colors.primary,
  },
  brandStack: {
    flexDirection: "column",
  },
  brandName: {
    fontFamily: typography.family,
    fontSize: typography.title,
    fontWeight: 700,
    color: colors.primary,
  },
  brandSubtitle: {
    fontSize: typography.small,
    color: colors.muted,
    marginTop: 2,
  },
  docMetaStack: {
    alignItems: "flex-end",
  },
  docKind: {
    fontSize: typography.small,
    fontWeight: 700,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
  docNumber: {
    fontSize: typography.title,
    fontWeight: 700,
    color: colors.ink,
    marginTop: 4,
  },
  docDate: {
    fontSize: typography.small,
    color: colors.muted,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: typography.sectionTitle,
    fontWeight: 700,
    color: colors.primaryDark,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.row,
  },
  twoColRow: {
    flexDirection: "row",
    gap: spacing.block,
    marginBottom: spacing.block,
  },
  twoColCell: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: typography.micro,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.muted,
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: typography.body,
    color: colors.body,
    marginBottom: spacing.inlineSm,
  },
  table: {
    borderWidth: ruler.thin,
    borderColor: colors.border,
    marginBottom: spacing.block,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: colors.primary,
  },
  tableHeaderCell: {
    fontSize: typography.small,
    fontWeight: 700,
    color: colors.white,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: ruler.thin,
    borderTopColor: colors.border,
  },
  tableCell: {
    fontSize: typography.small,
    color: colors.body,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tableRowStripe: {
    backgroundColor: colors.surfaceSoft,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 2,
  },
  totalsLabel: {
    fontSize: typography.small,
    color: colors.muted,
    width: 110,
    textAlign: "right",
    marginRight: spacing.row,
  },
  totalsValue: {
    fontSize: typography.body,
    color: colors.ink,
    width: 110,
    textAlign: "right",
  },
  totalsBold: {
    fontWeight: 700,
  },
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.block,
  },
  signatureBlock: {
    flex: 1,
    marginRight: spacing.block,
  },
  signatureLine: {
    borderBottomWidth: ruler.thin,
    borderBottomColor: colors.border,
    height: 28,
  },
  signatureCaption: {
    fontSize: typography.micro,
    textTransform: "uppercase",
    color: colors.muted,
    marginTop: 4,
    letterSpacing: 1,
  },
  footerRow: {
    position: "absolute",
    left: spacing.page,
    right: spacing.page,
    bottom: spacing.page / 2,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: ruler.thin,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  footerText: {
    fontSize: typography.micro,
    color: colors.muted,
  },
});

type BrandHeaderProps = {
  org: {
    /** Display name. Falls back to "Pymble Construction Limited" if blank. */
    legal_name?: string;
    trading_name?: string | null;
    tpin?: string | null;
    vat_registration_number?: string | null;
    headquarters_address?: string | null;
  };
  /** Document type label, e.g. "Tax Invoice". */
  documentKind: string;
  /** Document identifier, e.g. invoice number. */
  documentNumber: string;
  /** Date issued / created, already formatted. */
  documentDateLabel: string;
};

export function BrandHeader({ org, documentKind, documentNumber, documentDateLabel }: BrandHeaderProps) {
  return (
    <View style={sharedStyles.brandRow}>
      <View style={sharedStyles.brandStack}>
        <Text style={sharedStyles.brandName}>
          {org.legal_name ?? "Pymble Construction Limited"}
        </Text>
        {org.trading_name ? (
          <Text style={sharedStyles.brandSubtitle}>
            Trading as {org.trading_name}
          </Text>
        ) : null}
        {org.headquarters_address ? (
          <Text style={sharedStyles.brandSubtitle}>{org.headquarters_address}</Text>
        ) : null}
        {org.tpin ? (
          <Text style={sharedStyles.brandSubtitle}>TPIN: {org.tpin}</Text>
        ) : null}
        {org.vat_registration_number ? (
          <Text style={sharedStyles.brandSubtitle}>
            VAT Reg: {org.vat_registration_number}
          </Text>
        ) : null}
      </View>
      <View style={sharedStyles.docMetaStack}>
        <Text style={sharedStyles.docKind}>{documentKind}</Text>
        <Text style={sharedStyles.docNumber}>{documentNumber}</Text>
        <Text style={sharedStyles.docDate}>{documentDateLabel}</Text>
      </View>
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={sharedStyles.sectionTitle}>{children}</Text>;
}

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={sharedStyles.fieldLabel}>{label}</Text>
      <Text style={sharedStyles.fieldValue}>{value || "—"}</Text>
    </View>
  );
}

export function TwoColumn({ children }: { children: React.ReactNode }) {
  return <View style={sharedStyles.twoColRow}>{children}</View>;
}

export function Column({ children }: { children: React.ReactNode }) {
  return <View style={sharedStyles.twoColCell}>{children}</View>;
}

type TableProps = {
  columns: Array<{ label: string; widthPct: number; align?: "left" | "right" | "center" }>;
  rows: Array<Array<string | number>>;
};

export function Table({ columns, rows }: TableProps) {
  return (
    <View style={sharedStyles.table}>
      <View style={sharedStyles.tableHeaderRow}>
        {columns.map((column) => (
          <Text
            key={column.label}
            style={[
              sharedStyles.tableHeaderCell,
              {
                width: `${column.widthPct}%`,
                textAlign: column.align ?? "left",
              },
            ]}
          >
            {column.label}
          </Text>
        ))}
      </View>
      {rows.map((row, index) => (
        <View
          key={`row-${index}`}
          style={[
            sharedStyles.tableRow,
            ...(index % 2 === 1 ? [sharedStyles.tableRowStripe] : []),
          ]}
          wrap={false}
        >
          {row.map((cell, cellIndex) => (
            <Text
              key={`cell-${cellIndex}`}
              style={[
                sharedStyles.tableCell,
                {
                  width: `${columns[cellIndex]?.widthPct ?? 100 / row.length}%`,
                  textAlign: columns[cellIndex]?.align ?? "left",
                },
              ]}
            >
              {String(cell)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

type TotalsRow = { label: string; value: string; bold?: boolean };

export function TotalsBlock({ rows }: { rows: TotalsRow[] }) {
  return (
    <View>
      {rows.map((row) => (
        <View key={row.label} style={sharedStyles.totalsRow}>
          <Text style={[sharedStyles.totalsLabel, ...(row.bold ? [sharedStyles.totalsBold] : [])]}>
            {row.label}
          </Text>
          <Text style={[sharedStyles.totalsValue, ...(row.bold ? [sharedStyles.totalsBold] : [])]}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

type SignatureSlot = { caption: string; name?: string | null };

export function SignatureRow({ slots }: { slots: SignatureSlot[] }) {
  return (
    <View style={sharedStyles.signatureRow}>
      {slots.map((slot) => (
        <View key={slot.caption} style={sharedStyles.signatureBlock}>
          <View style={sharedStyles.signatureLine} />
          <Text style={sharedStyles.signatureCaption}>
            {slot.caption}
            {slot.name ? ` — ${slot.name}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

type FooterProps = {
  documentKind: string;
  documentNumber: string;
  generatedBy?: string | null;
  pageNumberLabel?: string;
};

export function PageFooter({
  documentKind,
  documentNumber,
  generatedBy,
}: FooterProps) {
  return (
    <View style={sharedStyles.footerRow} fixed>
      <Text style={sharedStyles.footerText}>
        {documentKind} {documentNumber}
        {generatedBy ? `  •  Generated by ${generatedBy}` : ""}
        {`  •  ${formatPdfDateTime(new Date())}`}
      </Text>
      <Text
        style={sharedStyles.footerText}
        render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

export { sharedStyles };
