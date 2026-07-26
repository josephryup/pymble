/**
 * Pure attendance earnings calculator.
 *
 * Pymble pays site workers a **fixed daily rate** (K60 by default): showing up
 * for the day earns the full rate regardless of how many hours were logged.
 * Overtime is captured separately, as its own hours figure, and paid on top.
 *
 * Conventions:
 *  - Present / late  → the full daily rate, whatever hours_worked says.
 *  - Absent          → zero pay, zero overtime.
 *  - Hourly rate     = dailyRate / standardDailyHours (used only for overtime).
 *  - Overtime pay    = overtimeHours × hourlyRate × overtimeMultiplier.
 *  - Total           = dailyRate + overtime pay.
 *
 * Overtime hours can be given explicitly (the "Overtime hours" input) or left
 * blank, in which case they are derived from hours worked beyond the standard
 * day — so a supervisor who only records a 10-hour day still gets the 2h of
 * overtime priced automatically.
 */

/** Standard Pymble worker daily rate in ZMW. */
export const DEFAULT_WORKER_DAILY_RATE = 60;

export type ComputeAttendanceInput = {
  /** Total hours the worker actually worked (informational; does not scale base pay). */
  hoursWorked: number;
  /**
   * Overtime hours as captured on the record. Pass `null`/`undefined` to derive
   * them from `hoursWorked` above the standard day.
   */
  overtimeHours?: number | null;
  /** Fixed daily rate in ZMW for a day's attendance. */
  dailyRate: number;
  /** Standard working hours per day (typically 8) — the overtime threshold. */
  standardDailyHours: number;
  /** Overtime pay multiplier (typically 1.5). */
  overtimeMultiplier: number;
  /** When true, force everything to zero (absent record). */
  isAbsent?: boolean;
};

export type ComputeAttendanceResult = {
  /** Hours counted inside the standard day (display only). */
  regularHours: number;
  /** Hours paid at the overtime rate. */
  overtimeHours: number;
  /** Hourly rate derived from dailyRate / standardDailyHours. */
  hourlyRate: number;
  /** Base pay for the day — the flat daily rate, or 0 when absent. */
  regularAmount: number;
  /** Pay attributable to overtime hours. */
  overtimeAmount: number;
  /** Total amount the worker earned for the day (daily rate + overtime). */
  totalAmount: number;
};

function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundHours(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Overtime implied by a plain hours figure: everything beyond the standard day.
 * Used when a record does not carry an explicit overtime entry.
 */
export function deriveOvertimeHours(hoursWorked: number, standardDailyHours: number): number {
  const standardHours = Math.max(standardDailyHours, 0);
  if (!Number.isFinite(hoursWorked) || hoursWorked <= standardHours) {
    return 0;
  }
  return roundHours(hoursWorked - standardHours);
}

/**
 * Hours between two HH:MM clock times on the same work day. A clock-out that
 * reads earlier than clock-in is treated as a night shift crossing midnight.
 * Returns null when either time is missing or unparseable.
 */
export function hoursBetweenClockTimes(
  clockInTime: string | null | undefined,
  clockOutTime: string | null | undefined,
): number | null {
  const toMinutes = (value: string | null | undefined) => {
    if (!value) return null;
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };

  const start = toMinutes(clockInTime);
  const end = toMinutes(clockOutTime);
  if (start === null || end === null) {
    return null;
  }

  const span = end >= start ? end - start : end + 24 * 60 - start;
  return roundHours(span / 60);
}

export function computeAttendanceEarnings(
  input: ComputeAttendanceInput,
): ComputeAttendanceResult {
  const standardHours = Math.max(input.standardDailyHours, 0.01);
  const multiplier = Math.max(input.overtimeMultiplier, 1);
  const dailyRate = Math.max(input.dailyRate, 0);
  // Keep the full-precision rate for the money math and only expose a rounded
  // value for display. Rounding the hourly rate *before* multiplying loses (or
  // gains) cents whenever dailyRate / standardHours isn't exact.
  const exactHourlyRate = dailyRate / standardHours;
  const hourlyRate = roundCents(exactHourlyRate);
  const hoursWorked = Number.isFinite(input.hoursWorked) ? Math.max(input.hoursWorked, 0) : 0;

  if (input.isAbsent) {
    return {
      regularHours: 0,
      overtimeHours: 0,
      hourlyRate,
      regularAmount: 0,
      overtimeAmount: 0,
      totalAmount: 0,
    };
  }

  const overtimeHours =
    input.overtimeHours === null || input.overtimeHours === undefined
      ? deriveOvertimeHours(hoursWorked, standardHours)
      : Math.max(roundHours(input.overtimeHours), 0);

  // The daily rate is fixed: a present worker earns it in full even if the
  // logged hours fall short of a standard day.
  const regularAmount = roundCents(dailyRate);
  const overtimeAmount = roundCents(overtimeHours * exactHourlyRate * multiplier);

  return {
    regularHours: roundHours(Math.min(hoursWorked, standardHours)),
    overtimeHours,
    hourlyRate,
    regularAmount,
    overtimeAmount,
    totalAmount: roundCents(regularAmount + overtimeAmount),
  };
}
