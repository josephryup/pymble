import test from "node:test";
import { strict as assert } from "node:assert";
import { computeAttendanceEarnings } from "@/lib/ops/attendance-earnings";

const STANDARD = { standardDailyHours: 8, overtimeMultiplier: 1.5 };

test("standard 8h day pays daily rate exactly", () => {
  const result = computeAttendanceEarnings({
    hoursWorked: 8,
    dailyRate: 240,
    ...STANDARD,
  });
  assert.equal(result.regularHours, 8);
  assert.equal(result.overtimeHours, 0);
  assert.equal(result.regularAmount, 240);
  assert.equal(result.overtimeAmount, 0);
  assert.equal(result.totalAmount, 240);
});

test("half day pays half the daily rate", () => {
  const result = computeAttendanceEarnings({
    hoursWorked: 4,
    dailyRate: 240,
    ...STANDARD,
  });
  assert.equal(result.regularHours, 4);
  assert.equal(result.overtimeHours, 0);
  assert.equal(result.regularAmount, 120);
  assert.equal(result.totalAmount, 120);
});

test("hours above standard split into overtime at 1.5x", () => {
  // dailyRate 240 / 8 hrs = K30/hr standard, K45/hr overtime
  const result = computeAttendanceEarnings({
    hoursWorked: 10,
    dailyRate: 240,
    ...STANDARD,
  });
  assert.equal(result.regularHours, 8);
  assert.equal(result.overtimeHours, 2);
  assert.equal(result.regularAmount, 240); // 8 * 30
  assert.equal(result.overtimeAmount, 90); // 2 * 30 * 1.5
  assert.equal(result.totalAmount, 330);
});

test("12-hour day produces 4h overtime", () => {
  const result = computeAttendanceEarnings({
    hoursWorked: 12,
    dailyRate: 240,
    ...STANDARD,
  });
  assert.equal(result.overtimeHours, 4);
  assert.equal(result.overtimeAmount, 180); // 4 * 30 * 1.5
  assert.equal(result.totalAmount, 420); // 240 + 180
});

test("absent record pays nothing regardless of hours", () => {
  const result = computeAttendanceEarnings({
    hoursWorked: 10,
    dailyRate: 240,
    isAbsent: true,
    ...STANDARD,
  });
  assert.equal(result.totalAmount, 0);
  assert.equal(result.overtimeHours, 0);
});

test("zero hours pays zero", () => {
  const result = computeAttendanceEarnings({
    hoursWorked: 0,
    dailyRate: 240,
    ...STANDARD,
  });
  assert.equal(result.totalAmount, 0);
});

test("non-default 7-hour standard day with 2x overtime multiplier", () => {
  const result = computeAttendanceEarnings({
    hoursWorked: 9,
    dailyRate: 210, // 30/hr standard
    standardDailyHours: 7,
    overtimeMultiplier: 2,
  });
  assert.equal(result.regularHours, 7);
  assert.equal(result.overtimeHours, 2);
  assert.equal(result.regularAmount, 210);
  assert.equal(result.overtimeAmount, 120); // 2 * 30 * 2
  assert.equal(result.totalAmount, 330);
});

test("rounds to cents", () => {
  // Awkward rate K100/day, 8h standard → hourly K12.50
  // 9 hours = 8*12.5 + 1*12.5*1.5 = 100 + 18.75 = 118.75
  const result = computeAttendanceEarnings({
    hoursWorked: 9,
    dailyRate: 100,
    ...STANDARD,
  });
  assert.equal(result.totalAmount, 118.75);
});
