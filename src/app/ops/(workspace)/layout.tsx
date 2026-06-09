import { OpsShell } from "@/components/ops/OpsShell";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsUnreadNotificationCount } from "@/lib/ops/notifications";

export default async function OpsWorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = await requireOpsUser();
  const { profile } = auth;
  const unreadNotifications = auth.isLocalRolePreview
    ? 0
    : await fetchOpsUnreadNotificationCount().catch(() => 0);

  return (
    <OpsShell
      isLocalRolePreview={auth.isLocalRolePreview}
      profileEmail={profile.email}
      profileName={profile.full_name}
      profileRole={profile.role}
      unreadNotifications={unreadNotifications}
    >
      {children}
    </OpsShell>
  );
}
