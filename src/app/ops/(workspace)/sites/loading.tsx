import { OpsRouteLoader } from "@/components/ops/OpsRouteLoader";

/**
 * Per-route loading state.
 *
 * The workspace layout already has one, but a layout-level loading.tsx only
 * fires when the layout itself is entered — navigating BETWEEN workspace pages
 * showed the old page frozen until the new one finished its queries (37 of them
 * on the heaviest dashboards). A route-level file makes the skeleton and the
 * animated mark appear on every navigation.
 */
export default function Loading() {
  return <OpsRouteLoader variant="workspace" />;
}
