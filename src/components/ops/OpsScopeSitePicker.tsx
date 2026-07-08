"use client";

import { useState } from "react";
import { OPS_INPUT_CLASS, OPS_LABEL_CLASS } from "@/lib/ops/ui";

export type OpsScopeSiteOption = {
  id: string;
  code: string;
  name: string;
};

type OpsScopeSitePickerProps = {
  sites: OpsScopeSiteOption[];
  /** Initial scope (server render). */
  defaultScope?: "site" | "general" | "it";
  /** Initial site selection when scope is 'site'. */
  defaultSiteId?: string | null;
  /**
   * Which scopes this user may pick. The IT manager gets ["it"] only;
   * top leadership can additionally raise confidential IT requests.
   */
  allowedScopes?: Array<"site" | "general" | "it">;
};

/**
 * Scope selector shared by the material-request and requisition create forms.
 *
 * Lets the user choose between a project **Site** requisition, a **General**
 * (office / overhead) one, or a confidential **IT** request (restricted
 * visibility, extra MD approval). The site dropdown is only shown — and only
 * required — when the scope is "site". Emits `scope` and `site_id` form fields.
 */
export function OpsScopeSitePicker({
  sites,
  defaultScope = "site",
  defaultSiteId = null,
  allowedScopes = ["site", "general"],
}: OpsScopeSitePickerProps) {
  const initialScope = allowedScopes.includes(defaultScope) ? defaultScope : allowedScopes[0];
  const [scope, setScope] = useState<"site" | "general" | "it">(initialScope);

  const SCOPE_LABELS: Record<"site" | "general" | "it", string> = {
    site: "Project site",
    general: "General / Office",
    it: "IT (confidential)",
  };

  return (
    <>
      <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
        Requisition type
        <select
          className={OPS_INPUT_CLASS}
          name="scope"
          onChange={(event) => setScope(event.target.value as "site" | "general" | "it")}
          value={scope}
        >
          {allowedScopes.map((value) => (
            <option key={value} value={value}>
              {SCOPE_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      {scope === "site" ? (
        <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
          Site
          <select
            className={OPS_INPUT_CLASS}
            defaultValue={defaultSiteId ?? ""}
            name="site_id"
            required
          >
            <option value="" disabled>
              Select Pymble site
            </option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.code} - {site.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        // Keep an empty site_id in the payload so the server always receives the field.
        <input name="site_id" type="hidden" value="" />
      )}
    </>
  );
}
