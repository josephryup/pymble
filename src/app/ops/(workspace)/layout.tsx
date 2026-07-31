import { OpsActionToaster } from "@/components/ops/OpsActionToaster";
import { OpsAutoRefresh } from "@/components/ops/OpsAutoRefresh";
import { OpsFormSubmitGuard } from "@/components/ops/OpsFormSubmitGuard";
import { OpsNotificationDock } from "@/components/ops/OpsNotificationDock";
import { OpsNotificationToaster } from "@/components/ops/OpsNotificationToaster";
import { OpsServiceWorker } from "@/components/ops/OpsServiceWorker";
import { OpsSessionTimeout } from "@/components/ops/OpsSessionTimeout";
import { cookies } from "next/headers";
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
  const cookieStore = await cookies();
  const defaultNavCollapsed = cookieStore.get("ops-nav-collapsed")?.value === "1";
  const [unreadNotifications, unreadInbox] = auth.isLocalRolePreview
    ? [0, 0]
    : await Promise.all([
        fetchOpsUnreadNotificationCount().catch(() => 0),
        fetchOpsInboxUnreadCountForCurrentUser().catch(() => 0),
      ]);

  return (
    <OpsShell
      avatarUpdatedAt={profile.avatar_updated_at}
      defaultNavCollapsed={defaultNavCollapsed}
      hasAvatar={Boolean(profile.avatar_key)}
      userId={profile.id}
      isLocalRolePreview={auth.isLocalRolePreview}
      profileEmail={profile.email}
      profileName={profile.full_name}
      profileRole={profile.role}
      unreadInbox={unreadInbox}
      unreadNotifications={unreadNotifications}
    >
      <OpsServiceWorker />
      {/* Confirms what YOU just did (audit §12). Distinct from
          OpsNotificationToaster, which announces what happened elsewhere. */}
      <OpsActionToaster />
      <OpsFormSubmitGuard />
      <OpsSyncIndicator />
      {auth.isLocalRolePreview ? null : (
        <>
          <OpsAutoRefresh userId={profile.id} />
          <OpsSessionTimeout role={profile.role} />
          <OpsNotificationToaster userId={profile.id} />
          <OpsNotificationDock />
        </>
      )}
      {children}
    </OpsShell>
  );
}
