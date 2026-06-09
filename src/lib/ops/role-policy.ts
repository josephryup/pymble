import { OPS_STAFF_ROLE_VALUES, type OpsAssignableStaffRole } from "@/lib/ops/roles";
import type { OpsUserRole } from "@/lib/ops/types";

export type OpsProductionRolePolicy = {
  role: OpsUserRole;
  label: string;
  accountModel: "single" | "many";
  canInviteStaff: boolean;
  canDeactivateStaff: boolean;
  visibleInAccessRegister: boolean;
  notes: string;
};

export const OPS_PRODUCTION_ASSIGNABLE_ROLES: OpsAssignableStaffRole[] = [
  ...OPS_STAFF_ROLE_VALUES,
];

export const OPS_PRODUCTION_ROLE_POLICY: OpsProductionRolePolicy[] = [
  {
    role: "developer",
    label: "Developer",
    accountModel: "single",
    canInviteStaff: true,
    canDeactivateStaff: true,
    visibleInAccessRegister: false,
    notes:
      "Developer account. Full system access, hidden from normal staff registers, and managed outside the app.",
  },
  {
    role: "managing_director",
    label: "Managing Director",
    accountModel: "single",
    canInviteStaff: true,
    canDeactivateStaff: true,
    visibleInAccessRegister: true,
    notes:
      "Overall business owner. Full operating access except deleting or downgrading the Developer account.",
  },
  {
    role: "general_manager",
    label: "General Manager",
    accountModel: "many",
    canInviteStaff: true,
    canDeactivateStaff: true,
    visibleInAccessRegister: true,
    notes:
      "Can create and deactivate operational accounts except Managing Director and Developer.",
  },
  {
    role: "human_resource",
    label: "Human Resource",
    accountModel: "many",
    canInviteStaff: true,
    canDeactivateStaff: true,
    visibleInAccessRegister: true,
    notes:
      "Can create and deactivate staff accounts except Managing Director, General Manager, and Developer.",
  },
  {
    role: "operations_manager",
    label: "Operations Manager",
    accountModel: "many",
    canInviteStaff: false,
    canDeactivateStaff: false,
    visibleInAccessRegister: true,
    notes: "Operational delivery role with module access only.",
  },
  {
    role: "projects_manager",
    label: "Projects Manager",
    accountModel: "many",
    canInviteStaff: false,
    canDeactivateStaff: false,
    visibleInAccessRegister: true,
    notes: "Project delivery role with module access only.",
  },
  {
    role: "procurement_manager",
    label: "Procurement Manager",
    accountModel: "many",
    canInviteStaff: false,
    canDeactivateStaff: false,
    visibleInAccessRegister: true,
    notes: "Procurement leadership role with module access only.",
  },
  {
    role: "quantity_surveyor",
    label: "Quantity Surveyor",
    accountModel: "many",
    canInviteStaff: false,
    canDeactivateStaff: false,
    visibleInAccessRegister: true,
    notes: "Commercial and project cost control role with module access only.",
  },
  {
    role: "procurement",
    label: "Procurement",
    accountModel: "many",
    canInviteStaff: false,
    canDeactivateStaff: false,
    visibleInAccessRegister: true,
    notes: "Procurement execution role with module access only.",
  },
  {
    role: "procurement_assistant",
    label: "Procurement Assistant",
    accountModel: "many",
    canInviteStaff: false,
    canDeactivateStaff: false,
    visibleInAccessRegister: true,
    notes: "Procurement support role with module access only.",
  },
  {
    role: "finance_manager",
    label: "Finance Manager",
    accountModel: "many",
    canInviteStaff: false,
    canDeactivateStaff: false,
    visibleInAccessRegister: true,
    notes: "Finance leadership role with module access only.",
  },
  {
    role: "accountant",
    label: "Accountant",
    accountModel: "many",
    canInviteStaff: false,
    canDeactivateStaff: false,
    visibleInAccessRegister: true,
    notes: "Accounting execution role with module access only.",
  },
  {
    role: "engineer",
    label: "Engineer",
    accountModel: "many",
    canInviteStaff: false,
    canDeactivateStaff: false,
    visibleInAccessRegister: true,
    notes: "Field engineering role with module access only.",
  },
  {
    role: "hse_officer",
    label: "HSE Officer",
    accountModel: "many",
    canInviteStaff: false,
    canDeactivateStaff: false,
    visibleInAccessRegister: true,
    notes: "HSE control role with module access only.",
  },
  {
    role: "hse_assistant_officer",
    label: "HSE Assistant Officer",
    accountModel: "many",
    canInviteStaff: false,
    canDeactivateStaff: false,
    visibleInAccessRegister: true,
    notes: "HSE support role with module access only.",
  },
  {
    role: "admin_receptionist",
    label: "Admin / Receptionist",
    accountModel: "many",
    canInviteStaff: false,
    canDeactivateStaff: false,
    visibleInAccessRegister: true,
    notes: "Admin and HR-support visibility role with module access only.",
  },
];

export function getOpsProductionRolePolicy(role: OpsUserRole) {
  return OPS_PRODUCTION_ROLE_POLICY.find((policy) => policy.role === role) ?? null;
}
