"use client";

import { useMemo, useState } from "react";
import {
  computeAttendanceEarnings,
  deriveOvertimeHours,
  hoursBetweenClockTimes,
} from "@/lib/ops/attendance-earnings";
import { formatZmw, OPS_INPUT_CLASS, OPS_LABEL_CLASS } from "@/lib/ops/ui";

export type OpsAttendanceEntryWorker = {
  id: string;
  worker_code: string;
  full_name: string;
  daily_rate: number;
};

type Props = {
  workerOptions: OpsAttendanceEntryWorker[];
  standardDailyHours: number;
  overtimeMultiplier: number;
  /** Rendered straight after the worker select so the page keeps its grid order. */
  children?: React.ReactNode;
};

/**
 * Smart half of the attendance capture form.
 *
 * Workers are on a fixed daily rate, so the hours inputs exist to record what
 * happened and to price overtime — not to scale the base pay. Everything here
 * fills itself in:
 *  - hours worked defaults to the clock in → clock out span,
 *  - overtime hours default to whatever sits above the standard day,
 *  - a live preview shows the daily rate plus the overtime it will pay.
 *
 * Either derived value can be typed over; typing pins that field so later
 * clock-time edits stop overwriting it.
 */
export function OpsAttendanceEntryFields({
  children,
  overtimeMultiplier,
  standardDailyHours,
  workerOptions,
}: Props) {
  const [workerId, setWorkerId] = useState("");
  const [presence, setPresence] = useState("present");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [hoursInput, setHoursInput] = useState<string | null>(null);
  const [overtimeInput, setOvertimeInput] = useState<string | null>(null);

  const clockedHours = hoursBetweenClockTimes(clockIn, clockOut);
  const hoursValue = hoursInput ?? (clockedHours === null ? "" : String(clockedHours));
  const hoursWorked = Number(hoursValue) || 0;
  const overtimeValue =
    overtimeInput ?? String(deriveOvertimeHours(hoursWorked, standardDailyHours));
  const dailyRate = workerOptions.find((worker) => worker.id === workerId)?.daily_rate ?? 0;

  const preview = useMemo(
    () =>
      computeAttendanceEarnings({
        hoursWorked,
        overtimeHours: Number(overtimeValue) || 0,
        dailyRate,
        standardDailyHours,
        overtimeMultiplier,
        isAbsent: presence === "absent",
      }),
    [dailyRate, hoursWorked, overtimeMultiplier, overtimeValue, presence, standardDailyHours],
  );

  return (
    <>
      <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
        Worker
        <select
          className={OPS_INPUT_CLASS}
          name="worker_id"
          onChange={(event) => setWorkerId(event.target.value)}
          required
          value={workerId}
        >
          <option value="" disabled>
            Select Pymble worker
          </option>
          {workerOptions.map((worker) => (
            <option key={worker.id} value={worker.id}>
              {worker.worker_code} - {worker.full_name} ({formatZmw(worker.daily_rate)}/day)
            </option>
          ))}
        </select>
      </label>

      {children}

      <label className={OPS_LABEL_CLASS}>
        Presence
        <select
          className={OPS_INPUT_CLASS}
          name="presence"
          onChange={(event) => setPresence(event.target.value)}
          value={presence}
        >
          <option value="present">Present</option>
          <option value="late">Late</option>
          <option value="absent">Absent</option>
        </select>
      </label>
      <label className={OPS_LABEL_CLASS}>
        Clock in
        <input
          className={OPS_INPUT_CLASS}
          name="clock_in_time"
          onChange={(event) => setClockIn(event.target.value)}
          required
          type="time"
          value={clockIn}
        />
      </label>
      <label className={OPS_LABEL_CLASS}>
        Clock out
        <input
          className={OPS_INPUT_CLASS}
          name="clock_out_time"
          onChange={(event) => setClockOut(event.target.value)}
          type="time"
          value={clockOut}
        />
      </label>
      <label className={OPS_LABEL_CLASS}>
        Hours worked
        <input
          className={OPS_INPUT_CLASS}
          max="24"
          min="0"
          name="hours_worked"
          onChange={(event) => setHoursInput(event.target.value)}
          step="0.25"
          type="number"
          value={hoursValue}
        />
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          {hoursInput === null && clockedHours !== null
            ? `Auto from clock times (${clockedHours}h)`
            : "Does not change the daily rate"}
        </span>
      </label>
      <label className={OPS_LABEL_CLASS}>
        Overtime hours
        <input
          className={OPS_INPUT_CLASS}
          max="16"
          min="0"
          name="overtime_hours"
          onChange={(event) => setOvertimeInput(event.target.value)}
          step="0.25"
          type="number"
          value={overtimeValue}
        />
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          {overtimeInput === null
            ? `Auto: hours beyond ${standardDailyHours}h`
            : `Paid at ${overtimeMultiplier}× (${formatZmw(preview.hourlyRate * overtimeMultiplier)}/h)`}
        </span>
      </label>

      <div
        aria-live="polite"
        className="rounded-lg border border-border bg-muted/40 px-4 py-3 min-[520px]:col-span-2 lg:col-span-3"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Will earn
        </p>
        <p className="mt-1 font-heading text-2xl font-bold text-foreground">
          {formatZmw(preview.totalAmount)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {presence === "absent"
            ? "Absent — no daily rate, no overtime."
            : `${formatZmw(preview.regularAmount)} fixed daily rate${
                preview.overtimeHours > 0
                  ? ` + ${formatZmw(preview.overtimeAmount)} for ${preview.overtimeHours}h overtime`
                  : " (no overtime)"
              }`}
        </p>
      </div>
    </>
  );
}
