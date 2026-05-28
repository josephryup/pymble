import { OpsShell } from "@/components/ops/OpsShell";
import { requireOpsUser } from "@/lib/ops/auth";

export default async function OpsWorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { profile } = await requireOpsUser();

  return (
    <OpsShell
      profileEmail={profile.email}
      profileName={profile.full_name}
      profileRole={profile.role}
    >
      {children}
    </OpsShell>
  );
}
