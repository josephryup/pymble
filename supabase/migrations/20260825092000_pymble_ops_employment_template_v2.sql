-- ---------------------------------------------------------------------------
-- Employment contract template v2 — the schedule the clauses point at
-- ---------------------------------------------------------------------------
--
-- v1's Remuneration clause reads "the basic salary and allowances set out in
-- the schedule to this contract". There was no schedule, and the record had no
-- column to hold one, so the sentence referred to nothing. The previous
-- migration added contracts.remuneration_snapshot and the employment-terms
-- columns; this publishes the wording that uses them.
--
-- A NEW ROW, not an edit. That rule is set in the original contracts migration
-- and it matters: contracts already drafted on v1 keep pointing at v1, and the
-- clause bodies they copied are untouched. v1 is deactivated so nothing new
-- starts on it, but it stays readable for anything already executed.
--
-- STILL NOT LEGALLY REVIEWED. requires_legal_review is set TRUE explicitly
-- below — the column defaults to FALSE, so omitting it publishes unvetted
-- wording as approvable. Adding a pay schedule does not make it vetted —
-- counsel has still never seen this template, and approveOpsContractAction
-- refuses to approve a contract on a template carrying this flag. Record the
-- review at /ops/contracts#template-review once someone qualified has read it.

-- DEACTIVATE v1 FIRST. contract_templates carries a partial unique index,
-- `contract_templates_active_code_unique ON (template_code) WHERE is_active`,
-- so only one version of a code may be active at a time. Inserting v2 before
-- retiring v1 fails with 23505 — the ordering here is load-bearing, not
-- stylistic.
--
-- v1 stays readable for anything already drafted on it; deactivating rather
-- than deleting is the whole reason versions exist.
update public.contract_templates
   set is_active = false
 where template_code = 'employment_contract'
   and version = 1;

insert into public.contract_templates (
  template_code, name, kind, version, is_active, description, requires_legal_review,
  default_vat_percent, default_retention_percent, default_penalty_percent_per_week,
  default_penalty_cap_percent, default_warranty_months, default_defects_liability_months,
  default_variation_threshold_percent, default_payment_terms_days
)
values (
  'employment_contract',
  'Employment contract',
  'employment',
  2,
  true,
  'Contract of employment for salaried staff, including site foremen engaged on payroll. Version 2 adds the remuneration schedule the Remuneration clause refers to. DRAFT WORDING — requires legal review before use.',
  -- EXPLICIT. The column defaults to FALSE, i.e. "already reviewed", so
  -- omitting it here would publish unvetted wording as approvable. Counsel has
  -- never read this template.
  true,
  0, 0, 0, 0, 0, 0, 0, 0
)
on conflict (template_code, version) do nothing;

insert into public.contract_template_clauses (
  template_id, section_key, heading, body_markdown, sort_order, is_required
)
select
  t.id, v.section_key, v.heading, v.body_markdown, v.sort_order, v.is_required
from public.contract_templates t
cross join (values
  (
    'appointment',
    'Appointment and duties',
    '{{org_legal_name}} appoints {{counterparty_name}} to the position of {{job_title}}. The Employee shall perform the duties of that position, together with any other duties reasonably assigned, faithfully and to the best of their ability, and shall comply with all lawful instructions of the Employer.',
    10,
    true
  ),
  (
    'place_of_work',
    'Place of work',
    'The Employee''s principal place of work is {{place_of_work}}. The Employer may require the Employee to work at any other site or office, within Zambia, where the operational requirements of the business so demand.',
    20,
    false
  ),
  (
    'remuneration',
    'Remuneration',
    'The Employee shall be paid a basic salary of {{basic_pay}} per month, together with a housing allowance of {{housing_allowance}} and any further allowances set out in the schedule to this contract, giving a gross monthly remuneration of {{gross_pay}}.

Remuneration is payable monthly in arrears. The Employee is {{statutory_basis}}, giving a net monthly pay of {{net_pay}}. Salary shall be reviewed at the Employer''s discretion and any review does not create an entitlement to an increase.',
    30,
    true
  ),
  (
    'schedule_remuneration',
    'Schedule — remuneration',
    'Basic salary: {{basic_pay}} per month.
Housing allowance: {{housing_allowance}} per month.
Gross monthly remuneration: {{gross_pay}}.
Statutory basis: the Employee is {{statutory_basis}}.
Net monthly pay: {{net_pay}}.

The figures in this schedule are those in force on the date this contract was approved. Statutory deductions are computed under the rates published by the Zambia Revenue Authority and the relevant statutory bodies for the applicable tax year, and change with those rates.',
    35,
    true
  ),
  (
    'hours_of_work',
    'Hours of work',
    'Normal hours of work are {{hours_per_week}} hours per week, worked as advised by the Employer and in accordance with the Employment Code Act. The Employee may be required to work additional hours where the operational requirements of a site so demand, and overtime shall be compensated in accordance with the applicable law and the Employer''s policy.',
    40,
    false
  ),
  (
    'probation',
    'Probation',
    'The Employee shall serve a probationary period of {{probation_months}} months from the commencement date. During probation either party may terminate this contract on the notice provided by law. Confirmation in the position is subject to satisfactory performance.',
    50,
    false
  ),
  (
    'leave',
    'Leave',
    'The Employee is entitled to {{annual_leave_days}} days of annual leave per year, together with sick leave and other statutory leave in accordance with the Employment Code Act and the Employer''s leave policy. Leave must be applied for in advance and is subject to approval and the operational requirements of the business.',
    60,
    false
  ),
  (
    'confidentiality',
    'Confidentiality and company property',
    'The Employee shall not, during or after employment, disclose to any third party any confidential information belonging to the Employer or its clients, including drawings, pricing, tender information, client details and employee records. All company property, documents and equipment issued to the Employee remain the property of the Employer and shall be returned on termination.',
    70,
    true
  ),
  (
    'health_and_safety',
    'Health and safety',
    'The Employee shall comply with all health and safety rules, wear the personal protective equipment issued, and report any accident, incident or unsafe condition immediately. Failure to comply with safety requirements constitutes a disciplinary offence.',
    80,
    false
  ),
  (
    'termination',
    'Termination',
    'This contract may be terminated by either party by giving {{notice_period_days}} days'' notice, or such longer notice as the Employment Code Act requires, or by payment in lieu of notice. The Employer may terminate without notice in the case of gross misconduct, following a disciplinary process.',
    90,
    true
  ),
  (
    'governing_law',
    'Governing law',
    'This contract is governed by the laws of the Republic of Zambia, and in particular the Employment Code Act. Any dispute shall be resolved in accordance with the applicable statutory dispute resolution procedures.',
    100,
    true
  ),
  (
    'entire_agreement',
    'Entire agreement',
    'This contract, together with its schedule and the Employer''s policies as amended from time to time, constitutes the entire agreement between the parties and supersedes any prior agreement or understanding, whether oral or written.',
    110,
    true
  )
) as v(section_key, heading, body_markdown, sort_order, is_required)
where t.template_code = 'employment_contract' and t.version = 2
on conflict (template_id, section_key) do nothing;
