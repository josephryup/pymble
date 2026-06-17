-- Publish the high-traffic ops tables to supabase_realtime so the workspace
-- can subscribe to live changes (used by OpsAutoRefresh + per-page listeners).
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.notifications';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.approval_requests';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.record_comments';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.boq_documents';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.material_requests';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.invoices';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.payment_requests';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.daily_site_reports';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.hse_incidents';
  exception when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.hse_weekly_reports';
  exception when duplicate_object then null;
  end;
end$$;
