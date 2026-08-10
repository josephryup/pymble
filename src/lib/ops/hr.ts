import { requireOpsUser } from "@/lib/ops/auth";
import { canViewOpsEmployeeDocuments, canViewOpsHr } from "@/lib/ops/hr-permissions";
import {
  buildOpsHrDocumentCoverageReport,
  type OpsHrDocumentCoverageReport,
} from "@/lib/ops/hr-reporting";
import {
  opsIlikeOrFilter,
  toOpsPaginatedResult,
  type OpsListState,
  type OpsPaginatedResult,
} from "@/lib/ops/listing";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsDocumentStatus,
  OpsDocumentVisibility,
  OpsEmployeeContractStatus,
  OpsEmployeeDocumentStatus,
  OpsEmployeeOnboardingStatus,
  OpsEmployeeStatus,
  OpsEmploymentType,
  OpsLeaveRequestStatus,
  OpsLeaveType,
  OpsPayFrequency,
  OpsPerformanceAppraisalStatus,
  OpsPriority,
  OpsRecruitmentRequisitionStatus,
  OpsSafetyTrainingStatus,
  OpsUserRole,
} from "@/lib/ops/types";

export type { OpsHrDocumentCoverageReport } from "@/lib/ops/hr-reporting";

export type OpsHrSiteSummary = {
  code: string;
  id: string;
  name: string;
};

export type OpsHrUserSummary = {
  email: string | null;
  full_name: string;
  id: string;
  role: OpsUserRole;
};

export type OpsLeaveRequestSummary = {
  approved_at: string | null;
  approved_by: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  created_at: string;
  created_by: string | null;
  days_requested: number;
  employee_id: string;
  end_date: string;
  handover_notes: string;
  id: string;
  leave_number: string;
  leave_type: OpsLeaveType;
  reason: string;
  rejected_at: string | null;
  rejection_reason: string;
  start_date: string;
  status: OpsLeaveRequestStatus;
  submitted_at: string | null;
};

export type OpsEmployeeContractSummary = {
  contract_number: string;
  contract_type: OpsEmploymentType;
  created_at: string;
  employee_id: string;
  end_date: string | null;
  id: string;
  notes: string;
  pay_frequency: OpsPayFrequency;
  probation_end_date: string | null;
  salary_amount: number;
  /** Pay structure used by the staff payslip. */
  basic_pay: number;
  housing_allowance: number;
  /** Sum of any other allowance entries; itemised list stays in the row. */
  other_allowances_total: number;
  leave_rate_per_month: number;
  signed_at: string | null;
  start_date: string;
  status: OpsEmployeeContractStatus;
  terminated_at: string | null;
  termination_reason: string;
  title: string;
};

export type OpsPerformanceAppraisalSummary = {
  appraisal_number: string;
  cancelled_at: string | null;
  completed_at: string | null;
  created_at: string;
  cycle_name: string;
  employee_id: string;
  goals: string;
  id: string;
  improvement_areas: string;
  overall_rating: number | null;
  period_end: string;
  period_start: string;
  reviewer: OpsHrUserSummary | null;
  reviewer_id: string | null;
  status: OpsPerformanceAppraisalStatus;
  strengths: string;
};

export type OpsLeaveBalanceSummary = {
  accrued_days: number;
  adjustment_days: number;
  available_days: number;
  balance_year: number;
  created_at: string;
  employee_id: string;
  id: string;
  leave_type: OpsLeaveType;
  notes: string;
  opening_balance: number;
  used_days: number;
};

export type OpsEmployeeOnboardingItemSummary = {
  cancelled_at: string | null;
  category: string;
  completed_at: string | null;
  completion_notes: string;
  created_at: string;
  created_by: string | null;
  description: string;
  due_date: string | null;
  employee_id: string;
  id: string;
  item_number: string;
  owner: OpsHrUserSummary | null;
  owner_user_id: string | null;
  status: OpsEmployeeOnboardingStatus;
  title: string;
  waived_at: string | null;
};

export type OpsEmployeeDocumentSummary = {
  category: OpsHrDocumentCategorySummary | null;
  category_id: string;
  created_at: string;
  document: {
    category: string;
    created_at: string;
    current_version_number: number;
    description: string;
    id: string;
    status: OpsDocumentStatus;
    title: string;
    uploaded_by: string | null;
    visibility: OpsDocumentVisibility;
  } | null;
  document_id: string;
  document_version_id: string | null;
  employee_id: string;
  expiry_date: string | null;
  id: string;
  review_notes: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  status: OpsEmployeeDocumentStatus;
  uploaded_by: string | null;
  version: {
    checksum_sha256: string | null;
    content_type: string;
    created_at: string;
    file_name: string;
    file_size_bytes: number;
    id: string;
    uploaded_by: string | null;
    version_number: number;
  } | null;
};

export type OpsEmployeeSummary = {
  appraisals: OpsPerformanceAppraisalSummary[];
  contracts: OpsEmployeeContractSummary[];
  created_at: string;
  department: string;
  email: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  employee_number: string;
  employment_type: OpsEmploymentType;
  end_date: string | null;
  full_name: string;
  id: string;
  job_title: string;
  leave_balances: OpsLeaveBalanceSummary[];
  leave_requests: OpsLeaveRequestSummary[];
  documents: OpsEmployeeDocumentSummary[];
  notes: string;
  /** NRC identity number shown on the staff payslip. */
  nrc_number: string;
  /** NAPSA Security number shown on the staff payslip. */
  napsa_number: string;
  tpin: string;
  onboarding_items: OpsEmployeeOnboardingItemSummary[];
  phone: string;
  site: OpsHrSiteSummary | null;
  site_id: string | null;
  start_date: string;
  status: OpsEmployeeStatus;
  updated_at: string;
  user: OpsHrUserSummary | null;
  user_id: string | null;
  worker_id: string | null;
};

export type OpsEmployeeOption = {
  employee_number: string;
  full_name: string;
  id: string;
  status: OpsEmployeeStatus;
};

export type OpsHrUserOption = {
  email: string | null;
  full_name: string;
  id: string;
  role: OpsUserRole;
};

export type OpsHrStats = {
  activeEmployees: number;
  activeContracts: number;
  approvedLeave: number;
  dueAppraisals: number;
  expiredTraining: number;
  lowLeaveBalances: number;
  onLeave: number;
  openOnboardingItems: number;
  openRecruitment: number;
  overdueOnboardingItems: number;
  submittedLeave: number;
  totalEmployees: number;
  trainingDueSoon: number;
};

export type OpsHrDashboardActionTone = "default" | "urgent" | "watch";

export type OpsHrDashboardAction = {
  detail: string;
  href: string;
  label: string;
  tone: OpsHrDashboardActionTone;
  value: number;
};

export type OpsRecruitmentRequisitionSummary = {
  approved_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  department: string;
  employment_type: OpsEmploymentType;
  filled_at: string | null;
  hiring_manager: OpsHrUserSummary | null;
  hiring_manager_id: string | null;
  id: string;
  job_title: string;
  justification: string;
  positions_count: number;
  priority: OpsPriority;
  requested_by_user: OpsHrUserSummary | null;
  requested_by: string | null;
  requisition_number: string;
  salary_range: string;
  site: OpsHrSiteSummary | null;
  site_id: string | null;
  status: OpsRecruitmentRequisitionStatus;
  target_start_date: string | null;
};

export type OpsHrDocumentCategorySummary = {
  category_code: string;
  created_at: string;
  description: string;
  id: string;
  is_active: boolean;
  is_required: boolean;
  name: string;
  retention_years: number | null;
};

export type OpsHrTrainingRenewalSummary = {
  completed_date: string | null;
  employee: {
    employee_number: string;
    full_name: string;
    id: string;
    job_title: string;
    status: OpsEmployeeStatus;
  } | null;
  employee_id: string | null;
  expiry_date: string | null;
  id: string;
  provider: string;
  site: OpsHrSiteSummary | null;
  site_id: string | null;
  status: OpsSafetyTrainingStatus;
  trainee_name: string;
  training_number: string;
  training_title: string;
  training_type: string;
};

export type OpsEmployeeSelfServiceProfile = {
  documentCategories: OpsHrDocumentCategorySummary[];
  documents: OpsEmployeeDocumentSummary[];
  employee: OpsEmployeeSummary | null;
  trainingRecords: OpsHrTrainingRenewalSummary[];
};

export function buildOpsHrDashboardActions(stats: OpsHrStats): OpsHrDashboardAction[] {
  const actions: OpsHrDashboardAction[] = [
    {
      detail: "Leave decisions",
      href: "/ops/employees?tab=people#employee-register",
      label: "Submitted leave",
      tone: stats.submittedLeave > 0 ? "watch" : "default",
      value: stats.submittedLeave,
    },
    {
      detail: "Late onboarding tasks",
      href: "/ops/employees?tab=people#employee-register",
      label: "Overdue onboarding",
      tone: stats.overdueOnboardingItems > 0 ? "urgent" : "default",
      value: stats.overdueOnboardingItems,
    },
    {
      detail: "Expired certificates",
      href: "/ops/employees?tab=admin#training-renewals",
      label: "Expired training",
      tone: stats.expiredTraining > 0 ? "urgent" : "default",
      value: stats.expiredTraining,
    },
    {
      detail: "Renewals inside 45 days",
      href: "/ops/employees?tab=admin#training-renewals",
      label: "Training due soon",
      tone: stats.trainingDueSoon > 0 ? "watch" : "default",
      value: stats.trainingDueSoon,
    },
    {
      detail: "Reviews at or past period end",
      href: "/ops/employees?tab=people#employee-register",
      label: "Appraisals due",
      tone: stats.dueAppraisals > 0 ? "watch" : "default",
      value: stats.dueAppraisals,
    },
  ];

  return actions.filter((action) => action.value > 0);
}

export type FetchPaginatedOpsEmployeesOptions = {
  listState: OpsListState;
  query?: string;
  status?: OpsEmployeeStatus;
};

type RawRelation<T> = T | T[] | null;

type RawEmployee = Omit<
  OpsEmployeeSummary,
  | "appraisals"
  | "contracts"
  | "documents"
  | "leave_balances"
  | "leave_requests"
  | "onboarding_items"
  | "site"
  | "user"
> & {
  site: RawRelation<OpsEmployeeSummary["site"]>;
  user: RawRelation<OpsEmployeeSummary["user"]>;
};

type RawLeaveRequest = Omit<OpsLeaveRequestSummary, "days_requested"> & {
  days_requested: number | string;
};

type RawEmployeeContract = Omit<
  OpsEmployeeContractSummary,
  "salary_amount" | "basic_pay" | "housing_allowance" | "other_allowances_total" | "leave_rate_per_month"
> & {
  salary_amount: number | string;
  basic_pay: number | string | null;
  housing_allowance: number | string | null;
  other_allowances: Array<{ amount?: number | string; label?: string }> | null;
  leave_rate_per_month: number | string | null;
};

type RawPerformanceAppraisal = Omit<OpsPerformanceAppraisalSummary, "overall_rating" | "reviewer"> & {
  overall_rating: number | string | null;
  reviewer: RawRelation<OpsHrUserSummary>;
};

type RawLeaveBalance = Omit<
  OpsLeaveBalanceSummary,
  "accrued_days" | "adjustment_days" | "available_days" | "opening_balance" | "used_days"
> & {
  accrued_days: number | string;
  adjustment_days: number | string;
  available_days: number | string;
  opening_balance: number | string;
  used_days: number | string;
};

type RawEmployeeOnboardingItem = Omit<OpsEmployeeOnboardingItemSummary, "owner"> & {
  owner: RawRelation<OpsHrUserSummary>;
};

type RawEmployeeDocument = Omit<
  OpsEmployeeDocumentSummary,
  "category" | "document" | "version"
> & {
  category: RawRelation<OpsHrDocumentCategorySummary>;
  document: RawRelation<OpsEmployeeDocumentSummary["document"]>;
  version: RawRelation<
    Omit<NonNullable<OpsEmployeeDocumentSummary["version"]>, "file_size_bytes"> & {
      file_size_bytes: number | string;
    }
  >;
};

type RawRecruitmentRequisition = Omit<
  OpsRecruitmentRequisitionSummary,
  "hiring_manager" | "positions_count" | "requested_by_user" | "site"
> & {
  hiring_manager: RawRelation<OpsHrUserSummary>;
  positions_count: number | string;
  requested_by_user: RawRelation<OpsHrUserSummary>;
  site: RawRelation<OpsHrSiteSummary>;
};

type RawHrTrainingRenewal = Omit<OpsHrTrainingRenewalSummary, "employee" | "site"> & {
  employee: RawRelation<OpsHrTrainingRenewalSummary["employee"]>;
  site: RawRelation<OpsHrSiteSummary>;
};

function normalizeRelation<T>(value: RawRelation<T>) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function isMissingHrTable(error: { code?: string; message?: string } | null | undefined) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST200" ||
        error.code === "PGRST205" ||
        /employees|leave_requests|recruitment_requisitions|employee_contracts|performance_appraisals|leave_balances|employee_onboarding_items|employee_documents|hr_document_categories|safety_training_records|schema cache/i.test(
          error.message ?? "",
        )),
  );
}

async function countByQuery(
  buildQuery: (
    supabase: ReturnType<typeof getOpsSupabaseServiceClient>,
  ) => PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }>,
) {
  const supabase = getOpsSupabaseServiceClient();
  const { count, error } = await buildQuery(supabase);

  if (isMissingHrTable(error)) {
    return 0;
  }

  if (error) {
    throw error;
  }

  return count ?? 0;
}

function groupLeaveRequests(requests: RawLeaveRequest[]) {
  const grouped = new Map<string, OpsLeaveRequestSummary[]>();

  requests.forEach((request) => {
    grouped.set(request.employee_id, [
      ...(grouped.get(request.employee_id) ?? []),
      {
        ...request,
        days_requested: normalizeNumber(request.days_requested),
      },
    ]);
  });

  return grouped;
}

function sumOtherAllowances(
  value: RawEmployeeContract["other_allowances"],
): number {
  if (!Array.isArray(value)) return 0;
  let total = 0;
  for (const entry of value) {
    const amount = Number(entry?.amount ?? 0);
    if (Number.isFinite(amount) && amount > 0) {
      total += amount;
    }
  }
  return total;
}

function groupEmployeeContracts(contracts: RawEmployeeContract[]) {
  const grouped = new Map<string, OpsEmployeeContractSummary[]>();

  contracts.forEach((contract) => {
    grouped.set(contract.employee_id, [
      ...(grouped.get(contract.employee_id) ?? []),
      {
        ...contract,
        salary_amount: normalizeNumber(contract.salary_amount),
        basic_pay: normalizeNumber(contract.basic_pay),
        housing_allowance: normalizeNumber(contract.housing_allowance),
        other_allowances_total: sumOtherAllowances(contract.other_allowances),
        leave_rate_per_month: normalizeNumber(contract.leave_rate_per_month),
      },
    ]);
  });

  return grouped;
}

function groupPerformanceAppraisals(appraisals: RawPerformanceAppraisal[]) {
  const grouped = new Map<string, OpsPerformanceAppraisalSummary[]>();

  appraisals.forEach((appraisal) => {
    grouped.set(appraisal.employee_id, [
      ...(grouped.get(appraisal.employee_id) ?? []),
      {
        ...appraisal,
        overall_rating:
          appraisal.overall_rating === null ? null : normalizeNumber(appraisal.overall_rating),
        reviewer: normalizeRelation(appraisal.reviewer),
      },
    ]);
  });

  return grouped;
}

function groupLeaveBalances(balances: RawLeaveBalance[]) {
  const grouped = new Map<string, OpsLeaveBalanceSummary[]>();

  balances.forEach((balance) => {
    grouped.set(balance.employee_id, [
      ...(grouped.get(balance.employee_id) ?? []),
      {
        ...balance,
        accrued_days: normalizeNumber(balance.accrued_days),
        adjustment_days: normalizeNumber(balance.adjustment_days),
        available_days: normalizeNumber(balance.available_days),
        opening_balance: normalizeNumber(balance.opening_balance),
        used_days: normalizeNumber(balance.used_days),
      },
    ]);
  });

  return grouped;
}

function groupOnboardingItems(items: RawEmployeeOnboardingItem[]) {
  const grouped = new Map<string, OpsEmployeeOnboardingItemSummary[]>();

  items.forEach((item) => {
    grouped.set(item.employee_id, [
      ...(grouped.get(item.employee_id) ?? []),
      {
        ...item,
        owner: normalizeRelation(item.owner),
      },
    ]);
  });

  return grouped;
}

function groupEmployeeDocuments(items: RawEmployeeDocument[]) {
  const grouped = new Map<string, OpsEmployeeDocumentSummary[]>();

  items.forEach((item) => {
    const version = normalizeRelation(item.version);
    grouped.set(item.employee_id, [
      ...(grouped.get(item.employee_id) ?? []),
      {
        ...item,
        category: normalizeRelation(item.category),
        document: normalizeRelation(item.document),
        version: version
          ? {
              ...version,
              file_size_bytes: normalizeNumber(version.file_size_bytes),
            }
          : null,
      },
    ]);
  });

  return grouped;
}

async function fetchLeaveRequestsByEmployeeIds(employeeIds: string[]) {
  if (employeeIds.length === 0) {
    return new Map<string, OpsLeaveRequestSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .select(
      [
        "id",
        "leave_number",
        "employee_id",
        "leave_type",
        "status",
        "start_date",
        "end_date",
        "days_requested",
        "reason",
        "handover_notes",
        "submitted_at",
        "approved_at",
        "approved_by",
        "rejected_at",
        "rejection_reason",
        "cancelled_at",
        "completed_at",
        "created_by",
        "created_at",
      ].join(", "),
    )
    .in("employee_id", employeeIds)
    .order("start_date", { ascending: false })
    .limit(200);

  if (isMissingHrTable(error)) {
    return new Map<string, OpsLeaveRequestSummary[]>();
  }

  if (error) {
    throw error;
  }

  return groupLeaveRequests((data ?? []) as unknown as RawLeaveRequest[]);
}

async function fetchEmployeeContractsByEmployeeIds(employeeIds: string[]) {
  if (employeeIds.length === 0) {
    return new Map<string, OpsEmployeeContractSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employee_contracts")
    .select(
      [
        "id",
        "contract_number",
        "employee_id",
        "contract_type",
        "status",
        "title",
        "start_date",
        "end_date",
        "probation_end_date",
        "salary_amount",
        "basic_pay",
        "housing_allowance",
        "other_allowances",
        "leave_rate_per_month",
        "pay_frequency",
        "signed_at",
        "terminated_at",
        "termination_reason",
        "notes",
        "created_at",
      ].join(", "),
    )
    .in("employee_id", employeeIds)
    .order("start_date", { ascending: false })
    .limit(200);

  if (isMissingHrTable(error)) {
    return new Map<string, OpsEmployeeContractSummary[]>();
  }

  if (error) {
    throw error;
  }

  return groupEmployeeContracts((data ?? []) as unknown as RawEmployeeContract[]);
}

async function fetchPerformanceAppraisalsByEmployeeIds(employeeIds: string[]) {
  if (employeeIds.length === 0) {
    return new Map<string, OpsPerformanceAppraisalSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("performance_appraisals")
    .select(
      [
        "id",
        "appraisal_number",
        "employee_id",
        "reviewer_id",
        "cycle_name",
        "period_start",
        "period_end",
        "status",
        "overall_rating",
        "strengths",
        "improvement_areas",
        "goals",
        "completed_at",
        "cancelled_at",
        "created_at",
        "reviewer:users!performance_appraisals_reviewer_id_fkey(id, full_name, role, email)",
      ].join(", "),
    )
    .in("employee_id", employeeIds)
    .order("period_end", { ascending: false })
    .limit(200);

  if (isMissingHrTable(error)) {
    return new Map<string, OpsPerformanceAppraisalSummary[]>();
  }

  if (error) {
    throw error;
  }

  return groupPerformanceAppraisals((data ?? []) as unknown as RawPerformanceAppraisal[]);
}

async function fetchLeaveBalancesByEmployeeIds(employeeIds: string[]) {
  if (employeeIds.length === 0) {
    return new Map<string, OpsLeaveBalanceSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("leave_balances")
    .select(
      [
        "id",
        "employee_id",
        "leave_type",
        "balance_year",
        "opening_balance",
        "accrued_days",
        "used_days",
        "adjustment_days",
        "available_days",
        "notes",
        "created_at",
      ].join(", "),
    )
    .in("employee_id", employeeIds)
    .order("balance_year", { ascending: false })
    .order("leave_type", { ascending: true })
    .limit(240);

  if (isMissingHrTable(error)) {
    return new Map<string, OpsLeaveBalanceSummary[]>();
  }

  if (error) {
    throw error;
  }

  return groupLeaveBalances((data ?? []) as unknown as RawLeaveBalance[]);
}

async function fetchOnboardingItemsByEmployeeIds(employeeIds: string[]) {
  if (employeeIds.length === 0) {
    return new Map<string, OpsEmployeeOnboardingItemSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employee_onboarding_items")
    .select(
      [
        "id",
        "item_number",
        "employee_id",
        "category",
        "title",
        "description",
        "owner_user_id",
        "due_date",
        "status",
        "completion_notes",
        "completed_at",
        "waived_at",
        "cancelled_at",
        "created_by",
        "created_at",
        "owner:users!employee_onboarding_items_owner_user_id_fkey(id, full_name, role, email)",
      ].join(", "),
    )
    .in("employee_id", employeeIds)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(240);

  if (isMissingHrTable(error)) {
    return new Map<string, OpsEmployeeOnboardingItemSummary[]>();
  }

  if (error) {
    throw error;
  }

  return groupOnboardingItems((data ?? []) as unknown as RawEmployeeOnboardingItem[]);
}

async function fetchEmployeeDocumentsByEmployeeIds(employeeIds: string[]) {
  if (employeeIds.length === 0) {
    return new Map<string, OpsEmployeeDocumentSummary[]>();
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employee_documents")
    .select(
      [
        "id",
        "employee_id",
        "category_id",
        "document_id",
        "document_version_id",
        "status",
        "expiry_date",
        "review_notes",
        "uploaded_by",
        "reviewed_by",
        "reviewed_at",
        "created_at",
        "category:hr_document_categories!employee_documents_category_id_fkey(id, category_code, name, description, is_required, retention_years, is_active, created_at)",
        "document:documents!employee_documents_document_id_fkey(id, title, description, category, visibility, status, current_version_number, uploaded_by, created_at)",
        "version:document_versions!employee_documents_document_version_id_fkey(id, version_number, file_name, content_type, file_size_bytes, checksum_sha256, uploaded_by, created_at)",
      ].join(", "),
    )
    .in("employee_id", employeeIds)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(400);

  if (isMissingHrTable(error)) {
    return new Map<string, OpsEmployeeDocumentSummary[]>();
  }

  if (error) {
    throw error;
  }

  return groupEmployeeDocuments((data ?? []) as unknown as RawEmployeeDocument[]);
}

export async function fetchPaginatedOpsEmployees(
  options: FetchPaginatedOpsEmployeesOptions,
): Promise<OpsPaginatedResult<OpsEmployeeSummary>> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHr(profile.role)) {
    return toOpsPaginatedResult([], 0, options.listState);
  }

  const supabase = getOpsSupabaseServiceClient();
  let query = supabase
    .from("employees")
    .select(
      [
        "id",
        "employee_number",
        "user_id",
        "worker_id",
        "full_name",
        "job_title",
        "department",
        "employment_type",
        "status",
        "site_id",
        "phone",
        "email",
        "start_date",
        "end_date",
        "emergency_contact_name",
        "emergency_contact_phone",
        "nrc_number",
        "napsa_number",
        "tpin",
        "notes",
        "created_at",
        "updated_at",
        "site:sites!employees_site_id_fkey(id, code, name)",
        "user:users!employees_user_id_fkey(id, full_name, role, email)",
      ].join(", "),
      { count: "exact" },
    )
    .order("full_name", { ascending: true });

  if (options.status) {
    query = query.eq("status", options.status);
  }

  const searchFilter = opsIlikeOrFilter(
    ["employee_number", "full_name", "job_title", "department", "phone", "email"],
    options.query ?? "",
  );

  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await query.range(options.listState.from, options.listState.to);

  if (isMissingHrTable(error)) {
    return toOpsPaginatedResult([], 0, options.listState);
  }

  if (error) {
    throw error;
  }

  const employees = (data ?? []) as unknown as RawEmployee[];
  const employeeIds = employees.map((employee) => employee.id);
  const canViewEmployeeDocuments = canViewOpsEmployeeDocuments(profile.role);
  const [
    leaveRequestsByEmployeeId,
    contractsByEmployeeId,
    appraisalsByEmployeeId,
    leaveBalancesByEmployeeId,
    onboardingItemsByEmployeeId,
    documentsByEmployeeId,
  ] = await Promise.all([
    fetchLeaveRequestsByEmployeeIds(employeeIds),
    fetchEmployeeContractsByEmployeeIds(employeeIds),
    fetchPerformanceAppraisalsByEmployeeIds(employeeIds),
    fetchLeaveBalancesByEmployeeIds(employeeIds),
    fetchOnboardingItemsByEmployeeIds(employeeIds),
    canViewEmployeeDocuments
      ? fetchEmployeeDocumentsByEmployeeIds(employeeIds)
      : Promise.resolve(new Map<string, OpsEmployeeDocumentSummary[]>()),
  ]);

  return toOpsPaginatedResult(
    employees.map((employee) => ({
      ...employee,
      appraisals: appraisalsByEmployeeId.get(employee.id) ?? [],
      contracts: contractsByEmployeeId.get(employee.id) ?? [],
      documents: documentsByEmployeeId.get(employee.id) ?? [],
      leave_balances: leaveBalancesByEmployeeId.get(employee.id) ?? [],
      leave_requests: leaveRequestsByEmployeeId.get(employee.id) ?? [],
      onboarding_items: onboardingItemsByEmployeeId.get(employee.id) ?? [],
      site: normalizeRelation(employee.site),
      user: normalizeRelation(employee.user),
    })),
    count,
    options.listState,
  );
}

export async function fetchActiveEmployeeOptions(limit = 200) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHr(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, employee_number, full_name, status")
    .in("status", ["active", "probation", "on_leave"])
    .order("full_name", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 300));

  if (isMissingHrTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return (data ?? []) as OpsEmployeeOption[];
}

export async function fetchHrUserOptions(limit = 200) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHr(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, full_name, role, email")
    .eq("is_active", true)
    .order("full_name", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 300));

  if (error) {
    throw error;
  }

  return (data ?? []) as OpsHrUserOption[];
}

export async function fetchRecentRecruitmentRequisitions(limit = 12) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHr(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("recruitment_requisitions")
    .select(
      [
        "id",
        "requisition_number",
        "site_id",
        "job_title",
        "department",
        "employment_type",
        "status",
        "priority",
        "positions_count",
        "target_start_date",
        "salary_range",
        "justification",
        "requested_by",
        "hiring_manager_id",
        "approved_at",
        "filled_at",
        "cancelled_at",
        "created_at",
        "site:sites!recruitment_requisitions_site_id_fkey(id, code, name)",
        "requested_by_user:users!recruitment_requisitions_requested_by_fkey(id, full_name, role, email)",
        "hiring_manager:users!recruitment_requisitions_hiring_manager_id_fkey(id, full_name, role, email)",
      ].join(", "),
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 40));

  if (isMissingHrTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawRecruitmentRequisition[]).map((requisition) => ({
    ...requisition,
    hiring_manager: normalizeRelation(requisition.hiring_manager),
    positions_count: normalizeNumber(requisition.positions_count),
    requested_by_user: normalizeRelation(requisition.requested_by_user),
    site: normalizeRelation(requisition.site),
  }));
}

async function fetchHrDocumentCategoryRows(limit = 40) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("hr_document_categories")
    .select(
      [
        "id",
        "category_code",
        "name",
        "description",
        "is_required",
        "retention_years",
        "is_active",
        "created_at",
      ].join(", "),
    )
    .order("is_required", { ascending: false })
    .order("name", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 80));

  if (isMissingHrTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as OpsHrDocumentCategorySummary[];
}

export async function fetchHrDocumentCategories(limit = 40) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHr(profile.role)) {
    return [];
  }

  return fetchHrDocumentCategoryRows(limit);
}

export async function fetchOpsHrDocumentCoverageReport(): Promise<OpsHrDocumentCoverageReport> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsEmployeeDocuments(profile.role)) {
    return buildOpsHrDocumentCoverageReport({
      categories: [],
      documents: [],
      employees: [],
      today: new Date().toISOString().slice(0, 10),
    });
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, department, status")
    .in("status", ["active", "probation", "on_leave"]);

  if (isMissingHrTable(error)) {
    return buildOpsHrDocumentCoverageReport({
      categories: [],
      documents: [],
      employees: [],
      today: new Date().toISOString().slice(0, 10),
    });
  }

  if (error) {
    throw error;
  }

  const employeeRows = (employees ?? []) as Array<{
    department: string;
    id: string;
    status: OpsEmployeeStatus;
  }>;
  const employeeIds = employeeRows.map((employee) => employee.id);
  const [categories, documentsByEmployeeId] = await Promise.all([
    fetchHrDocumentCategoryRows(80),
    fetchEmployeeDocumentsByEmployeeIds(employeeIds),
  ]);
  const documents = Array.from(documentsByEmployeeId.values()).flat();

  return buildOpsHrDocumentCoverageReport({
    categories,
    documents: documents.map((document) => ({
      category_id: document.category_id,
      employee_id: document.employee_id,
      expiry_date: document.expiry_date,
      status: document.status,
    })),
    employees: employeeRows,
    today: new Date().toISOString().slice(0, 10),
  });
}

export async function fetchRecentHrTrainingRenewals(limit = 12) {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHr(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const dueSoonDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("safety_training_records")
    .select(
      [
        "id",
        "training_number",
        "site_id",
        "employee_id",
        "trainee_name",
        "training_title",
        "training_type",
        "provider",
        "status",
        "completed_date",
        "expiry_date",
        "site:sites!safety_training_records_site_id_fkey(id, code, name)",
        "employee:employees!safety_training_records_employee_id_fkey(id, employee_number, full_name, job_title, status)",
      ].join(", "),
    )
    .in("status", ["completed", "expired"])
    .lte("expiry_date", dueSoonDate)
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .limit(Math.min(Math.max(limit, 1), 40));

  if (isMissingHrTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawHrTrainingRenewal[]).map((record) => ({
      ...record,
      employee: normalizeRelation(record.employee),
      site: normalizeRelation(record.site),
    }));
}

async function fetchEmployeeTrainingRecordsByEmployeeId(employeeId: string, limit = 8) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("safety_training_records")
    .select(
      [
        "id",
        "training_number",
        "site_id",
        "employee_id",
        "trainee_name",
        "training_title",
        "training_type",
        "provider",
        "status",
        "completed_date",
        "expiry_date",
        "site:sites!safety_training_records_site_id_fkey(id, code, name)",
        "employee:employees!safety_training_records_employee_id_fkey(id, employee_number, full_name, job_title, status)",
      ].join(", "),
    )
    .eq("employee_id", employeeId)
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("completed_date", { ascending: false, nullsFirst: false })
    .limit(Math.min(Math.max(limit, 1), 20));

  if (isMissingHrTable(error)) {
    return [];
  }

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as RawHrTrainingRenewal[]).map((record) => ({
    ...record,
    employee: normalizeRelation(record.employee),
    site: normalizeRelation(record.site),
  }));
}

export async function fetchMyOpsEmployeeSelfServiceProfile(): Promise<OpsEmployeeSelfServiceProfile> {
  const { profile } = await requireOpsUser();
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employees")
    .select(
      [
        "id",
        "employee_number",
        "user_id",
        "worker_id",
        "full_name",
        "job_title",
        "department",
        "employment_type",
        "status",
        "site_id",
        "phone",
        "email",
        "start_date",
        "end_date",
        "emergency_contact_name",
        "emergency_contact_phone",
        "nrc_number",
        "napsa_number",
        "tpin",
        "notes",
        "created_at",
        "updated_at",
        "site:sites!employees_site_id_fkey(id, code, name)",
        "user:users!employees_user_id_fkey(id, full_name, role, email)",
      ].join(", "),
    )
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<RawEmployee>();

  if (isMissingHrTable(error)) {
    return { documentCategories: [], documents: [], employee: null, trainingRecords: [] };
  }

  if (error) {
    throw error;
  }

  if (!data) {
    return { documentCategories: [], documents: [], employee: null, trainingRecords: [] };
  }

  const [
    leaveRequestsByEmployeeId,
    contractsByEmployeeId,
    appraisalsByEmployeeId,
    leaveBalancesByEmployeeId,
    onboardingItemsByEmployeeId,
    documentsByEmployeeId,
    documentCategories,
    trainingRecords,
  ] = await Promise.all([
    fetchLeaveRequestsByEmployeeIds([data.id]),
    fetchEmployeeContractsByEmployeeIds([data.id]),
    fetchPerformanceAppraisalsByEmployeeIds([data.id]),
    fetchLeaveBalancesByEmployeeIds([data.id]),
    fetchOnboardingItemsByEmployeeIds([data.id]),
    fetchEmployeeDocumentsByEmployeeIds([data.id]),
    fetchHrDocumentCategoryRows(),
    fetchEmployeeTrainingRecordsByEmployeeId(data.id),
  ]);

  const documents = documentsByEmployeeId.get(data.id) ?? [];

  return {
    documentCategories,
    documents,
    employee: {
      ...data,
      appraisals: appraisalsByEmployeeId.get(data.id) ?? [],
      contracts: contractsByEmployeeId.get(data.id) ?? [],
      documents,
      leave_balances: leaveBalancesByEmployeeId.get(data.id) ?? [],
      leave_requests: leaveRequestsByEmployeeId.get(data.id) ?? [],
      onboarding_items: onboardingItemsByEmployeeId.get(data.id) ?? [],
      site: normalizeRelation(data.site),
      user: normalizeRelation(data.user),
    },
    trainingRecords,
  };
}

export async function fetchOpsHrStats(): Promise<OpsHrStats> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsHr(profile.role)) {
    return {
      activeEmployees: 0,
      activeContracts: 0,
      approvedLeave: 0,
      dueAppraisals: 0,
      expiredTraining: 0,
      lowLeaveBalances: 0,
      onLeave: 0,
      openOnboardingItems: 0,
      openRecruitment: 0,
      overdueOnboardingItems: 0,
      submittedLeave: 0,
      totalEmployees: 0,
      trainingDueSoon: 0,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const trainingDueSoonDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [
    totalEmployees,
    activeEmployees,
    onLeave,
    submittedLeave,
    approvedLeave,
    openRecruitment,
    activeContracts,
    dueAppraisals,
    lowLeaveBalances,
    openOnboardingItems,
    overdueOnboardingItems,
    trainingDueSoon,
    expiredTrainingMarked,
    expiredTrainingByDate,
  ] =
    await Promise.all([
      countByQuery((supabase) =>
        supabase.from("employees").select("id", { count: "exact", head: true }),
      ),
      countByQuery((supabase) =>
        supabase
          .from("employees")
          .select("id", { count: "exact", head: true })
          .in("status", ["active", "probation"]),
      ),
      countByQuery((supabase) =>
        supabase
          .from("employees")
          .select("id", { count: "exact", head: true })
          .eq("status", "on_leave"),
      ),
      countByQuery((supabase) =>
        supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted"),
      ),
      countByQuery((supabase) =>
        supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved"),
      ),
      countByQuery((supabase) =>
        supabase
          .from("recruitment_requisitions")
          .select("id", { count: "exact", head: true })
          .in("status", ["submitted", "approved", "open", "interviewing", "offered"]),
      ),
      countByQuery((supabase) =>
        supabase
          .from("employee_contracts")
          .select("id", { count: "exact", head: true })
          .eq("status", "active"),
      ),
      countByQuery((supabase) =>
        supabase
          .from("performance_appraisals")
          .select("id", { count: "exact", head: true })
          .in("status", ["planned", "in_progress"])
          .lte("period_end", today),
      ),
      countByQuery((supabase) =>
        supabase
          .from("leave_balances")
          .select("id", { count: "exact", head: true })
          .lte("available_days", 3),
      ),
      countByQuery((supabase) =>
        supabase
          .from("employee_onboarding_items")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "in_progress"]),
      ),
      countByQuery((supabase) =>
        supabase
          .from("employee_onboarding_items")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "in_progress"])
          .lt("due_date", today),
      ),
      countByQuery((supabase) =>
        supabase
          .from("safety_training_records")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed")
          .gte("expiry_date", today)
          .lte("expiry_date", trainingDueSoonDate),
      ),
      countByQuery((supabase) =>
        supabase
          .from("safety_training_records")
          .select("id", { count: "exact", head: true })
          .eq("status", "expired"),
      ),
      countByQuery((supabase) =>
        supabase
          .from("safety_training_records")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed")
          .lt("expiry_date", today),
      ),
    ]);

  return {
    activeEmployees,
    activeContracts,
    approvedLeave,
    dueAppraisals,
    expiredTraining: expiredTrainingMarked + expiredTrainingByDate,
    lowLeaveBalances,
    onLeave,
    openOnboardingItems,
    openRecruitment,
    overdueOnboardingItems,
    submittedLeave,
    totalEmployees,
    trainingDueSoon,
  };
}
