const fs = require("fs");
const path = require("path");
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} = require("docx");

const { MODULE_CONTENT } = require("./workbook-content.js");
const MODULES = require("./modules.json");

// ── Departments ────────────────────────────────────────────────────────────
// Roles are the real ones from src/lib/ops/types.ts. A department's workbook
// covers every module ANY of its roles can open; where the roles differ, the
// access table in section 2 says who gets what.
const DEPARTMENTS = [
  {
    key: "procurement",
    name: "Procurement",
    roles: [
      ["procurement_manager", "Procurement Manager"],
      ["procurement", "Procurement Officer"],
      ["procurement_assistant", "Procurement Assistant"],
    ],
    owns: ["material-requests", "boq", "rfq-po", "suppliers", "stores-inventory", "delivery-exceptions"],
    mission:
      "Turning an approved need into goods on site at a price the company agreed, with the evidence to show it.",
  },
  {
    key: "engineering",
    name: "Engineering",
    roles: [
      ["engineering_manager", "Engineering Manager"],
      ["engineer", "Engineer"],
      ["engineering_intern", "Engineering Intern"],
    ],
    owns: ["daily-site-reports", "engineering-controls", "site-checklists", "project-schedule", "boq"],
    mission:
      "Getting the work built right, and leaving a record good enough to prove it was.",
  },
  {
    key: "projects",
    name: "Projects and Commercial",
    roles: [
      ["projects_manager", "Projects Manager"],
      ["quantity_surveyor", "Quantity Surveyor"],
    ],
    owns: ["project-schedule", "boq", "commercial-maturity", "project-budgets", "material-requests", "cost-codes"],
    mission:
      "Holding the project to its programme and its price, and making sure every change is priced before it is built.",
  },
  {
    key: "finance",
    name: "Finance",
    roles: [
      ["finance_manager", "Finance Manager"],
      ["accountant", "Accountant"],
      ["accountant_intern", "Accountant Intern"],
    ],
    owns: ["project-budgets", "payment-requests", "invoices", "loans", "cost-codes", "finance-overview", "staff-payroll"],
    mission:
      "Making sure every kwacha the company commits, spends or is owed reaches the accounts, correctly and on time.",
  },
  {
    key: "operations",
    name: "Operations",
    roles: [
      ["operations_manager", "Operations Manager"],
      ["manager", "Manager"],
      ["supervisor", "Supervisor"],
    ],
    owns: ["sites", "attendance", "workers", "subcontractors", "contracts", "material-requests", "approvals"],
    mission:
      "Keeping sites running and unblocking the workflow — most of what stalls in this system stalls waiting for an Operations decision.",
  },
  {
    key: "hse",
    name: "Health, Safety and Environment",
    roles: [
      ["hse_officer", "HSE Officer"],
      ["hse_assistant_officer", "HSE Assistant Officer"],
    ],
    owns: ["hse-incidents", "hse-compliance", "hse-weekly"],
    mission:
      "Everyone goes home. Everything that happens is recorded on the day it happens.",
  },
  {
    key: "hr",
    name: "Human Resource",
    roles: [
      ["human_resource", "Human Resource"],
      ["hr", "HR Officer"],
      ["admin_receptionist", "Admin / Receptionist"],
    ],
    owns: ["employees", "staff", "staff-payroll", "payroll", "recruitment"],
    mission:
      "People are hired, contracted, present, paid correctly and on time — and the record shows it.",
  },
];

const GROUP_ORDER = [
  ["workspace", "Your day"],
  ["operations", "Projects and people"],
  ["procurement", "Procurement and materials"],
  ["engineering", "Engineering and site control"],
  ["commercial", "Commercial"],
  ["finance", "Money"],
  ["hr", "People and payroll"],
  ["hse", "Health, safety and environment"],
  ["fleet", "Plant and transport"],
  ["records", "Records and reference"],
  ["executive", "Reporting"],
  ["it", "IT"],
];

// ── Styling ────────────────────────────────────────────────────────────────
const INK = "1A1D1C";
const SOFT = "4A4F4C";
const FAINT = "737B78";
const ACCENT = "0E5A62";
const RULE = "C9CDCA";
const HEAD_FILL = "EDF2F2";
const ZEBRA = "F6F7F7";
const WARN = "8A5A06";
const STOP = "962623";
const GO = "26603A";
const BODY_FONT = "Calibri";
const HEAD_FONT = "Cambria";
const W = 9026;

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const THIN = { style: BorderStyle.SINGLE, size: 4, color: RULE };

const t = (text, o = {}) => new TextRun({ text, font: BODY_FONT, size: 20, color: INK, ...o });
const B = (text) => ({ text, bold: true });

const seg = (s) => (typeof s === "string" ? t(s) : t(s.text, s));

function p(text, o = {}) {
  const { children, ...rest } = o;
  return new Paragraph({ spacing: { after: 140, line: 276 }, children: children ?? [t(text)], ...rest });
}

const rich = (segments, o = {}) =>
  new Paragraph({ spacing: { after: 140, line: 276 }, children: segments.map(seg), ...o });

const h1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 190 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 6 } },
    children: [new TextRun({ text, font: HEAD_FONT, size: 30, bold: true, color: ACCENT })],
  });

const h2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 120 },
    children: [new TextRun({ text, font: HEAD_FONT, size: 23, bold: true, color: INK })],
  });

const h3 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 90 },
    children: [new TextRun({ text, font: BODY_FONT, size: 20, bold: true, color: SOFT })],
  });

const bullet = (segments) =>
  new Paragraph({
    numbering: { reference: "wb-bullets", level: 0 },
    spacing: { after: 80, line: 272 },
    children: (Array.isArray(segments) ? segments : [segments]).map(seg),
  });

const numbered = (segments) =>
  new Paragraph({
    numbering: { reference: "wb-steps", level: 0 },
    spacing: { after: 90, line: 272 },
    children: (Array.isArray(segments) ? segments : [segments]).map(seg),
  });

const spacer = (after = 180) => new Paragraph({ spacing: { after }, children: [t("")] });

function callout(title, body, tone = "accent") {
  const color = tone === "warn" ? WARN : tone === "stop" ? STOP : tone === "go" ? GO : ACCENT;
  const fill = tone === "warn" ? "FDF6E8" : tone === "stop" ? "FCEFEE" : tone === "go" ? "EDF6F0" : "EDF3F3";
  return new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [W],
    borders: { top: NONE, bottom: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE, left: { style: BorderStyle.SINGLE, size: 18, color } },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: W, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill, color: "auto" },
            margins: { top: 150, bottom: 150, left: 220, right: 220 },
            children: [
              new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: title, font: BODY_FONT, size: 20, bold: true, color })] }),
              new Paragraph({ spacing: { line: 272 }, children: (Array.isArray(body) ? body : [body]).map(seg) }),
            ],
          }),
        ],
      }),
    ],
  });
}

function table(headers, rows, widths) {
  const cols = widths ? [...widths] : headers.map(() => Math.floor(W / headers.length));
  cols[cols.length - 1] += W - cols.reduce((a, b) => a + b, 0);

  const head = new TableRow({
    tableHeader: true,
    children: headers.map(
      (label, i) =>
        new TableCell({
          width: { size: cols[i], type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: HEAD_FILL, color: "auto" },
          margins: { top: 85, bottom: 85, left: 130, right: 130 },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: label, font: BODY_FONT, size: 17, bold: true, color: ACCENT, allCaps: true })] })],
        }),
    ),
  });

  const body = rows.map(
    (cells, r) =>
      new TableRow({
        children: cells.map(
          (cell, i) =>
            new TableCell({
              width: { size: cols[i], type: WidthType.DXA },
              shading: r % 2 === 1 ? { type: ShadingType.CLEAR, fill: ZEBRA, color: "auto" } : undefined,
              margins: { top: 85, bottom: 85, left: 130, right: 130 },
              children: [
                new Paragraph({
                  spacing: { after: 0, line: 258 },
                  children: (Array.isArray(cell) ? cell : [cell]).map((s) =>
                    typeof s === "string"
                      ? new TextRun({ text: s, font: BODY_FONT, size: 19, color: INK })
                      : new TextRun({ text: s.text, font: BODY_FONT, size: 19, color: s.color ?? INK, bold: s.bold, italics: s.italics }),
                  ),
                }),
              ],
            }),
        ),
      }),
  );

  return new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: cols,
    borders: { top: THIN, bottom: THIN, left: THIN, right: THIN, insideHorizontal: THIN, insideVertical: THIN },
    rows: [head, ...body],
  });
}

function plainTable(rows, widths) {
  const cols = [...widths];
  cols[cols.length - 1] += W - cols.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: cols,
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideVertical: NONE, insideHorizontal: THIN },
    rows: rows.map(
      (cells) =>
        new TableRow({
          children: cells.map(
            (cell, i) =>
              new TableCell({
                width: { size: cols[i], type: WidthType.DXA },
                margins: { top: 110, bottom: 110, left: 0, right: 160 },
                children: [
                  new Paragraph({
                    spacing: { after: 0, line: 258 },
                    children: (Array.isArray(cell) ? cell : [cell]).map((s) =>
                      typeof s === "string"
                        ? new TextRun({ text: s, font: BODY_FONT, size: 19, color: INK })
                        : new TextRun({ text: s.text, font: BODY_FONT, size: 19, bold: s.bold, color: s.bold ? ACCENT : INK }),
                    ),
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}

// ── Section builders ───────────────────────────────────────────────────────

function cover(dept, moduleCount) {
  return [
    new Paragraph({ spacing: { before: 2400 }, children: [t("")] }),
    new Paragraph({
      spacing: { after: 110 },
      children: [new TextRun({ text: "PYMBLE CONSTRUCTION LIMITED", font: BODY_FONT, size: 20, bold: true, color: ACCENT, characterSpacing: 60 })],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: dept.name, font: HEAD_FONT, size: 56, bold: true, color: INK })],
    }),
    new Paragraph({
      spacing: { after: 100 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: ACCENT, space: 10 } },
      children: [new TextRun({ text: "Operations Workbook", font: HEAD_FONT, size: 40, color: SOFT })],
    }),
    new Paragraph({
      spacing: { before: 240, after: 420 },
      children: [new TextRun({ text: dept.mission, font: BODY_FONT, size: 24, color: SOFT, italics: true })],
    }),
    plainTable(
      [
        [B("For"), dept.roles.map((r) => r[1]).join(" · ")],
        [B("Covers"), `${moduleCount} modules you can open`],
        [B("Version"), "1.0"],
        [B("Issued"), "19 August 2026"],
      ],
      [1700, 7326],
    ),
    new Paragraph({
      spacing: { before: 460 },
      children: [new TextRun({ text: "Internal document. Access shown here is taken from the system's own role matrix.", font: BODY_FONT, size: 17, color: FAINT, italics: true })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function contents() {
  return [
    new Paragraph({ spacing: { after: 180 }, children: [new TextRun({ text: "Contents", font: HEAD_FONT, size: 32, bold: true, color: ACCENT })] }),
    new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }),
    new Paragraph({
      spacing: { before: 200 },
      children: [new TextRun({ text: "To fill in the page numbers: click anywhere in the contents, then press F9.", font: BODY_FONT, size: 17, color: FAINT, italics: true })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function howToRead(dept) {
  return [
    h1("1. How to use this workbook"),
    p(`This is the ${dept.name} edition. It covers only the modules your roles can actually open, so nothing in it is somebody else's job.`),
    h2("How each module is described"),
    numbered([B("What it is for"), " — one sentence."]),
    numbered([B("How it moves"), " — the states a record passes through, where the module is a workflow."]),
    numbered([B("How to operate it"), " — the instructions."]),
    numbered([B("What happens if you don't"), " — the consequence of skipping a step. This is the part most people need."]),
    spacer(120),
    h2("Two words used precisely"),
    rich([B("Live"), " — the record is governing something. A live budget controls spend. A draft one does not, no matter what is written on it."]),
    rich([B("Charged"), " — money has been attached to a specific piece of work. Money that is not charged still exists; it just cannot be reported against anything."]),
    spacer(120),
    callout(
      "If you take one thing from this workbook",
      "Almost every problem in this system comes from a step that was started and not finished — prices attached but never sent, a budget written but never activated, an order approved but never issued. Each of these now shows on a screen. Nothing here asks you to remember anything.",
    ),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function accessSection(dept, visible) {
  const multi = dept.roles.length > 1;
  const rows = visible.map((m) => {
    const cells = [m.title];
    for (const [roleId] of dept.roles) cells.push(m.roles.includes(roleId) ? "Yes" : { text: "—", color: FAINT });
    return cells;
  });

  const headers = ["Module", ...dept.roles.map((r) => r[1])];
  const roleColWidth = Math.floor(3600 / dept.roles.length);
  const widths = [W - roleColWidth * dept.roles.length, ...dept.roles.map(() => roleColWidth)];

  const out = [
    h1("2. What your department can open"),
    p(`Your roles can open ${visible.length} of the system's ${MODULES.length} modules. Everything else is another department's, and you will not see it in the menu.`),
  ];

  if (multi) {
    out.push(p("Access differs between roles within the department. This table is the definitive list."));
  }
  out.push(spacer(80), table(headers, rows, widths));
  out.push(spacer(140));
  out.push(
    callout(
      "If you cannot see something you think you should",
      "Access is set per role, and can be adjusted by IT for anything that is not a money or people module. Ask your manager first — the usual answer is that the work belongs to another role.",
    ),
  );
  out.push(new Paragraph({ children: [new PageBreak()] }));
  return out;
}

function moduleSection(m, index, isOwned) {
  const c = MODULE_CONTENT[m.id];
  const out = [];

  out.push(h2(`${index} ${m.title}`));
  if (isOwned) {
    out.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: "YOUR DEPARTMENT OWNS THIS", font: BODY_FONT, size: 16, bold: true, color: ACCENT, characterSpacing: 40 })],
      }),
    );
  }
  out.push(rich([B("What it is for. "), c.purpose]));

  if (c.flow) {
    out.push(h3("How it moves"));
    for (const step of c.flow) {
      out.push(step.length > 1 ? bullet([B(step[0] + " — "), step[1]]) : bullet([B(step[0])]));
    }
  }

  if (c.how) {
    out.push(h3("How to operate it"));
    for (const line of c.how) out.push(bullet(line));
  }

  if (c.extra) {
    out.push(h3(c.extra.title));
    if (c.extra.intro) out.push(p(c.extra.intro));
    out.push(table(c.extra.table.headers, c.extra.table.rows, c.extra.table.widths));
    if (c.extra.note) {
      out.push(spacer(120));
      out.push(callout("Worth knowing", c.extra.note));
      out.push(spacer(120));
    }
  }

  if (c.ifNot) {
    out.push(h3("What happens if you don't"));
    out.push(
      table(
        ["If this is not done", "What happens"],
        c.ifNot.map(([a, b]) => [a, b]),
        [3200, 5826],
      ),
    );
    out.push(spacer(120));
  }

  if (c.sla) {
    out.push(h3("When it counts as late"));
    out.push(table(["Stage", "Late after"], c.sla, [5400, 3626]));
    out.push(spacer(120));
  }

  return out;
}

function closing(dept) {
  return [
    h1("Where to look when something seems wrong"),
    table(
      ["Question", "Where to look"],
      [
        ["“Why is my request stuck?”", "Open it — the banner says exactly what is blocking it and what clears it"],
        ["“What is waiting on me?”", "Approvals, and My Queue on the Overview"],
        ["“Where has the money gone on this site?”", "Project Budgets, then the site's budget"],
        ["“Why does this charge contingency?”", "The item's cost code badge — it means no material schedule line matched"],
        ["“Who changed this?”", "Activity Log"],
        ["“What does this word mean?”", "Glossary"],
        ["“I think I should be able to see X”", "Modules — it lists every module and whether you can open it"],
      ],
      [3400, 5626],
    ),
    spacer(200),
    callout(
      `The ${dept.name} habits that keep the system honest`,
      "Finish what you start, on the day you start it. Record the reason when you decline, defer or override something. And if a screen tells you a record is blocked, read the sentence — it names the fix.",
      "go",
    ),
    spacer(200),
    p("This workbook describes the system as it behaves after the August 2026 workflow remediation. Access shown is taken from the system's own role matrix."),
  ];
}

// ── Build ──────────────────────────────────────────────────────────────────

function buildDocument(dept) {
  const visible = MODULES.filter((m) => dept.roles.some(([r]) => m.roles.includes(r)));
  const owned = new Set(dept.owns);

  const children = [...cover(dept, visible.length), ...contents(), ...howToRead(dept), ...accessSection(dept, visible)];

  // Section 3 onward: modules, grouped, department-owned groups first.
  const byGroup = new Map();
  for (const m of visible) {
    if (!byGroup.has(m.group)) byGroup.set(m.group, []);
    byGroup.get(m.group).push(m);
  }

  const ordered = GROUP_ORDER.filter(([g]) => byGroup.has(g)).sort((a, b) => {
    const aOwn = byGroup.get(a[0]).some((m) => owned.has(m.id)) ? 0 : 1;
    const bOwn = byGroup.get(b[0]).some((m) => owned.has(m.id)) ? 0 : 1;
    return aOwn - bOwn;
  });

  let sectionNo = 3;
  for (const [group, label] of ordered) {
    // Department-owned modules lead their section, in the order the department
    // actually works in them — not alphabetically. Material Requests should be
    // 3.1 for Procurement; Delivery Exceptions should not.
    const rank = (m) => {
      const i = dept.owns.indexOf(m.id);
      return i === -1 ? 1000 : i;
    };
    const mods = byGroup.get(group).sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));

    children.push(h1(`${sectionNo}. ${label}`));
    let sub = 1;
    for (const m of mods) {
      children.push(...moduleSection(m, `${sectionNo}.${sub}`, owned.has(m.id)));
      sub += 1;
    }
    children.push(new Paragraph({ children: [new PageBreak()] }));
    sectionNo += 1;
  }

  children.push(...closing(dept));

  return new Document({
    creator: "Pymble Construction Limited",
    title: `${dept.name} — Operations Workbook`,
    description: `Operations workbook for ${dept.name}`,
    styles: { default: { document: { run: { font: BODY_FONT, size: 20, color: INK } } } },
    numbering: {
      config: [
        {
          reference: "wb-bullets",
          levels: [
            { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 440, hanging: 250 } } } },
          ],
        },
        {
          reference: "wb-steps",
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 440, hanging: 250 } } } },
          ],
        },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }, titlePage: true },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 70 },
                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 6 } },
                children: [new TextRun({ text: `Pymble Construction Limited  ·  ${dept.name} Workbook`, font: BODY_FONT, size: 16, color: FAINT })],
              }),
            ],
          }),
          first: new Header({ children: [new Paragraph({ children: [t("")] })] }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: "Version 1.0  ·  19 August 2026  ·  Page ", font: BODY_FONT, size: 16, color: FAINT }),
                  new TextRun({ children: [PageNumber.CURRENT], font: BODY_FONT, size: 16, color: FAINT }),
                  new TextRun({ text: " of ", font: BODY_FONT, size: 16, color: FAINT }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: BODY_FONT, size: 16, color: FAINT }),
                ],
              }),
            ],
          }),
          first: new Footer({ children: [new Paragraph({ children: [t("")] })] }),
        },
        children,
      },
    ],
  });
}

const outDir = process.argv[2];
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  for (const dept of DEPARTMENTS) {
    const visible = MODULES.filter((m) => dept.roles.some(([r]) => m.roles.includes(r)));
    const missing = visible.filter((m) => !MODULE_CONTENT[m.id]);
    if (missing.length) {
      throw new Error(`${dept.name}: no content for ${missing.map((m) => m.id).join(", ")}`);
    }
    const buf = await Packer.toBuffer(buildDocument(dept));
    const file = path.join(outDir, `Pymble-Workbook-${dept.name.replace(/[^A-Za-z]+/g, "-")}.docx`);
    fs.writeFileSync(file, buf);
    console.log(`${dept.name.padEnd(34)} ${String(visible.length).padStart(2)} modules   ${(buf.length / 1024).toFixed(0)} KB`);
  }
})();
