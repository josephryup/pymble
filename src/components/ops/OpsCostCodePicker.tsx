import {
  costCodeChoiceValue,
  type OpsCostCodeChoice,
} from "@/lib/ops/cost-code-picker";
import { OPS_INPUT_CLASS } from "@/lib/ops/ui";

/**
 * The one cost-code <select> used by every form that files spend or budget.
 *
 * Two groups, deliberately in this order:
 *
 *   "On this project" — codes the project already uses. Usually the right
 *                       answer, and short enough to scan.
 *   "Add from the library" — the rest of the company library, grouped by
 *                       division. Choosing one adds it to the project on save.
 *
 * The second group is why this component exists. Offering only the project's
 * own codes left six of eleven projects with an empty dropdown and no way
 * forward, because a project's work breakdown had to be hand-built on another
 * screen before anything could be coded. Including the library makes the list
 * never-empty and lets the breakdown assemble itself from real use.
 */
export function OpsCostCodePicker({
  choices,
  className,
  helperText,
  label = "Cost code",
  name = "cost_code_id",
  required = false,
  unsetLabel = "Not set",
  value,
}: {
  choices: OpsCostCodeChoice[];
  className?: string;
  helperText?: string;
  label?: string;
  name?: string;
  required?: boolean;
  /** Placeholder for the "no cost code" option. */
  unsetLabel?: string;
  /** The saved cost code id, if any. */
  value?: string | null;
}) {
  const projectChoices = choices.filter((choice) => choice.group === "project");
  const libraryChoices = choices.filter((choice) => choice.group === "library");

  const divisions: string[] = [];
  for (const choice of libraryChoices) {
    const division = choice.division ?? "Other";
    if (!divisions.includes(division)) {
      divisions.push(division);
    }
  }

  return (
    <label className={className ?? "grid gap-1 text-xs font-semibold text-muted-foreground"}>
      {label}
      <select
        className={OPS_INPUT_CLASS}
        defaultValue={costCodeChoiceValue(value)}
        name={name}
        required={required}
      >
        <option disabled={required} value="">
          {unsetLabel}
        </option>
        {projectChoices.length > 0 ? (
          <optgroup label="On this project">
            {projectChoices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.isPhase ? `${choice.label} (whole phase)` : choice.label}
              </option>
            ))}
          </optgroup>
        ) : null}
        {divisions.map((division) => (
          <optgroup key={division} label={`Add from the library — ${division}`}>
            {libraryChoices
              .filter((choice) => (choice.division ?? "Other") === division)
              .map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {helperText ? (
        <span className="mt-1 block text-xs font-medium text-muted-foreground">
          {helperText}
        </span>
      ) : null}
    </label>
  );
}
