import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizePersonName,
  suggestEmployeeAccountMatches,
  summariseAccountLinkCoverage,
  type EmployeeForMatching,
  type UserForMatching,
} from "../src/lib/ops/employee-account-matching";

function employee(
  overrides: Partial<EmployeeForMatching> & { id: string },
): EmployeeForMatching {
  return {
    employeeNumber: `EMP-${overrides.id}`,
    fullName: "Joseph Phiri",
    email: null,
    userId: null,
    ...overrides,
  };
}

function user(overrides: Partial<UserForMatching> & { id: string }): UserForMatching {
  return {
    fullName: "Joseph Phiri",
    email: null,
    isActive: true,
    ...overrides,
  };
}

describe("normalizePersonName", () => {
  it("strips honorifics, punctuation and case", () => {
    assert.equal(normalizePersonName("  Mr. Joseph  PHIRI "), "joseph phiri");
    assert.equal(normalizePersonName("Eng Chanda-Mwale"), "chanda mwale");
  });

  it("handles null and empty input", () => {
    assert.equal(normalizePersonName(null), "");
    assert.equal(normalizePersonName(""), "");
  });
});

describe("suggestEmployeeAccountMatches", () => {
  it("matches on email above everything else", () => {
    const result = suggestEmployeeAccountMatches({
      employees: [employee({ id: "e1", fullName: "J Phiri", email: "jp@pymble.zm" })],
      users: [
        user({ id: "u1", fullName: "Someone Else", email: "jp@pymble.zm" }),
        user({ id: "u2", fullName: "J Phiri", email: "other@pymble.zm" }),
      ],
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].userId, "u1");
    assert.equal(result[0].confidence, "exact_email");
  });

  it("matches names regardless of word order", () => {
    const result = suggestEmployeeAccountMatches({
      employees: [employee({ id: "e1", fullName: "Phiri Joseph" })],
      users: [user({ id: "u1", fullName: "Joseph Phiri" })],
    });

    assert.equal(result[0].confidence, "exact_name");
  });

  it("matches first and last name when a middle name differs", () => {
    const result = suggestEmployeeAccountMatches({
      employees: [employee({ id: "e1", fullName: "Joseph Mwansa Phiri" })],
      users: [user({ id: "u1", fullName: "Joseph Phiri" })],
    });

    assert.equal(result[0].confidence, "likely_name");
  });

  it("refuses to guess when two accounts match equally well", () => {
    // Two people sharing a name is exactly when an auto-link leaks a payslip.
    const result = suggestEmployeeAccountMatches({
      employees: [employee({ id: "e1", fullName: "Joseph Phiri" })],
      users: [
        user({ id: "u1", fullName: "Joseph Phiri" }),
        user({ id: "u2", fullName: "Joseph Phiri" }),
      ],
    });

    assert.deepEqual(result, []);
  });

  it("never re-points an employee that is already linked", () => {
    const result = suggestEmployeeAccountMatches({
      employees: [employee({ id: "e1", userId: "u-existing" })],
      users: [user({ id: "u1" })],
    });

    assert.deepEqual(result, []);
  });

  it("never proposes an account already linked to someone else", () => {
    const result = suggestEmployeeAccountMatches({
      employees: [
        employee({ id: "e1", fullName: "Joseph Phiri", userId: "u1" }),
        employee({ id: "e2", fullName: "Joseph Phiri" }),
      ],
      users: [user({ id: "u1", fullName: "Joseph Phiri" })],
    });

    assert.deepEqual(result, []);
  });

  it("never proposes one account for two employees in the same pass", () => {
    const result = suggestEmployeeAccountMatches({
      employees: [
        employee({ id: "e1", fullName: "Joseph Phiri" }),
        employee({ id: "e2", fullName: "Joseph Phiri" }),
      ],
      users: [user({ id: "u1", fullName: "Joseph Phiri" })],
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].employeeId, "e1");
  });

  it("ignores deactivated accounts", () => {
    const result = suggestEmployeeAccountMatches({
      employees: [employee({ id: "e1" })],
      users: [user({ id: "u1", isActive: false })],
    });

    assert.deepEqual(result, []);
  });

  it("makes no suggestion when nothing resembles a match", () => {
    const result = suggestEmployeeAccountMatches({
      employees: [employee({ id: "e1", fullName: "Joseph Phiri" })],
      users: [user({ id: "u1", fullName: "Grace Banda" })],
    });

    assert.deepEqual(result, []);
  });

  it("carries a rationale so the person confirming can see the basis", () => {
    const result = suggestEmployeeAccountMatches({
      employees: [employee({ id: "e1", email: "jp@pymble.zm" })],
      users: [user({ id: "u1", email: "JP@Pymble.zm" })],
    });

    assert.match(result[0].rationale, /Email matches/);
  });
});

describe("summariseAccountLinkCoverage", () => {
  it("reports the gap in both directions", () => {
    const result = summariseAccountLinkCoverage({
      employees: [
        employee({ id: "e1", userId: "u1" }),
        employee({ id: "e2" }),
        employee({ id: "e3" }),
      ],
      users: [user({ id: "u1" }), user({ id: "u2" }), user({ id: "u3", isActive: false })],
    });

    assert.equal(result.totalEmployees, 3);
    assert.equal(result.linked, 1);
    assert.equal(result.unlinked, 2);
    // u2 is active with no employee record; u3 is inactive so does not count.
    assert.equal(result.usersWithoutEmployee, 1);
    assert.equal(result.coveragePercent, 33);
  });

  it("reports zero coverage rather than dividing by zero", () => {
    const result = summariseAccountLinkCoverage({ employees: [], users: [] });
    assert.equal(result.coveragePercent, 0);
  });
});
