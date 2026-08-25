const fs = require("fs");
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

// ── Palette ────────────────────────────────────────────────────────────────
// Conservative and printable. One accent (deep petrol), plus semantic tones
// used only in callouts and status words.
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

// A4 content width with 1" margins: 11906 - 2880 = 9026 DXA.
const W = 9026;

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const THIN = { style: BorderStyle.SINGLE, size: 4, color: RULE };

function t(text, opts = {}) {
  return new TextRun({ text, font: BODY_FONT, size: 20, color: INK, ...opts });
}

function p(text, opts = {}) {
  const { children, ...rest } = opts;
  return new Paragraph({
    spacing: { after: 140, line: 276 },
    children: children ?? [t(text)],
    ...rest,
  });
}

/** Body paragraph that may mix bold and plain segments. */
function rich(segments, opts = {}) {
  return new Paragraph({
    spacing: { after: 140, line: 276 },
    children: segments.map((seg) =>
      typeof seg === "string" ? t(seg) : t(seg.text, seg),
    ),
    ...opts,
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 420, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 6 } },
    children: [
      new TextRun({ text, font: HEAD_FONT, size: 30, bold: true, color: ACCENT }),
    ],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 130 },
    children: [
      new TextRun({ text, font: HEAD_FONT, size: 24, bold: true, color: INK }),
    ],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 100 },
    children: [
      new TextRun({ text, font: BODY_FONT, size: 21, bold: true, color: SOFT }),
    ],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "wb-bullets", level },
    spacing: { after: 90, line: 276 },
    children: [t(text)],
  });
}

function richBullet(segments, level = 0) {
  return new Paragraph({
    numbering: { reference: "wb-bullets", level },
    spacing: { after: 90, line: 276 },
    children: segments.map((seg) =>
      typeof seg === "string" ? t(seg) : t(seg.text, seg),
    ),
  });
}

function numbered(segments) {
  return new Paragraph({
    numbering: { reference: "wb-steps", level: 0 },
    spacing: { after: 100, line: 276 },
    children: segments.map((seg) =>
      typeof seg === "string" ? t(seg) : t(seg.text, seg),
    ),
  });
}

/**
 * A callout box: one bordered, tinted cell. Used sparingly — only where the
 * consequence of getting something wrong is expensive.
 */
function callout(title, body, tone = "accent") {
  const color = tone === "warn" ? WARN : tone === "stop" ? STOP : tone === "go" ? GO : ACCENT;
  const fill = tone === "warn" ? "FDF6E8" : tone === "stop" ? "FCEFEE" : tone === "go" ? "EDF6F0" : "EDF3F3";

  return new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: [W],
    borders: {
      top: NONE,
      bottom: NONE,
      right: NONE,
      insideHorizontal: NONE,
      insideVertical: NONE,
      left: { style: BorderStyle.SINGLE, size: 18, color },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: W, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, fill, color: "auto" },
            margins: { top: 160, bottom: 160, left: 220, right: 220 },
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({ text: title, font: BODY_FONT, size: 20, bold: true, color }),
                ],
              }),
              new Paragraph({
                spacing: { line: 276 },
                children: Array.isArray(body)
                  ? body.map((seg) => (typeof seg === "string" ? t(seg) : t(seg.text, seg)))
                  : [t(body)],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/** Data table. `widths` must sum to W. */
function table(headers, rows, widths) {
  const cols = widths ?? headers.map(() => Math.floor(W / headers.length));
  // Absorb rounding into the last column so the widths sum exactly.
  const sum = cols.reduce((a, b) => a + b, 0);
  cols[cols.length - 1] += W - sum;

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (label, i) =>
        new TableCell({
          width: { size: cols[i], type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: HEAD_FILL, color: "auto" },
          margins: { top: 90, bottom: 90, left: 130, right: 130 },
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({
              spacing: { after: 0 },
              children: [
                new TextRun({
                  text: label,
                  font: BODY_FONT,
                  size: 17,
                  bold: true,
                  color: ACCENT,
                  allCaps: true,
                }),
              ],
            }),
          ],
        }),
    ),
  });

  const bodyRows = rows.map(
    (cells, r) =>
      new TableRow({
        children: cells.map(
          (cell, i) =>
            new TableCell({
              width: { size: cols[i], type: WidthType.DXA },
              shading:
                r % 2 === 1
                  ? { type: ShadingType.CLEAR, fill: ZEBRA, color: "auto" }
                  : undefined,
              margins: { top: 90, bottom: 90, left: 130, right: 130 },
              children: [
                new Paragraph({
                  spacing: { after: 0, line: 260 },
                  children: (Array.isArray(cell) ? cell : [cell]).map((seg) =>
                    typeof seg === "string"
                      ? new TextRun({ text: seg, font: BODY_FONT, size: 19, color: INK })
                      : new TextRun({
                          text: seg.text,
                          font: BODY_FONT,
                          size: 19,
                          color: seg.color ?? INK,
                          bold: seg.bold,
                          italics: seg.italics,
                        }),
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
    borders: {
      top: THIN,
      bottom: THIN,
      left: THIN,
      right: THIN,
      insideHorizontal: THIN,
      insideVertical: THIN,
    },
    rows: [headerRow, ...bodyRows],
  });
}

/** Key/value table with no header row — used on the cover. */
function plainTable(rows, widths) {
  const cols = [...widths];
  cols[cols.length - 1] += W - cols.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: cols,
    borders: {
      top: NONE,
      bottom: NONE,
      left: NONE,
      right: NONE,
      insideVertical: NONE,
      insideHorizontal: THIN,
    },
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
                    spacing: { after: 0, line: 260 },
                    children: (Array.isArray(cell) ? cell : [cell]).map((seg) =>
                      typeof seg === "string"
                        ? new TextRun({ text: seg, font: BODY_FONT, size: 19, color: INK })
                        : new TextRun({
                            text: seg.text,
                            font: BODY_FONT,
                            size: 19,
                            bold: seg.bold,
                            color: seg.bold ? ACCENT : INK,
                          }),
                    ),
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}

function spacer(after = 200) {
  return new Paragraph({ spacing: { after }, children: [t("")] });
}

const B = (text) => ({ text, bold: true });
const I = (text) => ({ text, italics: true });

// ── Cover ──────────────────────────────────────────────────────────────────
const cover = [
  new Paragraph({ spacing: { before: 2600, after: 0 }, children: [t("")] }),
  new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({
        text: "PYMBLE CONSTRUCTION LIMITED",
        font: BODY_FONT,
        size: 20,
        bold: true,
        color: ACCENT,
        characterSpacing: 60,
      }),
    ],
  }),
  new Paragraph({
    spacing: { after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: ACCENT, space: 10 } },
    children: [
      new TextRun({ text: "Operations Workbook", font: HEAD_FONT, size: 62, bold: true, color: INK }),
    ],
  }),
  new Paragraph({
    spacing: { before: 260, after: 460 },
    children: [
      new TextRun({
        text: "How the system works, who does what, and what it means when something is not done.",
        font: BODY_FONT,
        size: 26,
        color: SOFT,
      }),
    ],
  }),
  plainTable(
    [
      [B("Covers"), "Material requests · Material schedules · Project budgets · Loans · Payment requests"],
      [B("For"), "All PCL operations, procurement, commercial and finance staff"],
      [B("Version"), "1.0"],
      [B("Issued"), "19 August 2026"],
    ],
    [1700, 7326],
  ),
  new Paragraph({
    spacing: { before: 500 },
    children: [
      new TextRun({
        text: "Internal document. Figures quoted were measured on the live system on 19 August 2026.",
        font: BODY_FONT,
        size: 17,
        color: FAINT,
        italics: true,
      }),
    ],
  }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── Contents ───────────────────────────────────────────────────────────────
const contents = [
  new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: "Contents", font: HEAD_FONT, size: 32, bold: true, color: ACCENT })],
  }),
  new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }),
  new Paragraph({
    spacing: { before: 220 },
    children: [
      new TextRun({
        text: "To refresh page numbers: click anywhere in the contents, then press F9.",
        font: BODY_FONT,
        size: 17,
        color: FAINT,
        italics: true,
      }),
    ],
  }),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── 1. How to use ──────────────────────────────────────────────────────────
const s1 = [
  h1("1. How to use this workbook"),
  p("Each module in this workbook follows the same four-part shape, so you can find what you need without reading the whole thing."),
  numbered([B("What it is for"), " — in one sentence."]),
  numbered([B("The steps"), " — who does what, in order."]),
  numbered([B("What happens if you don't"), " — the consequence of skipping a step. This is the part most people need."]),
  numbered([B("How long it should take"), " — what the system counts as late."]),
  spacer(120),
  h2("Two words used precisely"),
  rich([B("Live"), " — the record is governing something. A live budget controls spend. A draft one does not, no matter what is written on it."]),
  rich([B("Charged"), " — money has been attached to a specific piece of work. Money that is not charged still exists; it just cannot be reported against anything."]),
  spacer(120),
  callout(
    "If you take one thing from this workbook",
    "Almost every problem in the system comes from a step that was started and not finished — prices attached but never sent, a budget written but never activated, an order approved but never issued. The system now shows you each of these on screen. Nothing on the following pages requires you to remember anything.",
  ),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── 2. Material requests ───────────────────────────────────────────────────
const s2 = [
  h1("2. Material requests"),
  p("Getting materials to a site, with the company knowing what was ordered, what it cost, and which work it was for."),

  h2("2.1 The nine stations"),
  p("A request moves through these in order. It cannot skip one, and it cannot go backwards."),
  table(
    ["#", "Station", "Who acts", "What they do"],
    [
      ["1", "Draft", "Requester", "Builds the request and adds line items"],
      ["2", "Submitted", "Requester", "Sends it for approval"],
      ["3", "Operations approved", "Projects Manager, then Operations Manager", "Confirms the materials are right for the job"],
      ["4", "Pricing", "Procurement", "Attaches the actual supplier prices"],
      ["5", "Priced", "Procurement", "Sends it to Finance"],
      ["6", "Cost approved", "Finance Manager or Accountant", "Approves the money"],
      ["7", "Ordered", "Procurement", "Raises and issues the purchase order"],
      ["8", "Delivered", "Requester or site manager", "Confirms the goods arrived"],
      ["9", "Closed", "Stores, or automatic on full delivery", "Done"],
    ],
    [500, 1900, 2600, 4026],
  ),
  spacer(),

  h2("2.2 The approval chain"),
  richBullet([B("Site request under K25,000"), " — Projects Manager, then Operations Manager."]),
  richBullet([B("Site request K25,000 or over"), " — Projects Manager, Operations Manager, then the Managing Director."]),
  richBullet([B("Office or general request"), " — Operations Manager only. There is no project for a Projects Manager to check it against."]),
  richBullet(["If there is ", B("no active Projects Manager"), ", the Managing Director covers that step directly."]),
  spacer(120),

  h2("2.3 Who can do what"),
  table(
    ["Action", "Roles"],
    [
      ["Raise a request", "Operations Manager, Projects Manager, Procurement Manager, Procurement, Procurement Assistant, Quantity Surveyor, Engineer, Manager, Supervisor, HSE Officer, HSE Assistant, MD, GM, Owner"],
      ["Approve (Operations)", "Projects Manager, then Operations Manager"],
      ["Approve above K25,000", "The above, then Managing Director"],
      ["Attach supplier prices", "Procurement Manager, Procurement, Procurement Assistant, MD, Owner"],
      ["Approve the cost", "Finance Manager, Accountant, MD, Owner"],
      ["Raise the purchase order", "Procurement Manager, Procurement"],
      ["Confirm delivery", "The person who raised it, or any Operations / Projects / Procurement manager"],
      ["See every request", "MD, GM, Operations Manager, Projects Manager, Procurement Manager, Procurement, Manager, Owner"],
    ],
    [2600, 6426],
  ),
  spacer(120),
  rich(["Everyone else sees ", B("only the requests they raised themselves.")]),
  spacer(120),

  h2("2.4 What happens if you don't"),
  table(
    ["If this is not done", "What happens"],
    [
      [
        "You don't name a supplier on a line",
        [B("The request cannot be sent to Finance."), " The screen says so from the moment you add items — you do not have to wait until you press Send. Fix: pick a supplier from the register, or type the name."],
      ],
      [
        "You type a supplier who is not on the register",
        ["Still blocked, but with a cheaper fix: ", B("add them to the supplier register"), ", or record one set of comparison prices. Either one clears it."],
      ],
      [
        "The request is K1,000,000 or more",
        ["Comparison prices are the ", B("only"), " way through. Use Record comparison prices on the request itself."],
      ],
      [
        "You don't set a cost code",
        ["Nothing blocks — the system works it out. But if it cannot find a match, the spend charges ", B("unplanned / contingency"), ", so it will not appear against the work it was actually for."],
      ],
      [
        "Procurement prices it but never presses Send to Finance",
        ["The request sits in ", B("Pricing"), " indefinitely. This is the most common way a request goes quiet."],
      ],
      [
        "Finance approves but nobody raises the purchase order",
        ["The money is ", B("reserved"), " but never committed. The budget looks more spent than it is, and the site never gets the goods."],
      ],
      [
        "The purchase order is raised but never issued",
        "Same as above. A draft order is not an order.",
      ],
      [
        "Delivery is never confirmed",
        ["The cost never becomes ", I("actual"), ", so it never reaches the accounts."],
      ],
    ],
    [3200, 5826],
  ),
  spacer(),

  h2("2.5 How the cost code is worked out for you"),
  callout(
    "You do not need to pick a cost code",
    [
      "The system tries, in order: ",
      B("1."),
      " what you picked, if you picked one — your choice always wins. ",
      B("2."),
      " the material schedule line the item matches. ",
      B("3."),
      " the budget line the request draws against. ",
      B("4."),
      " the site's unplanned / contingency budget, as a last resort.",
    ],
    "go",
  ),
  spacer(140),
  rich(["If your request lands on contingency, that is the system telling you the item is ", B("not on the site's material schedule"), ". That is usually true, and worth knowing."]),
  rich([B("Office and IT requests have no project"), ", so they charge a cost centre (IT or Head Office) instead of a cost code. That is correct, not a gap."]),
  spacer(120),

  h2("2.6 How long each stage should take"),
  table(
    ["Stage", "Counted as late after"],
    [
      ["Waiting for approval", "2 days"],
      ["Waiting for pricing", "2 days"],
      ["Purchase order waiting to be issued", "1 day"],
      ["Approved but not yet ordered (a reservation)", "60 days, or as soon as the needed-by date is 30 days past"],
    ],
    [4200, 4826],
  ),
  spacer(120),
  p("Escalations go to the person whose queue the item is sitting in, then to their manager."),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── 3. Material schedules ──────────────────────────────────────────────────
const s3 = [
  h1("3. Material schedules"),
  p("The list of everything a project is planned to consume, with quantities. It is the thing that makes planned-versus-actual possible."),

  h2("3.1 The steps"),
  numbered([B("Draft"), " — the Quantity Surveyor, Engineer, Engineering Manager or Projects Manager writes the schedule and its lines."]),
  numbered([B("Pricing"), " — the QS submits it; Procurement attaches unit rates and transport estimates per line."]),
  numbered([B("Priced"), " — prices are on."]),
  numbered([B("Issued"), " — the Projects Manager, QS, GM or MD locks it in. This is what generates the project budget."]),
  spacer(140),

  callout(
    "Read this section even if you read nothing else",
    [
      "As of 19 August 2026 the material schedules are effectively ",
      B("empty"),
      " — ten schedules exist, only one has been issued, and it has no lines on it. The consequence, measured on the live system: ",
      B("465 of 468 request line items — K2.26 million — charge unplanned / contingency"),
      ", because there is no schedule line to match them to. Only three items in the entire company charge real work.",
    ],
    "stop",
  ),
  spacer(140),
  rich(["Nothing is broken and nothing is lost — the money is all recorded. But until the schedules are populated, the system can tell you ", B("how much"), " was spent and ", B("not what on"), "."]),
  spacer(120),

  h2("3.2 Who can do what"),
  table(
    ["Action", "Roles"],
    [
      ["Create and edit", "Quantity Surveyor, Engineer, Engineering Manager, Projects Manager, GM, MD, Manager, Owner"],
      ["Price it", "Procurement Manager, Procurement, Procurement Assistant"],
      ["Issue it", "Projects Manager, Quantity Surveyor, GM, MD, Manager, Owner"],
      ["Archive it", "The above, plus Operations Manager"],
    ],
    [2600, 6426],
  ),
  spacer(120),

  h2("3.3 What happens if you don't"),
  table(
    ["If this is not done", "What happens"],
    [
      ["No schedule is created", "Every request on that site charges contingency. Variance reporting is impossible."],
      ["A schedule is drafted but never priced", "Requests can still match against it, but no budget is generated."],
      ["A schedule is priced but never issued", [B("No project budget is created."), " Issuing is what generates it."]],
      ["A schedule line has no cost code", "Requests matching that line inherit nothing and fall through to contingency."],
    ],
    [3200, 5826],
  ),
  spacer(140),
  callout(
    "When you do populate the schedules",
    "Existing requests will not reclassify themselves. Ask the developer to run the re-derivation pass, which moves contingency-coded items onto their proper schedule lines. It only touches items sitting on contingency — anything coded deliberately is left alone.",
  ),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── 4. Project budgets ─────────────────────────────────────────────────────
const s4 = [
  h1("4. Project budgets"),
  p("Saying what a project is allowed to spend, per kind of work, so that overspend is visible while it is happening rather than afterwards."),

  h2("4.1 The four states"),
  table(
    ["State", "What it means"],
    [
      [B("Draft"), ["A plan somebody is writing. ", B("It controls nothing.")]],
      [B("Active"), "Live. This is what spend is measured against. One per site."],
      [B("Locked"), "Closed to edits, still measuring."],
      [B("Archived"), "Superseded."],
    ],
    [2000, 7026],
  ),
  spacer(140),
  callout(
    "A draft budget does not measure anything",
    [
      "It is shown on screen as ",
      I("planned"),
      ", so you can see the figure — but no control, band or report treats it as funding. ",
      B("Activation is the moment a plan starts governing."),
    ],
    "warn",
  ),
  spacer(140),

  h2("4.2 The steps"),
  numbered([B("Create the budget"), " for the site."]),
  numbered([B("Add lines"), ", each with an amount and a cost code. A line without a cost code cannot be saved."]),
  numbered([B("Activate it.")]),
  numbered(["On activation the system ", B("links every open request on that site"), " to the budget, codes any uncoded items, and tells you what it did."]),
  spacer(140),

  h2("4.3 Who can do what"),
  table(
    ["Action", "Roles"],
    [
      ["Create a budget", "Finance Manager, Accountant, Quantity Surveyor, Projects Manager, GM, MD, Manager, Owner"],
      ["Add / edit lines", "Finance Manager, GM, MD, Manager, Owner"],
      ["Activate", "Finance Manager, GM, MD, Manager, Owner"],
      ["Lock / archive", "Finance Manager, GM, MD, Owner"],
      ["View", "Operations Manager, Projects Manager, Procurement Manager, Procurement, Quantity Surveyor, Accountant, plus all of the above"],
    ],
    [2600, 6426],
  ),
  spacer(120),

  h2("4.4 What happens if you don't"),
  table(
    ["If this is not done", "What happens"],
    [
      ["The budget is left in draft", [B("Nothing is measured."), " Every request on that site reports as unfunded, and Finance gets a “record why” prompt on every approval. The budget-health panel lists exactly which sites are in this state."]],
      ["A budget line has no cost code", "Money on that line is invisible to every band, roll-up and variance report. The system refuses to activate a budget in this state, and names the lines."],
      ["No contingency amount is set", "Off-schedule spend has nothing to be measured against. You will get “record why it is needed” on every such request, indefinitely."],
      ["Two budgets active on one site", "Cannot happen. Lock or archive the old one first."],
    ],
    [3200, 5826],
  ),
  spacer(),

  h2("4.5 The spending bands"),
  p("When Finance approves a cost, the system reports where that leaves the budget."),
  table(
    ["Band", "When", "What happens"],
    [
      [{ text: "OK", bold: true, color: GO }, "Under 90% used", "Approve normally"],
      [{ text: "Warning", bold: true, color: WARN }, "Over 90%", "Shown, no extra step"],
      [{ text: "Record why", bold: true, color: WARN }, "Over 100%", "Approval allowed, but a reason is required. Finance Manager is notified."],
      [{ text: "Escalate", bold: true, color: STOP }, "Over 110%, or no live budget", "Approval allowed, and the MD and GM are notified."],
    ],
    [1700, 2400, 4926],
  ),
  spacer(140),
  callout(
    "Spend is never blocked",
    "It is made visible. That is deliberate — blocking a site mid-pour helps nobody. One exception: the contingency line asks for a reason rather than escalating, even when it is unfunded. Off-schedule spend legitimately lands there all day, and an escalation that fires on everything is one people learn to ignore.",
  ),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── 5. Loans ───────────────────────────────────────────────────────────────
const s5 = [
  h1("5. Loans"),
  p("Tracking money the company has borrowed, what it owes, and what it has repaid."),
  callout(
    "A loan is not a bill",
    [
      "The principal you borrow is a ",
      B("liability"),
      ", not an expense. When you repay, the ",
      B("principal"),
      " portion reduces what you owe and only the ",
      B("interest"),
      " portion is a cost. This is why loan instalments never appear as payment requests — recording them that way would double-count the money and overstate your costs.",
    ],
    "stop",
  ),
  spacer(140),

  h2("5.1 The steps"),
  numbered([B("Add the provider"), " — the bank or lender."]),
  numbered([B("Create the facility"), " — amount, rate, term, and whether interest is flat or reducing balance."]),
  numbered([B("Record the drawdown"), " when the money arrives. This posts to the accounts."]),
  numbered([B("Record each repayment."), " The system splits principal from interest for you."]),
  spacer(140),
  callout(
    "Flat versus reducing balance is not a detail",
    ["On the same nominal rate, the two can differ by roughly ", B("80%"), " in total interest. Pick the one the agreement actually says."],
    "warn",
  ),
  spacer(140),

  h2("5.2 Who can do what"),
  table(
    ["Action", "Roles"],
    [
      ["View loans", "MD, Owner, GM, Finance Manager, Accountant, Operations Manager"],
      ["Create / edit a facility", "MD, Owner, Finance Manager, Operations Manager"],
      ["Record a repayment", "MD, Owner, Finance Manager, Accountant"],
    ],
    [2600, 6426],
  ),
  spacer(120),
  p("Recording a repayment moves cash and posts a ledger entry, so it is deliberately limited to Finance — Operations can set a loan up but cannot post against it."),
  spacer(120),

  h2("5.3 What happens if you don't"),
  table(
    ["If this is not done", "What happens"],
    [
      ["A repayment is not recorded", "The balance stays too high, and arrears are flagged against you incorrectly."],
      ["The drawdown is not recorded", "The cash appears in the bank with no matching liability. The accounts will not balance."],
      ["The wrong interest basis is chosen", "Every projected figure for that loan is wrong, by a lot."],
      ["A missed instalment", "The daily sweep catches it and flags arrears — the one thing here nobody would otherwise discover by opening a page."],
    ],
    [3200, 5826],
  ),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── 6. Payment requests ────────────────────────────────────────────────────
const s6 = [
  h1("6. Payment requests"),
  p("Paying suppliers and other bills."),
  table(
    ["#", "Stage", "Who"],
    [
      ["1", "Draft", "Finance, Operations Manager, Projects Manager, Procurement Manager, Procurement, Quantity Surveyor, Accountant"],
      ["2", "Submitted", "The creator"],
      ["3", "Finance review", "Finance Manager, Accountant, GM, MD"],
      ["4", "Approved", "Finance Manager, GM, MD, Owner"],
      ["5", "Paid", "Finance Manager, MD, Owner"],
    ],
    [500, 2200, 6326],
  ),
  spacer(140),
  callout(
    "Currently 14 of 15 payment requests are stuck at “submitted”",
    "Nothing in the system has ever been marked paid. If a supplier has been paid from the bank but the request is not marked paid here, your payables are overstated by that amount.",
    "warn",
  ),
  spacer(140),
  p("A payment request is flagged as late after 2 days at any stage."),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── 7. How the money moves ─────────────────────────────────────────────────
const s7 = [
  h1("7. How the money moves behind the scenes"),
  p("You do not operate this, but understanding it explains most “why does the report say that?” questions. Every cost moves through stations, and each one relieves the last so nothing is counted twice."),
  table(
    ["Station", "When it happens", "What it means"],
    [
      [B("Reserved"), "Finance approves the cost", "Funds are held. Nothing is ordered yet."],
      [B("Committed"), "The purchase order is issued", "The company is contractually on the hook."],
      [B("Accrued"), "Goods received, invoice not yet in", "The cost is real but unbilled."],
      [B("Actual"), "Delivery confirmed", "The cost has landed."],
      [B("Paid"), "Money has left", "Settled."],
      [B("Released"), "Cancelled", "Funds go back to the budget."],
    ],
    [1800, 3200, 4026],
  ),
  spacer(140),
  callout(
    "Why a budget can look exhausted when it isn't",
    "Approved-but-never-ordered requests hold a reservation. If Procurement never raises the order, that money sits reserved indefinitely. Finance can see these under “Reservations awaiting procurement” — anything over 60 days is flagged.",
  ),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── 8. Who owns what ───────────────────────────────────────────────────────
const s8 = [
  h1("8. Who owns what"),
  table(
    ["Module", "Owns the day-to-day", "Approves", "Sees everything"],
    [
      ["Material requests", "Site teams, Procurement", "Projects Manager, then Operations Manager, then MD over K25,000", "MD, GM, Operations, Projects, Procurement"],
      ["Pricing", "Procurement", "—", "Procurement, leadership"],
      ["Cost approval", "Finance", "Finance Manager, Accountant", "Finance, leadership"],
      ["Material schedules", "Quantity Surveyor, Engineering", "Projects Manager / QS issue it", "Commercial, Engineering, leadership"],
      ["Project budgets", "Finance", "Finance Manager, GM, MD", "Finance, Commercial, Operations, leadership"],
      ["Loans", "Finance", "Finance Manager, MD", "Finance, MD, GM, Operations"],
      ["Payment requests", "Finance", "Finance Manager, GM, MD", "Finance, leadership"],
    ],
    [1900, 2200, 2600, 2326],
  ),
  new Paragraph({ children: [new PageBreak()] }),
];

// ── 9 + 10 ─────────────────────────────────────────────────────────────────
const s9 = [
  h1("9. The five things most likely to go wrong"),
  p("Ranked by how often they actually happened in the first three months of use."),
  numbered([B("A request stops at Pricing."), " Procurement saves prices but never presses Send to Finance. Check the Pricing queue weekly."]),
  numbered([B("A budget stays in draft."), " It looks finished, so nobody activates it — and it measures nothing until they do."]),
  numbered([B("Nobody raises the purchase order after Finance approves."), " The money is reserved and the site waits."]),
  numbered([B("A schedule is never issued"), ", so no budget is generated and every request charges contingency."]),
  numbered([B("Payment requests are submitted and never reviewed."), " They do not chase themselves beyond the 2-day flag."]),
  spacer(140),
  callout("Every one of these is now visible on a screen", "None of them was before.", "go"),
  spacer(200),

  h1("10. Where to look when something seems wrong"),
  table(
    ["Question", "Where to look"],
    [
      ["“Why is my request stuck?”", "Open it — the banner says exactly what is blocking it and what clears it"],
      ["“Where has the money gone on this site?”", "Project Budgets, then the site's budget"],
      ["“What is late?”", "Your inbox / My Queue"],
      ["“Why does this charge contingency?”", "The item's cost code badge — it means no schedule line matched"],
      ["“Is the accounting complete?”", "Finance, then Cost subledger and general ledger. Zero unposted is healthy"],
      ["“What is wrong with our budgets?”", "Project Budgets, then the health panel at the top"],
    ],
    [3400, 5626],
  ),
];

// ── Document ───────────────────────────────────────────────────────────────
const doc = new Document({
  creator: "Pymble Construction Limited",
  title: "Pymble Ops Workbook",
  description: "Operations workbook for PCL staff",
  styles: {
    default: {
      document: { run: { font: BODY_FONT, size: 20, color: INK } },
    },
    paragraphStyles: [
      {
        id: "Normal",
        name: "Normal",
        run: { font: BODY_FONT, size: 20, color: INK },
        paragraph: { spacing: { after: 140, line: 276 } },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "wb-bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 460, hanging: 260 } } },
          },
          {
            level: 1,
            format: LevelFormat.BULLET,
            text: "–",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 900, hanging: 260 } } },
          },
        ],
      },
      {
        reference: "wb-steps",
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 460, hanging: 260 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
        titlePage: true,
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { after: 80 },
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 6 } },
              children: [
                new TextRun({
                  text: "Pymble Construction Limited  ·  Operations Workbook",
                  font: BODY_FONT,
                  size: 16,
                  color: FAINT,
                }),
              ],
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
      children: [
        ...cover,
        ...contents,
        ...s1,
        ...s2,
        ...s3,
        ...s4,
        ...s5,
        ...s6,
        ...s7,
        ...s8,
        ...s9,
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(process.argv[2], buf);
  console.log("written", process.argv[2], buf.length, "bytes");
});
