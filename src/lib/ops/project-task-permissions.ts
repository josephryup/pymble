import {
  isDeveloperRole,
  isEngineeringManagerRole,
  isGeneralManagerRole,
  isManagingDirectorRole,
} from "@/lib/ops/roles";
import type { OpsUserRole } from "@/lib/ops/types";

/**
 * Roles that can create + edit project tasks. Projects Manager owns the
 * schedule day-to-day; Engineering Manager + Operations Manager + leadership
 * can also intervene.
 */
const PROJECT_TASK_MANAGER_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "general_manager",
  "owner",
  "manager",
  "operations_manager",
  "projects_manager",
  "engineering_manager",
];

export function canCreateProjectTask(role: OpsUserRole) {
  return PROJECT_TASK_MANAGER_ROLES.includes(role);
}

export function canEditProjectTask(role: OpsUserRole) {
  return PROJECT_TASK_MANAGER_ROLES.includes(role);
}

/**
 * Updating progress / marking complete: managers above + the assigned
 * engineer themselves. Other engineers cannot move someone else's task.
 */
export function canUpdateProjectTaskProgress(
  role: OpsUserRole,
  actorId: string,
  task: { assigned_to: string | null },
) {
  if (PROJECT_TASK_MANAGER_ROLES.includes(role)) return true;
  if (role === "engineer" && task.assigned_to === actorId) return true;
  return false;
}

export function canArchiveProjectTask(role: OpsUserRole) {
  return (
    isDeveloperRole(role) ||
    isManagingDirectorRole(role) ||
    isGeneralManagerRole(role) ||
    isEngineeringManagerRole(role) ||
    role === "projects_manager"
  );
}

export function canDeleteProjectTask(role: OpsUserRole) {
  return isDeveloperRole(role);
}

/**
 * Visibility: site-delivery roles see the schedule; everyone else doesn't.
 * Mirrors what the rest of the site-delivery surface exposes.
 */
const PROJECT_TASK_VIEWER_ROLES: OpsUserRole[] = [
  ...PROJECT_TASK_MANAGER_ROLES,
  "engineer",
  "supervisor",
  "hse_officer",
  "hse_assistant_officer",
  "quantity_surveyor",
];

export function canViewProjectTasks(role: OpsUserRole) {
  return PROJECT_TASK_VIEWER_ROLES.includes(role);
}
