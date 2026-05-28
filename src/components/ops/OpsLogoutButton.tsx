import { OPS_SECONDARY_BUTTON_CLASS } from "@/lib/ops/ui";

export function OpsLogoutButton() {
  return (
    <form action="/api/ops/auth/logout" method="post">
      <button
        className={OPS_SECONDARY_BUTTON_CLASS}
        type="submit"
      >
        Sign out
      </button>
    </form>
  );
}
