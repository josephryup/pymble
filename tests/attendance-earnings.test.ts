import test from "node:test";
import { strict as assert } from "node:assert";
import {
  computeAttendanceEarnings,
  DEFAULT_WORKER_DAILY_RATE,
  deriveOvertimeHours,
  hoursBetweenClockTimes,
} from "@/lib/ops/attendance-earnings";

const STANDARD = { standardDailyHours: 8, overtimeMultiplier: 1.5 };

test("the default Pymble worker daily rate is K60", () => {
  assert.equal(DEFAULT_WORKER_DAILY_RATE, 60);
});

test("a full 8h day pays the fixed daily rate", () => {
  const result = computeAttendanceEarnings({
    hoursWorked: 8,
    dailyRate: 60,
    ...STANDARD,
  });
  assert.equal(result.overtimeHours, 0);
  assert.equal(result.regularAmount, 60);
  assert.equal(result.overtimeAmount, 0);
  assert.equal(result.totalAmount, 60);
});

test("a short day still pays the full fixed daily rate", () => {
  const result = computeAttendanceEarnings({
    hoursWorked: 3,
    dailyRate: 60,
    ...STANDARD,
  });
  assert.equal(result.regularAmount, 60);
  assert.equal(result.overtimeAmount, 0);
  assert.equal(result.totalAmount, 60);
});

test("zero logged hours while present still pays the daily rate", () => {
  const result = computeAttendanceEarnings({
    hoursWorked: 0,
    dailyRate: 60,
    ...STANDARD,
  });
  assert.equal(result.totalAmount, 60);
});

test("absent pays nothing regardless of hours or overtime", () => {
  const result = computeAttendanceEarnings({
    hoursWorked: 10,
    overtimeHours: 2,
    dailyRate: 60,
    isAbsent: true,
    ...STANDARD,
  });
  assert.equal(result.totalAmount, 0);
  assert.equal(result.regularAmount, 0);
  assert.equal(result.overtimeHours, 0);
  assert.equal(result.overtimeAmount, 0);
});

test("explicit overtime hours are added on top of the daily rate", () => {
  // K60/day over an 8h standard day = K7.50/hr → K11.25/hr overtime.
  const result = computeAttendanceEarnings({
    hoursWorked: 8,
    overtimeHours: 2,
    dailyRate: 60,
    ...STANDARD,
  });
  assert.equal(result.hourlyRate, 7.5);
  assert.equal(result.overtimeHours, 2);
  assert.equal(result.overtimeAmount, 22.5);
  assert.equal(result.totalAmount, 82.5);
});

test("overtime is derived from hours beyond the standard day when not supplied", () => {
  const result = computeAttendanceEarnings({
    hoursWorked: 11,
    dailyRate: 60,
    ...STANDARD,
  });
  assert.equal(result.overtimeHours, 3);
  assert.equal(result.overtimeAmount, 33.75); // 3 * 7.5 * 1.5
  assert.equal(result.totalAmount, 93.75);
});

test("explicit overtime wins over the derived value", () => {
  // Supervisor logged 12 hours but only 1 hour was authorised as overtime.
  const result = computeAttendanceEarnings({
    hoursWorked: 12,
    overtimeHours: 1,
    dailyRate: 60,
    ...STANDARD,
  });
  assert.equal(result.overtimeHours, 1);
  assert.equal(result.overtimeAmount, 11.25);
  assert.equal(result.totalAmount, 71.25);
});

test("explicit zero overtime suppresses the derived overtime", () => {
  const result = computeAttendanceEarnings({
    hoursWorked: 12,
    overtimeHours: 0,
    dailyRate: 60,
    ...STANDARD,
  });
  assert.equal(result.overtimeHours, 0);
  assert.equal(result.totalAmount, 60);
});

test("negative overtime is clamped to zero", () => {
  const result = computeAttendanceEarnings({
    hoursWorked: 8,
    overtimeHours: -4,
    dailyRate: 60,
    ...STANDARD,
  });
  assert.equal(result.overtimeHours, 0);
  assert.equal(result.totalAmount, 60);
});

test("a non-default standard day and multiplier flow through", () => {
  const result = computeAttendanceEarnings({
    hoursWorked: 9,
    dailyRate: 70,
    standardDailyHours: 7,
    overtimeMultiplier: 2,
  });
  assert.equal(result.hourlyRate, 10);
  assert.equal(result.overtimeHours, 2);
  assert.equal(result.overtimeAmount, 40); // 2 * 10 * 2
  assert.equal(result.totalAmount, 110);
});

test("overtime money rounds to cents", () => {
  // K100/day, 8h standard → K12.50/hr; 1.5h OT = 1.5 * 12.5 * 1.5 = 28.125 → 28.13
  const result = computeAttendanceEarnings({
    hoursWorked: 9.5,
    dailyRate: 100,
    ...STANDARD,
  });
  assert.equal(result.overtimeHours, 1.5);
  assert.equal(result.overtimeAmount, 28.13);
  assert.equal(result.totalAmount, 128.13);
});

test("deriveOvertimeHours only counts hours beyond the standard day", () => {
  assert.equal(deriveOvertimeHours(8, 8), 0);
  assert.equal(deriveOvertimeHours(4, 8), 0);
  assert.equal(deriveOvertimeHours(10.5, 8), 2.5);
});

test("hoursBetweenClockTimes measures a normal shift", () => {
  assert.equal(hoursBetweenClockTimes("07:00", "16:30"), 9.5);
});

test("hoursBetweenClockTimes treats an earlier clock-out as a night shift", () => {
  assert.equal(hoursBetweenClockTimes("21:00", "05:00"), 8);
});

test("hoursBetweenClockTimes returns null without a usable pair", () => {
  assert.equal(hoursBetweenClockTimes("07:00", null), null);
  assert.equal(hoursBetweenClockTimes("", "16:00"), null);
  assert.equal(hoursBetweenClockTimes("7am", "16:00"), null);
});
