import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";
import type { OpsItPolicyCategory, OpsItPolicyStatus } from "@/lib/ops/types";

export type OpsItPolicySummary = {
  ack_count: number;
  archived_at: string | null;
  category: OpsItPolicyCategory;
  created_at: string;
  id: string;
  published_at: string | null;
  status: OpsItPolicyStatus;
  title: string;
  version: number;
};

export type OpsItPolicyDetail = OpsItPolicySummary & {
  acknowledged_by_me: boolean;
  body: string;
};

export const IT_POLICY_CATEGORY_LABELS: Record<OpsItPolicyCategory, string> = {
  acceptable_use: "Acceptable use",
  byod: "Bring your own device",
  cybersecurity: "Cybersecurity",
  data_retention: "Data retention",
  other: "Other",
  password: "Password",
};

export async function fetchOpsItPolicies(): Promise<OpsItPolicySummary[]> {
  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("it_policies")
    .select("id, title, category, version, status, published_at, archived_at, created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .returns<Omit<OpsItPolicySummary, "ack_count">[]>();

  if (error) {
    throw error;
  }
  const rows = data ?? [];
  if (rows.length === 0) {
    return [];
  }

  const { data: acks, error: ackError } = await supabase
    .from("it_policy_acknowledgements")
    .select("policy_id")
    .in(
      "policy_id",
      rows.map((row) => row.id),
    )
    .returns<{ policy_id: string }[]>();

  if (ackError) {
    throw ackError;
  }

  const counts = new Map<string, number>();
  for (const ack of acks ?? []) {
    counts.set(ack.policy_id, (counts.get(ack.policy_id) ?? 0) + 1);
  }

  return rows.map((row) => ({ ...row, ack_count: counts.get(row.id) ?? 0 }));
}

export async function fetchOpsItPolicy(
  policyId: string,
  userId: string,
): Promise<OpsItPolicyDetail | null> {
  const supabase = getOpsSupabaseServiceClient();
  const { data: policy, error } = await supabase
    .from("it_policies")
    .select("id, title, category, version, body, status, published_at, archived_at, created_at")
    .eq("id", policyId)
    .maybeSingle<Omit<OpsItPolicyDetail, "ack_count" | "acknowledged_by_me">>();

  if (error) {
    throw error;
  }
  if (!policy) {
    return null;
  }

  const { data: acks, error: ackError } = await supabase
    .from("it_policy_acknowledgements")
    .select("user_id")
    .eq("policy_id", policyId)
    .returns<{ user_id: string }[]>();

  if (ackError) {
    throw ackError;
  }

  const ackRows = acks ?? [];
  return {
    ...policy,
    ack_count: ackRows.length,
    acknowledged_by_me: ackRows.some((ack) => ack.user_id === userId),
  };
}
