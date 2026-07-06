import {
  Briefcase,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Inbox,
  Plus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsKpiCard } from "@/components/ops/OpsKpiCard";
import { requireOpsUser } from "@/lib/ops/auth";
import { canAccessOpsHref } from "@/lib/ops/permissions";
import { canManageOpsJobPosting, canReviewOpsJobApplication } from "@/lib/ops/hr-permissions";
import { createOpsR2ReadUrl } from "@/lib/ops/r2";
import {
  createJobPostingAction,
  generateOfferLetterAction,
  publishJobPostingAction,
  recordInterviewAction,
  unpublishJobPostingAction,
  updateJobApplicationStatusAction,
} from "@/lib/ops/recruitment-actions";
import {
  fetchOpsJobApplications,
  fetchOpsJobPostings,
  fetchOpsRecruitmentStats,
  type OpsJobApplication,
} from "@/lib/ops/recruitment";
import type { OpsJobApplicationStatus } from "@/lib/ops/types";
import {
  firstParam,
  OPS_FOCUS_CLASS,
  OPS_INPUT_CLASS,
  OPS_LABEL_CLASS,
  OPS_PRIMARY_BUTTON_CLASS,
  OPS_SECONDARY_BUTTON_CLASS,
  type OpsSearchParams,
} from "@/lib/ops/ui";

type PageProps = {
  searchParams?: Promise<OpsSearchParams>;
};

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: "Full time",
  fixed_term: "Fixed term",
  casual: "Casual",
  contractor: "Contractor",
  intern: "Intern",
};

const APPLICATION_STATUSES: OpsJobApplicationStatus[] = [
  "new",
  "screening",
  "shortlisted",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
];

function applicationStatusClass(status: OpsJobApplicationStatus) {
  if (status === "hired") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "rejected" || status === "withdrawn") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "new") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  return "border-orange-200 bg-orange-50 text-orange-700";
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function recruitmentNotice(params: OpsSearchParams) {
  const error = firstParam(params.error);

  if (error) {
    return { tone: "error" as const, message: error };
  }

  if (firstParam(params.created) === "posting") {
    return { tone: "success" as const, message: "Job posting created." };
  }

  const updated = firstParam(params.updated);

  if (updated === "published") {
    return { tone: "success" as const, message: "Job posting published to the website." };
  }

  if (updated === "unpublished") {
    return { tone: "success" as const, message: "Job posting removed from the website." };
  }

  if (updated === "interview") {
    return { tone: "success" as const, message: "Interview score recorded." };
  }

  if (updated === "offer") {
    return { tone: "success" as const, message: "Offer letter generated and stored." };
  }

  if (updated === "application") {
    return { tone: "success" as const, message: "Application updated." };
  }

  return null;
}

export default async function OpsRecruitmentPage({ searchParams }: PageProps) {
  const [params, auth] = await Promise.all([
    searchParams ?? Promise.resolve({} as OpsSearchParams),
    requireOpsUser(),
  ]);

  if (!canAccessOpsHref(auth.profile.role, "/ops/recruitment")) {
    notFound();
  }

  const canManage = canManageOpsJobPosting(auth.profile.role);
  const canReview = canReviewOpsJobApplication(auth.profile.role);
  const [postings, applications, stats] = await Promise.all([
    fetchOpsJobPostings(),
    fetchOpsJobApplications(),
    fetchOpsRecruitmentStats(),
  ]);

  // Short-lived signed URLs for CV / offer-letter downloads (HR-only page).
  const cvUrls = new Map<string, string>();
  const offerUrls = new Map<string, string>();
  await Promise.all(
    applications
      .filter((application) => application.cv_r2_key)
      .map(async (application) => {
        try {
          const url = await createOpsR2ReadUrl(application.cv_r2_key as string);
          cvUrls.set(application.id, url);
        } catch {
          // skip download link if signing fails
        }
      }),
  );
  await Promise.all(
    applications
      .filter((application) => application.offer_letter_r2_key)
      .map(async (application) => {
        try {
          const url = await createOpsR2ReadUrl(application.offer_letter_r2_key as string);
          offerUrls.set(application.id, url);
        } catch {
          // skip download link if signing fails
        }
      }),
  );

  const applicationCountByPosting = applications.reduce<Record<string, number>>(
    (counts, application) => {
      if (application.job_posting_id) {
        counts[application.job_posting_id] = (counts[application.job_posting_id] ?? 0) + 1;
      }
      return counts;
    },
    {},
  );

  const notice = recruitmentNotice(params);

  return (
    <div className="w-full max-w-none space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-blue">
            Admin and HR
          </p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-primary-dark">Recruitment</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-primary-dark/68">
            Publish job openings to the Pymble website, then review and progress the candidate
            applications that come in.
          </p>
        </div>
        <Link className={OPS_SECONDARY_BUTTON_CLASS} href="/careers" target="_blank">
          <Globe className="size-4" aria-hidden="true" />
          View careers page
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </Link>
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OpsKpiCard
          href="/ops/recruitment#create-posting"
          icon={Briefcase}
          label="Job postings"
          value={stats.postings.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/careers"
          icon={Globe}
          label="Published"
          hint="Live on the website"
          value={stats.published.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/recruitment#applications"
          icon={Inbox}
          label="Applications"
          value={stats.applications.toLocaleString("en-ZM")}
        />
        <OpsKpiCard
          href="/ops/recruitment#applications"
          icon={Users}
          label="New to review"
          tone={stats.newApplications > 0 ? "warn" : "good"}
          value={stats.newApplications.toLocaleString("en-ZM")}
        />
      </section>

      {canManage ? (
        <details className="scroll-mt-24 rounded-lg border border-primary-dark/10 bg-white" id="create-posting">
          <summary
            className={`flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-blue text-white">
              <Plus className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-xl font-bold text-primary-dark">
                Create job posting
              </span>
              <span className="mt-1 block text-sm text-primary-dark/60">
                Publish immediately or save as a draft to publish later.
              </span>
            </span>
            <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-primary-dark/45">
              Open
            </span>
          </summary>
          <form
            action={createJobPostingAction}
            className="grid gap-4 border-t border-primary-dark/10 p-5 sm:grid-cols-2 lg:grid-cols-6"
          >
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2 lg:col-span-3`}>
              Job title
              <input className={OPS_INPUT_CLASS} name="title" required />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-3`}>
              Department
              <input className={OPS_INPUT_CLASS} name="department" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Employment type
              <select className={OPS_INPUT_CLASS} defaultValue="full_time" name="employment_type">
                {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Location
              <input className={OPS_INPUT_CLASS} name="location" placeholder="e.g. Lusaka, Zambia" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Salary range (optional)
              <input className={OPS_INPUT_CLASS} name="salary_range" />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2 lg:col-span-6`}>
              Short summary
              <input className={OPS_INPUT_CLASS} name="summary" placeholder="One line shown in the careers list" />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2 lg:col-span-6`}>
              Description
              <textarea className={`${OPS_INPUT_CLASS} min-h-28`} name="description" />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2 lg:col-span-3`}>
              Responsibilities
              <textarea className={`${OPS_INPUT_CLASS} min-h-28`} name="responsibilities" />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2 lg:col-span-3`}>
              Requirements
              <textarea className={`${OPS_INPUT_CLASS} min-h-28`} name="requirements" />
            </label>
            <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
              Closes on (optional)
              <input className={OPS_INPUT_CLASS} name="closes_at" type="date" />
            </label>
            <label className="flex items-center gap-2 self-end sm:col-span-2 lg:col-span-2">
              <input className="size-4" defaultChecked name="publish" type="checkbox" value="on" />
              <span className="text-sm font-semibold text-primary-dark">Publish to website now</span>
            </label>
            <div className="flex items-end sm:col-span-2 lg:col-span-2 lg:justify-end">
              <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full lg:w-auto`} type="submit">
                <Plus className="size-4" aria-hidden="true" />
                Create posting
              </button>
            </div>
          </form>
        </details>
      ) : null}

      <section className="scroll-mt-24 space-y-3" id="postings">
        <h2 className="font-heading text-xl font-bold text-primary-dark">Job postings</h2>
        {postings.length > 0 ? (
          <div className="grid gap-3">
            {postings.map((posting) => (
              <article
                className="rounded-lg border border-primary-dark/10 bg-white p-5"
                key={posting.id}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-heading text-lg font-bold text-primary-dark">
                        {posting.title}
                      </h3>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${
                          posting.is_published
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-primary-dark/15 bg-primary-dark/[0.04] text-primary-dark/55"
                        }`}
                      >
                        {posting.is_published ? "Published" : "Draft"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-primary-dark/60">
                      {posting.posting_number} ·{" "}
                      {EMPLOYMENT_TYPE_LABELS[posting.employment_type] ?? posting.employment_type}
                      {posting.department ? ` · ${posting.department}` : ""}
                      {posting.location ? ` · ${posting.location}` : ""}
                    </p>
                    {posting.summary ? (
                      <p className="mt-2 text-sm leading-6 text-primary-dark/70">{posting.summary}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                    <span className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary-dark/10 px-3 py-1.5 text-sm font-semibold text-primary-dark">
                      <Inbox className="size-4 text-primary-blue" aria-hidden="true" />
                      {applicationCountByPosting[posting.id] ?? 0} application(s)
                    </span>
                    {canManage ? (
                      <form
                        action={
                          posting.is_published ? unpublishJobPostingAction : publishJobPostingAction
                        }
                      >
                        <input name="posting_id" type="hidden" value={posting.id} />
                        <button
                          className={
                            posting.is_published
                              ? `${OPS_SECONDARY_BUTTON_CLASS} w-full sm:w-auto`
                              : `${OPS_PRIMARY_BUTTON_CLASS} w-full sm:w-auto`
                          }
                          type="submit"
                        >
                          {posting.is_published ? "Unpublish" : "Publish"}
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-primary-dark/10 bg-white p-8 text-center">
            <Briefcase className="size-8 text-primary-blue" aria-hidden="true" />
            <p className="text-sm text-primary-dark/60">
              No job postings yet. Create one to start receiving applications.
            </p>
          </div>
        )}
      </section>

      <section className="scroll-mt-24 space-y-3" id="applications">
        <h2 className="font-heading text-xl font-bold text-primary-dark">Applications</h2>
        {applications.length > 0 ? (
          <div className="grid gap-3">
            {applications.map((application) => (
              <ApplicationCard
                application={application}
                canReview={canReview}
                cvUrl={cvUrls.get(application.id) ?? null}
                offerUrl={offerUrls.get(application.id) ?? null}
                key={application.id}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-primary-dark/10 bg-white p-8 text-center">
            <Inbox className="size-8 text-primary-blue" aria-hidden="true" />
            <p className="text-sm text-primary-dark/60">
              No applications yet. They will appear here as candidates apply on the careers page.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function ApplicationCard({
  application,
  canReview,
  cvUrl,
  offerUrl,
}: {
  application: OpsJobApplication;
  canReview: boolean;
  cvUrl: string | null;
  offerUrl: string | null;
}) {
  return (
    <article className="rounded-lg border border-primary-dark/10 bg-white p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-lg font-bold text-primary-dark">
              {application.full_name}
            </h3>
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${applicationStatusClass(
                application.status,
              )}`}
            >
              {formatLabel(application.status)}
            </span>
            {application.interview_score !== null ? (
              <span className="inline-flex rounded-full border border-primary-blue/20 bg-primary-blue/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-primary-blue">
                Interview {application.interview_score.toFixed(1)}/5
              </span>
            ) : null}
          </div>
          <p className="mt-1 break-words text-sm text-primary-dark/60">
            {application.application_number} · applied for{" "}
            <span className="font-semibold text-primary-dark/80">
              {application.posting?.title ?? "General application"}
            </span>
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-primary-dark/70">
            <a className="hover:text-primary-blue hover:underline" href={`mailto:${application.email}`}>
              {application.email}
            </a>
            {application.phone ? <span>{application.phone}</span> : null}
            {application.linkedin_url ? (
              <a
                className="inline-flex items-center gap-1 hover:text-primary-blue hover:underline"
                href={application.linkedin_url}
                rel="noopener noreferrer"
                target="_blank"
              >
                LinkedIn
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            ) : null}
          </div>
          {application.cover_letter ? (
            <p className="mt-3 whitespace-pre-line rounded-md border border-primary-dark/10 bg-primary-dark/[0.02] px-3 py-2 text-sm leading-6 text-primary-dark/75">
              {application.cover_letter}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2">
          {cvUrl ? (
            <a
              className={`${OPS_SECONDARY_BUTTON_CLASS} w-full justify-center`}
              href={cvUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Download className="size-4" aria-hidden="true" />
              Download CV
            </a>
          ) : (
            <span className="inline-flex items-center justify-center gap-1.5 rounded-md border border-primary-dark/10 px-3 py-1.5 text-xs font-semibold text-primary-dark/45">
              <FileText className="size-3.5" aria-hidden="true" />
              No CV attached
            </span>
          )}
          {offerUrl ? (
            <a
              className={`${OPS_SECONDARY_BUTTON_CLASS} w-full justify-center`}
              href={offerUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Download className="size-4" aria-hidden="true" />
              Offer letter
            </a>
          ) : null}
        </div>
      </div>

      {application.interview_notes ? (
        <p className="mt-3 whitespace-pre-line rounded-md border border-primary-blue/15 bg-primary-blue/[0.04] px-3 py-2 text-sm leading-6 text-primary-dark/80">
          <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-primary-blue">
            Interview notes
          </span>
          {application.interview_notes}
        </p>
      ) : null}

      {canReview ? (
        <form
          action={updateJobApplicationStatusAction}
          className="mt-4 grid gap-3 border-t border-primary-dark/10 pt-4 sm:grid-cols-[minmax(0,12rem)_1fr_auto] sm:items-end"
        >
          <input name="application_id" type="hidden" value={application.id} />
          <label className={OPS_LABEL_CLASS}>
            Stage
            <select className={OPS_INPUT_CLASS} defaultValue={application.status} name="status">
              {APPLICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className={OPS_LABEL_CLASS}>
            Notes
            <input className={OPS_INPUT_CLASS} defaultValue={application.notes} name="notes" />
          </label>
          <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full sm:w-auto`} type="submit">
            Update
          </button>
        </form>
      ) : null}

      {canReview ? (
        <details className="mt-3 rounded-md border border-primary-dark/10">
          <summary
            className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-bold text-primary-dark transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
          >
            <span>Record interview score</span>
            <span className="text-xs uppercase tracking-[0.12em] text-primary-dark/45">Open</span>
          </summary>
          <form
            action={recordInterviewAction}
            className="grid gap-3 border-t border-primary-dark/10 p-4 sm:grid-cols-[8rem_1fr_auto] sm:items-end"
          >
            <input name="application_id" type="hidden" value={application.id} />
            <label className={OPS_LABEL_CLASS}>
              Score 0-5
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={
                  application.interview_score !== null ? application.interview_score : ""
                }
                max="5"
                min="0"
                name="interview_score"
                required
                step="0.1"
                type="number"
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Notes
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={application.interview_notes}
                name="interview_notes"
                placeholder="Strengths, gaps, panel comments"
              />
            </label>
            <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full sm:w-auto`} type="submit">
              Save score
            </button>
          </form>
        </details>
      ) : null}

      {canReview ? (
        <details className="mt-3 rounded-md border border-primary-dark/10">
          <summary
            className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-sm font-bold text-primary-dark transition hover:text-primary-blue [&::-webkit-details-marker]:hidden ${OPS_FOCUS_CLASS}`}
          >
            <span>
              {application.offer_letter_r2_key ? "Regenerate offer letter" : "Generate offer letter"}
            </span>
            <span className="text-xs uppercase tracking-[0.12em] text-primary-dark/45">Open</span>
          </summary>
          <form
            action={generateOfferLetterAction}
            className="grid gap-3 border-t border-primary-dark/10 p-4 sm:grid-cols-2"
          >
            <input name="application_id" type="hidden" value={application.id} />
            <label className={OPS_LABEL_CLASS}>
              Position title
              <input
                className={OPS_INPUT_CLASS}
                defaultValue={application.posting?.title ?? ""}
                name="position_title"
                required
              />
            </label>
            <label className={OPS_LABEL_CLASS}>
              Proposed start date
              <input className={OPS_INPUT_CLASS} name="start_date" type="date" />
            </label>
            <label className={`${OPS_LABEL_CLASS} sm:col-span-2`}>
              Salary / remuneration
              <input
                className={OPS_INPUT_CLASS}
                name="salary"
                placeholder="e.g. ZMW 12,000 monthly gross"
              />
            </label>
            <div className="sm:col-span-2">
              <button className={`${OPS_PRIMARY_BUTTON_CLASS} w-full sm:w-auto`} type="submit">
                Generate offer letter
              </button>
            </div>
          </form>
        </details>
      ) : null}
    </article>
  );
}
