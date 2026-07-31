import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPayslipEmailContent } from "../src/lib/ops/staff-payslip-email";

/**
 * Payslip email content (audit §10).
 *
 * The body is the part that leaks: email is forwarded, quoted, previewed on
 * lock screens and synced to personal devices far more casually than an
 * attachment is opened. So the tests here are mostly about what must NOT be in
 * it.
 */

const base = {
  fullName: "Joseph Mwansa Phiri",
  periodLabel: "July 2026",
  netPay: 12_450.5,
  companyName: "Pymble Construction Limited",
};

describe("buildPayslipEmailContent", () => {
  it("addresses the person by first name", () => {
    const content = buildPayslipEmailContent(base);
    assert.match(content.text, /Hello Joseph,/);
    assert.match(content.html, /Hello Joseph,/);
  });

  it("names the period in the subject so it is findable later", () => {
    const content = buildPayslipEmailContent(base);
    assert.equal(content.subject, "Your payslip for July 2026");
  });

  it("states net pay and nothing else of substance", () => {
    const content = buildPayslipEmailContent(base);

    assert.match(content.text, /ZMW 12,450\.50/);
    // Gross, PAYE, NAPSA and deductions belong in the attachment only.
    for (const term of ["gross", "PAYE", "NAPSA", "NHIMA", "deduction", "advance"]) {
      assert.doesNotMatch(
        content.text,
        new RegExp(term, "i"),
        `${term} must not appear in the email body`,
      );
    }
  });

  it("carries no identifiers that would help someone impersonate the person", () => {
    const content = buildPayslipEmailContent(base);

    for (const term of ["NRC", "TPIN", "account number", "bank"]) {
      assert.doesNotMatch(
        content.text,
        new RegExp(term, "i"),
        `${term} must not appear in the email body`,
      );
    }
  });

  it("escapes HTML so a crafted name cannot inject markup", () => {
    const content = buildPayslipEmailContent({
      ...base,
      fullName: '<script>alert("x")</script> Phiri',
      companyName: "Acme <b>&</b> Co",
    });

    assert.doesNotMatch(content.html, /<script>/);
    assert.match(content.html, /&lt;script&gt;/);
    assert.match(content.html, /Acme &lt;b&gt;&amp;&lt;\/b&gt; Co/);
  });

  it("falls back to the full name when there is no space to split on", () => {
    const content = buildPayslipEmailContent({ ...base, fullName: "Chanda" });
    assert.match(content.text, /Hello Chanda,/);
  });

  it("tells the reader the detail is attached, and where to go if it is wrong", () => {
    const content = buildPayslipEmailContent(base);
    assert.match(content.text, /attached/i);
    assert.match(content.text, /contact HR/i);
  });
});
