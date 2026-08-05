-- Value-based escalation for material request approvals.
--
-- `materialRequestApprovalSteps(_priority, _estimatedTotal, scope)` accepted a
-- priority and an estimated total and then explicitly discarded both:
--
--   void _priority;
--   void _estimatedTotal;
--
-- So a K200 request and a K200,000 request followed the identical two-step
-- chain (Projects Manager → Operations Manager for site scope, Operations
-- Manager alone otherwise). Value-based escalation is the most ordinary
-- approval control there is, and the parameters being threaded through and
-- thrown away suggests it was intended and never finished.
--
-- This seeds the settings row that turns it on. The CHAIN itself stays in code,
-- deliberately: with one Projects Manager and one Operations Manager, routing
-- is org-chart-shaped and does not vary, and segregation of duties is currently
-- guaranteed by tests over that code. The THRESHOLD is the part that genuinely
-- changes over time (inflation, policy), so that is the part that belongs in
-- configuration — the same split already used for purchase orders.
--
-- first_step_role / second_step_role are recorded here for display on the
-- "who approves what" page. They mirror the site-scope chain in
-- material-request-permissions.ts; the code remains authoritative for routing.

insert into public.approval_workflow_settings (
  workflow_key,
  module_key,
  title,
  description,
  currency_code,
  threshold_amount,
  threshold_enabled,
  first_step_role,
  second_step_role,
  threshold_step_role,
  is_active
)
values (
  'material_request',
  'material_requests',
  'Material request approval',
  'Site requests are reviewed by the Projects Manager then Operations. Above the threshold the Managing Director is added as a final step.',
  'ZMW',
  -- Starting point, not a recommendation: the MD should set this to whatever
  -- authority level actually reflects company policy.
  25000,
  true,
  'projects_manager',
  'operations_manager',
  'managing_director',
  true
)
on conflict (workflow_key) do nothing;
