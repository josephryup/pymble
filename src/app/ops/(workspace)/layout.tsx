import { OpsAutoRefresh } from "@/components/ops/OpsAutoRefresh";
import { OpsFormSubmitGuard } from "@/components/ops/OpsFormSubmitGuard";
import { OpsServiceWorker } from "@/components/ops/OpsServiceWorker";
import { OpsShell } from "@/components/ops/OpsShell";
import { OpsSyncIndicator } from "@/components/ops/OpsSyncIndicator";
import { requireOpsUser } from "@/lib/ops/auth";
import { fetchOpsInboxUnreadCountForCurrentUser } from "@/lib/ops/inbox";
import { fetchOpsUnreadNotificationCount } from "@/lib/ops/notifications";

export default async function OpsWorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = await requireOpsUser();
  const { profile } = auth;
  const [unreadNotifications, unreadInbox] = auth.isLocalRolePreview
    ? [0, 0]
    : await Promise.all([
        fetchOpsUnreadNotificationCount().catch(() => 0),
        fetchOpsInboxUnreadCountForCurrentUser().catch(() => 0),
      ]);

  return (
    <OpsShell
      isLocalRolePreview={auth.isLocalRolePreview}
      profileEmail={profile.email}
      profileName={profile.full_name}
      profileRole={profile.role}
      unreadInbox={unreadInbox}
      unreadNotifications={unreadNotifications}
    >
      <OpsServiceWorker />
      <OpsFormSubmitGuard />
      <OpsSyncIndicator />
      {auth.isLocalRolePreview ? null : <OpsAutoRefresh userId={profile.id} />}
      {children}
    </OpsShell>
  );
}
