import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsEmploymentType, OpsJobApplicationStatus } from "@/lib/ops/types";

export type OpsJobPosting = {
  id: string;
  posting_number: string;
  title: string;
  department: string;
  employment_type: OpsEmploymentType;
  location: string;
  summary: string;
  description: string;
  responsibilities: string;
  requirements: string;
  salary_range: string;
  is_published: boolean;
  published_at: string | null;
  closes_at: string | null;
  created_at: string;
};

export type OpsJobApplicationPosting = {
  id: string;
  title: string;
  posting_number: string;
};

export type OpsJobApplication = {
  id: string;
  application_number: string;
  job_posting_id: string | null;
  full_name: string;
  email: string;
  phone: string;
  cover_letter: string;
  linkedin_url: string;
  cv_document_id: string | null;
  cv_r2_key: string | null;
  status: OpsJobApplicationStatus;
  source: string;
  notes: string;
  interview_score: number | null;
  interview_notes: string;
  offer_letter_r2_key: string | null;
  offer_generated_at: string | null;
  created_at: string;
  posting: OpsJobApplicationPosting | null;
};

const POSTING_COLUMNS =
  "id, posting_number, title, department, employment_type, location, summary, description, responsibilities, requirements, salary_range, is_published, published_at, closes_at, created_at";

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export async function fetchOpsJobPostings(): Promise<OpsJobPosting[]> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("job_postings")
    .select(POSTING_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as OpsJobPosting[];
}

export async function fetchOpsJobApplications(): Promise<OpsJobApplication[]> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("job_applications")
    .select(
      "id, application_number, job_posting_id, full_name, email, phone, cover_letter, linkedin_url, cv_document_id, cv_r2_key, status, source, notes, interview_score, interview_notes, offer_letter_r2_key, offer_generated_at, created_at, posting:job_postings!job_applications_job_posting_id_fkey(id, title, posting_number)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as Array<
    Omit<OpsJobApplication, "posting" | "interview_score"> & {
      interview_score: number | string | null;
      posting: OpsJobApplicationPosting | OpsJobApplicationPosting[] | null;
    }
  >).map((application) => ({
    ...application,
    interview_score:
      application.interview_score === null || application.interview_score === undefined
        ? null
        : Number(application.interview_score),
    posting: normalizeRelation(application.posting),
  }));
}

export type OpsRecruitmentStats = {
  postings: number;
  published: number;
  applications: number;
  newApplications: number;
};

export async function fetchOpsRecruitmentStats(): Promise<OpsRecruitmentStats> {
  const supabase = getOpsSupabaseServiceClient();
  const [postings, published, applications, newApplications] = await Promise.all([
    supabase.from("job_postings").select("id", { count: "exact", head: true }),
    supabase
      .from("job_postings")
      .select("id", { count: "exact", head: true })
      .eq("is_published", true),
    supabase.from("job_applications").select("id", { count: "exact", head: true }),
    supabase
      .from("job_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
  ]);

  return {
    applications: applications.count ?? 0,
    newApplications: newApplications.count ?? 0,
    postings: postings.count ?? 0,
    published: published.count ?? 0,
  };
}

// --- Public website (only published postings) ---------------------------------

export async function fetchPublishedJobPostings(): Promise<OpsJobPosting[]> {
  const supabase = getOpsSupabaseServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("job_postings")
    .select(POSTING_COLUMNS)
    .eq("is_published", true)
    .or(`closes_at.is.null,closes_at.gte.${today}`)
    .order("published_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as OpsJobPosting[];
}

export async function fetchPublishedJobPosting(id: string): Promise<OpsJobPosting | null> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("job_postings")
    .select(POSTING_COLUMNS)
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle<OpsJobPosting>();

  if (error) {
    throw error;
  }

  return data;
}
