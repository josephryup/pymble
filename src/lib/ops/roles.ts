import type { OpsUserRole } from "@/lib/ops/types";

export const OPS_ROLE_LABELS: Record<OpsUserRole, string> = {
  accountant: "Accountant",
  admin_receptionist: "Admin / Receptionist",
  crew: "Staff",
  developer: "Developer",
  engineer: "Engineer",
  finance_manager: "Finance Manager",
  general_manager: "General Manager",
  hr: "Human Resource",
  hse_assistant_officer: "HSE Assistant Officer",
  hse_officer: "HSE Officer",
  human_resource: "Human Resource",
  manager: "General Manager",
  managing_director: "Managing Director",
  operations_manager: "Operations Manager",
  owner: "Managing Director",
  procurement: "Procurement",
  procurement_assistant: "Procurement Assistant",
  procurement_manager: "Procurement Manager",
  projects_manager: "Projects Manager",
  quantity_surveyor: "Quantity Surveyor",
  supervisor: "Operations Manager",
};

export const OPS_STAFF_ROLE_OPTIONS = [
  { value: "managing_director", label: "Managing Director" },
  { value: "general_manager", label: "General Manager" },
  { value: "human_resource", label: "Human Resource" },
  { value: "operations_manager", label: "Operations Manager" },
  { value: "projects_manager", label: "Projects Manager" },
  { value: "procurement_manager", label: "Procurement Manager" },
  { value: "quantity_surveyor", label: "Quantity Surveyor" },
  { value: "procurement", label: "Procurement" },
  { value: "procurement_assistant", label: "Procurement Assistant" },
  { value: "finance_manager", label: "Finance Manager" },
  { value: "accountant", label: "Accountant" },
  { value: "engineer", label: "Engineer" },
  { value: "hse_officer", label: "HSE Officer" },
  { value: "hse_assistant_officer", label: "HSE Assistant Officer" },
  { value: "admin_receptionist", label: "Admin / Receptionist" },
] as const;

export const OPS_STAFF_ROLE_VALUES = [
  "managing_director",
  "general_manager",
  "human_resource",
  "operations_manager",
  "projects_manager",
  "procurement_manager",
  "quantity_surveyor",
  "procurement",
  "procurement_assistant",
  "finance_manager",
  "accountant",
  "engineer",
  "hse_officer",
  "hse_assistant_officer",
  "admin_receptionist",
] as const;

export type OpsAssignableStaffRole = (typeof OPS_STAFF_ROLE_VALUES)[number];

export function formatOpsRole(role?: string | null) {
  if (!role) {
    return "Staff";
  }

  return OPS_ROLE_LABELS[role as OpsUserRole] ?? role.replace(/_/g, " ");
}

export function formatOpsProfileName(name?: string | null, role?: OpsUserRole | null) {
  const normalizedName = name?.trim();

  if (role === "developer" && (!normalizedName || /^pymble (owner|developer)$/i.test(normalizedName))) {
    return "Developer";
  }

  return normalizedName || "Unnamed Staff";
}

export function formatOpsUserName(name?: string | null, userId?: string | null) {
  const normalizedName = name?.trim();

  if (normalizedName) {
    return normalizedName;
  }

  if (userId) {
    return `Staff ${userId.slice(0, 8)}`;
  }

  return "Staff account unavailable";
}

export function isDeveloperRole(role?: string | null) {
  return role === "developer";
}

export function isManagingDirectorRole(role?: string | null) {
  return role === "managing_director" || role === "owner";
}

export function isGeneralManagerRole(role?: string | null) {
  return role === "general_manager" || role === "manager";
}

export function isHumanResourceRole(role?: string | null) {
  return role === "human_resource" || role === "hr";
}
