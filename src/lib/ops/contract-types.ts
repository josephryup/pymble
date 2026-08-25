/**
 * Contract types, kept in their own module with no server imports so client
 * components can pull them without dragging the service-role Supabase client
 * into a browser bundle.
 *
 * One rule runs through every type here: no shape that can reach a client
 * component carries an R2 key. Signature specimens are private (see
 * contract-signatures.ts), and the cheapest way to keep them private is for the
 * client-facing types to have nowhere to put the key.
 */

export type OpsContractKind = "subcontract" | "employment";

export type OpsContractStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "issued"
  | "signed"
  | "active"
  | "completed"
  | "terminated"
  | "cancelled";

export type OpsContractMilestoneStatus =
  | "pending"
  | "certified"
  | "invoiced"
  | "paid";

export type OpsContractSignatoryRole =
  | "hr"
  | "general_manager"
  | "managing_director"
  | "counterparty"
  | "witness_internal"
  | "witness_counterparty";

export type OpsContractSignatureStatus = "pending" | "signed" | "declined";

export type OpsContractCounterpartyType = "subcontractor" | "employee";

/**
 * The two columns that together decide whether a contract is about a PERSON.
 *
 * They were independent until 2026-08-25, and every privacy gate in the module
 * read only `kind`. That let a subcontract-kind contract point at an employee:
 * the row passed `contracts_counterparty_exactly_one` (which only ties
 * counterparty_type to whichever id column is populated), collected the
 * employee's name, phone and email into counterparty_snapshot at approval, and
 * was then readable by every commercial role — quantity surveyor, procurement,
 * accountant — because none of the gates looked at counterparty_type.
 *
 * Gates now take the pair, never one half of it.
 */
export type OpsContractSubject = {
  kind: OpsContractKind;
  counterparty_type: OpsContractCounterpartyType;
};

/** Is this contract about a person rather than a company? */
export function isOpsPersonalContract(subject: OpsContractSubject) {
  return subject.kind === "employment" || subject.counterparty_type === "employee";
}

/**
 * The two halves must agree. Enforced in the database by
 * `contracts_kind_matches_counterparty`; checked here too so the action layer
 * can refuse with a sentence rather than a constraint-violation string.
 */
export function isOpsContractSubjectConsistent(subject: OpsContractSubject) {
  return (subject.kind === "employment") === (subject.counterparty_type === "employee");
}

/** Frozen at issue so a later register edit cannot rewrite an executed agreement. */
export type OpsContractCounterpartySnapshot = {
  name?: string;
  address?: string;
  tpin?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  registration_number?: string;
};

export type OpsContractRemunerationAllowance = {
  label: string;
  amount: number;
};

/**
 * The remuneration schedule the employment template's clause refers to.
 *
 * Every figure is computed by computeStaffPayslip — the same function the
 * payroll run uses — so the contract cannot promise one net while the payslip
 * pays another. Stored on contracts.remuneration_snapshot, frozen at approval.
 *
 * `frozen` is not stored: it is true when the values came from the snapshot and
 * false when they were computed live for a draft, which is a statement about
 * THIS read rather than about the record.
 */
export type OpsContractRemuneration = {
  /** Which employee_contracts row these figures came from. */
  source_employee_contract_id: string;
  source_contract_number: string;
  pay_frequency: string;
  leave_rate_per_month: number;

  /** Earnings. basic + housing + other_allowances equals gross. */
  basic: number;
  housing: number;
  other_allowances: number;
  allowance_items: OpsContractRemunerationAllowance[];
  gross: number;

  /** False for an engagement that is not employment for tax purposes. */
  statutory_applies: boolean;
  paye: number;
  napsa_employee: number;
  napsa_employer: number;
  nhima_employee: number;
  nhima_employer: number;
  wcf_employer: number;
  total_deductions: number;
  net: number;
  /** Gross plus the employer-side contributions. What the person actually costs. */
  employer_total_cost: number;

  /** Which ZRA rate year was applied, and the line to print under the schedule. */
  tax_year: number;
  citation: string;
  computed_at: string;

  /** True when read from the snapshot rather than recomputed. Never stored. */
  frozen: boolean;
};

export type OpsContractTemplate = {
  id: string;
  template_code: string;
  name: string;
  kind: OpsContractKind;
  version: number;
  is_active: boolean;
  description: string;
  default_vat_percent: number;
  default_retention_percent: number;
  default_penalty_percent_per_week: number;
  default_penalty_cap_percent: number;
  default_warranty_months: number;
  default_defects_liability_months: number;
  default_variation_threshold_percent: number;
  default_payment_terms_days: number;
  requires_legal_review: boolean;
  legal_reviewed_at: string | null;
  legal_review_note: string;
  created_at: string;
  updated_at: string;
};

export type OpsContractTemplateClause = {
  id: string;
  template_id: string;
  section_key: string;
  heading: string;
  body_markdown: string;
  sort_order: number;
  is_required: boolean;
  is_editable: boolean;
};

export type OpsContractScopeItem = {
  id: string;
  contract_id: string;
  sort_order: number;
  heading: string;
  detail: string;
};

export type OpsContractLine = {
  id: string;
  contract_id: string;
  sort_order: number;
  description: string;
  quantity: number;
  uom: string;
  rate: number;
  amount: number;
  cost_code_id: string | null;
};

export type OpsContractMilestone = {
  id: string;
  contract_id: string;
  sort_order: number;
  label: string;
  percent: number;
  amount: number;
  trigger_description: string;
  payable_within_days: number;
  is_retention: boolean;
  status: OpsContractMilestoneStatus;
  certified_at: string | null;
  certified_by: string | null;
  /** The payable raised on certification. The live money link. */
  payment_request_id: string | null;
  /** Superseded by payment_request_id — subcontractor_payments never reached the GL. */
  subcontractor_payment_id: string | null;
  release_due_date: string | null;
  notes: string;
};

export type OpsContractClause = {
  id: string;
  contract_id: string;
  section_key: string;
  heading: string;
  body_markdown: string;
  sort_order: number;
  is_required: boolean;
  is_customised: boolean;
  /**
   * What the template said when this clause was copied. The approval screen
   * diffs the live body against this so "customised" is a thing a reviewer can
   * act on rather than a flag nobody can interpret.
   */
  template_body_snapshot: string;
};

/**
 * A signature row as the UI is allowed to see it.
 *
 * `signature_r2_key` from the database row is deliberately ABSENT. The mark is
 * composited into the PDF server-side; nothing in the browser ever receives a
 * pointer to the image. `has_mark` tells the UI whether a mark was applied
 * without telling it where the mark lives.
 */
export type OpsContractSignature = {
  id: string;
  contract_id: string;
  signatory_role: OpsContractSignatoryRole;
  sequence: number;
  is_required: boolean;
  assigned_user_id: string | null;
  status: OpsContractSignatureStatus;
  signed_by_user_id: string | null;
  signed_name: string;
  signed_title: string;
  has_mark: boolean;
  signed_at: string | null;
  decline_reason: string;
  verification_code: string | null;
  /**
   * False when the contract has been edited since this signature was taken —
   * the stored document hash no longer matches a fresh render. Computed, never
   * stored, because it is a statement about the CURRENT document.
   */
  matches_current_document: boolean | null;
};

export type OpsContract = {
  id: string;
  contract_number: string;
  template_id: string | null;
  template_version: number | null;
  kind: OpsContractKind;
  status: OpsContractStatus;
  counterparty_type: OpsContractCounterpartyType;
  subcontractor_id: string | null;
  employee_id: string | null;
  counterparty_snapshot: OpsContractCounterpartySnapshot;
  work_order_number: string;
  work_order_date: string | null;
  site_id: string | null;
  assignment_id: string | null;
  cost_code_id: string | null;
  title: string;
  preamble: string;
  scope_summary: string;
  currency_code: string;
  subtotal: number;
  vat_applicable: boolean;
  vat_percent: number;
  vat_amount: number;
  total_value: number;
  roe_reference: string;
  retention_percent: number;
  penalty_percent_per_week: number;
  penalty_cap_percent: number;
  variation_threshold_percent: number;
  warranty_months: number;
  defects_liability_months: number;
  min_workers: number;
  payment_terms_days: number;
  /** Employment terms. Zero/empty on a subcontract, which does not own them. */
  job_title: string;
  place_of_work: string;
  probation_months: number;
  notice_period_days: number;
  annual_leave_days: number;
  hours_per_week: number;
  /** The employee_contracts row this contract draws its pay from. */
  employee_contract_id: string | null;
  /** NULL inherits the employee's standing setting. */
  statutory_contributions_apply: boolean | null;
  start_date: string | null;
  end_date: string | null;
  duration_days: number;
  expected_start_date: string | null;
  expected_finish_date: string | null;
  approved_at: string | null;
  approved_by: string | null;
  issued_at: string | null;
  issued_by: string | null;
  signed_at: string | null;
  signed_document_id: string | null;
  terminated_at: string | null;
  termination_reason: string;
  completed_at: string | null;
  /** Committed cost entry raised at approval; null when there is no site to commit against. */
  commitment_cost_entry_id: string | null;
  parent_contract_id: string | null;
  addendum_number: number | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  /** Joined for the register list. */
  counterparty_name: string;
  site: { id: string; code: string; name: string } | null;
  template_name: string;
  /**
   * True while the template's clause wording has not been reviewed by counsel.
   * Such a contract can be drafted and previewed but never approved, so it
   * cannot reach signature on unvetted terms.
   */
  template_requires_legal_review: boolean;
};

export type OpsContractDetail = OpsContract & {
  /**
   * The pay schedule, or null when there is none to show. Attached by
   * fetchOpsContractById AFTER the visibility gate — never widened into
   * OpsContract itself, so a list read cannot carry pay figures by accident.
   */
  remuneration: OpsContractRemuneration | null;
  scope_items: OpsContractScopeItem[];
  lines: OpsContractLine[];
  milestones: OpsContractMilestone[];
  clauses: OpsContractClause[];
  signatures: OpsContractSignature[];
};

/**
 * What the profile page is told about your own signature specimen. Note the
 * absence of the R2 key here too: even the owner's browser has no reason to
 * learn the storage path, and /api/ops/signature/me needs no parameter.
 */
export type OpsSignatureSpecimenMeta = {
  has_specimen: boolean;
  specimen_name: string;
  content_type: string;
  byte_size: number;
  updated_at: string | null;
};

export const OPS_CONTRACT_STATUS_LABELS: Record<OpsContractStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  issued: "Issued",
  signed: "Signed",
  active: "Active",
  completed: "Completed",
  terminated: "Terminated",
  cancelled: "Cancelled",
};

export const OPS_CONTRACT_SIGNATORY_LABELS: Record<
  OpsContractSignatoryRole,
  string
> = {
  hr: "Human Resources",
  general_manager: "General Manager",
  managing_director: "Managing Director",
  counterparty: "Counterparty",
  witness_internal: "Witness (Pymble)",
  witness_counterparty: "Witness (Counterparty)",
};

/**
 * Where a contract of this kind lives.
 *
 * Two routes, one engine (decision D2). The kind is decided by the ROUTE rather
 * than by a dropdown, which is also what makes a mismatched kind/counterparty
 * pair unconstructible from the UI — see OpsContractSubject.
 *
 * `/ops/hr/contracts` sits in the `hr` module group, which is in
 * SENSITIVE_MODULE_GROUPS, so an IT Manager cannot widen access to employment
 * contracts. Under `operations` they could.
 */
export const OPS_CONTRACT_ROUTES: Record<OpsContractKind, string> = {
  subcontract: "/ops/contracts",
  employment: "/ops/hr/contracts",
};

export function opsContractHref(kind: OpsContractKind, contractId?: string) {
  const base = OPS_CONTRACT_ROUTES[kind];
  return contractId ? `${base}/${contractId}` : base;
}

/**
 * Which sections belong to which kind of contract.
 *
 * A registry rather than `kind === "employment"` scattered through the detail
 * page, for the same reason OPS_CONTRACT_STATUS_LABELS is a registry: a
 * reviewer can read the whole rule in one place, and a new section has exactly
 * one place to declare itself. Before this existed the detail page had NO kind
 * branching at all, so an employment contract rendered retention percentages,
 * weekly penalties, defects liability and a retention-release button.
 *
 * The write side reads the same table — see assertOpsContractSectionAllowed in
 * contract-actions.ts. Hiding a field is not a gate; a Server Action takes
 * whatever FormData is posted to it.
 */
export type OpsContractSection =
  /** VAT, retention, penalties, defects liability, warranty, variation threshold. */
  | "commercial_terms"
  /** The numbered "scope of works includes, but is not limited to" list. */
  | "scope_of_works"
  /** Priced lines with cost codes, and the totals derived from them. */
  | "priced_lines"
  /** Payment milestones, certification, retention release. */
  | "milestones"
  /** Minimum workers on site. */
  | "min_workers"
  /** Job title, place of work, probation, notice, hours, leave entitlement. */
  | "employment_terms"
  /** Basic / gross / statutory / net, drawn from the linked pay record. */
  | "remuneration"
  /** Start, end, duration, expected dates. Both kinds have a programme. */
  | "programme"
  /** Clauses, signatures, revisions, addenda. Both kinds. */
  | "instrument";

const SUBCONTRACT_SECTIONS: OpsContractSection[] = [
  "commercial_terms",
  "scope_of_works",
  "priced_lines",
  "milestones",
  "min_workers",
  "programme",
  "instrument",
];

const EMPLOYMENT_SECTIONS: OpsContractSection[] = [
  "employment_terms",
  "remuneration",
  "programme",
  "instrument",
];

export const OPS_CONTRACT_KIND_SECTIONS: Record<
  OpsContractKind,
  readonly OpsContractSection[]
> = {
  subcontract: SUBCONTRACT_SECTIONS,
  employment: EMPLOYMENT_SECTIONS,
};

export function opsContractHasSection(
  kind: OpsContractKind,
  section: OpsContractSection,
) {
  return OPS_CONTRACT_KIND_SECTIONS[kind].includes(section);
}

/**
 * Which editable fields belong to which section.
 *
 * Used by the terms action to refuse a field the contract's kind does not own,
 * so a posted `retention_percent` cannot reach an employment contract even
 * though the form never renders the input.
 */
export const OPS_CONTRACT_SECTION_FIELDS: Record<
  OpsContractSection,
  readonly string[]
> = {
  commercial_terms: [
    "vat_applicable",
    "vat_percent",
    "retention_percent",
    "penalty_percent_per_week",
    "penalty_cap_percent",
    "variation_threshold_percent",
    "warranty_months",
    "defects_liability_months",
    "payment_terms_days",
    "roe_reference",
    // The works-order header. Only a subcontract has one — an employment
    // contract is not raised against a works order — so it is gated with the
    // rest of the subcontract-only fields rather than with the programme.
    "work_order_number",
    "work_order_date",
  ],
  scope_of_works: ["scope_summary"],
  priced_lines: ["cost_code_id"],
  milestones: [],
  min_workers: ["min_workers"],
  employment_terms: [
    "job_title",
    "place_of_work",
    "probation_months",
    "notice_period_days",
    "annual_leave_days",
    "hours_per_week",
  ],
  remuneration: ["employee_contract_id", "statutory_contributions_apply"],
  programme: [
    "start_date",
    "end_date",
    "duration_days",
    "expected_start_date",
    "expected_finish_date",
  ],
  instrument: ["title", "preamble", "notes", "site_id"],
};

/** The section a given editable field belongs to, or null if it is unknown. */
export function opsContractSectionForField(
  field: string,
): OpsContractSection | null {
  for (const [section, fields] of Object.entries(OPS_CONTRACT_SECTION_FIELDS)) {
    if (fields.includes(field)) return section as OpsContractSection;
  }
  return null;
}

/** Merge tokens a clause body may carry. Resolved at render time. */
export const OPS_CONTRACT_MERGE_TOKENS = [
  "org_legal_name",
  "counterparty_name",
  "contract_total",
  "duration_days",
  "warranty_months",
  "penalty_percent_per_week",
  "penalty_cap_percent",
  "variation_threshold_percent",
  "min_workers",
  "payment_terms_days",
  "retention_percent",
  "defects_liability_months",
  "site_name",
  // Employment. These are what make the Remuneration clause's "schedule to
  // this contract" a real reference rather than a dangling one.
  "job_title",
  "place_of_work",
  "probation_months",
  "notice_period_days",
  "annual_leave_days",
  "hours_per_week",
  "basic_pay",
  "housing_allowance",
  "gross_pay",
  "net_pay",
  "statutory_basis",
] as const;

export type OpsContractMergeToken = (typeof OPS_CONTRACT_MERGE_TOKENS)[number];
