import type { OpsUserRole } from "@/lib/ops/types";

export const OPS_ROLE_LABELS: Record<OpsUserRole, string> = {
  accountant: "Accountant",
  admin_receptionist: "Administration / Receptionist",
  crew: "Staff",
  developer: "Developer",
  engineer: "Engineer",
  engineering_manager: "Engineering Manager",
  finance_manager: "Finance Manager",
  general_manager: "General Manager",
  hr: "Human Resources",
  hse_assistant_officer: "Health, Safety and Environment Assistant Officer",
  hse_officer: "Health, Safety and Environment Officer",
  human_resource: "Human Resources",
  it_manager: "IT Manager",
  manager: "General Manager",
  managing_director: "Managing Director",
  operations_manager: "Operations Manager",
  owner: "Managing Director",
  procurement: "Procurement Officer",
  procurement_assistant: "Procurement Assistant",
  procurement_manager: "Procurement Manager",
  projects_manager: "Projects Manager",
  quantity_surveyor: "Quantity Surveyor",
  supervisor: "Operations Manager",
};

export const OPS_STAFF_ROLE_OPTIONS = [
  { value: "managing_director", label: "Managing Director" },
  { value: "general_manager", label: "General Manager" },
  { value: "human_resource", label: "Human Resources" },
  { value: "operations_manager", label: "Operations Manager" },
  { value: "projects_manager", label: "Projects Manager" },
  { value: "engineering_manager", label: "Engineering Manager" },
  { value: "procurement_manager", label: "Procurement Manager" },
  { value: "quantity_surveyor", label: "Quantity Surveyor" },
  { value: "procurement", label: "Procurement Officer" },
  { value: "procurement_assistant", label: "Procurement Assistant" },
  { value: "finance_manager", label: "Finance Manager" },
  { value: "accountant", label: "Accountant" },
  { value: "engineer", label: "Engineer" },
  { value: "hse_officer", label: "Health, Safety and Environment Officer" },
  { value: "hse_assistant_officer", label: "Health, Safety and Environment Assistant Officer" },
  { value: "admin_receptionist", label: "Administration / Receptionist" },
  { value: "it_manager", label: "IT Manager" },
] as const;

export const OPS_STAFF_ROLE_VALUES = [
  "managing_director",
  "general_manager",
  "human_resource",
  "operations_manager",
  "projects_manager",
  "engineering_manager",
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
  "it_manager",
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

export function isOperationsManagerRole(role?: string | null) {
  return role === "operations_manager";
}

export function isEngineeringManagerRole(role?: string | null) {
  return role === "engineering_manager";
}

export function isItManagerRole(role?: string | null) {
  return role === "it_manager";
}

/**
 * Leadership = MD, GM, Developer, Owner. NOT Operations Manager.
 * The organogram has Operations Manager reporting up to the Managing Director;
 * they do not have executive-level visibility.
 */
export function isLeadershipRole(role?: string | null) {
  return (
    isDeveloperRole(role) ||
    isManagingDirectorRole(role) ||
    isGeneralManagerRole(role)
  );
}
