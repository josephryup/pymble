-- Legal review gate on contract templates.
--
-- The works-order clause set was transcribed from an instrument Pymble has
-- actually used. The employment clause set was not: there was no signed
-- employment contract to codify, so it was drafted from the employee_contracts
-- fields plus Employment Code defaults. It reads as finished, which is the
-- problem — nothing on the generated document would tell an employee, or a
-- court, that nobody qualified had ever looked at it.
--
-- So a template can now be marked as needing review, and an unreviewed template
-- cannot produce an approved contract. This is a gate rather than a warning
-- because a warning on a legal document is a thing people stop seeing.

alter table public.contract_templates
  add column if not exists requires_legal_review boolean not null default false;

alter table public.contract_templates
  add column if not exists legal_reviewed_at timestamptz;

alter table public.contract_templates
  add column if not exists legal_reviewed_by uuid references public.users(id) on delete set null;

alter table public.contract_templates
  add column if not exists legal_review_note text not null default '';

comment on column public.contract_templates.requires_legal_review is
  'True while the clause wording has not been signed off by counsel. A contract on such a template can be drafted and previewed but not approved, so it can never reach signature.';

comment on column public.contract_templates.legal_reviewed_at is
  'When the review was recorded. Set together with requires_legal_review = false.';

-- The employment set is the one that was never reviewed. The works order came
-- from a real instrument, so it is not gated.
update public.contract_templates
set requires_legal_review = true
where template_code = 'employment_contract'
  and legal_reviewed_at is null;
