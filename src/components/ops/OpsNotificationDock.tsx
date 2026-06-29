import {
  fetchOpsNotifications,
  fetchOpsUnreadNotificationCount,
} from "@/lib/ops/notifications";
import {
  OpsNotificationDockClient,
  type OpsDockNotification,
} from "@/components/ops/OpsNotificationDockClient";

/**
 * Floating notifications dock. Mounted once in the workspace shell so the bell
 * (with a live unread badge) and a quick-glance alert panel are available on
 * every ops page, including the landing overview. Live updates ride the
 * existing OpsAutoRefresh cycle, which router.refresh()es on new notifications
 * for the current user.
 */
export async function OpsNotificationDock() {
  const [notifications, unreadCount] = await Promise.all([
    fetchOpsNotifications({ limit: 8 }).catch(() => []),
    fetchOpsUnreadNotificationCount().catch(() => 0),
  ]);

  const dockNotifications: OpsDockNotification[] = notifications.map((notification) => ({
    id: notification.id,
    title: notification.title,
    body: notification.body,
    moduleKey: notification.module_key,
    category: notification.category,
    status: notification.status,
    actionHref: notification.action_href,
    createdAt: notification.created_at,
  }));

  return <OpsNotificationDockClient notifications={dockNotifications} unreadCount={unreadCount} />;
}
