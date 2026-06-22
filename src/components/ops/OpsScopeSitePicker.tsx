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
  defaultScope?: "site" | "general";
  /** Initial site selection when scope is 'site'. */
  defaultSiteId?: string | null;
};

/**
 * Scope selector shared by the material-request and requisition create forms.
 *
 * Lets the user choose between a project **Site** requisition and a **General**
 * (office / overhead) one. The site dropdown is only shown — and only required —
 * when the scope is "site". Emits `scope` and `site_id` form fields.
 */
export function OpsScopeSitePicker({
  sites,
  defaultScope = "site",
  defaultSiteId = null,
}: OpsScopeSitePickerProps) {
  const [scope, setScope] = useState<"site" | "general">(defaultScope);

  return (
    <>
      <label className={`${OPS_LABEL_CLASS} lg:col-span-2`}>
        Requisition type
        <select
          className={OPS_INPUT_CLASS}
          name="scope"
          onChange={(event) => setScope(event.target.value as "site" | "general")}
          value={scope}
        >
          <option value="site">Project site</option>
          <option value="general">General / Office</option>
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
