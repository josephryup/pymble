"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeOpsActionErrorMessage } from "@/lib/ops/action-errors";
import { requireOpsUser } from "@/lib/ops/auth";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { notifyOpsWorkflowEvent } from "@/lib/ops/workflow-notifications";
import { canManageOpsJobPosting, canReviewOpsJobApplication } from "@/lib/ops/hr-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsJobApplicationStatus } from "@/lib/ops/types";

const RECRUITMENT_ROUTE = "/ops/recruitment";

const EMPLOYMENT_TYPES = ["full_time", "fixed_term", "casual", "contractor", "intern"] as const;

const APPLICATION_STATUSES = [
  "new",
  "screening",
  "shortlisted",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const satisfies readonly OpsJobApplicationStatus[];

const createPostingSchema = z.object({
  title: z.string().trim().min(2, "Job title is required.").max(160),
  department: z.string().trim().max(120).default(""),
  employment_type: z.enum(EMPLOYMENT_TYPES).default("full_time"),
  location: z.string().trim().max(160).default(""),
  summary: z.string().trim().max(400).default(""),
  description: z.string().trim().max(6000).default(""),
  responsibilities: z.string().trim().max(6000).default(""),
  requirements: z.string().trim().max(6000).default(""),
  salary_range: z.string().trim().max(120).default(""),
  closes_at: z.string().trim().default(""),
  publish: z.string().trim().default(""),
});

const postingIdSchema = z.object({
  posting_id: z.string().uuid("Select a job posting."),
});

const applicationStatusSchema = z.object({
  application_id: z.string().uuid("Select an application."),
  status: z.enum(APPLICATION_STATUSES),
  notes: z.string().trim().max(2000).default(""),
});

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function recruitmentError(message: string): never {
  redirect(`${RECRUITMENT_ROUTE}?error=${encodeURIComponent(safeOpsActionErrorMessage(message))}`);
}

function normalizeDate(value: string) {
  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    recruitmentError("Use a valid closing date.");
  }

  return value;
}

export async function createJobPostingAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsJobPosting(profile.role)) {
    recruitmentError("Only HR and leadership can create job postings.");
  }

  const parsed = createPostingSchema.safeParse({
    closes_at: field(formData, "closes_at"),
    department: field(formData, "department"),
    description: field(formData, "description"),
    employment_type: field(formData, "employment_type") || "full_time",
    location: field(formData, "location"),
    publish: field(formData, "publish"),
    requirements: field(formData, "requirements"),
    responsibilities: field(formData, "responsibilities"),
    salary_range: field(formData, "salary_range"),
    summary: field(formData, "summary"),
    title: field(formData, "title"),
  });

  if (!parsed.success) {
    recruitmentError(parsed.error.issues[0]?.message ?? "Check the job posting details.");
  }

  const publish = parsed.data.publish === "on" || parsed.data.publish === "true";
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("job_postings")
    .insert({
      closes_at: normalizeDate(parsed.data.closes_at),
      created_by: profile.id,
      department: parsed.data.department,
      description: parsed.data.description,
      employment_type: parsed.data.employment_type,
      is_published: publish,
      location: parsed.data.location,
      published_at: publish ? new Date().toISOString() : null,
      requirements: parsed.data.requirements,
      responsibilities: parsed.data.responsibilities,
      salary_range: parsed.data.salary_range,
      summary: parsed.data.summary,
      title: parsed.data.title,
    })
    .select("id, posting_number")
    .single<{ id: string; posting_number: string }>();

  if (error || !data) {
    recruitmentError(error?.message ?? "The job posting could not be created.");
  }

  await recordOpsAuditEvent({
    action: "job_posting.created",
    actorUserId: profile.id,
    entityId: data.id,
    entityType: "job_posting",
    metadata: { posting_number: data.posting_number, published: publish, title: parsed.data.title },
    moduleKey: "recruitment",
    sourceId: data.id,
    sourceTable: "job_postings",
    summary: `Created job posting ${data.posting_number}: ${parsed.data.title}`,
  }).catch(() => null);

  revalidatePath(RECRUITMENT_ROUTE);
  revalidatePath("/careers");
  redirect(`${RECRUITMENT_ROUTE}?created=posting#postings`);
}

async function setJobPostingPublished(formData: FormData, publish: boolean) {
  const { profile } = await requireOpsUser();

  if (!canManageOpsJobPosting(profile.role)) {
    recruitmentError("Only HR and leadership can manage job postings.");
  }

  const parsed = postingIdSchema.safeParse({ posting_id: field(formData, "posting_id") });

  if (!parsed.success) {
    recruitmentError(parsed.error.issues[0]?.message ?? "Select a job posting.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("job_postings")
    .update({
      is_published: publish,
      published_at: publish ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.posting_id);

  if (error) {
    recruitmentError(error.message);
  }

  await recordOpsAuditEvent({
    action: publish ? "job_posting.published" : "job_posting.unpublished",
    actorUserId: profile.id,
    entityId: parsed.data.posting_id,
    entityType: "job_posting",
    moduleKey: "recruitment",
    sourceId: parsed.data.posting_id,
    sourceTable: "job_postings",
    summary: publish ? "Published a job posting" : "Unpublished a job posting",
  }).catch(() => null);

  revalidatePath(RECRUITMENT_ROUTE);
  revalidatePath("/careers");
  redirect(`${RECRUITMENT_ROUTE}?updated=${publish ? "published" : "unpublished"}#postings`);
}

export async function publishJobPostingAction(formData: FormData) {
  return setJobPostingPublished(formData, true);
}

export async function unpublishJobPostingAction(formData: FormData) {
  return setJobPostingPublished(formData, false);
}

export async function updateJobApplicationStatusAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canReviewOpsJobApplication(profile.role)) {
    recruitmentError("Only HR and leadership can review applications.");
  }

  const parsed = applicationStatusSchema.safeParse({
    application_id: field(formData, "application_id"),
    notes: field(formData, "notes"),
    status: field(formData, "status"),
  });

  if (!parsed.success) {
    recruitmentError(parsed.error.issues[0]?.message ?? "Check the application update.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("job_applications")
    .update({
      notes: parsed.data.notes,
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile.id,
      status: parsed.data.status,
    })
    .eq("id", parsed.data.application_id);

  if (error) {
    recruitmentError(error.message);
  }

  await recordOpsAuditEvent({
    action: "job_application.status_changed",
    actorUserId: profile.id,
    entityId: parsed.data.application_id,
    entityType: "job_application",
    metadata: { status: parsed.data.status },
    moduleKey: "recruitment",
    sourceId: parsed.data.application_id,
    sourceTable: "job_applications",
    summary: `Moved application to ${parsed.data.status}`,
  }).catch(() => null);

  await notifyOpsWorkflowEvent({
    actorId: profile.id,
    actionNeededRoles: ["human_resource", "hr"],
    title: `Application ${parsed.data.status}`,
    body: `${profile.full_name} moved a job application to ${parsed.data.status}.`,
    actionHref: `${RECRUITMENT_ROUTE}#applications`,
    moduleKey: "recruitment",
    sourceTable: "job_applications",
    sourceId: parsed.data.application_id,
    eventKey: `status_${parsed.data.status}`,
    category: "info",
  });

  revalidatePath(RECRUITMENT_ROUTE);
  redirect(`${RECRUITMENT_ROUTE}?updated=application#applications`);
}

const interviewSchema = z.object({
  application_id: z.string().uuid("Select an application."),
  interview_score: z.coerce
    .number()
    .min(0, "Score must be between 0 and 5.")
    .max(5, "Score must be between 0 and 5."),
  interview_notes: z.string().trim().max(4000).default(""),
});

export async function recordInterviewAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canReviewOpsJobApplication(profile.role)) {
    recruitmentError("Only HR and leadership can record interview scores.");
  }

  const parsed = interviewSchema.safeParse({
    application_id: field(formData, "application_id"),
    interview_score: field(formData, "interview_score"),
    interview_notes: field(formData, "interview_notes"),
  });

  if (!parsed.success) {
    recruitmentError(parsed.error.issues[0]?.message ?? "Check the interview details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { error } = await supabase
    .from("job_applications")
    .update({
      interview_score: parsed.data.interview_score,
      interview_notes: parsed.data.interview_notes,
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile.id,
    })
    .eq("id", parsed.data.application_id);

  if (error) {
    recruitmentError(error.message);
  }

  await recordOpsAuditEvent({
    action: "job_application.interview_scored",
    actorUserId: profile.id,
    entityId: parsed.data.application_id,
    entityType: "job_application",
    metadata: { score: parsed.data.interview_score },
    moduleKey: "recruitment",
    sourceId: parsed.data.application_id,
    sourceTable: "job_applications",
    summary: `Recorded interview score ${parsed.data.interview_score}/5`,
  }).catch(() => null);

  revalidatePath(RECRUITMENT_ROUTE);
  redirect(`${RECRUITMENT_ROUTE}?updated=interview#applications`);
}

const offerSchema = z.object({
  application_id: z.string().uuid("Select an application."),
  position_title: z.string().trim().min(2, "Position title is required.").max(160),
  start_date: z.string().trim().default(""),
  salary: z.string().trim().max(120).default(""),
});

function offerLetterText(input: {
  candidate: string;
  position: string;
  startDate: string;
  salary: string;
}) {
  const today = new Intl.DateTimeFormat("en-ZM", {
    dateStyle: "long",
    timeZone: "Africa/Lusaka",
  }).format(new Date());

  return [
    `Pymble Construction Limited`,
    `Plot No. 1822 Azikiwe Road, Lusaka, Zambia`,
    ``,
    today,
    ``,
    `Dear ${input.candidate},`,
    ``,
    `OFFER OF EMPLOYMENT — ${input.position.toUpperCase()}`,
    ``,
    `We are pleased to offer you the position of ${input.position} at Pymble Construction Limited.`,
    input.startDate ? `Your proposed start date is ${input.startDate}.` : "",
    input.salary ? `Your remuneration will be ${input.salary}.` : "",
    ``,
    `Detailed terms — contract type, leave, benefits, probation, confidentiality, code of conduct,`,
    `and HSE obligations — are set out in the attached employment contract.`,
    ``,
    `Please confirm acceptance by signing and returning a copy of this letter and the contract`,
    `within seven (7) calendar days. If we have not heard from you within that period, this offer`,
    `will lapse.`,
    ``,
    `We look forward to welcoming you to the Pymble team.`,
    ``,
    `Yours sincerely,`,
    ``,
    `_____________________________`,
    `Pymble Construction Limited`,
    `Human Resource`,
    ``,
    `Candidate acceptance:`,
    `Name: ${input.candidate}`,
    `Signature: _____________________________`,
    `Date: _____________________________`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export async function generateOfferLetterAction(formData: FormData) {
  const { profile } = await requireOpsUser();

  if (!canReviewOpsJobApplication(profile.role)) {
    recruitmentError("Only HR and leadership can generate offer letters.");
  }

  const parsed = offerSchema.safeParse({
    application_id: field(formData, "application_id"),
    position_title: field(formData, "position_title"),
    start_date: field(formData, "start_date"),
    salary: field(formData, "salary"),
  });

  if (!parsed.success) {
    recruitmentError(parsed.error.issues[0]?.message ?? "Check the offer letter details.");
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data: applicationRow, error: fetchError } = await supabase
    .from("job_applications")
    .select("id, full_name")
    .eq("id", parsed.data.application_id)
    .maybeSingle<{ id: string; full_name: string }>();

  if (fetchError || !applicationRow) {
    recruitmentError(fetchError?.message ?? "Application was not found.");
  }

  const { putOpsR2Object } = await import("@/lib/ops/r2");
  const body = offerLetterText({
    candidate: applicationRow.full_name,
    position: parsed.data.position_title,
    salary: parsed.data.salary,
    startDate: parsed.data.start_date,
  });
  const cryptoMod = await import("node:crypto");
  const key = `careers/offers/${cryptoMod.randomUUID()}-offer.txt`;

  try {
    await putOpsR2Object({
      body: new TextEncoder().encode(body),
      contentType: "text/plain; charset=utf-8",
      key,
    });
  } catch (error) {
    recruitmentError(error instanceof Error ? error.message : "The offer letter could not be saved.");
  }

  const generatedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("job_applications")
    .update({
      offer_letter_r2_key: key,
      offer_generated_at: generatedAt,
      offer_generated_by: profile.id,
      status: "offer",
      reviewed_at: generatedAt,
      reviewed_by: profile.id,
    })
    .eq("id", parsed.data.application_id);

  if (updateError) {
    recruitmentError(updateError.message);
  }

  await recordOpsAuditEvent({
    action: "job_application.offer_generated",
    actorUserId: profile.id,
    entityId: parsed.data.application_id,
    entityType: "job_application",
    metadata: { position: parsed.data.position_title },
    moduleKey: "recruitment",
    sourceId: parsed.data.application_id,
    sourceTable: "job_applications",
    summary: `Generated offer letter for ${applicationRow.full_name}`,
  }).catch(() => null);

  revalidatePath(RECRUITMENT_ROUTE);
  redirect(`${RECRUITMENT_ROUTE}?updated=offer#applications`);
}
