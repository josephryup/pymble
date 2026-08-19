import { NextResponse } from "next/server";
import { recordOpsAuditEvent } from "@/lib/ops/audit";
import { fanoutToOpsRoles } from "@/lib/ops/notification-fanout";
import { queueOpsNotification } from "@/lib/ops/notifications";
import { timingSafeEqualString } from "@/lib/ops/secure-compare";
import { runOpsWorkflowIntegrityChecks } from "@/lib/ops/workflow-integrity";

export const dynamic = "force-dynamic";

/**
 * Nightly workflow integrity sweep.
 *
 * Every defect in the August 2026 workflow audit had been live for weeks and
 * every one was findable with a single query. The audit's conclusion was that
 * nothing was watching — so this watches, and tells somebody.
 *
 * Notifies only when something is actually broken. A nightly "all clear" is
 * how a channel becomes noise, and a noisy channel hides the night it matters.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "Scheduled job is not configured.", ok: false },
      { status: 503 },
    );
  }

  if (!timingSafeEqualString(request.headers.get("authorization") ?? "", `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized", ok: false }, { status: 401 });
  }

  const report = await runOpsWorkflowIntegrityChecks();

  await recordOpsAuditEvent({
    action: "workflow.integrity_checked",
    actorUserId: null,
    entityId: null,
    entityType: "system",
    metadata: {
      failing: report.failing,
      checks: report.checks.map((check) => ({
        key: check.key,
        violations: check.violations,
      })),
    },
    moduleKey: "finance",
    sourceId: null,
    sourceTable: null,
    summary: report.clean
      ? "Workflow integrity: all checks passed"
      : `Workflow integrity: ${report.failing} check(s) failing`,
  }).catch(() => null);

  if (!report.clean) {
    const critical = report.checks.filter(
      (check) => check.violations > 0 && check.severity === "critical",
    );
    const headline = critical.length > 0 ? critical[0] : report.checks.find((c) => c.violations > 0);

    const recipients = await fanoutToOpsRoles(["finance_manager", "managing_director"]);
    await Promise.all(
      recipients.map((recipient) =>
        queueOpsNotification({
          actionHref: "/ops/finance",
          body: headline
            ? `${headline.invariant} ${headline.violations} exception(s) — e.g. ${headline.examples.slice(0, 2).join("; ")}.`
            : `${report.failing} workflow integrity check(s) are failing.`,
          // Keyed by date so a persisting break reminds once a day rather than
          // stacking, and a fixed one stops on its own.
          idempotencyKey: `workflow-integrity:${report.ranAt.slice(0, 10)}:${recipient.id}`,
          moduleKey: "finance",
          recipientId: recipient.id,
          sourceId: null,
          sourceTable: null,
          title: `${report.failing} workflow check(s) failing`,
        }).catch(() => null),
      ),
    );
  }

  return NextResponse.json({ ok: true, report });
}
