import { ShieldCheck, UserPlus, Users } from "lucide-react";
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
  canCreateStaffRole,
  canDeactivateStaffRole,
  canManageStaff,
} from "@/lib/ops/permissions";
import {
  createStaffMemberAction,
  deactivateStaffMemberAction,
} from "@/lib/ops/staff-actions";
import { fetchOpsStaffMembers } from "@/lib/ops/staff";
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

  return "border-primary-dark/10 bg-primary-dark/[0.03] text-primary-dark/70";
}

export default async function OpsStaffPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([searchParams ?? Promise.resolve({}), requireOpsUser()]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/staff")) {
    notFound();
  }

  const staffMembers = await fetchOpsStaffMembers();
  const canCreateStaff = canManageStaff(auth.profile.role);
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
      <section className="rounded-lg border border-primary-dark/10 bg-white p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
              Pymble Staff
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark">
              Invite-only access
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
              Manage internal access for Pymble Construction staff. All accounts are created by
              invitation.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Active
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {activeStaff}
              </p>
            </div>
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Managing Director
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {directorCount}
              </p>
            </div>
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                General Managers
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {generalManagerCount}
              </p>
            </div>
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Human Resource
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
                {humanResourceCount}
              </p>
            </div>
            <div className="rounded-md border border-primary-dark/10 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
                Operations
              </p>
              <p className="mt-1 font-heading text-2xl font-bold text-primary-dark">
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
        <section className="rounded-lg border border-primary-dark/10 bg-white p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <UserPlus className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-primary-dark">
                Invite staff member
              </h2>
              <p className="text-sm text-primary-dark/60">
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
        <div className="rounded-md border border-primary-dark/10 bg-white px-4 py-3 text-sm text-primary-dark/65">
          Staff creation is limited to the Developer, Managing Director, General Manager, and Human
          Resource accounts. Your role can view the access register available to it.
        </div>
      )}

      <section className="rounded-lg border border-primary-dark/10 bg-white">
        <div className="border-b border-primary-dark/10 p-5">
          <h2 className="font-heading text-xl font-bold text-primary-dark">Access register</h2>
        </div>
        {staffMembers.length > 0 ? (
          <>
            <OpsMobileRecordList>
              {staffMembers.map((member) => (
                <OpsMobileRecordCard key={member.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-heading text-lg font-bold text-primary-dark">
                        {member.full_name}
                      </p>
                      <p className="mt-1 font-mono text-xs text-primary-dark/45">
                        {member.id.slice(0, 8)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${
                        member.is_active
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-primary-dark/10 bg-primary-dark/[0.03] text-primary-dark/50"
                      }`}
                    >
                      {member.is_active ? "active" : "inactive"}
                    </span>
                  </div>
                  <OpsMobileRecordRow label="Contact">
                    <p>{member.email ?? "Email not recorded"}</p>
                    <p className="text-xs text-primary-dark/45">
                      {member.phone ?? "Phone not recorded"}
                    </p>
                  </OpsMobileRecordRow>
                  <OpsMobileRecordRow label="Role">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${roleClass(member.role)}`}
                    >
                      {formatOpsRole(member.role)}
                    </span>
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
                      <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-primary-dark/45">
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
            <table className="min-w-full divide-y divide-primary-dark/10 text-sm">
              <caption className="sr-only">
                Staff access register with contact details, role, status, and account action.
              </caption>
              <thead className="bg-primary-dark/[0.03] text-left text-xs uppercase tracking-[0.12em] text-primary-dark/52">
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
              <tbody className="divide-y divide-primary-dark/10">
                {staffMembers.map((member) => (
                  <tr key={member.id}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-dark text-white">
                          <Users className="size-4" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="font-bold text-primary-dark">{member.full_name}</p>
                          <p className="mt-1 font-mono text-xs text-primary-dark/45">
                            {member.id.slice(0, 8)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-primary-dark/70">
                      <p>{member.email ?? "Email not recorded"}</p>
                      <p className="mt-1 text-xs text-primary-dark/45">
                        {member.phone ?? "Phone not recorded"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${roleClass(member.role)}`}
                      >
                        {formatOpsRole(member.role)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${
                          member.is_active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-primary-dark/10 bg-primary-dark/[0.03] text-primary-dark/50"
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
                        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-primary-dark/45">
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
              <p className="font-heading text-xl font-bold text-primary-dark">
                No staff accounts yet
              </p>
              <p className="mt-2 max-w-lg text-sm leading-6 text-primary-dark/60">
                Invite the Managing Director and operational staff to build the access register.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
