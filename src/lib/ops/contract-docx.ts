import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import type { OpsContractDetail } from "@/lib/ops/contract-types";
import type { PymblePdfOrgSnapshot } from "@/lib/ops/pdf/theme";

/**
 * Word export — the "editable" half of the ask.
 *
 * This is a WORKING COPY, not the system record. HR edits it offline, gets it
 * signed on paper, and the signed scan comes back in against the contract. The
 * banner at the top of the document says so, because a Word file that looks
 * authoritative will be treated as authoritative.
 *
 * There is deliberately no DOCX import. Parsing an edited Word file back into
 * structured clauses is all cost and no payoff: edits belong in the clause
 * editor, where they are diffed against the template and bound by the signature
 * hash. A round-trip would quietly bypass both.
 */

function heading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ bold: true, text })],
  });
}

function body(text: string) {
  // Clause bodies carry hard newlines; Word needs a paragraph each or the
  // numbered sub-clauses run together into a wall of text.
  return text
    .split("\n")
    .map(
      (line) =>
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: line })],
        }),
    );
}

function cell(text: string, bold = false) {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ bold, text })] })],
  });
}

function money(amount: number, currency: string) {
  return `${currency || "ZMW"} ${Number(amount ?? 0).toLocaleString("en-ZM", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export async function buildOpsContractDocx(input: {
  clauses: Array<{ heading: string; body: string; is_customised: boolean }>;
  contract: OpsContractDetail;
  org: PymblePdfOrgSnapshot;
}) {
  const { contract, org } = input;
  const currency = contract.currency_code || "ZMW";
  const counterparty = contract.counterparty_snapshot ?? {};

  const children: Paragraph[] = [];
  const blocks: (Paragraph | Table)[] = [];

  blocks.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          bold: true,
          color: "B00020",
          text: "WORKING COPY — NOT THE SYSTEM RECORD",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          italics: true,
          size: 18,
          text: `Generated from ${contract.contract_number}. Edits made here do not update the workspace; the signed copy must be uploaded back against the contract.`,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          bold: true,
          text:
            contract.kind === "employment"
              ? "CONTRACT OF EMPLOYMENT"
              : "WORKS ORDER & SUBCONTRACT AGREEMENT",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: contract.contract_number })],
    }),
  );

  blocks.push(
    heading("Parties"),
    new Paragraph({
      children: [
        new TextRun({ bold: true, text: "From: " }),
        new TextRun({ text: org.legal_name ?? "Pymble Construction Limited" }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ bold: true, text: "To: " }),
        new TextRun({ text: counterparty.name || contract.counterparty_name }),
      ],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: [
            counterparty.address ? `Address: ${counterparty.address}` : null,
            `TPIN: ${counterparty.tpin || "—"}`,
            `Contact: ${counterparty.contact_name || "—"}${counterparty.contact_phone ? ` ${counterparty.contact_phone}` : ""}`,
            `Email: ${counterparty.contact_email || "—"}`,
          ]
            .filter(Boolean)
            .join("   ·   "),
        }),
      ],
    }),
  );

  if (contract.preamble) {
    blocks.push(heading("Preamble"), ...body(contract.preamble));
  }

  if (contract.scope_items.length > 0) {
    blocks.push(heading("Scope of works"));
    if (contract.scope_summary) blocks.push(...body(contract.scope_summary));
    contract.scope_items.forEach((item, index) => {
      blocks.push(
        new Paragraph({
          spacing: { before: 120 },
          children: [new TextRun({ bold: true, text: `${index + 1}. ${item.heading}` })],
        }),
      );
      if (item.detail) blocks.push(...body(item.detail));
    });
  }

  // The remuneration schedule, for the employment kind. Same figures and same
  // order as the PDF — the two documents are the same instrument in different
  // wrappers, and a reader comparing them must not find a discrepancy.
  const remuneration = contract.remuneration;
  if (remuneration) {
    blocks.push(heading("Schedule — remuneration"));

    const scheduleRows: Array<[string, number]> = [
      ["Basic salary", remuneration.basic],
      ["Housing allowance", remuneration.housing],
      ...remuneration.allowance_items.map(
        (allowance) => [allowance.label, allowance.amount] as [string, number],
      ),
      ["Gross monthly remuneration", remuneration.gross],
      ...(remuneration.statutory_applies
        ? ([
            ["Less: PAYE", remuneration.paye],
            ["Less: NAPSA (employee)", remuneration.napsa_employee],
            ["Less: NHIMA (employee)", remuneration.nhima_employee],
          ] as Array<[string, number]>)
        : []),
      ["Net monthly pay", remuneration.net],
    ];

    blocks.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [cell("Item", true), cell("Amount per month", true)],
          }),
          ...scheduleRows.map(
            ([label, amount]) =>
              new TableRow({
                children: [cell(label), cell(money(amount, currency))],
              }),
          ),
        ],
      }),
    );

    blocks.push(
      ...body(
        remuneration.statutory_applies
          ? `Deductions are computed under ${remuneration.citation}. Statutory rates change from time to time and the deductions above change with them; the gross salary does not.`
          : `The Employee is paid gross and is responsible for their own tax and statutory contributions. No PAYE is withheld and no NAPSA, NHIMA or Workers' Compensation contributions are made by either party. Rates reference: ${remuneration.citation}.`,
      ),
    );
  }

  if (contract.lines.length > 0) {
    blocks.push(heading("Value of works"));
    blocks.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              cell("S/No", true),
              cell("Description", true),
              cell("Qty", true),
              cell("UoM", true),
              cell("Rate", true),
              cell("Amount", true),
            ],
          }),
          ...contract.lines.map(
            (line, index) =>
              new TableRow({
                children: [
                  cell(String(index + 1)),
                  cell(line.description),
                  cell(String(Number(line.quantity ?? 0))),
                  cell(line.uom),
                  cell(money(Number(line.rate ?? 0), currency)),
                  cell(money(Number(line.amount ?? 0), currency)),
                ],
              }),
          ),
        ],
      }),
    );

    blocks.push(
      new Paragraph({
        spacing: { before: 120 },
        children: [
          new TextRun({ text: `Subtotal: ${money(Number(contract.subtotal ?? 0), currency)}` }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: contract.vat_applicable
              ? `VAT (${Number(contract.vat_percent)}%): ${money(Number(contract.vat_amount ?? 0), currency)}`
              : "VAT: not applicable — supplier not VAT registered",
          }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({
            bold: true,
            text: `Total: ${money(Number(contract.total_value ?? 0), currency)}`,
          }),
        ],
      }),
    );
  }

  if (contract.milestones.length > 0) {
    blocks.push(heading("Payment schedule"));
    blocks.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              cell("Stage", true),
              cell("%", true),
              cell("Amount", true),
              cell("Trigger", true),
              cell("Payable", true),
            ],
          }),
          ...contract.milestones.map(
            (milestone) =>
              new TableRow({
                children: [
                  cell(
                    milestone.label + (milestone.is_retention ? " (retention)" : ""),
                  ),
                  cell(`${Number(milestone.percent ?? 0)}%`),
                  cell(money(Number(milestone.amount ?? 0), currency)),
                  cell(milestone.trigger_description),
                  cell(`${milestone.payable_within_days} days`),
                ],
              }),
          ),
        ],
      }),
    );
  }

  blocks.push(heading("Terms and conditions"));
  for (const clause of input.clauses) {
    if (clause.is_customised) {
      blocks.push(
        new Paragraph({
          spacing: { before: 120 },
          children: [
            new TextRun({
              bold: true,
              color: "B00020",
              size: 16,
              text: "AMENDED FROM STANDARD TERMS",
            }),
          ],
        }),
      );
    }
    if (clause.heading) blocks.push(heading(clause.heading));
    blocks.push(...body(clause.body));
  }

  blocks.push(
    heading("Execution"),
    new Paragraph({
      spacing: { before: 240 },
      children: [
        new TextRun({
          text: `For & on behalf of ${org.legal_name ?? "Pymble Construction Limited"}: ______________________`,
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: 240 },
      children: [
        new TextRun({
          text: `For & on behalf of ${counterparty.name || contract.counterparty_name}: ______________________`,
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: 240 },
      children: [new TextRun({ text: "Witness: ______________________" })],
    }),
    new Paragraph({
      spacing: { before: 240 },
      children: [new TextRun({ text: "Date: ______________________" })],
    }),
  );

  void children;

  const document = new Document({
    creator: org.legal_name ?? "Pymble Construction Limited",
    title: `${contract.contract_number} (working copy)`,
    sections: [{ children: blocks }],
  });

  return Packer.toBuffer(document);
}
