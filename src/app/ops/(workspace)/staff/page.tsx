import { ShieldCheck, UserMinus, UserPlus, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { OpsConfirmSubmitButton } from "@/components/ops/OpsConfirmSubmitButton";
import { OpsSubmitButton } from "@/components/ops/OpsSubmitButton";
import {
  OpsMobileRecordCard,
  OpsMobileRecordList,
  OpsMobileRecordRow,
} from "@/components/ops/OpsMobileRecord";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  canAccessOpsHref,
  canChangeStaffRole,
  canCreateStaffRole,
  canDeactivateStaffRole,
  canManageStaff,
} from "@/lib/ops/permissions";
import {
  changeStaffMemberRoleAction,
  createStaffMemberAction,
  deactivateStaffMemberAction,
} from "@/lib/ops/staff-actions";
import { fetchOpsStaffMembers } from "@/lib/ops/staff";
import {
  assignEngineeringInternToSiteAction,
  unassignEngineeringInternFromSiteAction,
} from "@/lib/ops/site-assignment-actions";
import {
  canManageOpsSiteAssignments,
  fetchActiveEngineeringInternSiteAssignments,
} from "@/lib/ops/site-assignments";
import { fetchActiveSiteOptions } from "@/lib/ops/sites";
import {
  firstParam,
  noticeFromParams,
  OPS_DANGER_BUTTON_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_TABLE_SCROLL_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";
import { formatOpsRole, OPS_STAFF_ROLE_OPTIONS } from "@/lib/ops/roles";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

function staffNotice(params: OpsSearchParams) {
  const created = noticeFromParams(params, "staff", "Staff invitation sent.");

  if (created) {
    return created;
  }

  if (firstParam(params.created) === "invitation") {
    return {
      tone: "success" as const,
      message: "Staff invitation sent.",
    };
  }

  if (firstParam(params.updated) === "deactivated") {
    return {
      tone: "success" as const,
      message: "Staff account deactivated.",
    };
  }

  if (firstParam(params.updated) === "role") {
    return {
      tone: "success" as const,
      message: "Staff member role updated.",
    };
  }

  if (firstParam(params.updated) === "role-unchanged") {
    return {
      tone: "success" as const,
      message: "Staff member already has that role — no change made.",
    };
  }

  if (firstParam(params.updated) === "site-assignment") {
    return { tone: "success" as const, message: "Engineering Intern site assignment saved." };
  }

  if (firstParam(params.updated) === "site-unassigned") {
    return { tone: "success" as const, message: "Engineering Intern site assignment removed." };
  }

  return null;
}

function roleClass(role: string) {
  if (role === "managing_director" || role === "owner") {
    return "border-primary-blue/20 bg-primary-blue/10 text-primary-blue";
  }

  if (role === "general_manager" || role === "manager") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (role === "human_resource" || role === "hr") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  if (
    role === "operations_manager" ||
    role === "projects_manager" ||
    role === "procurement_manager" ||
    role === "finance_manager"
  ) {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  return "border-border bg-muted/40 text-foreground/70";
}

export default async function OpsStaffPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([searchParams ?? Promise.resolve({}), requireOpsUser()]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/staff")) {
    notFound();
  }

  const canManageAssignments = canManageOpsSiteAssignments(auth.profile.role);
  const [staffMembers, siteOptions, siteAssignments] = await Promise.all([
    fetchOpsStaffMembers(),
    fetchActiveSiteOptions(),
    canManageAssignments ? fetchActiveEngineeringInternSiteAssignments() : Promise.resolve([]),
  ]);
  const canCreateStaff = canManageStaff(auth.profile.role);
  const engineeringInterns = staffMembers.filter(
    (member) => member.is_active && member.role === "engineering_intern",
  );
  const notice = staffNotice(params);
  const activeStaff = staffMembers.filter((member) => member.is_active).length;
  const directorCount = staffMembers.filter(
    (member) =>
      member.is_active && (member.role === "managing_director" || member.role === "owner"),
  ).length;
  const generalManagerCount = staffMembers.filter(
    (member) =>
      member.is_active && (member.role === "general_manager" || member.role === "manager"),
  ).length;
  const humanResourceCount = staffMembers.filter(
    (member) => member.is_active && (member.role === "human_resource" || member.role === "hr"),
  ).length;
  const operationsCount = staffMembers.filter(
    (member) =>
      member.is_active &&
      [
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
        "supervisor",
        "crew",
      ].includes(member.role),
  ).length;
  const assignableRoles = OPS_STAFF_ROLE_OPTIONS.filter((role) =>
    canCreateStaffRole(auth.profile.role, role.value),
  );

  return (
    <div className="w-full max-w-none space-y-6">
      <section className="rounded-lg border border-border bg-card p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Pymble Staff
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-foreground">
              Invite-only access
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-foreground/68">
              Manage internal access for Pymble Construction staff. All accounts are created by
              invitation.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Active
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {activeStaff}
              </p>
            </div>
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Managing Director
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {directorCount}
              </p>
            </div>
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                General Managers
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {generalManagerCount}
              </p>
            </div>
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Human Resource
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {humanResourceCount}
              </p>
            </div>
            <div className="rounded-md border border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Operations
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-foreground">
                {operationsCount}
              </p>
            </div>
          </div>
        </div>
      </section>

      {notice ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm font-semibold ${
            notice.tone === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </div>
      ) : null}

      {canCreateStaff ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <UserPlus className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-foreground">
                Invite staff member
              </h2>
              <p className="text-sm text-muted-foreground">
                Sends a secure email invitation and creates the staff account with the selected
                role.
              </p>
            </div>
          </div>
          <form
            action={createStaffMemberAction}
            className="grid gap-4 min-[520px]:grid-cols-2 lg:grid-cols-6"
          >
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Full name
              <input className={OPS_INPUT_CLASS} name="full_name" required />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Email
              <input
                autoComplete="off"
                className={OPS_INPUT_CLASS}
                name="email"
                required
                type="email"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Phone
              <input className={OPS_INPUT_CLASS} name="phone" />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Role
              <select
                className={OPS_INPUT_CLASS}
                defaultValue={assignableRoles[0]?.value}
                name="role"
              >
                {assignableRoles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end min-[520px]:col-span-2 lg:col-span-5">
              <OpsSubmitButton
                className={`${OPS_PRIMARY_BUTTON_CLASS} w-full md:w-auto`}
                pendingLabel="Sending invitation..."
              >
                <UserPlus className="size-4" aria-hidden="true" />
                Send invitation
              </OpsSubmitButton>
            </div>
          </form>
        </section>
      ) : (
        <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Staff creation is limited to the Developer, Managing Director, General Manager, and Human
          Resource accounts. Your role can view the access register available to it.
        </div>
      )}

      {canManageAssignments ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-heading text-xl font-bold text-foreground">Engineering Intern site assignments</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Assign an intern to one or more active sites. Their attendance and daily-report access is limited to these sites.
          </p>
          {engineeringInterns.length > 0 && siteOptions.length > 0 ? (
            <form action={assignEngineeringInternToSiteAction} className="mt-4 grid gap-4 md:grid-cols-3">
              <label className={OPS_LABEL_CLASS}>
                Engineering Intern
                <select className={OPS_INPUT_CLASS} name="user_id" required>
                  {engineeringInterns.map((intern) => <option key={intern.id} value={intern.id}>{intern.full_name}</option>)}
                </select>
              </label>
              <label className={OPS_LABEL_CLASS}>
                Site
                <select className={OPS_INPUT_CLASS} name="site_id" required>
                  {siteOptions.map((site) => <option key={site.id} value={site.id}>{site.code} — {site.name}</option>)}
                </select>
              </label>
              <div className="flex items-end">
                <OpsSubmitButton className={OPS_PRIMARY_BUTTON_CLASS} pendingLabel="Assigning site...">Assign site</OpsSubmitButton>
              </div>
            </form>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Invite an Engineering Intern and ensure an active site exists before creating an assignment.</p>
          )}
          {siteAssignments.length > 0 ? (
            <div className="mt-5 divide-y divide-border rounded-md border border-border">
              {siteAssignments.map((assignment) => (
                <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between" key={assignment.id}>
                  <div>
                    <p className="font-bold text-foreground">{assignment.user?.full_name ?? "Unknown intern"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {assignment.site ? `${assignment.site.code} - ${assignment.site.name}` : "Unknown site"}
                    </p>
                  </div>
                  <form action={unassignEngineeringInternFromSiteAction}>
                    <input name="assignment_id" type="hidden" value={assignment.id} />
                    <OpsConfirmSubmitButton className={OPS_DANGER_BUTTON_CLASS} confirmText="Remove site assignment">
                      <UserMinus className="size-4" aria-hidden="true" />
                      Remove
                    </OpsConfirmSubmitButton>
                  </form>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="font-heading text-xl font-bold text-foreground">Access register</h2>
        </div>
        {staffMembers.length > 0 ? (
          <>
            <OpsMobileRecordList>
              {staffMembers.map((member) => (
                <OpsMobileRecordCard key={member.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-heading text-lg font-bold text-foreground">
                        {member.full_name}
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {member.id.slice(0, 8)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${
                        member.is_active
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-border bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      {member.is_active ? "active" : "inactive"}
                    </span>
                  </div>
                  <OpsMobileRecordRow label="Contact">
                    <p>{member.email ?? "Email not recorded"}</p>
                    <p className="text-xs text-muted-foreground">
                      {member.phone ?? "Phone not recorded"}
                    </p>
                  </OpsMobileRecordRow>
                  <OpsMobileRecordRow label="Role">
                    <div className="space-y-2">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${roleClass(member.role)}`}
                      >
                        {formatOpsRole(member.role)}
                      </span>
                      {canCreateStaff && member.id !== auth.authUser.id ? (
                        <form
                          action={changeStaffMemberRoleAction}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input name="id" type="hidden" value={member.id} />
                          <select
                            aria-label={`Change role for ${member.full_name}`}
                            className={`${OPS_INPUT_CLASS} w-auto`}
                            defaultValue={member.role}
                            name="role"
                          >
                            {OPS_STAFF_ROLE_OPTIONS.filter((role) =>
                              role.value === member.role ||
                              canChangeStaffRole(auth.profile.role, member.role, role.value),
                            ).map((role) => (
                              <option key={role.value} value={role.value}>
                                {role.label}
                              </option>
                            ))}
                          </select>
                          <OpsConfirmSubmitButton
                            className={OPS_PRIMARY_BUTTON_CLASS}
                            confirmText="Confirm role change"
                          >
                            Change role
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </OpsMobileRecordRow>
                  <OpsMobileRecordRow label="Action">
                    {canCreateStaff &&
                    member.is_active &&
                    canDeactivateStaffRole(auth.profile.role, member.role) &&
                    member.id !== auth.authUser.id ? (
                      <form action={deactivateStaffMemberAction}>
                        <input name="id" type="hidden" value={member.id} />
                        <OpsConfirmSubmitButton
                          className={OPS_DANGER_BUTTON_CLASS}
                          confirmText="Confirm deactivation"
                        >
                          Deactivate
                        </OpsConfirmSubmitButton>
                      </form>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        <ShieldCheck className="size-4" aria-hidden="true" />
                        Locked
                      </span>
                    )}
                  </OpsMobileRecordRow>
                </OpsMobileRecordCard>
              ))}
            </OpsMobileRecordList>
            <div
              aria-label="Staff access register table"
              className={`hidden md:block ${OPS_TABLE_SCROLL_CLASS}`}
              tabIndex={0}
            >
            <table className="min-w-full divide-y divide-border text-sm">
              <caption className="sr-only">
                Staff access register with contact details, role, status, and account action.
              </caption>
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3" scope="col">
                    Staff member
                  </th>
                  <th className="px-5 py-3" scope="col">
                    Contact
                  </th>
                  <th className="px-5 py-3" scope="col">
                    Role
                  </th>
                  <th className="px-5 py-3" scope="col">
                    Status
                  </th>
                  <th className="px-5 py-3" scope="col">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {staffMembers.map((member) => (
                  <tr key={member.id}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-dark text-white">
                          <Users className="size-4" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="font-bold text-foreground">{member.full_name}</p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {member.id.slice(0, 8)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-foreground/70">
                      <p>{member.email ?? "Email not recorded"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {member.phone ?? "Phone not recorded"}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${roleClass(member.role)}`}
                      >
                        {formatOpsRole(member.role)}
                      </span>
                      {canCreateStaff && member.id !== auth.authUser.id ? (
                        <form
                          action={changeStaffMemberRoleAction}
                          className="mt-2 flex flex-wrap items-center gap-2"
                        >
                          <input name="id" type="hidden" value={member.id} />
                          <select
                            aria-label={`Change role for ${member.full_name}`}
                            className={`${OPS_INPUT_CLASS} w-auto`}
                            defaultValue={member.role}
                            name="role"
                          >
                            {OPS_STAFF_ROLE_OPTIONS.filter((role) =>
                              role.value === member.role ||
                              canChangeStaffRole(auth.profile.role, member.role, role.value),
                            ).map((role) => (
                              <option key={role.value} value={role.value}>
                                {role.label}
                              </option>
                            ))}
                          </select>
                          <OpsConfirmSubmitButton
                            className={OPS_PRIMARY_BUTTON_CLASS}
                            confirmText="Confirm role change"
                          >
                            Change role
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${
                          member.is_active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-border bg-muted/40 text-muted-foreground"
                        }`}
                      >
                        {member.is_active ? "active" : "inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {canCreateStaff &&
                      member.is_active &&
                      canDeactivateStaffRole(auth.profile.role, member.role) &&
                      member.id !== auth.authUser.id ? (
                        <form action={deactivateStaffMemberAction}>
                          <input name="id" type="hidden" value={member.id} />
                          <OpsConfirmSubmitButton
                            className={OPS_DANGER_BUTTON_CLASS}
                            confirmText="Confirm deactivation"
                          >
                            Deactivate
                          </OpsConfirmSubmitButton>
                        </form>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                          <ShieldCheck className="size-4" aria-hidden="true" />
                          Locked
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
            <Users className="size-10 text-primary-blue" aria-hidden="true" />
            <div>
              <p className="font-heading text-xl font-bold text-foreground">
                No staff accounts yet
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                Invite the Managing Director and operational staff to build the access register.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
