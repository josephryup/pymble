-- Pymble Operations — Recruitment: interview scoring and offer letter tracking
-- Closes the PDF requirement "ERP Workflow → Recruitment → Interview scoring
-- tracked → Offer letters generated" by adding the missing fields on
-- public.job_applications.

alter table public.job_applications
  add column if not exists interview_score numeric(4, 2)
    check (interview_score is null or (interview_score >= 0 and interview_score <= 5)),
  add column if not exists interview_notes text not null default '',
  add column if not exists offer_letter_r2_key text,
  add column if not exists offer_generated_at timestamptz,
  add column if not exists offer_generated_by uuid references public.users(id) on delete set null;

comment on column public.job_applications.interview_score is
  'Interview rating on a 0-5 scale; null = not yet interviewed.';
comment on column public.job_applications.interview_notes is
  'Interview panel notes captured during/after the interview.';
comment on column public.job_applications.offer_letter_r2_key is
  'R2 storage key for the generated offer letter PDF (null until offered).';
