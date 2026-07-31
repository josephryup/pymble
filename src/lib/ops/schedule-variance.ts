/**
 * Programme baselines and schedule variance (audit D11).
 *
 * `project_tasks.planned_start_date` / `planned_end_date` are mutable. Without
 * a frozen baseline the plan silently becomes whatever it is today, so
 * slippage is unmeasurable and "are we late?" has no answer — the plan always
 * agrees with reality by construction.
 *
 * Baselining freezes the approved dates once. Everything here is pure so the
 * variance arithmetic is testable without a database, matching the rest of the
 * spine work.
 */

export type TaskForVariance = {
  id: string;
  title: string;
  baselineStartDate: string | null;
  baselineEndDate: string | null;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate: string | null;
  actualEndDate: string | null;
  completionPercent: number;
};

export type TaskVariance = {
  taskId: string;
  title: string;
  /** Days the planned finish has moved since baseline. Positive = later. */
  plannedSlipDays: number | null;
  /** Days the actual finish beat or missed the baseline. Positive = late. */
  actualSlipDays: number | null;
  /** Days late against the baseline right now, for work still running. */
  forecastSlipDays: number | null;
  isBaselined: boolean;
  isComplete: boolean;
  isSlipping: boolean;
  /** Started but past its baseline finish with work outstanding. */
  isOverdue: boolean;
};

export type ProgrammeVariance = {
  tasks: TaskVariance[];
  baselinedCount: number;
  unbaselinedCount: number;
  slippingCount: number;
  overdueCount: number;
  /** Worst slip in the programme — the number that matters to a PM. */
  worstSlipDays: number;
  /** Simple completion, weighted by task count. */
  completionPercent: number;
};

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Variance for one task.
 *
 * Three different slips, deliberately not collapsed into one:
 *   • plannedSlip  — the plan has been moved. Re-planning, not yet lateness.
 *   • actualSlip   — the task finished late. History.
 *   • forecastSlip — it is running and already past baseline. The live risk.
 *
 * Collapsing them would hide the most useful signal: a programme where nothing
 * has finished late but everything has been re-planned forward is in trouble,
 * and only plannedSlip shows it.
 */
export function computeTaskVariance(
  task: TaskForVariance,
  now: Date = new Date(),
): TaskVariance {
  const baselineEnd = parseDate(task.baselineEndDate);
  const plannedEnd = parseDate(task.plannedEndDate);
  const actualEnd = parseDate(task.actualEndDate);
  const isComplete = task.completionPercent >= 100 || actualEnd !== null;
  const isBaselined = baselineEnd !== null;

  const plannedSlipDays =
    baselineEnd && plannedEnd ? daysBetween(baselineEnd, plannedEnd) : null;
  const actualSlipDays =
    baselineEnd && actualEnd ? daysBetween(baselineEnd, actualEnd) : null;
  const forecastSlipDays =
    baselineEnd && !isComplete && now > baselineEnd ? daysBetween(baselineEnd, now) : null;

  return {
    taskId: task.id,
    title: task.title,
    plannedSlipDays,
    actualSlipDays,
    forecastSlipDays,
    isBaselined,
    isComplete,
    isSlipping: (plannedSlipDays ?? 0) > 0 || (forecastSlipDays ?? 0) > 0,
    isOverdue: !isComplete && (forecastSlipDays ?? 0) > 0,
  };
}

export function computeProgrammeVariance(
  tasks: TaskForVariance[],
  now: Date = new Date(),
): ProgrammeVariance {
  const variances = tasks.map((task) => computeTaskVariance(task, now));

  const worstSlipDays = variances.reduce((worst, task) => {
    const slip = Math.max(
      task.plannedSlipDays ?? 0,
      task.actualSlipDays ?? 0,
      task.forecastSlipDays ?? 0,
    );
    return Math.max(worst, slip);
  }, 0);

  const completionPercent =
    tasks.length === 0
      ? 0
      : Math.round(
          tasks.reduce((sum, task) => sum + Math.min(task.completionPercent, 100), 0) /
            tasks.length,
        );

  return {
    tasks: variances.sort(
      (a, b) =>
        Math.max(b.forecastSlipDays ?? 0, b.plannedSlipDays ?? 0) -
        Math.max(a.forecastSlipDays ?? 0, a.plannedSlipDays ?? 0),
    ),
    baselinedCount: variances.filter((task) => task.isBaselined).length,
    unbaselinedCount: variances.filter((task) => !task.isBaselined).length,
    slippingCount: variances.filter((task) => task.isSlipping).length,
    overdueCount: variances.filter((task) => task.isOverdue).length,
    worstSlipDays,
    completionPercent,
  };
}
