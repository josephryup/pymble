import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOpsHseEmailDeliveryReport } from "../src/lib/ops/hse-email-observability";

describe("HSE email observability", () => {
  it("builds delivery counts, masks email addresses, and fills a seven-day trend", () => {
    const report = buildOpsHseEmailDeliveryReport({
      configured: true,
      today: "2026-06-07",
      rows: [
        {
          action_href: "/ops/hse#incident-register",
          attempted_at: "2026-06-07T09:00:00.000Z",
          delivery_type: "hse_critical_alert",
          id: "event-1",
          module_key: "hse",
          provider: "resend",
          reason: "sent",
          recipient_email: "director@example.com",
          recipient_name: "",
          recipient_role: "managing_director",
          source_id: "source-1",
          source_table: "hse_incidents",
          status: "sent",
        },
        {
          action_href: "/ops/hse#incident-register",
          attempted_at: "2026-06-06T09:00:00.000Z",
          delivery_type: "hse_critical_alert",
          id: "event-2",
          module_key: "hse",
          provider: "resend",
          reason: "send_failed",
          recipient_email: "hse@example.com",
          recipient_name: "HSE Officer",
          recipient_role: "hse_officer",
          source_id: "source-2",
          source_table: "corrective_actions",
          status: "failed",
        },
        {
          action_href: "/ops/hse#incident-register",
          attempted_at: "2026-05-25T09:00:00.000Z",
          delivery_type: "hse_critical_alert",
          id: "event-old",
          module_key: "hse",
          provider: "resend",
          reason: "sent",
          recipient_email: "old@example.com",
          recipient_name: "",
          recipient_role: "developer",
          source_id: "source-old",
          source_table: "hse_incidents",
          status: "sent",
        },
      ],
    });

    assert.equal(report.sent7d, 1);
    assert.equal(report.failed7d, 1);
    assert.equal(report.skipped7d, 0);
    assert.equal(report.total7d, 2);
    assert.equal(report.failureRate7d, 50);
    assert.equal(report.trendRows.length, 7);
    assert.equal(report.trendRows[6].date, "2026-06-07");
    assert.equal(report.trendRows[6].sent, 1);
    assert.equal(report.recentEvents[0].recipient_label, "di***@example.com");
    assert.equal(report.recentEvents[1].recipient_label, "HSE Officer");
  });
});
