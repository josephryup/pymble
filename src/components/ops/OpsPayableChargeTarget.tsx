"use client";

import { Building2, FolderClock, Landmark } from "lucide-react";
import { useId, useState } from "react";
import { OPS_INPUT_CLASS, OPS_LABEL_CLASS } from "@/lib/ops/ui";

type Option = { id: string; label: string };
type LegacyOption = Option & { cost_treatment: "opening_balance" | "current_period" };

/**
 * Choosing what a payable is charged to.
 *
 * The three targets are mutually exclusive — the database enforces that with a
 * CHECK constraint — so this deliberately renders ONE selector at a time rather
 * than three that must be left blank correctly. A form that lets you fill in
 * two and then rejects you is a form that taught you nothing.
 *
 * Unselected inputs are unmounted rather than hidden, so the browser never
 * posts a stale site id alongside a legacy project id.
 */
export function OpsPayableChargeTarget({
  costCentreOptions,
  defaultChargeTarget = "site",
  defaultCostCentreId = "",
  defaultCostTreatment = "",
  defaultLegacyProjectId = "",
  defaultSiteId = "",
  legacyProjectOptions,
  siteOptions,
}: {
  costCentreOptions: Option[];
  defaultChargeTarget?: string;
  defaultCostCentreId?: string;
  defaultCostTreatment?: string;
  defaultLegacyProjectId?: string;
  defaultSiteId?: string;
  legacyProjectOptions: LegacyOption[];
  siteOptions: { code: string; id: string; name: string }[];
}) {
  const groupId = useId();
  const [target, setTarget] = useState(defaultChargeTarget);
  const [legacyProjectId, setLegacyProjectId] = useState(defaultLegacyProjectId);
  const [treatment, setTreatment] = useState(defaultCostTreatment || "current_period");

  const choices = [
    {
      description: "Work on a live project in the sites register.",
      disabled: siteOptions.length === 0,
      icon: Building2,
      label: "Site",
      value: "site",
    },
    {
      description: "A project that finished before this system.",
      disabled: legacyProjectOptions.length === 0,
      icon: FolderClock,
      label: "Completed project",
      value: "legacy_project",
    },
    {
      description: "Company cost with no project — rent, insurance, fees.",
      disabled: costCentreOptions.length === 0,
      icon: Landmark,
      label: "Overhead",
      value: "overhead",
    },
  ];

  return (
    <div className="lg:col-span-2">
      <fieldset>
        <legend className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          What is this charged to?
        </legend>

        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {choices.map((choice) => {
            const Icon = choice.icon;
            const active = target === choice.value;

            return (
              <label
                className={`flex cursor-pointer gap-3 rounded-md border p-3 transition ${
                  active
                    ? "border-primary-blue bg-primary/5"
                    : "border-border hover:border-primary-blue/40"
                } ${choice.disabled ? "cursor-not-allowed opacity-50" : ""}`}
                key={choice.value}
              >
                <input
                  checked={active}
                  className="mt-1 size-4 shrink-0 accent-[var(--primary-blue,#1d4ed8)]"
                  disabled={choice.disabled}
                  name={`${groupId}-charge-target-radio`}
                  onChange={() => setTarget(choice.value)}
                  type="radio"
                  value={choice.value}
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {choice.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {choice.disabled ? "None available yet." : choice.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {/* The value the action actually reads. Kept separate from the radios so
            the radio group name can be unique per instance (create and edit
            forms coexist on the page). */}
        <input name="charge_target" type="hidden" value={target} />
      </fieldset>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        {target === "site" ? (
          <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
            Site
            <select
              className={OPS_INPUT_CLASS}
              defaultValue={defaultSiteId}
              name="site_id"
              required
            >
              <option disabled value="">
                Select site
              </option>
              {siteOptions.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.code} - {site.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {target === "legacy_project" ? (
          <>
            <label className={OPS_LABEL_CLASS}>
              Completed project
              <select
                className={OPS_INPUT_CLASS}
                name="legacy_project_id"
                onChange={(event) => {
                  const next = event.target.value;
                  setLegacyProjectId(next);
                  // Inherit the project's treatment. It was decided once, when
                  // the project was registered, by someone who knew whether
                  // those costs were in the closed accounts.
                  const match = legacyProjectOptions.find((option) => option.id === next);
                  if (match) setTreatment(match.cost_treatment);
                }}
                required
                value={legacyProjectId}
              >
                <option disabled value="">
                  Select completed project
                </option>
                {legacyProjectOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={OPS_LABEL_CLASS}>
              Cost treatment
              <select
                className={OPS_INPUT_CLASS}
                name="cost_treatment"
                onChange={(event) => setTreatment(event.target.value)}
                required
                value={treatment}
              >
                <option value="current_period">
                  Recognise the cost now — it was never booked
                </option>
                <option value="opening_balance">
                  Already booked in closed accounts — liability only
                </option>
              </select>
              <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
                {treatment === "opening_balance"
                  ? "Only use this if the cost was already expensed in accounts you have closed. Posts against retained earnings, so this year's profit does not move."
                  : "The cost has never been recognised, so it is recognised now. Posts as a normal cost and will reduce this year's profit."}
              </span>
            </label>

            <p className="lg:col-span-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
              A completed project has no live budget, so this payable cannot use a budget
              line.
            </p>
          </>
        ) : null}

        {target === "overhead" ? (
          <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
            Cost centre
            <select
              className={OPS_INPUT_CLASS}
              defaultValue={defaultCostCentreId}
              name="cost_centre_id"
              required
            >
              <option disabled value="">
                Select cost centre
              </option>
              {costCentreOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );
}
