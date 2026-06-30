import { Download } from "lucide-react";
import type { OpsImportTemplateKind } from "@/lib/ops/import-templates";

/**
 * "Download template" links shown next to a document-import form. Users grab a
 * CSV or Excel template, edit it, then upload it back through the same importer.
 */
export function OpsImportTemplateLinks({ kind }: { kind: OpsImportTemplateKind }) {
  const base = `/api/ops/import-templates/${kind}`;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="font-semibold text-foreground/65">Need a template?</span>
      <a
        className="inline-flex items-center gap-1 font-semibold text-primary-blue hover:underline"
        href={`${base}?format=csv`}
      >
        <Download className="size-3.5" aria-hidden="true" />
        CSV
      </a>
      <a
        className="inline-flex items-center gap-1 font-semibold text-primary-blue hover:underline"
        href={`${base}?format=xlsx`}
      >
        <Download className="size-3.5" aria-hidden="true" />
        Excel
      </a>
    </p>
  );
}
