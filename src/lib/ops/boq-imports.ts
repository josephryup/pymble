import * as XLSX from "xlsx";

/**
 * Minimal RFC-4180-ish CSV parser shared by the spreadsheet importers. Handles
 * quoted cells, escaped quotes, and CRLF. Returns a 2D string grid.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char === "\r") {
      // ignore; handled by the \n branch
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

/**
 * Parse an XLSX/XLS workbook into a 2D string grid. We always read the first
 * sheet — multi-sheet workbooks would need a separate UI step to pick one.
 *
 * The cells are stringified so the downstream parser (which is shared with CSV)
 * can handle numeric quantities/prices uniformly.
 */
export async function readXlsxRows(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("The spreadsheet has no sheets.");
  }
  const sheet = workbook.Sheets[firstSheetName];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });

  // Strip the leading title/blank rows that come from form-style spreadsheets
  // (see the procurement requisition form in the user's reference image): we
  // scan rows until we find one containing recognised header keywords.
  const HEADER_KEYWORDS = [
    "item",
    "description",
    "quantity",
    "qty",
    "unit",
    "unit price",
    "unit_rate",
    "rate",
    "supplier",
    "total",
  ];

  const stringRows = raw.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))),
  );

  const headerRowIndex = stringRows.findIndex((row) =>
    row.some((cell) => {
      const lowered = cell.trim().toLowerCase();
      return HEADER_KEYWORDS.some((keyword) => lowered === keyword || lowered.startsWith(`${keyword} `));
    }),
  );

  return headerRowIndex >= 0 ? stringRows.slice(headerRowIndex) : stringRows;
}

/**
 * Best-effort PDF text extraction. PDFs are not a structured tabular format,
 * so we accept a small surface: we look for lines that contain a column
 * separator (multiple spaces or a tab) and parse them as rows.
 *
 * For consistent results, users should export the spreadsheet to PDF with the
 * header row intact. We do not OCR scanned PDFs.
 */
export async function readPdfRows(file: File): Promise<string[][]> {
  // Lazy-load pdfjs only inside this server-only path so it doesn't bloat
  // the client bundle.
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as typeof import("pdfjs-dist");
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const lines: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    // pdfjs returns a mixed list of TextItem and TextMarkedContent — only the
    // TextItems have positions. Filter loosely and treat the rest as opaque.
    type Item = { str: string; x: number; y: number };
    const items: Item[] = (content.items as Array<Record<string, unknown>>)
      .filter((raw) => typeof raw.str === "string" && Array.isArray(raw.transform))
      .map((raw) => {
        const transform = raw.transform as number[];
        return {
          str: raw.str as string,
          x: transform[4] ?? 0,
          y: transform[5] ?? 0,
        };
      });

    const lineBuckets = new Map<number, Item[]>();
    for (const item of items) {
      const bucket = Math.round(item.y);
      const list = lineBuckets.get(bucket) ?? [];
      list.push(item);
      lineBuckets.set(bucket, list);
    }

    const sortedBuckets = Array.from(lineBuckets.entries()).sort((a, b) => b[0] - a[0]);
    for (const [, list] of sortedBuckets) {
      list.sort((a, b) => a.x - b.x);
      const text = list
        .map((item) => item.str)
        .join("|")
        .replace(/\|+/g, "|")
        .trim();
      if (text.length > 0) {
        lines.push(text);
      }
    }
  }

  return lines.map((line) => line.split("|").map((cell) => cell.trim()));
}
