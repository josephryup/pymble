import { KeyRound, ShieldCheck, UserCircle } from "lucide-react";
import { OpsLogoutButton } from "@/components/ops/OpsLogoutButton";
import { requireOpsUser } from "@/lib/ops/auth";
import {
  updateMyPasswordAction,
  updateMyProfileAction,
} from "@/lib/ops/profile-actions";
import {
  firstParam,
  noticeFromParams,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";
import { formatOpsProfileName, formatOpsRole } from "@/lib/ops/roles";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

function profileNotice(params: OpsSearchParams) {
  const baseNotice = noticeFromParams(params, "profile", "Profile updated.");

  if (baseNotice) {
    return baseNotice;
  }

  if (firstParam(params.updated) === "password") {
    return {
      tone: "success" as const,
      message: "Password updated.",
    };
  }

  if (firstParam(params.updated) === "welcome") {
    return {
      tone: "success" as const,
      message: "Welcome to Pymble Operations. Set a password here so you can sign in normally next time.",
    };
  }

  if (firstParam(params.updated) === "profile") {
    return {
      tone: "success" as const,
      message: "Profile updated.",
    };
  }

  return null;
}

export default async function OpsProfilePage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({}),
    requireOpsUser(),
  ]);
  const notice = profileNotice(params);
  const profileName = formatOpsProfileName(auth.profile.full_name, auth.profile.role);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-lg border border-primary-dark/10 bg-white p-5 md:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
          My Account
        </p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold tracking-tight text-primary-dark md:text-4xl">
              Profile
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
              Manage your Pymble account details and password.
            </p>
          </div>
          <div className="rounded-md border border-primary-dark/10 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-dark/45">
              Access role
            </p>
            <p className="mt-1 font-heading text-xl font-bold text-primary-dark">
              {formatOpsRole(auth.profile.role)}
            </p>
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

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <form
          action={updateMyProfileAction}
          className="rounded-lg border border-primary-dark/10 bg-white p-5"
        >
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary-blue text-white">
              <UserCircle className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-bold text-primary-dark">
                Personal details
              </h2>
              <p className="text-sm text-primary-dark/60">
                These details appear in the ops workspace and activity records.
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={OPS_LABEL_CLASS}>
              Full name
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={profileName}
                name="full_name"
                required
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Phone
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={auth.profile.phone ?? ""}
                name="phone"
              />
            </label>
            <label className={`${OPS_LABEL_CLASS} md:col-span-2`}>
              Email
              <input
                className={`${OPS_INPUT_CLASS} bg-primary-dark/[0.03] text-primary-dark/55`}
                defaultValue={auth.profile.email ?? auth.authUser.email ?? ""}
                disabled
              />
            </label>
          </div>
          <button
            className={`${OPS_PRIMARY_BUTTON_CLASS} mt-5`}
            type="submit"
          >
            Save profile
          </button>
        </form>

        <div className="space-y-5">
          <form
            action={updateMyPasswordAction}
            className="rounded-lg border border-primary-dark/10 bg-white p-5"
            id="password"
          >
            <div className="mb-5 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-primary-dark text-white">
                <KeyRound className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-xl font-bold text-primary-dark">
                  Password
                </h2>
                <p className="text-sm text-primary-dark/60">
                  Choose a new password for your login.
                </p>
              </div>
            </div>
            <div className="grid gap-4">
              <label className={OPS_LABEL_CLASS}>
                New password
                <input
                  autoComplete="new-password"
                  className={OPS_INPUT_CLASS}
                  minLength={8}
                  name="password"
                  required
                  type="password"
                />
              </label>
              <label className={OPS_LABEL_CLASS}>
                Confirm password
                <input
                  autoComplete="new-password"
                  className={OPS_INPUT_CLASS}
                  minLength={8}
                  name="confirm_password"
                  required
                  type="password"
                />
              </label>
            </div>
            <button
              className={`${OPS_PRIMARY_BUTTON_CLASS} mt-5`}
              type="submit"
            >
              Reset password
            </button>
          </form>

          <section className="rounded-lg border border-primary-dark/10 bg-white p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-heading text-xl font-bold text-primary-dark">
                  Session
                </h2>
                <p className="text-sm text-primary-dark/60">
                  Sign out of this browser when you finish.
                </p>
              </div>
            </div>
            <OpsLogoutButton />
          </section>
        </div>
      </section>
    </div>
  );
}
