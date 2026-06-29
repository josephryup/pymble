/**
 * Pure attendance earnings calculator.
 *
 * Splits a worker's hours into regular and overtime, pays each band at its
 * own rate. Configurable so a change to the standard day or overtime
 * multiplier in the organization profile flows through automatically.
 *
 * Conventions:
 *  - Daily rate is what the worker is paid for a standard day's work.
 *  - Hourly rate = dailyRate / standardDailyHours.
 *  - Hours up to standardDailyHours pay at the hourly rate.
 *  - Hours above that pay at hourly rate × overtimeMultiplier.
 *  - Absent / zero hours = zero pay, zero overtime.
 */

export type ComputeAttendanceInput = {
  /** Total hours the worker actually worked. */
  hoursWorked: number;
  /** Daily rate in ZMW for a standard day. */
  dailyRate: number;
  /** Standard working hours per day (typically 8). */
  standardDailyHours: number;
  /** Overtime pay multiplier (typically 1.5). */
  overtimeMultiplier: number;
  /** When true, force everything to zero (absent record). */
  isAbsent?: boolean;
};

export type ComputeAttendanceResult = {
  /** Hours paid at the standard rate. */
  regularHours: number;
  /** Hours paid at the overtime rate. */
  overtimeHours: number;
  /** Hourly rate derived from dailyRate / standardDailyHours. */
  hourlyRate: number;
  /** Pay attributable to regular hours. */
  regularAmount: number;
  /** Pay attributable to overtime hours. */
  overtimeAmount: number;
  /** Total amount the worker earned for the period (regular + overtime). */
  totalAmount: number;
};

function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeAttendanceEarnings(
  input: ComputeAttendanceInput,
): ComputeAttendanceResult {
  const standardHours = Math.max(input.standardDailyHours, 0.01);
  const multiplier = Math.max(input.overtimeMultiplier, 1);
  const dailyRate = Math.max(input.dailyRate, 0);
  // Keep the full-precision rate for the money math and only expose a rounded
  // value for display. Rounding the hourly rate *before* multiplying loses (or
  // gains) cents whenever dailyRate / standardHours isn't exact — e.g.
  // 100 / 3 = 33.33 -> a full 3h day would pay 99.99 instead of 100.
  const exactHourlyRate = dailyRate / standardHours;
  const hourlyRate = roundCents(exactHourlyRate);

  if (input.isAbsent || input.hoursWorked <= 0) {
    return {
      regularHours: 0,
      overtimeHours: 0,
      hourlyRate,
      regularAmount: 0,
      overtimeAmount: 0,
      totalAmount: 0,
    };
  }

  const regularHours = Math.min(input.hoursWorked, standardHours);
  const overtimeHours = Math.max(input.hoursWorked - standardHours, 0);
  const regularAmount = roundCents(regularHours * exactHourlyRate);
  const overtimeAmount = roundCents(overtimeHours * exactHourlyRate * multiplier);
  const totalAmount = roundCents(regularAmount + overtimeAmount);

  return {
    regularHours,
    overtimeHours,
    hourlyRate,
    regularAmount,
    overtimeAmount,
    totalAmount,
  };
}
