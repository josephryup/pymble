import { requireOpsUser } from "@/lib/ops/auth";
import { canViewOpsChartOfAccounts } from "@/lib/ops/chart-of-accounts-permissions";
import { getOpsSupabaseServiceClient } from "@/lib/ops/supabase-server";

export type OpsGlAccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type OpsGlNormalBalance = "debit" | "credit";

export type OpsChartOfAccount = {
  id: string;
  code: string;
  name: string;
  account_type: OpsGlAccountType;
  account_subtype: string;
  normal_balance: OpsGlNormalBalance;
  parent_id: string | null;
  is_postable: boolean;
  is_control: boolean;
  control_key: string | null;
  currency_code: string;
  is_active: boolean;
  system_locked: boolean;
  description: string;
};

export type OpsChartOfAccountsGroup = {
  type: OpsGlAccountType;
  label: string;
  accounts: OpsChartOfAccount[];
};

export type OpsChartOfAccountsStats = {
  total: number;
  postable: number;
  control: number;
  inactive: number;
};

const TYPE_ORDER: OpsGlAccountType[] = [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
];

const TYPE_LABELS: Record<OpsGlAccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

export function opsGlAccountTypeLabel(type: OpsGlAccountType) {
  return TYPE_LABELS[type];
}

const ACCOUNT_COLUMNS =
  "id, code, name, account_type, account_subtype, normal_balance, parent_id, is_postable, is_control, control_key, currency_code, is_active, system_locked, description";

export async function fetchOpsChartOfAccounts(): Promise<OpsChartOfAccountsGroup[]> {
  const { profile } = await requireOpsUser();

  if (!canViewOpsChartOfAccounts(profile.role)) {
    return [];
  }

  const supabase = getOpsSupabaseServiceClient();
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select(ACCOUNT_COLUMNS)
    .order("code", { ascending: true });

  if (error) {
    throw error;
  }

  const accounts = (data ?? []) as unknown as OpsChartOfAccount[];

  return TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    accounts: accounts.filter((account) => account.account_type === type),
  })).filter((group) => group.accounts.length > 0);
}

export function summarizeOpsChartOfAccounts(
  groups: OpsChartOfAccountsGroup[],
): OpsChartOfAccountsStats {
  const accounts = groups.flatMap((group) => group.accounts);

  return {
    total: accounts.length,
    postable: accounts.filter((account) => account.is_postable).length,
    control: accounts.filter((account) => account.is_control).length,
    inactive: accounts.filter((account) => !account.is_active).length,
  };
}
