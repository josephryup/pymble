import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { readdirSync, statSync } from "node:fs";
import { OPS_FORM_GRID_CLASS, OPS_LABEL_CLASS } from "../src/lib/ops/ui";

/**
 * Guard: form layout stays inside the rules set by the 2026-08-10 UI/UX audit.
 *
 * These are source-level assertions because the failures they prevent are
 * invisible in review and in every runtime test — they only show up as a
 * squashed or overflowing form at one particular window width, on one page,
 * which is exactly how the workspace accumulated 93 divergent field grids in
 * the first place.
 */

const ROOTS = [
  join(import.meta.dirname, "..", "src", "app", "ops"),
  join(import.meta.dirname, "..", "src", "components", "ops"),
];

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

const SOURCES = ROOTS.flatMap(tsxFiles).map((path) => ({
  path,
  lines: readFileSync(path, "utf8").split("\n"),
}));

const FORM_TAG = /<(form|fieldset|OpsOfflineForm)\b/;
const DENSE_GRID = /\bgrid-cols-([56])\b/;

/** Every form-like opening tag in the workspace, with the tag's own classes. */
function formOpeningTags() {
  return SOURCES.flatMap(({ path, lines }) => {
    const tags: Array<{ path: string; line: number; text: string }> = [];
    for (let i = 0; i < lines.length; i++) {
      if (!FORM_TAG.test(lines[i])) continue;
      const header: string[] = [];
      for (let j = i; j < lines.length && j < i + 25; j++) {
        header.push(lines[j]);
        if (/\/?>\s*$/.test(lines[j])) break;
      }
      tags.push({ path, line: i + 1, text: header.join("\n") });
    }
    return tags;
  });
}

describe("ops form layout", () => {
  it("actually scanned the workspace", () => {
    // Without this the assertions below pass vacuously if the scan ever breaks.
    assert.ok(SOURCES.length > 50, `only found ${SOURCES.length} ops components`);
    assert.ok(formOpeningTags().length > 50, "found almost no forms — the scan is broken");
  });

  it("keeps min-w-0 on the shared field wrapper", () => {
    // Without this a <select> with long option text widens its own grid track
    // and pushes neighbouring fields out of the section (audit §2a).
    assert.ok(
      OPS_LABEL_CLASS.split(" ").includes("min-w-0"),
      "OPS_LABEL_CLASS must keep min-w-0 — see the comment on it in ui.ts",
    );
  });

  it("keeps the shared form grid free of a fixed column count", () => {
    assert.ok(OPS_FORM_GRID_CLASS.includes("auto-fit"));
    assert.doesNotMatch(OPS_FORM_GRID_CLASS, DENSE_GRID);
  });

  it("caps form grids at four tracks", () => {
    const offenders = formOpeningTags()
      .filter((tag) => DENSE_GRID.test(tag.text))
      .map((tag) => `${tag.path}:${tag.line}`);

    assert.deepEqual(
      offenders,
      [],
      "form grids must not exceed 4 columns — use OpsFormGrid, or grid-cols-4",
    );
  });

  it("leaves no child spanning more tracks than its form has", () => {
    // A `col-span-6` inside a 4-track grid does not clamp — it creates two
    // implicit columns and knocks the rest of the row out of alignment.
    const offenders = SOURCES.flatMap(({ path, lines }) =>
      lines.flatMap((line, index) =>
        /\bcol-span-([56])\b/.test(line) ? [`${path}:${index + 1}`] : [],
      ),
    );

    assert.deepEqual(offenders, [], "col-span-5/6 has no matching track after the 4-column cap");
  });
});
