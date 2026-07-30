"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { notifyOpsWorkflowEvent } from "@/lib/ops/workflow-notifications";
import {
  canApproveOpsLeaveRequest,
  canArchiveOpsEmployeeDocument,
  canCreateOpsEmployeeContract,
  canCancelOpsEmployeeOnboardingItem,
  canCancelOpsLeaveRequest,
  canCompleteOpsLeaveRequest,
  canCreateOpsEmployee,
  canCreateOpsEmployeeOnboardingItem,
  canCreateOpsLeaveRequest,
  canCreateOpsPerformanceAppraisal,
  canCreateOpsRecruitmentRequisition,
  canCompleteOpsEmployeeOnboardingItem,
  canManageOpsEmployeeContract,
  canManageOpsHrDocumentCategory,
  canManageOpsLeaveBalance,
  canManageOpsPerformanceAppraisal,
  canManageOpsRecruitmentRequisition,
  canRejectOpsLeaveRequest,
  canReviewOpsEmployeeDocument,
  canStartOpsEmployeeOnboardingItem,
  canSubmitOpsLeaveRequest,
  canUpdateOpsEmployeeStatus,
  canUploadOpsEmployeeDocument,
  canWaiveOpsEmployeeOnboardingItem,
} from "@/lib/ops/hr-permissions";
import { deleteOpsR2Object, putOpsR2Object } from "@/lib/ops/r2";
import { safeOpsReturnTo } from "@/lib/ops/return-paths";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import { safeOpsFileName, validateOpsUploadFile } from "@/lib/ops/upload-validation";
import type {
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
} from "@/lib/ops/types";

const HR_ROUTE = "/ops/employees";

const employeeStatuses = [
  "active",
  "probation",
  "on_leave",
  "suspended",
  "exited",
] as const satisfies readonly OpsEmployeeStatus[];

const employmentTypes = [
  "full_time",
  "fixed_term",
  "casual",
  "contractor",
  "intern",
] as const satisfies readonly OpsEmploymentType[];

const leaveTypes = [
  "annual",
  "sick",
  "compassionate",
  "unpaid",
  "maternity",
  "paternity",
  "study",
  "other",
] as const satisfies readonly OpsLeaveType[];

const priorities = ["low", "normal", "high", "urgent"] as const satisfies readonly OpsPriority[];

const recruitmentStatuses = [
  "draft",
  "submitted",
  "approved",
  "open",
  "interviewing",
  "offered",
  "filled",
  "cancelled",
] as const satisfies readonly OpsRecruitmentRequisitionStatus[];

const contractStatuses = [
  "draft",
  "active",
  "expired",
  "terminated",
  "superseded",
  "cancelled",
] as const satisfies readonly OpsEmployeeContractStatus[];

const payFrequencies = [
  "monthly",
  "weekly",
  "daily",
  "hourly",
  "contract_sum",
] as const satisfies readonly OpsPayFrequency[];

const appraisalStatuses = [
  "planned",
  "in_progress",
  "completed",
  "cancelled",
] as const satisfies readonly OpsPerformanceAppraisalStatus[];

const createEmployeeSchema = z.object({
  department: z.string().trim().max(120).default(""),
  email: z.string().trim().email("Use a valid email.").optional().or(z.literal("")),
  emergency_contact_name: z.string().trim().max(140).default(""),
  emergency_contact_phone: z.string().trim().max(80).default(""),
  employment_type: z.enum(employmentTypes),
  full_name: z.string().trim().min(2, "Employee name is required.").max(180),
  job_title: z.string().trim().max(140).default(""),
  notes: z.string().trim().max(1000).default(""),
  phone: z.string().trim().max(80).default(""),
  site_id: z.string().trim().default(""),
  start_date: z.string().trim().default(""),
  status: z.enum(employeeStatuses),
  user_id: z.string().trim().default(""),
  // Payslip identity fields (PCL convention). Both shown on the staff payslip.
  nrc_number: z.string().trim().max(32).default(""),
  napsa_number: z.string().trim().max(32).default(""),
  tpin: z.string().trim().max(32).default(""),
});

const updateEmployeeSchema = createEmployeeSchema.extend({
  employee_id: z.string().uuid("Select an employee."),
});

const employeeStatusSchema = z.object({
  employee_id: z.string().uuid("Select an employee."),
  status: z.enum(employeeStatuses),
});

const leaveRequestSchema = z.object({
  days_requested: z.coerce.number().min(0).optional().or(z.literal("")),
  employee_id: z.string().uuid("Select an employee."),
  end_date: z.string().trim(),
  handover_notes: z.string().trim().max(1000).default(""),
  leave_type: z.enum(leaveTypes),
  reason: z.string().trim().max(1000).default(""),
  start_date: z.string().trim(),
});

const leaveIdSchema = z.object({
  leave_request_id: z.string().uuid("Select a leave request."),
});

const rejectLeaveSchema = leaveIdSchema.extend({
  rejection_reason: z.string().trim().max(1000).default(""),
});

const recruitmentRequisitionSchema = z.object({
  department: z.string().trim().max(120).default(""),
  employment_type: z.enum(employmentTypes),
  hiring_manager_id: z.string().trim().default(""),
  job_title: z.string().trim().min(2, "Job title is required.").max(160),
  justification: z.string().trim().max(1200).default(""),
  positions_count: z.coerce.number().int().min(1, "Positions must be at least 1.").default(1),
  priority: z.enum(priorities),
  salary_range: z.string().trim().max(120).default(""),
  site_id: z.string().trim().default(""),
  target_start_date: z.string().trim().default(""),
});

const recruitmentStatusSchema = z.object({
  requisition_id: z.string().uuid("Select a recruitment requisition."),
  status: z.enum(recruitmentStatuses),
});

const employeeContractSchema = z.object({
  contract_type: z.enum(employmentTypes),
  employee_id: z.string().uuid("Select an employee."),
  end_date: z.string().trim().default(""),
  notes: z.string().trim().max(1000).default(""),
  pay_frequency: z.enum(payFrequencies),
  probation_end_date: z.string().trim().default(""),
  // Pay structure used by the staff payslip. salary_amount stays as a derived
  // total for backwards compatibility (basic + housing + other).
  basic_pay: z.coerce.number().min(0, "Basic pay cannot be negative.").default(0),
  housing_allowance: z.coerce
    .number()
    .min(0, "Housing allowance cannot be negative.")
    .default(0),
  other_allowances_amount: z.coerce
    .number()
    .min(0, "Other allowances cannot be negative.")
    .default(0),
  leave_rate_per_month: z.coerce
    .number()
    .min(0, "Leave rate cannot be negative.")
    .default(2.5),
  start_date: z.string().trim(),
  status: z.enum(contractStatuses),
  title: z.string().trim().max(180).default(""),
});

const employeeContractEditSchema = employeeContractSchema.extend({
  contract_id: z.string().uuid("Select a contract."),
});

const employeeContractStatusSchema = z.object({
  contract_id: z.string().uuid("Select a contract."),
  status: z.enum(contractStatuses),
  termination_reason: z.string().trim().max(1000).default(""),
});

const performanceAppraisalSchema = z.object({
  cycle_name: z.string().trim().max(120).default(""),
  employee_id: z.string().uuid("Select an employee."),
  goals: z.string().trim().max(1200).default(""),
  period_end: z.string().trim(),
  period_start: z.string().trim(),
  reviewer_id: z.string().trim().default(""),
  status: z.enum(appraisalStatuses),
});

const completeAppraisalSchema = z.object({
  appraisal_id: z.string().uuid("Select an appraisal."),
  goals: z.string().trim().max(1200).default(""),
  improvement_areas: z.string().trim().max(1200).default(""),
  overall_rating: z.coerce.number().min(0).max(5),
  strengths: z.string().trim().max(1200).default(""),
});

const leaveBalanceSchema = z.object({
  accrued_days: z.coerce.number().default(0),
  adjustment_days: z.coerce.number().default(0),
  balance_year: z.coerce.number().int().min(2000).max(2100),
  employee_id: z.string().uuid("Select an employee."),
  leave_type: z.enum(leaveTypes),
  notes: z.string().trim().max(1000).default(""),
  opening_balance: z.coerce.number().default(0),
  used_days: z.coerce.number().min(0, "Used leave cannot be negative.").default(0),
});

const hrDocumentCategorySchema = z.object({
  category_code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]*$/, "Use a category code like contract or training_record.")
    .max(80),
  description: z.string().trim().max(1000).default(""),
  is_required: z.string().trim().default(""),
  name: z.string().trim().min(2, "Category name is required.").max(140),
  retention_years: z.coerce.number().int().min(0).max(100).optional().or(z.literal("")),
});

const employeeDocumentUploadSchema = z.object({
  category_id: z.string().uuid("Select an HR document category."),
  employee_id: z.string().uuid("Select an employee."),
  expiry_date: z.string().trim().default(""),
  return_to: z.string().trim().default(""),
  title: z.string().trim().max(180).default(""),
});

const employeeDocumentIdSchema = z.object({
  employee_document_id: z.string().uuid("Select an employee document."),
  return_to: z.string().trim().default(""),
});

const rejectEmployeeDocumentSchema = employeeDocumentIdSchema.extend({
  review_notes: z.string().trim().max(1000).default(""),
});

const onboardingItemSchema = z.object({
  category: z.string().trim().regex(/^[a-z][a-z0-9_]*$/, "Use a category like documents or induction.").default("general"),
  description: z.string().trim().max(1200).default(""),
  due_date: z.string().trim().default(""),
  employee_id: z.string().uuid("Select an employee."),
  owner_user_id: z.string().trim().default(""),
  title: z.string().trim().min(2, "Onboarding item title is required.").max(180),
});

const onboardingItemIdSchema = z.object({
  onboarding_item_id: z.string().uuid("Select an onboarding item."),
});

const completeOnboardingItemSchema = onboardingItemIdSchema.extend({
  completion_notes: z.string().trim().max(1200).default(""),
});

type SiteForHr = {
  id: string;
  is_active: boolean;
};

type EmployeeForMutation = {
  employee_number: string;
  full_name: string;
  id: string;
  status: OpsEmployeeStatus;
  user_id: string | null;
};

type LeaveRequestForMutation = {
  created_by: string | null;
  employee: {
    id: string;
    user_id: string | null;
  } | null;
  employee_id: string;
  id: string;
  leave_number: string;
  status: OpsLeaveRequestStatus;
};

type RecruitmentRequisitionForMutation = {
  id: string;
  requisition_number: string;
  status: OpsRecruitmentRequisitionStatus;
};

type EmployeeContractForMutation = {
  contract_number: string;
  employee_id: string;
  id: string;
  status: OpsEmployeeContractStatus;
};

type PerformanceAppraisalForMutation = {
  appraisal_number: string;
  employee_id: string;
  id: string;
  status: OpsPerformanceAppraisalStatus;
};

type EmployeeOnboardingItemForMutation = {
  employee_id: string;
  id: string;
  item_number: string;
  status: OpsEmployeeOnboardingStatus;
};

type HrDocumentCategoryForMutation = {
  category_code: string;
  id: string;
  is_active: boolean;
  name: string;
};

type EmployeeDocumentForMutation = {
  document_id: string;
  document_version_id: string | null;
  employee_id: string;
  id: string;
  status: OpsEmployeeDocumentStatus;
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function hrError(message: string): never {
  redirect(`${HR_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function employeeDocumentError(message: string, returnTo: string): never {
  const safeReturnTo = safeOpsReturnTo(returnTo, `${HR_ROUTE}#employee-register`);
  const [pathWithQuery, hash] = safeReturnTo.split("#", 2);
  const separator = pathWithQuery.includes("?") ? "&" : "?";
  redirect(
    `${pathWithQuery}${separator}error=${encodeURIComponent(safeOpsActionErrorMessage(message))}${
      hash ? `#${hash}` : ""
    }`,
  );
}

function redirectWithOpsParam(returnTo: string, key: "created" | "updated", value: string): never {
  const safeReturnTo = safeOpsReturnTo(returnTo, `${HR_ROUTE}#employee-register`);
  const [pathWithQuery, hash] = safeReturnTo.split("#", 2);
  const separator = pathWithQuery.includes("?") ? "&" : "?";
  redirect(`${pathWithQuery}${separator}${key}=${value}${hash ? `#${hash}` : ""}`);
}

function normalizeOptionalUuid(value: string) {
  return value || null;
}

function normalizeDate(value: string, message = "Use a valid date.") {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    hrError(message);
  }

  return value;
}

function normalizeOptionalDate(value: string) {
  return value ? normalizeDate(value) : null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function inclusiveDateDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  return Math.max(Math.floor((end - start) / dayMs) + 1, 0);
}

async function fetchSite(siteId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("sites")
    .select("id, is_active")
    .eq("id", siteId)
    .maybeSingle<SiteForHr>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchEmployee(employeeId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, employee_number, full_name, status, user_id")
    .eq("id", employeeId)
    .maybeSingle<EmployeeForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchHrDocumentCategory(categoryId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("hr_document_categories")
    .select("id, category_code, name, is_active")
    .eq("id", categoryId)
    .maybeSingle<HrDocumentCategoryForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchEmployeeDocument(employeeDocumentId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employee_documents")
    .select("id, employee_id, document_id, document_version_id, status")
    .eq("id", employeeDocumentId)
    .maybeSingle<EmployeeDocumentForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchLeaveRequest(leaveRequestId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .select(
      "id, leave_number, employee_id, status, created_by, employee:employees!leave_requests_employee_id_fkey(id, user_id)",
    )
    .eq("id", leaveRequestId)
    .maybeSingle<LeaveRequestForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchRecruitmentRequisition(requisitionId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("recruitment_requisitions")
    .select("id, requisition_number, status")
    .eq("id", requisitionId)
    .maybeSingle<RecruitmentRequisitionForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchEmployeeContract(contractId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employee_contracts")
    .select("id, contract_number, employee_id, status")
    .eq("id", contractId)
    .maybeSingle<EmployeeContractForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchPerformanceAppraisal(appraisalId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("performance_appraisals")
    .select("id, appraisal_number, employee_id, status")
    .eq("id", appraisalId)
    .maybeSingle<PerformanceAppraisalForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchEmployeeOnboardingItem(itemId: string) {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employee_onboarding_items")
    .select("id, item_number, employee_id, status")
    .eq("id", itemId)
    .maybeSingle<EmployeeOnboardingItemForMutation>();

  if (error) {
    throw error;
  }

  return data;
}

async function assertActiveSite(siteId: string) {
  const site = await fetchSite(siteId);

  if (!site || !site.is_active) {
    hrError("Select an active site.");
  }
}

export async function createEmployeeAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsEmployee(profile.role)) {
    hrError("Your role cannot create employee records.");
  }

  const parsed = createEmployeeSchema.safeParse({
    department: field(formData, "department"),
    email: field(formData, "email"),
    emergency_contact_name: field(formData, "emergency_contact_name"),
    emergency_contact_phone: field(formData, "emergency_contact_phone"),
    employment_type: field(formData, "employment_type") || "full_time",
    full_name: field(formData, "full_name"),
    job_title: field(formData, "job_title"),
    notes: field(formData, "notes"),
    phone: field(formData, "phone"),
    site_id: field(formData, "site_id"),
    start_date: field(formData, "start_date"),
    status: field(formData, "status") || "active",
    user_id: field(formData, "user_id"),
    nrc_number: field(formData, "nrc_number"),
    napsa_number: field(formData, "napsa_number"),
    tpin: field(formData, "tpin"),
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Check the employee record.");
  }

  if (parsed.data.site_id) {
    await assertActiveSite(parsed.data.site_id);
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employees")
    .insert({
      created_by: profile.id,
      department: parsed.data.department,
      email: parsed.data.email || "",
      emergency_contact_name: parsed.data.emergency_contact_name,
      emergency_contact_phone: parsed.data.emergency_contact_phone,
      employment_type: parsed.data.employment_type,
      full_name: parsed.data.full_name,
      job_title: parsed.data.job_title,
      notes: parsed.data.notes,
      phone: parsed.data.phone,
      site_id: normalizeOptionalUuid(parsed.data.site_id),
      start_date: normalizeDate(parsed.data.start_date || today(), "Use a valid start date."),
      status: parsed.data.status,
      user_id: normalizeOptionalUuid(parsed.data.user_id),
      nrc_number: parsed.data.nrc_number,
      napsa_number: parsed.data.napsa_number,
      tpin: parsed.data.tpin,
    })
    .select("id, employee_number")
    .single<{ employee_number: string; id: string }>();

  if (error || !data) {
    hrError(error?.message ?? "Could not create employee record.");
  }

  await recordOpsAuditEvent({
    action: "employee.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "employee",
    metadata: { employee_number: data.employee_number },
    moduleKey: "employees",
    sourceId: data.id,
    sourceTable: "employees",
    summary: `Created employee record ${data.employee_number}`,
  });

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?created=employee`);
}

/**
 * Edit an existing employee's profile. Same schema as create — lets HR fix
 * missing NRC / NAPSA Security No. fields on existing records so the staff
 * payslip stops showing "—" for those identity lines.
 */
export async function updateEmployeeAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsEmployee(profile.role)) {
    hrError("Your role cannot update employee records.");
  }

  const parsed = updateEmployeeSchema.safeParse({
    employee_id: field(formData, "employee_id"),
    department: field(formData, "department"),
    email: field(formData, "email"),
    emergency_contact_name: field(formData, "emergency_contact_name"),
    emergency_contact_phone: field(formData, "emergency_contact_phone"),
    employment_type: field(formData, "employment_type") || "full_time",
    full_name: field(formData, "full_name"),
    job_title: field(formData, "job_title"),
    notes: field(formData, "notes"),
    phone: field(formData, "phone"),
    site_id: field(formData, "site_id"),
    start_date: field(formData, "start_date"),
    status: field(formData, "status") || "active",
    user_id: field(formData, "user_id"),
    nrc_number: field(formData, "nrc_number"),
    napsa_number: field(formData, "napsa_number"),
    tpin: field(formData, "tpin"),
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Check the employee record.");
  }

  if (parsed.data.site_id) {
    await assertActiveSite(parsed.data.site_id);
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("employees")
    .update({
      department: parsed.data.department,
      email: parsed.data.email || "",
      emergency_contact_name: parsed.data.emergency_contact_name,
      emergency_contact_phone: parsed.data.emergency_contact_phone,
      employment_type: parsed.data.employment_type,
      full_name: parsed.data.full_name,
      job_title: parsed.data.job_title,
      notes: parsed.data.notes,
      phone: parsed.data.phone,
      site_id: normalizeOptionalUuid(parsed.data.site_id),
      start_date: normalizeDate(parsed.data.start_date || today(), "Use a valid start date."),
      status: parsed.data.status,
      user_id: normalizeOptionalUuid(parsed.data.user_id),
      nrc_number: parsed.data.nrc_number,
      napsa_number: parsed.data.napsa_number,
      tpin: parsed.data.tpin,
    })
    .eq("id", parsed.data.employee_id);

  if (error) {
    hrError(error.message);
  }

  await recordOpsAuditEvent({
    action: "employee.updated",
    actorUserId: profile.id,
    entityId: parsed.data.employee_id,
    entityType: "employee",
    metadata: { full_name: parsed.data.full_name },
    moduleKey: "employees",
    sourceId: parsed.data.employee_id,
    sourceTable: "employees",
    summary: `Updated employee ${parsed.data.full_name}`,
  });

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?updated=employee`);
}

export async function createEmployeeOnboardingItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsEmployeeOnboardingItem(profile.role)) {
    hrError("Your role cannot create onboarding items.");
  }

  const parsed = onboardingItemSchema.safeParse({
    category: field(formData, "category") || "general",
    description: field(formData, "description"),
    due_date: field(formData, "due_date"),
    employee_id: field(formData, "employee_id"),
    owner_user_id: field(formData, "owner_user_id"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Check the onboarding item.");
  }

  const employee = await fetchEmployee(parsed.data.employee_id);

  if (!employee || employee.status === "exited") {
    hrError("Select an active employee.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employee_onboarding_items")
    .insert({
      category: parsed.data.category,
      created_by: profile.id,
      description: parsed.data.description,
      due_date: normalizeOptionalDate(parsed.data.due_date),
      employee_id: employee.id,
      owner_user_id: normalizeOptionalUuid(parsed.data.owner_user_id),
      status: "pending",
      title: parsed.data.title,
    })
    .select("id, item_number")
    .single<{ id: string; item_number: string }>();

  if (error || !data) {
    hrError(error?.message ?? "Could not create onboarding item.");
  }

  await recordOpsAuditEvent({
    action: "employee_onboarding_item.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "employee_onboarding_item",
    metadata: { employee_number: employee.employee_number, item_number: data.item_number },
    moduleKey: "employees",
    sourceId: data.id,
    sourceTable: "employee_onboarding_items",
    summary: `Created onboarding item ${data.item_number}`,
  });

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?created=onboarding_item#employee-register`);
}

export async function startEmployeeOnboardingItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = onboardingItemIdSchema.safeParse({
    onboarding_item_id: field(formData, "onboarding_item_id"),
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Select an onboarding item.");
  }

  const item = await fetchEmployeeOnboardingItem(parsed.data.onboarding_item_id);

  if (!item) {
    hrError("Onboarding item was not found.");
  }

  if (!canStartOpsEmployeeOnboardingItem(profile.role, item)) {
    hrError("Your role cannot start this onboarding item.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("employee_onboarding_items")
    .update({ status: "in_progress" })
    .eq("id", item.id)
    .eq("status", "pending");

  if (error) {
    hrError(error.message);
  }

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?updated=onboarding_started#employee-register`);
}

export async function completeEmployeeOnboardingItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = completeOnboardingItemSchema.safeParse({
    completion_notes: field(formData, "completion_notes"),
    onboarding_item_id: field(formData, "onboarding_item_id"),
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Check the onboarding completion.");
  }

  const item = await fetchEmployeeOnboardingItem(parsed.data.onboarding_item_id);

  if (!item) {
    hrError("Onboarding item was not found.");
  }

  if (!canCompleteOpsEmployeeOnboardingItem(profile.role, item)) {
    hrError("Your role cannot complete this onboarding item.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("employee_onboarding_items")
    .update({
      completed_at: new Date().toISOString(),
      completed_by: profile.id,
      completion_notes: parsed.data.completion_notes,
      status: "completed",
    })
    .eq("id", item.id)
    .in("status", ["pending", "in_progress"]);

  if (error) {
    hrError(error.message);
  }

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?updated=onboarding_completed#employee-register`);
}

export async function waiveEmployeeOnboardingItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = onboardingItemIdSchema.safeParse({
    onboarding_item_id: field(formData, "onboarding_item_id"),
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Select an onboarding item.");
  }

  const item = await fetchEmployeeOnboardingItem(parsed.data.onboarding_item_id);

  if (!item) {
    hrError("Onboarding item was not found.");
  }

  if (!canWaiveOpsEmployeeOnboardingItem(profile.role, item)) {
    hrError("Your role cannot waive this onboarding item.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("employee_onboarding_items")
    .update({
      status: "waived",
      waived_at: new Date().toISOString(),
      waived_by: profile.id,
    })
    .eq("id", item.id)
    .in("status", ["pending", "in_progress"]);

  if (error) {
    hrError(error.message);
  }

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?updated=onboarding_waived#employee-register`);
}

export async function cancelEmployeeOnboardingItemAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = onboardingItemIdSchema.safeParse({
    onboarding_item_id: field(formData, "onboarding_item_id"),
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Select an onboarding item.");
  }

  const item = await fetchEmployeeOnboardingItem(parsed.data.onboarding_item_id);

  if (!item) {
    hrError("Onboarding item was not found.");
  }

  if (!canCancelOpsEmployeeOnboardingItem(profile.role, item)) {
    hrError("Your role cannot cancel this onboarding item.");
  }

  const { error } = await getOpsSupabaseServiceClient()
    .from("employee_onboarding_items")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: profile.id,
      status: "cancelled",
    })
    .eq("id", item.id)
    .in("status", ["pending", "in_progress"]);

  if (error) {
    hrError(error.message);
  }

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?updated=onboarding_cancelled#employee-register`);
}

export async function createRecruitmentRequisitionAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsRecruitmentRequisition(profile.role)) {
    hrError("Your role cannot create recruitment requisitions.");
  }

  const parsed = recruitmentRequisitionSchema.safeParse({
    department: field(formData, "department"),
    employment_type: field(formData, "employment_type") || "full_time",
    hiring_manager_id: field(formData, "hiring_manager_id"),
    job_title: field(formData, "job_title"),
    justification: field(formData, "justification"),
    positions_count: field(formData, "positions_count") || "1",
    priority: field(formData, "priority") || "normal",
    salary_range: field(formData, "salary_range"),
    site_id: field(formData, "site_id"),
    target_start_date: field(formData, "target_start_date"),
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Check the recruitment requisition.");
  }

  if (parsed.data.site_id) {
    await assertActiveSite(parsed.data.site_id);
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("recruitment_requisitions")
    .insert({
      created_by: profile.id,
      department: parsed.data.department,
      employment_type: parsed.data.employment_type,
      hiring_manager_id: normalizeOptionalUuid(parsed.data.hiring_manager_id),
      job_title: parsed.data.job_title,
      justification: parsed.data.justification,
      positions_count: parsed.data.positions_count,
      priority: parsed.data.priority,
      requested_by: profile.id,
      salary_range: parsed.data.salary_range,
      site_id: normalizeOptionalUuid(parsed.data.site_id),
      target_start_date: normalizeOptionalDate(parsed.data.target_start_date),
    })
    .select("id, requisition_number")
    .single<{ id: string; requisition_number: string }>();

  if (error || !data) {
    hrError(error?.message ?? "Could not create recruitment requisition.");
  }

  await recordOpsAuditEvent({
    action: "recruitment_requisition.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "recruitment_requisition",
    metadata: { requisition_number: data.requisition_number },
    moduleKey: "employees",
    sourceId: data.id,
    sourceTable: "recruitment_requisitions",
    summary: `Created recruitment requisition ${data.requisition_number}`,
  });

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?created=recruitment`);
}

export async function updateRecruitmentRequisitionStatusAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = recruitmentStatusSchema.safeParse({
    requisition_id: field(formData, "requisition_id"),
    status: field(formData, "status"),
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Check the recruitment status.");
  }

  const requisition = await fetchRecruitmentRequisition(parsed.data.requisition_id);

  if (!requisition) {
    hrError("Recruitment requisition was not found.");
  }

  if (!canManageOpsRecruitmentRequisition(profile.role, requisition)) {
    hrError("Your role cannot update this recruitment requisition.");
  }

  const now = new Date().toISOString();
  const update = {
    approved_at: parsed.data.status === "approved" ? now : undefined,
    approved_by: parsed.data.status === "approved" ? profile.id : undefined,
    cancelled_at: parsed.data.status === "cancelled" ? now : undefined,
    cancelled_by: parsed.data.status === "cancelled" ? profile.id : undefined,
    filled_at: parsed.data.status === "filled" ? now : undefined,
    status: parsed.data.status,
  };

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("recruitment_requisitions")
    .update(update)
    .eq("id", requisition.id);

  if (error) {
    hrError(error.message);
  }

  await recordOpsAuditEvent({
    action: "recruitment_requisition.status_updated",
    actorUserId: profile.id,
    entityId: requisition.id,
    entityType: "recruitment_requisition",
    metadata: { requisition_number: requisition.requisition_number, status: parsed.data.status },
    moduleKey: "employees",
    sourceId: requisition.id,
    sourceTable: "recruitment_requisitions",
    summary: `Updated ${requisition.requisition_number} to ${parsed.data.status}`,
  });

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?updated=recruitment_status`);
}

export async function createEmployeeContractAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsEmployeeContract(profile.role)) {
    hrError("Your role cannot create employee contracts.");
  }

  const parsed = employeeContractSchema.safeParse({
    contract_type: field(formData, "contract_type") || "full_time",
    employee_id: field(formData, "employee_id"),
    end_date: field(formData, "end_date"),
    notes: field(formData, "notes"),
    pay_frequency: field(formData, "pay_frequency") || "monthly",
    probation_end_date: field(formData, "probation_end_date"),
    basic_pay: field(formData, "basic_pay") || "0",
    housing_allowance: field(formData, "housing_allowance") || "0",
    other_allowances_amount: field(formData, "other_allowances_amount") || "0",
    leave_rate_per_month: field(formData, "leave_rate_per_month") || "2.5",
    start_date: field(formData, "start_date"),
    status: field(formData, "status") || "draft",
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Check the employee contract.");
  }

  const employee = await fetchEmployee(parsed.data.employee_id);

  if (!employee) {
    hrError("Employee was not found.");
  }

  const startDate = normalizeDate(parsed.data.start_date || today(), "Use a valid contract start date.");
  const endDate = normalizeOptionalDate(parsed.data.end_date);
  const probationEndDate = normalizeOptionalDate(parsed.data.probation_end_date);

  if (endDate && endDate < startDate) {
    hrError("Contract end date cannot be before start date.");
  }

  if (probationEndDate && probationEndDate < startDate) {
    hrError("Probation end date cannot be before start date.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("employee_contracts")
    .insert({
      contract_type: parsed.data.contract_type,
      created_by: profile.id,
      employee_id: employee.id,
      end_date: endDate,
      notes: parsed.data.notes,
      pay_frequency: parsed.data.pay_frequency,
      probation_end_date: probationEndDate,
      basic_pay: parsed.data.basic_pay,
      housing_allowance: parsed.data.housing_allowance,
      other_allowances: [
        { label: "Other allowances", amount: parsed.data.other_allowances_amount },
      ],
      leave_rate_per_month: parsed.data.leave_rate_per_month,
      // salary_amount stored as the derived total so legacy reports stay valid.
      salary_amount:
        parsed.data.basic_pay + parsed.data.housing_allowance + parsed.data.other_allowances_amount,
      signed_at: parsed.data.status === "active" ? new Date().toISOString() : null,
      start_date: startDate,
      status: parsed.data.status,
      title: parsed.data.title,
    })
    .select("id, contract_number")
    .single<{ contract_number: string; id: string }>();

  if (error || !data) {
    hrError(error?.message ?? "Could not create employee contract.");
  }

  await recordOpsAuditEvent({
    action: "employee_contract.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "employee_contract",
    metadata: { contract_number: data.contract_number, employee_number: employee.employee_number },
    moduleKey: "employees",
    sourceId: data.id,
    sourceTable: "employee_contracts",
    summary: `Created employee contract ${data.contract_number}`,
  });

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?created=contract`);
}

export async function updateEmployeeContractStatusAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = employeeContractStatusSchema.safeParse({
    contract_id: field(formData, "contract_id"),
    status: field(formData, "status"),
    termination_reason: field(formData, "termination_reason"),
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Check the contract status.");
  }

  const contract = await fetchEmployeeContract(parsed.data.contract_id);

  if (!contract) {
    hrError("Employee contract was not found.");
  }

  if (!canManageOpsEmployeeContract(profile.role, contract)) {
    hrError("Your role cannot update this contract.");
  }

  const now = new Date().toISOString();
  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("employee_contracts")
    .update({
      signed_at: parsed.data.status === "active" ? now : undefined,
      status: parsed.data.status,
      terminated_at: parsed.data.status === "terminated" ? now : undefined,
      termination_reason:
        parsed.data.status === "terminated" ? parsed.data.termination_reason : undefined,
    })
    .eq("id", contract.id);

  if (error) {
    hrError(error.message);
  }

  await recordOpsAuditEvent({
    action: "employee_contract.status_updated",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "employee_contract",
    metadata: { contract_number: contract.contract_number, status: parsed.data.status },
    moduleKey: "employees",
    sourceId: contract.id,
    sourceTable: "employee_contracts",
    summary: `Updated ${contract.contract_number} to ${parsed.data.status}`,
  });

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?updated=contract_status`);
}

/**
 * Edit an existing employee contract's pay structure + header fields. Only
 * roles allowed to manage the contract (HR + leadership + developer) may use
 * this; cancelled contracts are not editable.
 */
export async function updateEmployeeContractAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  const parsed = employeeContractEditSchema.safeParse({
    contract_id: field(formData, "contract_id"),
    contract_type: field(formData, "contract_type") || "full_time",
    employee_id: field(formData, "employee_id"),
    end_date: field(formData, "end_date"),
    notes: field(formData, "notes"),
    pay_frequency: field(formData, "pay_frequency") || "monthly",
    probation_end_date: field(formData, "probation_end_date"),
    basic_pay: field(formData, "basic_pay") || "0",
    housing_allowance: field(formData, "housing_allowance") || "0",
    other_allowances_amount: field(formData, "other_allowances_amount") || "0",
    leave_rate_per_month: field(formData, "leave_rate_per_month") || "2.5",
    start_date: field(formData, "start_date"),
    status: field(formData, "status") || "draft",
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Check the employee contract.");
  }

  const contract = await fetchEmployeeContract(parsed.data.contract_id);
  if (!contract) {
    hrError("Employee contract was not found.");
  }
  if (!canManageOpsEmployeeContract(profile.role, contract)) {
    hrError("Your role cannot update this contract.");
  }

  const startDate = normalizeDate(
    parsed.data.start_date || today(),
    "Use a valid contract start date.",
  );
  const endDate = normalizeOptionalDate(parsed.data.end_date);
  const probationEndDate = normalizeOptionalDate(parsed.data.probation_end_date);

  if (endDate && endDate < startDate) {
    hrError("Contract end date cannot be before start date.");
  }
  if (probationEndDate && probationEndDate < startDate) {
    hrError("Probation end date cannot be before start date.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("employee_contracts")
    .update({
      contract_type: parsed.data.contract_type,
      end_date: endDate,
      notes: parsed.data.notes,
      pay_frequency: parsed.data.pay_frequency,
      probation_end_date: probationEndDate,
      basic_pay: parsed.data.basic_pay,
      housing_allowance: parsed.data.housing_allowance,
      other_allowances: [
        { label: "Other allowances", amount: parsed.data.other_allowances_amount },
      ],
      leave_rate_per_month: parsed.data.leave_rate_per_month,
      salary_amount:
        parsed.data.basic_pay +
        parsed.data.housing_allowance +
        parsed.data.other_allowances_amount,
      start_date: startDate,
      title: parsed.data.title,
    })
    .eq("id", contract.id);

  if (error) {
    hrError(error.message);
  }

  await recordOpsAuditEvent({
    action: "employee_contract.updated",
    actorUserId: profile.id,
    entityId: contract.id,
    entityType: "employee_contract",
    metadata: {
      contract_number: contract.contract_number,
      basic_pay: parsed.data.basic_pay,
      housing_allowance: parsed.data.housing_allowance,
    },
    moduleKey: "employees",
    sourceId: contract.id,
    sourceTable: "employee_contracts",
    summary: `Updated contract ${contract.contract_number} pay structure`,
  });

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?updated=contract`);
}

export async function createPerformanceAppraisalAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsPerformanceAppraisal(profile.role)) {
    hrError("Your role cannot create performance appraisals.");
  }

  const parsed = performanceAppraisalSchema.safeParse({
    cycle_name: field(formData, "cycle_name"),
    employee_id: field(formData, "employee_id"),
    goals: field(formData, "goals"),
    period_end: field(formData, "period_end"),
    period_start: field(formData, "period_start"),
    reviewer_id: field(formData, "reviewer_id"),
    status: field(formData, "status") || "planned",
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Check the performance appraisal.");
  }

  const employee = await fetchEmployee(parsed.data.employee_id);

  if (!employee) {
    hrError("Employee was not found.");
  }

  const periodStart = normalizeDate(parsed.data.period_start, "Use a valid appraisal period start date.");
  const periodEnd = normalizeDate(parsed.data.period_end, "Use a valid appraisal period end date.");

  if (periodEnd < periodStart) {
    hrError("Appraisal period end cannot be before the start date.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("performance_appraisals")
    .insert({
      created_by: profile.id,
      cycle_name: parsed.data.cycle_name,
      employee_id: employee.id,
      goals: parsed.data.goals,
      period_end: periodEnd,
      period_start: periodStart,
      reviewer_id: normalizeOptionalUuid(parsed.data.reviewer_id),
      status: parsed.data.status,
    })
    .select("id, appraisal_number")
    .single<{ appraisal_number: string; id: string }>();

  if (error || !data) {
    hrError(error?.message ?? "Could not create performance appraisal.");
  }

  await recordOpsAuditEvent({
    action: "performance_appraisal.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "performance_appraisal",
    metadata: { appraisal_number: data.appraisal_number, employee_number: employee.employee_number },
    moduleKey: "employees",
    sourceId: data.id,
    sourceTable: "performance_appraisals",
    summary: `Created performance appraisal ${data.appraisal_number}`,
  });

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?created=appraisal`);
}

export async function completePerformanceAppraisalAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = completeAppraisalSchema.safeParse({
    appraisal_id: field(formData, "appraisal_id"),
    goals: field(formData, "goals"),
    improvement_areas: field(formData, "improvement_areas"),
    overall_rating: field(formData, "overall_rating"),
    strengths: field(formData, "strengths"),
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Check the appraisal completion.");
  }

  const appraisal = await fetchPerformanceAppraisal(parsed.data.appraisal_id);

  if (!appraisal) {
    hrError("Performance appraisal was not found.");
  }

  if (!canManageOpsPerformanceAppraisal(profile.role, appraisal)) {
    hrError("Your role cannot complete this appraisal.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("performance_appraisals")
    .update({
      completed_at: new Date().toISOString(),
      goals: parsed.data.goals,
      improvement_areas: parsed.data.improvement_areas,
      overall_rating: parsed.data.overall_rating,
      status: "completed",
      strengths: parsed.data.strengths,
    })
    .eq("id", appraisal.id);

  if (error) {
    hrError(error.message);
  }

  await recordOpsAuditEvent({
    action: "performance_appraisal.completed",
    actorUserId: profile.id,
    entityId: appraisal.id,
    entityType: "performance_appraisal",
    metadata: { appraisal_number: appraisal.appraisal_number },
    moduleKey: "employees",
    sourceId: appraisal.id,
    sourceTable: "performance_appraisals",
    summary: `Completed appraisal ${appraisal.appraisal_number}`,
  });

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?updated=appraisal_completed`);
}

export async function upsertLeaveBalanceAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsLeaveBalance(profile.role)) {
    hrError("Your role cannot manage leave balances.");
  }

  const parsed = leaveBalanceSchema.safeParse({
    accrued_days: field(formData, "accrued_days") || "0",
    adjustment_days: field(formData, "adjustment_days") || "0",
    balance_year: field(formData, "balance_year") || String(new Date().getFullYear()),
    employee_id: field(formData, "employee_id"),
    leave_type: field(formData, "leave_type") || "annual",
    notes: field(formData, "notes"),
    opening_balance: field(formData, "opening_balance") || "0",
    used_days: field(formData, "used_days") || "0",
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Check the leave balance.");
  }

  const employee = await fetchEmployee(parsed.data.employee_id);

  if (!employee) {
    hrError("Employee was not found.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("leave_balances")
    .upsert(
      {
        accrued_days: parsed.data.accrued_days,
        adjustment_days: parsed.data.adjustment_days,
        balance_year: parsed.data.balance_year,
        created_by: profile.id,
        employee_id: employee.id,
        leave_type: parsed.data.leave_type,
        notes: parsed.data.notes,
        opening_balance: parsed.data.opening_balance,
        used_days: parsed.data.used_days,
      },
      { onConflict: "employee_id,leave_type,balance_year" },
    )
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    hrError(error?.message ?? "Could not save leave balance.");
  }

  await recordOpsAuditEvent({
    action: "leave_balance.upserted",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "leave_balance",
    metadata: {
      balance_year: parsed.data.balance_year,
      employee_number: employee.employee_number,
      leave_type: parsed.data.leave_type,
    },
    moduleKey: "employees",
    sourceId: data.id,
    sourceTable: "leave_balances",
    summary: `Saved ${parsed.data.balance_year} ${parsed.data.leave_type} leave balance`,
  });

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?updated=leave_balance`);
}

export async function createHrDocumentCategoryAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsHrDocumentCategory(profile.role)) {
    hrError("Your role cannot manage HR document categories.");
  }

  const parsed = hrDocumentCategorySchema.safeParse({
    category_code: field(formData, "category_code"),
    description: field(formData, "description"),
    is_required: field(formData, "is_required"),
    name: field(formData, "name"),
    retention_years: field(formData, "retention_years"),
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Check the HR document category.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("hr_document_categories")
    .insert({
      category_code: parsed.data.category_code,
      created_by: profile.id,
      description: parsed.data.description,
      is_required: parsed.data.is_required === "on",
      name: parsed.data.name,
      retention_years: parsed.data.retention_years || null,
    })
    .select("id, category_code")
    .single<{ category_code: string; id: string }>();

  if (error || !data) {
    hrError(
      error?.code === "23505"
        ? "That HR document category already exists."
        : error?.message ?? "Could not create HR document category.",
    );
  }

  await recordOpsAuditEvent({
    action: "hr_document_category.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "hr_document_category",
    metadata: { category_code: data.category_code },
    moduleKey: "employees",
    summary: `Created HR document category ${data.category_code}`,
  });

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?created=hr_document_category`);
}

export async function uploadEmployeeDocumentAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = employeeDocumentUploadSchema.safeParse({
    category_id: field(formData, "category_id"),
    employee_id: field(formData, "employee_id"),
    expiry_date: field(formData, "expiry_date"),
    return_to: field(formData, "return_to") || `${HR_ROUTE}#employee-register`,
    title: field(formData, "title"),
  });
  const returnTo = parsed.success
    ? parsed.data.return_to
    : field(formData, "return_to") || `${HR_ROUTE}#employee-register`;

  if (!parsed.success) {
    employeeDocumentError(
      parsed.error.issues[0]?.message ?? "Check the employee document.",
      returnTo,
    );
  }

  const employee = await fetchEmployee(parsed.data.employee_id);

  if (!employee) {
    employeeDocumentError("Employee was not found.", returnTo);
  }

  if (!canUploadOpsEmployeeDocument(profile.id, profile.role, employee)) {
    employeeDocumentError("Your role cannot upload documents for this employee.", returnTo);
  }

  const category = await fetchHrDocumentCategory(parsed.data.category_id);

  if (!category || !category.is_active) {
    employeeDocumentError("Select an active HR document category.", returnTo);
  }

  const expiryDate = parsed.data.expiry_date;

  if (expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
    employeeDocumentError("Use a valid document expiry date.", returnTo);
  }

  const upload = validateOpsUploadFile(formData.get("document"), {
    empty: "Select an HR document to upload.",
    tooLarge: "HR documents must be 25 MB or smaller.",
    unsupportedType: "Upload a PDF, Word, Excel, CSV, text, JPEG, PNG, or WebP file.",
  });

  if (!upload.ok) {
    employeeDocumentError(upload.message, returnTo);
  }

  const file = upload.file;
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const checksum = crypto.createHash("sha256").update(fileBytes).digest("hex");
  const safeName = safeOpsFileName(file.name || "employee-document");
  const key = `documents/hr/${employee.employee_number.toLowerCase()}/${category.category_code}/${crypto.randomUUID()}-${safeName}`;
  const title =
    parsed.data.title ||
    `${category.name} - ${employee.full_name || employee.employee_number}`;

  await putOpsR2Object({
    body: fileBytes,
    contentType: file.type,
    key,
  });

  const supabase = getOpsSupabaseServiceClient();
  const { data: document, error: documentErrorResult } = await supabase
    .from("documents")
    .insert({
      category: "hr",
      description: `Employee document for ${employee.employee_number}: ${category.name}`,
      status: "active",
      title,
      uploaded_by: profile.id,
      visibility: "private",
    })
    .select("id")
    .single<{ id: string }>();

  if (documentErrorResult || !document) {
    await deleteOpsR2Object(key).catch(() => null);
    employeeDocumentError(
      documentErrorResult?.message ?? "The file was uploaded but could not be logged.",
      returnTo,
    );
  }

  const { data: version, error: versionError } = await supabase
    .from("document_versions")
    .insert({
      checksum_sha256: checksum,
      content_type: file.type,
      document_id: document.id,
      file_name: file.name || safeName,
      file_size_bytes: file.size,
      r2_key: key,
      uploaded_by: profile.id,
      version_number: 1,
    })
    .select("id")
    .single<{ id: string }>();

  if (versionError || !version) {
    await Promise.all([
      deleteOpsR2Object(key).catch(() => null),
      supabase.from("documents").update({ status: "archived" }).eq("id", document.id),
    ]);
    employeeDocumentError(
      versionError?.message ?? "The document was created but the version was not logged.",
      returnTo,
    );
  }

  const [{ error: linkError }, { data: employeeDocument, error: employeeDocumentErrorResult }] =
    await Promise.all([
      supabase.from("document_links").insert({
        document_id: document.id,
        module_key: "employees",
        source_id: employee.id,
        source_table: "employees",
      }),
      supabase
        .from("employee_documents")
        .insert({
          category_id: category.id,
          document_id: document.id,
          document_version_id: version.id,
          employee_id: employee.id,
          expiry_date: expiryDate || null,
          status: "submitted",
          uploaded_by: profile.id,
        })
        .select("id")
        .single<{ id: string }>(),
    ]);

  if (linkError || employeeDocumentErrorResult || !employeeDocument) {
    await Promise.all([
      deleteOpsR2Object(key).catch(() => null),
      supabase.from("documents").update({ status: "archived" }).eq("id", document.id),
      employeeDocument?.id
        ? supabase
            .from("employee_documents")
            .update({ status: "archived" })
            .eq("id", employeeDocument.id)
        : Promise.resolve(null),
    ]);
    employeeDocumentError(
      employeeDocumentErrorResult?.message ||
        linkError?.message ||
        "The document was uploaded but could not be linked to the employee.",
      returnTo,
    );
  }

  await recordOpsAuditEvent({
    action: "employee_document.uploaded",
    actorUserId: profile.id,
    entityId: employeeDocument.id,
    entityType: "employee_document",
    metadata: {
      category_code: category.category_code,
      document_id: document.id,
      employee_number: employee.employee_number,
      version_id: version.id,
    },
    moduleKey: "employees",
    sourceId: employeeDocument.id,
    sourceTable: "employee_documents",
    summary: `Uploaded ${category.name} for ${employee.employee_number}`,
  });

  revalidatePath(HR_ROUTE);
  revalidatePath("/ops/profile");
  redirectWithOpsParam(returnTo, "created", "employee_document");
}

export async function acceptEmployeeDocumentAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = employeeDocumentIdSchema.safeParse({
    employee_document_id: field(formData, "employee_document_id"),
    return_to: field(formData, "return_to") || `${HR_ROUTE}#employee-register`,
  });
  const returnTo = parsed.success
    ? parsed.data.return_to
    : field(formData, "return_to") || `${HR_ROUTE}#employee-register`;

  if (!parsed.success) {
    employeeDocumentError(parsed.error.issues[0]?.message ?? "Select an employee document.", returnTo);
  }

  const employeeDocument = await fetchEmployeeDocument(parsed.data.employee_document_id);

  if (!employeeDocument) {
    employeeDocumentError("Employee document was not found.", returnTo);
  }

  if (!canReviewOpsEmployeeDocument(profile.role, employeeDocument)) {
    employeeDocumentError("Your role cannot review this employee document.", returnTo);
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("employee_documents")
    .update({
      review_notes: "",
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile.id,
      status: "accepted",
    })
    .eq("id", employeeDocument.id);

  if (error) {
    employeeDocumentError(error.message, returnTo);
  }

  await recordOpsAuditEvent({
    action: "employee_document.accepted",
    actorUserId: profile.id,
    entityId: employeeDocument.id,
    entityType: "employee_document",
    metadata: { document_id: employeeDocument.document_id },
    moduleKey: "employees",
    sourceId: employeeDocument.id,
    sourceTable: "employee_documents",
    summary: "Accepted employee document",
  });

  revalidatePath(HR_ROUTE);
  revalidatePath("/ops/profile");
  redirectWithOpsParam(returnTo, "updated", "employee_document_reviewed");
}

export async function rejectEmployeeDocumentAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = rejectEmployeeDocumentSchema.safeParse({
    employee_document_id: field(formData, "employee_document_id"),
    return_to: field(formData, "return_to") || `${HR_ROUTE}#employee-register`,
    review_notes: field(formData, "review_notes"),
  });
  const returnTo = parsed.success
    ? parsed.data.return_to
    : field(formData, "return_to") || `${HR_ROUTE}#employee-register`;

  if (!parsed.success) {
    employeeDocumentError(parsed.error.issues[0]?.message ?? "Check the employee document.", returnTo);
  }

  const employeeDocument = await fetchEmployeeDocument(parsed.data.employee_document_id);

  if (!employeeDocument) {
    employeeDocumentError("Employee document was not found.", returnTo);
  }

  if (!canReviewOpsEmployeeDocument(profile.role, employeeDocument)) {
    employeeDocumentError("Your role cannot review this employee document.", returnTo);
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("employee_documents")
    .update({
      review_notes: parsed.data.review_notes,
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile.id,
      status: "rejected",
    })
    .eq("id", employeeDocument.id);

  if (error) {
    employeeDocumentError(error.message, returnTo);
  }

  await recordOpsAuditEvent({
    action: "employee_document.rejected",
    actorUserId: profile.id,
    entityId: employeeDocument.id,
    entityType: "employee_document",
    metadata: { document_id: employeeDocument.document_id },
    moduleKey: "employees",
    sourceId: employeeDocument.id,
    sourceTable: "employee_documents",
    summary: "Rejected employee document",
  });

  revalidatePath(HR_ROUTE);
  revalidatePath("/ops/profile");
  redirectWithOpsParam(returnTo, "updated", "employee_document_reviewed");
}

export async function archiveEmployeeDocumentAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = employeeDocumentIdSchema.safeParse({
    employee_document_id: field(formData, "employee_document_id"),
    return_to: field(formData, "return_to") || `${HR_ROUTE}#employee-register`,
  });
  const returnTo = parsed.success
    ? parsed.data.return_to
    : field(formData, "return_to") || `${HR_ROUTE}#employee-register`;

  if (!parsed.success) {
    employeeDocumentError(parsed.error.issues[0]?.message ?? "Select an employee document.", returnTo);
  }

  const employeeDocument = await fetchEmployeeDocument(parsed.data.employee_document_id);

  if (!employeeDocument) {
    employeeDocumentError("Employee document was not found.", returnTo);
  }

  if (!canArchiveOpsEmployeeDocument(profile.role, employeeDocument)) {
    employeeDocumentError("Your role cannot archive this employee document.", returnTo);
  }

  const supabase = getOpsSupabaseServiceClient();
  const [{ error: employeeDocumentErrorResult }, { error: documentErrorResult }] =
    await Promise.all([
      supabase
        .from("employee_documents")
        .update({
          reviewed_at: new Date().toISOString(),
          reviewed_by: profile.id,
          status: "archived",
        })
        .eq("id", employeeDocument.id),
      supabase
        .from("documents")
        .update({
          archived_at: new Date().toISOString(),
          status: "archived",
        })
        .eq("id", employeeDocument.document_id),
    ]);

  if (employeeDocumentErrorResult || documentErrorResult) {
    employeeDocumentError(
      employeeDocumentErrorResult?.message ||
        documentErrorResult?.message ||
        "Could not archive this employee document.",
      returnTo,
    );
  }

  await recordOpsAuditEvent({
    action: "employee_document.archived",
    actorUserId: profile.id,
    entityId: employeeDocument.id,
    entityType: "employee_document",
    metadata: { document_id: employeeDocument.document_id },
    moduleKey: "employees",
    sourceId: employeeDocument.id,
    sourceTable: "employee_documents",
    summary: "Archived employee document",
  });

  revalidatePath(HR_ROUTE);
  revalidatePath("/ops/profile");
  redirectWithOpsParam(returnTo, "updated", "employee_document_archived");
}

export async function updateEmployeeStatusAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canUpdateOpsEmployeeStatus(profile.role)) {
    hrError("Your role cannot update employee status.");
  }

  const parsed = employeeStatusSchema.safeParse({
    employee_id: field(formData, "employee_id"),
    status: field(formData, "status"),
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Check the employee status.");
  }

  const employee = await fetchEmployee(parsed.data.employee_id);

  if (!employee) {
    hrError("Employee was not found.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("employees")
    .update({
      end_date: parsed.data.status === "exited" ? today() : null,
      status: parsed.data.status,
    })
    .eq("id", employee.id);

  if (error) {
    hrError(error.message);
  }

  await recordOpsAuditEvent({
    action: "employee.status_updated",
    actorUserId: profile.id,
    entityId: employee.id,
    entityType: "employee",
    metadata: { employee_number: employee.employee_number, status: parsed.data.status },
    moduleKey: "employees",
    sourceId: employee.id,
    sourceTable: "employees",
    summary: `Updated ${employee.employee_number} status to ${parsed.data.status}`,
  });

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?updated=employee_status`);
}

export async function createLeaveRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canCreateOpsLeaveRequest(profile.role)) {
    hrError("Your role cannot create leave requests.");
  }

  const parsed = leaveRequestSchema.safeParse({
    days_requested: field(formData, "days_requested"),
    employee_id: field(formData, "employee_id"),
    end_date: field(formData, "end_date"),
    handover_notes: field(formData, "handover_notes"),
    leave_type: field(formData, "leave_type") || "annual",
    reason: field(formData, "reason"),
    start_date: field(formData, "start_date"),
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Check the leave request.");
  }

  const employee = await fetchEmployee(parsed.data.employee_id);

  if (!employee || employee.status === "exited" || employee.status === "suspended") {
    hrError("Select an active employee.");
  }

  const startDate = normalizeDate(parsed.data.start_date, "Use a valid leave start date.");
  const endDate = normalizeDate(parsed.data.end_date, "Use a valid leave end date.");

  if (endDate < startDate) {
    hrError("Leave end date cannot be before the start date.");
  }

  const daysRequested =
    parsed.data.days_requested === "" || parsed.data.days_requested === undefined
      ? inclusiveDateDays(startDate, endDate)
      : parsed.data.days_requested;

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .insert({
      created_by: profile.id,
      days_requested: daysRequested,
      employee_id: employee.id,
      end_date: endDate,
      handover_notes: parsed.data.handover_notes,
      leave_type: parsed.data.leave_type,
      reason: parsed.data.reason,
      start_date: startDate,
    })
    .select("id, leave_number")
    .single<{ id: string; leave_number: string }>();

  if (error || !data) {
    hrError(error?.message ?? "Could not create leave request.");
  }

  await recordOpsAuditEvent({
    action: "leave_request.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "leave_request",
    metadata: { employee_number: employee.employee_number, leave_number: data.leave_number },
    moduleKey: "employees",
    sourceId: data.id,
    sourceTable: "leave_requests",
    summary: `Created leave request ${data.leave_number}`,
  });

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?created=leave`);
}

export async function submitLeaveRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = leaveIdSchema.safeParse({ leave_request_id: field(formData, "leave_request_id") });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Select a leave request.");
  }

  const leaveRequest = await fetchLeaveRequest(parsed.data.leave_request_id);

  if (!leaveRequest) {
    hrError("Leave request was not found.");
  }

  if (!canSubmitOpsLeaveRequest(profile.id, profile.role, {
    ...leaveRequest,
    employee_user_id: leaveRequest.employee?.user_id,
  })) {
    hrError("Your role cannot submit this leave request.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", leaveRequest.id);

  if (error) {
    hrError(error.message);
  }

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    actionNeededRoles: ["human_resource", "hr"],
    title: `Leave request: ${leaveRequest.leave_number}`,
    body: `${profile.full_name} submitted leave request ${leaveRequest.leave_number}. Approval needed.`,
    actionHref: HR_ROUTE,
    moduleKey: "employees",
    sourceTable: "leave_requests",
    sourceId: leaveRequest.id,
    eventKey: "submitted",
  });

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?updated=leave_submitted`);
}

export async function approveLeaveRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = leaveIdSchema.safeParse({ leave_request_id: field(formData, "leave_request_id") });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Select a leave request.");
  }

  const leaveRequest = await fetchLeaveRequest(parsed.data.leave_request_id);

  if (!leaveRequest) {
    hrError("Leave request was not found.");
  }

  if (!canApproveOpsLeaveRequest(profile.role, leaveRequest)) {
    hrError("Your role cannot approve this leave request.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({
      approved_at: new Date().toISOString(),
      approved_by: profile.id,
      status: "approved",
    })
    .eq("id", leaveRequest.id);

  if (error) {
    hrError(error.message);
  }

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    stakeholderIds: [leaveRequest.employee?.user_id, leaveRequest.created_by],
    title: `Leave approved: ${leaveRequest.leave_number}`,
    body: `${profile.full_name} approved leave request ${leaveRequest.leave_number}.`,
    actionHref: HR_ROUTE,
    moduleKey: "employees",
    sourceTable: "leave_requests",
    sourceId: leaveRequest.id,
    eventKey: "approved",
    category: "info",
  });

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?updated=leave_approved`);
}

export async function rejectLeaveRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = rejectLeaveSchema.safeParse({
    leave_request_id: field(formData, "leave_request_id"),
    rejection_reason: field(formData, "rejection_reason"),
  });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Check the rejection reason.");
  }

  const leaveRequest = await fetchLeaveRequest(parsed.data.leave_request_id);

  if (!leaveRequest) {
    hrError("Leave request was not found.");
  }

  if (!canRejectOpsLeaveRequest(profile.role, leaveRequest)) {
    hrError("Your role cannot reject this leave request.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({
      rejected_at: new Date().toISOString(),
      rejected_by: profile.id,
      rejection_reason: parsed.data.rejection_reason,
      status: "rejected",
    })
    .eq("id", leaveRequest.id);

  if (error) {
    hrError(error.message);
  }

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    stakeholderIds: [leaveRequest.employee?.user_id, leaveRequest.created_by],
    title: `Leave rejected: ${leaveRequest.leave_number}`,
    body: `${profile.full_name} rejected leave request ${leaveRequest.leave_number}. Reason: ${parsed.data.rejection_reason}`,
    actionHref: HR_ROUTE,
    moduleKey: "employees",
    sourceTable: "leave_requests",
    sourceId: leaveRequest.id,
    eventKey: "rejected",
    category: "info",
  });

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?updated=leave_rejected`);
}

export async function cancelLeaveRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = leaveIdSchema.safeParse({ leave_request_id: field(formData, "leave_request_id") });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Select a leave request.");
  }

  const leaveRequest = await fetchLeaveRequest(parsed.data.leave_request_id);

  if (!leaveRequest) {
    hrError("Leave request was not found.");
  }

  if (!canCancelOpsLeaveRequest(profile.id, profile.role, {
    ...leaveRequest,
    employee_user_id: leaveRequest.employee?.user_id,
  })) {
    hrError("Your role cannot cancel this leave request.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: profile.id,
      status: "cancelled",
    })
    .eq("id", leaveRequest.id);

  if (error) {
    hrError(error.message);
  }

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?updated=leave_cancelled`);
}

export async function completeLeaveRequestAction(formData: FormData) {
  const { profile } = await requireOpsUser();
  const parsed = leaveIdSchema.safeParse({ leave_request_id: field(formData, "leave_request_id") });

  if (!parsed.success) {
    hrError(parsed.error.issues[0]?.message ?? "Select a leave request.");
  }

  const leaveRequest = await fetchLeaveRequest(parsed.data.leave_request_id);

  if (!leaveRequest) {
    hrError("Leave request was not found.");
  }

  if (!canCompleteOpsLeaveRequest(profile.role, leaveRequest)) {
    hrError("Your role cannot complete this leave request.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({
      completed_at: new Date().toISOString(),
      completed_by: profile.id,
      status: "completed",
    })
    .eq("id", leaveRequest.id);

  if (error) {
    hrError(error.message);
  }

  await supabase
    .from("employees")
    .update({ status: "active" })
    .eq("id", leaveRequest.employee_id)
    .eq("status", "on_leave");

  revalidatePath(HR_ROUTE);
  redirect(`${HR_ROUTE}?updated=leave_completed`);
}
