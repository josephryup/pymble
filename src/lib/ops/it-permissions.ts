import type { OpsUserRole } from "@/lib/ops/types";

/**
 * Information Technology is a role-isolated area. The IT Manager runs it; the
 * Managing Director / Owner keep oversight and the Developer retains
 * maintenance access. The General Manager is intentionally excluded — IT
 * reports to the MD on the organogram. Mirrors OPS_IT_ROLES in constants.ts.
 */
const IT_ROLES: OpsUserRole[] = [
  "developer",
  "managing_director",
  "owner",
  "it_manager",
];

/** See the IT area, dashboards, asset register, and the full help-desk queue. */
export function canViewIT(role: OpsUserRole) {
  return IT_ROLES.includes(role);
}

/**
 * Manage any IT register (software, access, checklists, policies, credentials,
 * infrastructure). View == manage for the IT area — every surface is
 * role-isolated to IT + MD, so a single gate covers create/edit/archive.
 */
export function canManageIT(role: OpsUserRole) {
  return IT_ROLES.includes(role);
}

/** Create, edit, assign, and retire IT assets. */
export function canManageItAssets(role: OpsUserRole) {
  return IT_ROLES.includes(role);
}

/** Triage the help-desk queue: assign, change status, add internal notes, close. */
export function canManageItTickets(role: OpsUserRole) {
  return IT_ROLES.includes(role);
}

/**
 * Raise an IT support ticket. This is the one IT surface open to every
 * authenticated staff member — support is useless if staff cannot reach it.
 * Requesters only ever see their own tickets (see canViewItTicket).
 */
export function canRaiseItTicket(role: OpsUserRole) {
  // Every staff member with a workspace account can reach IT. Crew are casual
  // site labour without ops logins, mirroring canManageOps in permissions.ts.
  return role !== "crew";
}

/**
 * View a single ticket: IT staff see everything; a requester sees only the
 * tickets they raised. Internal IT notes are filtered separately, server-side.
 */
export function canViewItTicket(
  role: OpsUserRole,
  ticket: { raised_by: string | null },
  userId: string,
) {
  return canManageItTickets(role) || ticket.raised_by === userId;
}
