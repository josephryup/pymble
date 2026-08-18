# Contracts Module — Subcontractor & General Foreman Agreements

**Status:** Design proposal, 2026-08-18
**Source template:** `COSTERN - 30 X & 30 X 18 - SUBCONTRACT.pdf` (Works Order / subcontract agreement, Mwembeshi warehouses)
**Goal:** HR (and Ops/QS) generate a contract from a standard template the same way payslips, quotations and POs are generated today — downloadable, editable, versioned, and wired into the register/finance spine.

---

## 1. What the attached template actually is

It is a **Works Order + subcontract agreement in one document** for an *individual* subcontractor (labour-only / trade package, materials by client). Structure:

| Block | Content | Nature |
| --- | --- | --- |
| Cover | "CONTRACT AGREEMENT BETWEEN Pymble Construction Ltd AND \<party\>", contact, W.O. No / W.O. Date | variable |
| Parties panel | FROM / TO — address, TPIN, contact name, phone, email | variable (snapshot) |
| Preamble | "We are pleased to issue this Works Order in reference to \<project\>…" | variable narrative |
| Scope of works | Numbered scope items (Setting Out & Excavation; Structural Works; Blockwork & Plastering) | variable list |
| Site notes | Variation threshold 10%, min 15 workers for 3 months ±1, PPE, holiday working | semi-variable (numbers) |
| Standing clauses | Quality of Works, Updates (daily WhatsApp), Communication (email + 48h confirmation) | fixed clause text |
| Client notes | Materials by client, daily reconciliation, lead times, contractor tools | fixed clause text |
| Priced schedule | S/NO, Description, Qty, UoM, Rate, Amount; VAT 16%; TOTAL; ROE reference | variable table |
| Other T&Cs | Fencing, NCC approval, billboard, resident civil engineer | semi-variable list |
| §1 Performance | Obligation fulfilment, comprehensive execution | fixed, name-merged |
| §2–3 Payment terms & schedule | Milestone plan: 30% mobilisation / 25% setting out & excavation / 20% columns / 20% beams & blockwork / 5% retention (1 month DLP), each "payable within 14 days" | variable milestones |
| §4 Governing law | Laws of Zambia, arbitration first | fixed |
| §5 Duration | 90 days; force majeure; penalty 0.3% per week capped at 3% | variable numbers |
| §6 Workmanship | Workforce, quality standards, regulations, QA | fixed |
| §7 Warranty | 6 months from completion certificate, workmanship only | variable months |
| §8 Entire agreement | Supersedes prior agreements | fixed |
| Execution | Both signature blocks + witness blocks + dates; expected start/finish | rendered fields |
| Every page | `INT_______` initial boxes, two per page | page furniture |

**So ~60% of the document is boilerplate clause text and ~40% is data we already hold or can hold.** That split is what makes templating viable.

### Defects in the source template to fix while we codify it
These are transcription errors in the sample, not design choices — they should not be carried into the seeded template:

1. **§1.2 references "UNO ENERGIES ZAMBIA LTD"** — leftover from a different contract. Must read Pymble Construction Limited.
2. "PYMBLE CONTRUCTION LTD" is misspelled in several places (cover §1.1, signature block).
3. **W.O. No. / W.O. Date are swapped** — the number field holds `21/04/2026`.
4. The priced table rows are misaligned: the 30×78 line carries no amount on its own row and the two amounts (170,000 / 88,000) sit against the wrong lines.
5. **VAT shows "16%" but the amount is "-"**, while TOTAL = 258,000 = the net sum. Either the party is not VAT-registered (then say "VAT not applicable — supplier not VAT registered") or VAT is due. The template must compute this, not leave it ambiguous.
6. `TOTAL 258,000 .00` — stray space.
7. The counterparty's Plot No., TPIN and Email are blank. If we require KYC before issue (recommended), the register enforces this.
8. Company address on the cover is *Plot No. 28, Muzovu Street, Kabwata* but `organization_profile` holds *31 Harry Mwangakumbula Rd, Woodlands*, and **`organization_profile.tpin` is NULL** while the template shows TPIN 2596001511. One of these is stale — the org profile must be corrected first, because every generated contract will pull from it (same source the quotation/invoice PDFs use).

---

## 2. Where it fits in what already exists

Nothing needs to be invented from scratch — the counterparty registers are already there.

| Existing | Rows today | Role in contracts |
| --- | --- | --- |
| `subcontractors` (`kind = 'company' \| 'general'`) | 9 (7 company, 2 general) | Counterparty master + KYC + `retention_percent` |
| `subcontractor_assignments` | 1 | Scope / site / agreed amount / dates — the contract's operational twin |
| `subcontractor_payments` | — | Where certified milestones become payments |
| `employees` / `employee_contracts` | 22 / 20 | Employment contracts (if the General Foreman is on payroll) |
| `hr_document_categories` (`contract` category exists) + `employee_documents` + `documents` | 8 / 7 / 23 | Where the **signed scan** is filed |
| `src/lib/ops/pdf/*` (`theme.ts`, `components.tsx`, `render.ts`) | — | The house PDF design system — reuse verbatim |
| `/api/ops/pdf/<doc>/[id]/route.ts` | 11 routes | The download pattern to copy |
| `cost_codes` spine | — | Budget/commitment linkage |

### The one real fork: what is a "General Foreman" here?

Two incompatible readings, and they lead to different tables:

- **(A) Labour subcontractor / gang leader paid per package** → he is a `subcontractors` row with `kind = 'general'` (this is exactly what that enum value already means — *"an individual / sole-trader subcontractor; company_name holds the person's name"*, e.g. PATRICK MWEENE, SOLOMON CHIRWA). The attached template fits him as-is.
- **(B) A salaried site foreman on payroll** → he is an `employees` row with an `employee_contracts` record, and the attached works-order template is the **wrong instrument** — he needs an employment contract (job title, basic pay, housing allowance, probation, leave, notice period, ZRA/NAPSA/NHIMA), which is a different clause set entirely.

**DECIDED (2026-08-18): both cases exist.** The module carries **two template kinds on one engine** from the start — `subcontract_works_order` (seeded from the attached PDF, covering company subcontractors *and* `kind='general'` individuals including gang-leader foremen) and `employment_contract` (built from the `employee_contracts` fields, which already hold basic pay, housing allowance, leave rate and probation date, for salaried foremen and staff). One `contracts` table, one PDF engine, two seeded clause sets — no rework later.

---

## 3. Data model

New tables, following the existing naming/RLS conventions (service-role-only policies, `set_updated_at` trigger, `archived_at`/`archived_by`, generated `*_number` default).

### 3.1 Template library — the "standard template"

```
contract_templates
  id, template_code (unique, e.g. 'subcontract_works_order')
  name, kind ('subcontract' | 'employment' | 'consultancy')
  version int, is_active bool          -- new version = new row, old row deactivated
  description
  default_vat_percent, default_retention_percent, default_penalty_percent_per_week,
  default_penalty_cap_percent, default_warranty_months, default_variation_threshold_percent,
  default_payment_terms_days
  created_by, created_at, updated_at

contract_template_clauses
  id, template_id -> contract_templates
  section_key ('quality_of_works', 'updates', 'communication', 'client_notes',
               'performance', 'payment_terms', 'governing_law', 'duration',
               'workmanship', 'warranty', 'entire_agreement', …)
  heading, body_markdown          -- supports {{merge_tokens}}
  sort_order, is_required bool, is_editable bool
```

Seeded as **v1 = the attached document**, cleaned of the defects in §1. `{{counterparty_name}}`, `{{org_legal_name}}`, `{{contract_total}}`, `{{duration_days}}`, `{{warranty_months}}` etc. resolve at render time.

### 3.2 The contract instance

```
contracts
  id, contract_number  default 'CT-' || YYYYMMDD || '-' || 6 hex   (matches EC-/PA- convention)
  template_id, template_version_snapshot
  kind ('subcontract' | 'employment')
  status  ops_contract_status enum:
          draft → in_review → approved → issued → signed → active → completed
                                                        ↘ terminated / cancelled
  -- counterparty (exactly one populated, enforced by CHECK)
  counterparty_type ('subcontractor' | 'employee')
  subcontractor_id -> subcontractors, employee_id -> employees
  counterparty_snapshot jsonb   -- name, address, tpin, contact name/phone/email at issue
  org_snapshot        jsonb     -- org profile at issue (same shape as PymblePdfOrgSnapshot)
  -- work order header
  work_order_number, work_order_date
  site_id -> sites, assignment_id -> subcontractor_assignments, cost_code_id -> cost_codes
  title, preamble, scope_summary
  -- commercial
  currency default 'ZMW', subtotal, vat_percent, vat_amount, total_value,
  vat_applicable bool, roe_reference,
  retention_percent, penalty_percent_per_week, penalty_cap_percent,
  variation_threshold_percent, warranty_months, defects_liability_months,
  min_workers, payment_terms_days
  -- programme
  start_date, end_date, duration_days,
  expected_start_date, expected_finish_date
  -- execution
  issued_at, issued_by, signed_at, signed_by_name, witness_name,
  signed_document_id -> documents        -- the uploaded countersigned scan
  generated_pdf_r2_key                   -- immutable archive of what was issued
  notes, created_by, created_at, updated_at, archived_at, archived_by

contract_lines                 -- the priced schedule
  id, contract_id, sort_order, description, quantity, uom, rate, amount,
  cost_code_id -> cost_codes

contract_milestones            -- the payment plan
  id, contract_id, sort_order, label, percent, amount,
  trigger_description, payable_within_days, is_retention bool,
  status ('pending' | 'certified' | 'invoiced' | 'paid'),
  certified_at, certified_by,
  subcontractor_payment_id -> subcontractor_payments   -- the money link
  CHECK: sum(percent) = 100 enforced in the action layer

contract_clauses               -- the per-contract *editable copy* of template clauses
  id, contract_id, section_key, heading, body_markdown,
  sort_order, is_customised bool          -- true once HR edits it away from template

contract_scope_items           -- the numbered "Scope of works includes…" list
  id, contract_id, sort_order, heading, detail

contract_revisions             -- full-record audit / restore points
  id, contract_id, revision_no, snapshot jsonb, changed_by, change_summary, created_at
```

**Why snapshots.** A contract must not silently change when someone edits the subcontractor register or the org profile a year later. Copy the counterparty and org details onto the contract at issue, exactly as `QuotationPdf` already receives an `org` object rather than reading globals.

---

## 4. "Editable" — three distinct meanings, all worth supporting

The word covers three things; be explicit about which you want (see §9).

**(a) Editable in-system before issue — the primary answer. DECIDED (2026-08-18): full clause editing.**
Every field, every scope item, every priced line, every milestone and every clause body is a form field while `status = 'draft'`. Clause bodies default from the template but are per-contract rows, so HR can rewrite "Updates" for a client who doesn't use WhatsApp without touching the master template. `is_customised` flags any clause that has drifted, and the approval screen shows a **diff against the template version** for every customised clause so the approver sees the exact wording change rather than a flag. Clauses may also be added (`section_key = 'custom_N'`) or removed unless `is_required` is set on the template clause — `governing_law`, `entire_agreement` and `warranty` stay required. After `issued`, the record locks; changes require an **addendum** (a child contract with `parent_contract_id`, rendered as "Addendum No. N") — which is how variations above the 10% threshold should be handled anyway.

**(b) Downloadable PDF — the deliverable.**
`SubcontractAgreementPdf.tsx` in `src/lib/ops/pdf/`, using `PYMBLE_PDF_THEME` and the shared `components.tsx` header/table/footer, served from `GET /api/ops/pdf/contract/[id]` following the `quotation` route exactly (auth → permission check → fetch → render → `recordOpsAuditEvent` → `pdfResponseHeaders`). Adds two template-specific bits of furniture:
- the `INT______` initial boxes as a **fixed footer** (`fixed` prop on `<View>` in react-pdf) so they land on every page automatically;
- signature + witness blocks with `wrap={false}` so they never split across a page break.
On issue, the rendered bytes are archived to R2 via the existing `putOpsR2Object` so "what we actually sent" is immutable, matching the loans/payslip philosophy.

**(c) Downloadable as an editable Word file — supported, but as a controlled export.**
Add the `docx` npm package and a `GET /api/ops/docx/contract/[id]` route generating the same content as a `.docx`. Guard rails: stamp it `WORKING COPY — NOT THE SYSTEM RECORD` in the header, and audit the download. HR edits offline, gets it signed, then uploads the signed scan back against the contract (`signed_document_id`), which is what the register actually cares about. **Do not attempt DOCX round-trip import** — parsing an edited Word file back into structured clauses is a rabbit hole with no payoff; edits belong in (a).

---

## 5. Workflow, permissions and notifications

```
HR / Ops drafts  ──▶  QS or Ops Manager reviews commercials  ──▶  MD/GM approves
                                                                       │
                                        issue (PDF locked + archived)  ▼
                                            ├─ notify counterparty contact by email (Resend)
                                            └─ upload countersigned scan ⇒ status 'signed' ⇒ 'active'
```

- **Approval threshold:** reuse the existing PO threshold logic — contracts above the configured value (K8M today) require MD sign-off; below it, GM/Ops Manager. Do not invent a second threshold constant.
- **Permissions:** new `src/lib/ops/contract-permissions.ts` mirroring `subcontractor-permissions.ts`. Draft/edit: HR, Ops Manager, Projects Manager, QS, Procurement Manager. Approve: MD/GM/Owner. View: the subcontractor `VIEWER_ROLES` set plus HR. Register the module in `OPS_MODULES` (`id: 'contracts'`, `href: '/ops/contracts'`) so `ops_module_role_access` can override it from `/ops/it/module-access` without a deploy.
- **Notifications:** `notifyOpsWorkflowEvent` on submit-for-review, approve, issue, signature-received, and **expiry/warranty warnings** (contract end date approaching, DLP retention release due, warranty expiring). The expiry sweep is the highest-value automation here — retention releases are exactly what gets forgotten.
- **Audit:** `recordOpsAuditEvent` on create / edit / approve / issue / download / terminate, `moduleKey: 'contracts'`.

---

## 5A. Digital signatures (DECIDED 2026-08-18)

Approvers sign the document *in the system*: HR, the General Manager and the Managing Director each click **Sign**, and their own uploaded signature mark is stamped onto the contract PDF. Each person's signature image is private to them — nobody else can view, download or apply it.

### The privacy rule, stated precisely

There are two different things and only one of them is private:

- **The signature specimen in the library is private to its owner.** No leadership bypass, no developer bypass, no admin view. This deliberately breaks the pattern used by `documents` (where owner + developer bypass every visibility tier) — a signature is not a document, it is the means of authenticating one, and an admin who can view it can forge with it.
- **The applied mark on a signed contract is visible to whoever can view that contract.** That is inherent to signing something. What we prevent is anyone *lifting the image to reuse it elsewhere*.

Enforcement, in layers:

1. **The API cannot express the request.** The serving route is `GET /api/ops/signature/me` — there is no `[userId]` parameter, so there is no URL that asks for someone else's specimen. (Contrast `/api/ops/avatar/[userId]`, which is correctly open to all staff.)
2. **RLS on `user_signatures` is `user_id = private.current_user_id()`** for select — not a role list. Even a direct authenticated query returns nothing for anyone else.
3. **The mark is never sent to a browser as an asset during rendering.** `ContractAgreementPdf` receives the bytes server-side and embeds them as a data URL, the way `PYMBLE_LOGO_DATA_URL` already works in `theme.ts`. The signature reaches the client only as pixels flattened into a PDF page.
4. **Re-authentication at the moment of signing.** Password re-entry before the signature is applied (2FA would be better, but it is currently enrolled for nobody). A stolen session should not be able to execute a contract.

### 5A.1 The specimen library

```
user_signatures                       -- one live specimen per person
  id, user_id -> users(id) on delete cascade   UNIQUE
  r2_key, content_type, byte_size
  specimen_name          -- printed name rendered beneath the mark
  created_at, updated_at
```

Uploaded from `/ops/profile` ("My signature" card) through a Server Action that mirrors `updateMyAvatarAction` exactly: the key is derived from `profile.id` with no parameter for *whose* signature to set, so the action is scoped to the signed-in user by construction. Signature images are small (PNG/WebP, transparent background preferred, ≤ 2 MB), so the 4.5 MB Server Action ceiling is not a factor and the direct-to-R2 presigned path is unnecessary. Replacing a specimen deletes the old object, same as avatars.

Key prefix: `ops/signatures/{user_id}/{timestamp}.png` — a **new prefix**, deliberately not reusing an existing scope, so a bucket-level policy can treat it differently from evidence uploads.

### 5A.2 The signing ledger

```
contract_signatures
  id, contract_id -> contracts on delete cascade
  signatory_role  ('hr' | 'general_manager' | 'managing_director'
                   | 'counterparty' | 'witness_internal' | 'witness_counterparty')
  sequence int                  -- signing order; internal roles sign in order
  is_required bool default true
  assigned_user_id -> users     -- who is expected to sign (null for counterparty)
  status ('pending' | 'signed' | 'declined')
  signed_by_user_id -> users
  signed_name, signed_title     -- snapshot: name and job title AT the moment of signing
  signature_r2_key              -- a COPY of the specimen taken at signing
  signed_at, decline_reason
  document_sha256               -- hash of the exact PDF bytes that were signed
  verification_code             -- short code printed beneath the mark
  signed_ip, signed_user_agent
  created_at, updated_at
  UNIQUE (contract_id, signatory_role)
```

Three details that matter more than they look:

- **`signature_r2_key` is a copy, not a pointer.** If someone re-uploads their specimen next year, contracts they signed last year must not silently change. Same reasoning as the counterparty and org snapshots in §3.2.
- **`document_sha256` binds the signature to the wording.** If the contract is later altered, the stored hash stops matching and the PDF prints *"Signature recorded against a different version of this document"* instead of presenting a mark that no longer means anything. This is what makes clause editing (D2) safe to combine with signing.

  **Correction, made during implementation:** this was specified as a hash of the rendered PDF bytes. That does not work — `@react-pdf` embeds a creation timestamp and does not guarantee stable object ordering, so two renders of an untouched contract differ and *every* signature would read as stale the moment anyone reopened the document. The hash is instead taken over a **canonical projection of the signable content** (`toOpsContractSignableContent`): parties, terms, scope items, priced lines, milestones and clause bodies, with fixed key order and fixed decimal precision. This is both stable and a truer statement of what a signatory assented to — changing a margin or a logo is not a change of agreement; rewording an indemnity clause is.
- **`signed_title` is snapshotted** because people change roles. A contract signed by someone who was General Manager in 2026 must still say that in 2030.

### 5A.3 The flow

```
approved  ──▶ signature rows created from the template's signatory set
                │
                ├─ 1. HR                  ┐
                ├─ 2. General Manager     ├─ each: re-auth ▸ sign ▸ mark + hash recorded
                └─ 3. Managing Director   ┘
                          │
              all required internal rows signed  ⇒  status 'issued'
                          │
              counterparty signs physically ⇒ scan uploaded ⇒ 'signed' ⇒ 'active'
```

- A person may only sign a row where `assigned_user_id` is themselves, or where their current role matches `signatory_role`. Signing on behalf of someone else is not possible through any path.
- **Declining** is a first-class outcome (`status = 'declined'` + reason), which sends the contract back to `draft` and notifies the drafter. Without it, people just don't click, and nobody knows why.
- **A signatory with no uploaded specimen is blocked at the Sign button** with a link to `/ops/profile` — better than silently rendering a name-only signature that looks like an oversight on a legal document.
- Every sign / decline raises `recordOpsAuditEvent` and `notifyOpsWorkflowEvent` to the next signatory in sequence.

### 5A.4 On the PDF

The `INT______` initial boxes stay as the fixed footer for the counterparty's wet initials. The execution block renders, per signatory: the mark image (bounded box, aspect preserved), the printed name, the job title, the timestamp in `Africa/Lusaka`, and the verification code. Unsigned required roles render as an empty ruled line — a half-signed contract must *look* half-signed.

The one legal caveat: whether these marks constitute a legally binding electronic signature in Zambia is a question for the company's lawyer, not for this document. The design records the evidence a court would ask for (who, when, what exact bytes, from where, re-authenticated) — that is the most the system can do.

---

## 6. Finance integration (this is where the value is)

The contract is the missing head of the subcontractor money chain:

```
contract (total 258,000)
   └─ contract_milestones  30% / 25% / 20% / 20% / 5% retention
         └─ certified  ⇒  subcontractor_payments (existing table)
               └─ payment_requests  ⇒  GL journal  ⇒  cost code / budget
```

- **Commitment on the budget.** On approval, post the contract total as a *commitment* against `cost_code_id` so project budgets show committed-but-unspent value. Today ~87% of spend never reaches Finance (see the project–finance spine audit); subcontract commitments are a large slice of that.
- **Retention ledger.** `retention_percent` already lives on `subcontractors`; the 5% milestone becomes a tracked retention balance with a release date (completion + DLP months), surfaced in the Finance queue.
- **Known gap to close alongside:** `subcontractor_payments` are currently *not* posted to the GL or the budget. Wiring contracts without fixing that leaves the chain broken one link from the end. Recommend doing both in the same phase.
- **Penalties:** 0.3%/week capped at 3% is computable from `end_date` vs actual completion — surface as a suggested deduction on the final certificate, never auto-applied.

---

## 7. UI

Standard workspace module, same shell/patterns as `/ops/subcontractors`:

- `/ops/contracts` — register: filters (status, kind, site, counterparty), stat tiles (draft / awaiting signature / active value / retention held), `OPS_NOTICE_*` + status-tone registry for badges (no bespoke `statusClass` functions — that migration is complete).
- `/ops/contracts/new` — wizard: **1** Kind & counterparty → **2** Site, cost code & programme → **3** Priced schedule → **4** Payment milestones (percent must total 100) → **5** Clause review (accordion, each clause editable, customised ones flagged) → **6** Preview & submit.
- `/ops/contracts/[contractId]` — tabs: Overview · Scope & pricing · Milestones · Clauses · Documents (signed scan, addenda) · Activity.
- Entry points from `/ops/subcontractors/[id]` ("Generate contract") and, for kind `employment`, from the employee record.
- `/ops/settings` or `/ops/it` — template library management (view clauses, publish a new version). New versions never mutate live contracts.

---

## 8. Suggested phasing

| Phase | Content | Notes |
| --- | --- | --- |
| **0** | Fix `organization_profile` (address + TPIN); clean the template defects in §1 | Blocks everything — every PDF inherits these |
| **1** | Migration (tables + enums + RLS + seed both v1 templates + signature tables), `contracts.ts` / `contract-actions.ts` / `contract-permissions.ts`, register + wizard + detail pages, clause editor with template diff, `ContractAgreementPdf` + download route | The core ask. Both kinds, since the engine is shared |
| **1B** | Signature specimen upload on `/ops/profile`, `/api/ops/signature/me`, sign/decline actions with re-auth + hashing, marks rendered on the PDF (§5A) | Depends only on phase 1's tables |
| **2** | Approval routing (customised clauses always visible to the approver) + notifications + signed-scan upload → `documents`, expiry/retention/warranty reminders | Makes it a workflow rather than a form |
| **3** | Milestone → `subcontractor_payments` → payment request → GL; budget commitment on `cost_code_id`; retention ledger | Closes the finance chain |
| **4** | DOCX export; addenda/variations | Nice-to-have once 1–3 are solid |

Ship 1 + 2 before touching 3 — a contract that generates and gets signed is useful on its own; a half-wired GL link is not.

---

## 9. Decisions taken and still open

### Settled 2026-08-18
- **D1 — General Foreman is both.** Two template kinds on one engine from phase 1 (§2). Salaried foremen get an employment-contract clause set; gang-leader foremen and company subcontractors get the works-order set.
- **D2 — Full clause editing.** HR may rewrite any non-required clause per contract; customised clauses are flagged and diffed against the template for the approver (§4a).

### Still open
1. **The employment-contract clause set does not exist yet.** The works-order set comes from your attached PDF; there is no equivalent source document for the salaried version. Either supply a signed employment contract to codify, or the clauses get drafted from `employee_contracts` fields + Zambian Employment Code defaults and need legal review before use.
2. **VAT default.** Individual subcontractors are typically not VAT-registered. Default `vat_applicable = false` with an explicit "VAT not applicable — supplier not VAT registered" line, or default 16% and let the drafter zero it?
3. **Who owns the template library** — HR, MD, or IT/developer only? Determines whether template editing is a `/ops/settings` page or a code-seeded fixture like the site-checklist templates.
4. **Counterparty KYC gate.** Block issue when TPIN / address / contact email are blank on the register? The sample contract went out with all three empty.
5. **Legal review.** The clause set becomes the company's standard instrument once seeded. Worth one pass by a Zambian construction lawyer before v1 is locked — particularly the penalty cap, warranty scope, and the retention/DLP interaction.
