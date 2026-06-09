import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOpsCriticalHseAlertEmailContent,
  buildOpsEmailActionUrl,
} from "../src/lib/ops/email";

describe("Ops email helpers", () => {
  it("builds safe absolute ops URLs from internal action paths", () => {
    assert.equal(
      buildOpsEmailActionUrl("/ops/hse#incident-register", "https://ops.pymbleconstruction.com/"),
      "https://ops.pymbleconstruction.com/ops/hse#incident-register",
    );
    assert.equal(
      buildOpsEmailActionUrl("https://bad.example/phish", "ops.pymbleconstruction.com"),
      "https://ops.pymbleconstruction.com/ops/notifications",
    );
  });

  it("renders HSE alert HTML with link text and escaped content", () => {
    const content = buildOpsCriticalHseAlertEmailContent({
      actionHref: "/ops/hse?severity=high#incident-register",
      body: "Incident <script>alert(1)</script> requires action.",
      recipientName: "Managing Director",
      title: "Critical <incident>",
      to: "leader@example.com",
    });

    assert.equal(content.subject, "Pymble HSE alert: Critical <incident>");
    assert.match(content.html, /Open HSE alert/);
    assert.match(content.html, /Critical &lt;incident&gt;/);
    assert.match(content.html, /Incident &lt;script&gt;alert\(1\)&lt;\/script&gt; requires action\./);
    assert.equal(content.html.includes(">https://"), false);
  });
});
