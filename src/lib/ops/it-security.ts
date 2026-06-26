import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type {
  OpsItBackupStatus,
  OpsItIncidentSeverity,
  OpsItIncidentStatus,
} from "@/lib/ops/types";

export type OpsItSecurityIncident = {
  archived_at: string | null;
  created_at: string;
  detected_at: string;
  id: string;
  resolved_at: string | null;
  severity: OpsItIncidentSeverity;
  status: OpsItIncidentStatus;
  summary: string;
  title: string;
};

export type OpsItBackupRecord = {
  archived_at: string | null;
  created_at: string;
  frequency: string;
  id: string;
  last_run_at: string | null;
  name: string;
  notes: string;
  status: OpsItBackupStatus;
  target: string;
};

export type OpsItSecurityStats = {
  failed_backups: number;
  open_incidents: number;
};

export async function fetchOpsItSecurityIncidents(): Promise<OpsItSecurityIncident[]> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_security_incidents")
    .select("id, title, severity, status, summary, detected_at, resolved_at, archived_at, created_at")
    .is("archived_at", null)
    .order("detected_at", { ascending: false })
    .returns<OpsItSecurityIncident[]>();

  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function fetchOpsItBackupRecords(): Promise<OpsItBackupRecord[]> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_backup_records")
    .select("id, name, target, frequency, status, last_run_at, notes, archived_at, created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .returns<OpsItBackupRecord[]>();

  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function fetchOpsItSecurityStats(): Promise<OpsItSecurityStats> {
  const supabase = getOpsSupabaseServiceClient();
  const [incidents, backups] = await Promise.all([
    supabase
      .from("it_security_incidents")
      .select("status")
      .is("archived_at", null)
      .returns<{ status: OpsItIncidentStatus }[]>(),
    supabase
      .from("it_backup_records")
      .select("status")
      .is("archived_at", null)
      .returns<{ status: OpsItBackupStatus }[]>(),
  ]);

  if (incidents.error) {
    throw incidents.error;
  }
  if (backups.error) {
    throw backups.error;
  }

  return {
    failed_backups: (backups.data ?? []).filter((row) => row.status === "failed").length,
    open_incidents: (incidents.data ?? []).filter((row) => row.status !== "resolved").length,
  };
}
