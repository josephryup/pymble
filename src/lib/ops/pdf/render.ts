import type { ReactElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";

/**
 * Renders a React-PDF document element to a Buffer suitable for streaming back
 * to the browser. Centralised so download routes stay tiny.
 */
export async function renderPdfDocument(element: ReactElement): Promise<Buffer> {
  // The renderer's type definitions require DocumentProps but our templates
  // return generic React elements wrapped in <Document>. Cast at the boundary;
  // template authors are responsible for using <Document> at the root.
  return await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
}

/**
 * Standard download response headers. Encodes the filename per RFC 5987 so
 * filenames with spaces / non-ASCII characters land cleanly.
 */
export function pdfResponseHeaders(filename: string): HeadersInit {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "private, no-store, max-age=0",
  };
}
