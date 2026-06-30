import { OPS_LOCAL_ROLE_PREVIEW_OPTIONS } from "@/lib/ops/local-role-preview";
import { formatOpsRole } from "@/lib/ops/roles";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/label";
import {
  OPS_INPUT_CLASS,
} from "@/lib/ops/ui";
import type { OpsUserRole } from "@/lib/ops/types";

type OpsLocalRolePreviewPanelProps = {
  activeRole?: OpsUserRole | null;
  compact?: boolean;
};

export function OpsLocalRolePreviewPanel({
  activeRole = null,
  compact = false,
}: OpsLocalRolePreviewPanelProps) {
  return (
    <Alert
      aria-labelledby={compact ? "ops-preview-banner-title" : "ops-preview-login-title"}
      className={
        compact
          ? "rounded-xl border-amber-200 bg-amber-50 p-3 text-foreground"
          : "mt-5 rounded-xl border-amber-200 bg-amber-50 p-4 text-foreground"
      }
    >
      <div className={compact ? "grid gap-3 xl:grid-cols-[1fr_auto]" : "grid gap-3"}>
        <div>
          <p
            className="text-xs font-black uppercase tracking-[0.16em] text-amber-700"
            id={compact ? "ops-preview-banner-title" : "ops-preview-login-title"}
          >
            Local role preview
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {activeRole
              ? `Viewing the workspace as ${formatOpsRole(activeRole)}. Preview mode is read-only.`
              : "Use a temporary local-only role view without creating Supabase accounts."}
          </p>
        </div>

        <div className={compact ? "flex flex-wrap items-end gap-2" : "grid gap-2"}>
          <form action="/api/ops/dev-preview" className="flex flex-wrap items-end gap-2" method="post">
            <input name="action" type="hidden" value="start" />
            <Label className="grid min-w-[13rem] flex-1 gap-1 text-xs font-bold text-muted-foreground">
              <span>Preview role</span>
              <select
                className={`${OPS_INPUT_CLASS} min-h-10 bg-background text-sm`}
                defaultValue={activeRole ?? "developer"}
                name="role"
              >
                {OPS_LOCAL_ROLE_PREVIEW_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </Label>
            <Button className="min-h-10 px-4 text-sm" type="submit">
              {activeRole ? "Switch" : "Start preview"}
            </Button>
          </form>

          {activeRole ? (
            <form action="/api/ops/dev-preview" method="post">
              <input name="action" type="hidden" value="stop" />
              <Button className="min-h-10 px-4 text-sm" type="submit" variant="outline">
                Stop preview
              </Button>
            </form>
          ) : null}
        </div>
      </div>
    </Alert>
  );
}
