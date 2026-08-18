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
  parent_contract_id: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  /** Joined for the register list. */
  counterparty_name: string;
  site: { id: string; code: string; name: string } | null;
};

export type OpsContractDetail = OpsContract & {
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
] as const;

export type OpsContractMergeToken = (typeof OPS_CONTRACT_MERGE_TOKENS)[number];
