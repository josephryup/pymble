import type { OpsUserRole } from "@/lib/ops/types";

const EXECUTIVE_DASHBOARD_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "manager",
];

export function canViewOpsExecutiveDashboard(role: OpsUserRole) {
  return EXECUTIVE_DASHBOARD_ROLES.includes(role);
}
