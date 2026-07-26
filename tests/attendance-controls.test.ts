import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canApproveAttendance,
  canRecordAttendance,
  canSelfApproveAttendance,
} from "../src/lib/ops/permissions";
import { attendanceExportFilename } from "../src/lib/ops/attendance-export";
import {
  attendanceRateSettings,
  resolveAttendanceEarnings,
} from "../src/lib/ops/attendance-core";

const SETTINGS = { standardDailyHours: 8, overtimeMultiplier: 1.5 };

describe("attendance maker/checker (audit A1)", () => {
  it("stops the capture-and-approve roles from signing off their own records", () => {
    // These roles record attendance daily; approval must go to a second person.
    for (const role of ["supervisor", "engineer", "hse_officer", "quantity_surveyor"] as const) {
      assert.equal(canRecordAttendance(role), true, `${role} should record`);
      assert.equal(canApproveAttendance(role), true, `${role} should approve others`);
      assert.equal(canSelfApproveAttendance(role), false, `${role} must not self-approve`);
    }
  });

  it("lets senior roles carry approval authority alone", () => {
    for (const role of [
      "developer",
      "managing_director",
      "owner",
      "general_manager",
      "manager",
      "operations_manager",
      "projects_manager",
    ] as const) {
      assert.equal(canSelfApproveAttendance(role), true, `${role} should self-approve`);
    }
  });

  it("never grants self-approval to a role that cannot approve at all", () => {
    assert.equal(canApproveAttendance("crew"), false);
    assert.equal(canSelfApproveAttendance("crew"), false);
    assert.equal(canApproveAttendance("engineering_intern"), false);
    assert.equal(canSelfApproveAttendance("engineering_intern"), false);
  });
});

describe("resolveAttendanceEarnings", () => {
  it("derives hours from the clock times when none are given", () => {
    const { hoursWorked, earnings } = resolveAttendanceEarnings({
      presence: "present",
      clockInTime: "07:00",
      clockOutTime: "17:00",
      hoursWorked: null,
      overtimeHours: null,
      dailyRate: 60,
      settings: SETTINGS,
    });
    assert.equal(hoursWorked, 10);
    assert.equal(earnings.overtimeHours, 2);
    assert.equal(earnings.totalAmount, 82.5); // 60 + 2 * 7.5 * 1.5
  });

  it("prefers explicitly entered hours over the clock span", () => {
    const { hoursWorked } = resolveAttendanceEarnings({
      presence: "present",
      clockInTime: "07:00",
      clockOutTime: "17:00",
      hoursWorked: 8,
      overtimeHours: null,
      dailyRate: 60,
      settings: SETTINGS,
    });
    assert.equal(hoursWorked, 8);
  });

  it("pays the full daily rate for a short day", () => {
    const { earnings } = resolveAttendanceEarnings({
      presence: "late",
      clockInTime: "10:00",
      clockOutTime: "13:00",
      hoursWorked: null,
      overtimeHours: null,
      dailyRate: 60,
      settings: SETTINGS,
    });
    assert.equal(earnings.totalAmount, 60);
  });

  it("zeroes hours, overtime, and pay for an absent record", () => {
    const { hoursWorked, earnings } = resolveAttendanceEarnings({
      presence: "absent",
      clockInTime: "07:00",
      clockOutTime: "17:00",
      hoursWorked: 10,
      overtimeHours: 2,
      dailyRate: 60,
      settings: SETTINGS,
    });
    assert.equal(hoursWorked, 0);
    assert.equal(earnings.overtimeHours, 0);
    assert.equal(earnings.totalAmount, 0);
  });

  it("handles a night shift crossing midnight", () => {
    const { hoursWorked } = resolveAttendanceEarnings({
      presence: "present",
      clockInTime: "20:00",
      clockOutTime: "04:00",
      hoursWorked: null,
      overtimeHours: null,
      dailyRate: 60,
      settings: SETTINGS,
    });
    assert.equal(hoursWorked, 8);
  });
});

describe("attendanceRateSettings", () => {
  it("falls back to an 8-hour day at 1.5x when the org profile is empty", () => {
    assert.deepEqual(attendanceRateSettings(null), {
      standardDailyHours: 8,
      overtimeMultiplier: 1.5,
    });
  });

  it("reads numeric strings from Postgres numeric columns", () => {
    assert.deepEqual(
      attendanceRateSettings({ standard_daily_hours: "9.00", overtime_multiplier: "2.00" }),
      { standardDailyHours: 9, overtimeMultiplier: 2 },
    );
  });
});

describe("attendanceExportFilename", () => {
  it("slugifies the scope into a safe filename", () => {
    assert.equal(
      attendanceExportFilename("2026-07-01 to 2026-07-26 | All sites"),
      "pymble-attendance-register-2026-07-01-to-2026-07-26-all-sites.xlsx",
    );
  });

  it("falls back when the scope has nothing usable", () => {
    assert.equal(attendanceExportFilename("  |  "), "pymble-attendance-register-all.xlsx");
  });
});
