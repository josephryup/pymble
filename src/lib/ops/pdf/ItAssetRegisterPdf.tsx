
import { Document, Page, StyleSheet, Text } from "@react-pdf/renderer";
import type { OpsItAssetSummary } from "@/lib/ops/it-assets";
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

const TYPE_LABELS: Record<string, string> = {
  access_point: "Access point",
  desktop: "Desktop",
  laptop: "Laptop",
  monitor: "Monitor",
  network: "Network",
  other: "Other",
  phone: "Phone",
  printer: "Printer",
  server: "Server",
  tablet: "Tablet",
};

const STATUS_LABELS: Record<string, string> = {
  disposed: "Disposed",
  in_use: "In use",
  lost: "Lost",
  repair: "Repair",
  retired: "Retired",
  spare: "Spare",
};

export type ItAssetRegisterPdfProps = {
  assets: OpsItAssetSummary[];
  generatedBy?: string | null;
  org: PymblePdfOrgSnapshot;
};

export function ItAssetRegisterPdf({ assets, generatedBy, org }: ItAssetRegisterPdfProps) {
  const safeOrg = { ...PYMBLE_ORG_FALLBACK, ...org };
  const documentKind = "IT Asset Register";
  const documentNumber = `AST-${formatPdfDate(new Date().toISOString())}`;

  const rows = assets.map((asset) => [
    asset.asset_tag,
    asset.name,
    TYPE_LABELS[asset.asset_type] ?? asset.asset_type,
    STATUS_LABELS[asset.status] ?? asset.status,
    asset.assignee?.full_name ?? "Unassigned",
    asset.site?.code ?? "—",
    asset.warranty_expiry ?? "—",
    [asset.operating_system, asset.processor, asset.ram, asset.storage]
      .filter(Boolean)
      .join(" · ") || "—",
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
        <SectionTitle>Asset register</SectionTitle>
        <Text style={styles.summary}>{assets.length} active asset{assets.length === 1 ? "" : "s"}</Text>
        {assets.length === 0 ? (
          <Text style={sharedStyles.fieldValue}>No active assets recorded.</Text>
        ) : (
          <Table
            columns={[
              { label: "Tag", widthPct: 10 },
              { label: "Name", widthPct: 16 },
              { label: "Type", widthPct: 8 },
              { label: "Status", widthPct: 8 },
              { label: "Assigned to", widthPct: 14 },
              { label: "Site", widthPct: 6 },
              { label: "Warranty", widthPct: 10 },
              { label: "Specifications (OS · CPU · RAM · Storage)", widthPct: 28 },
            ]}
            rows={rows}
          />
        )}
        <PageFooter documentKind={documentKind} documentNumber={documentNumber} generatedBy={generatedBy} />
      </Page>
    </Document>
  );
}
