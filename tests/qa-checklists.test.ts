import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canRecordQaOverride,
  evaluateQaChecklist,
  type QaChecklistEvaluationItem,
  type QaItemResult,
} from "../src/lib/ops/qa-checklist-rules";
import {
  QA_CHECKLIST_TEMPLATES,
  qaChecklistTemplate,
  qaChecklistTemplateOptions,
} from "../src/lib/ops/qa-checklist-templates";

let line = 0;
function item(
  result: QaItemResult,
  overrides: Partial<QaChecklistEvaluationItem> = {},
): QaChecklistEvaluationItem {
  line += 1;
  return {
    id: `item-${line}`,
    lineNumber: overrides.lineNumber ?? line,
    text: "Check something",
    result,
    isHoldPoint: false,
    photoCount: 0,
    ...overrides,
  };
}

describe("evaluateQaChecklist", () => {
  it("allows completion when everything passes", () => {
    const result = evaluateQaChecklist([item("pass"), item("pass")]);

    assert.equal(result.canComplete, true);
    assert.equal(result.blockers.length, 0);
    assert.equal(result.score, 100);
  });

  it("blocks while any item is unanswered", () => {
    const result = evaluateQaChecklist([item("pass"), item("pending", { lineNumber: 7 })]);

    assert.equal(result.canComplete, false);
    assert.equal(result.blockers[0].code, "pending_items");
    assert.deepEqual(result.blockers[0].lineNumbers, [7]);
    assert.equal(result.overridable, false);
  });

  it("blocks a failed item until a photo is attached", () => {
    const withoutPhoto = evaluateQaChecklist([item("fail", { lineNumber: 3 })]);
    assert.equal(withoutPhoto.canComplete, false);
    assert.equal(withoutPhoto.blockers[0].code, "missing_photos");
    assert.deepEqual(withoutPhoto.blockers[0].lineNumbers, [3]);

    const withPhoto = evaluateQaChecklist([item("fail", { photoCount: 1 })]);
    assert.equal(withPhoto.canComplete, true);
  });

  it("does not require photos for passed or N/A items", () => {
    const result = evaluateQaChecklist([item("pass"), item("not_applicable")]);
    assert.equal(result.canComplete, true);
  });

  it("blocks an unmet hold point even with a photo attached", () => {
    const result = evaluateQaChecklist([
      item("fail", { isHoldPoint: true, photoCount: 2, lineNumber: 4 }),
    ]);

    assert.equal(result.canComplete, false);
    assert.equal(result.blockers[0].code, "hold_points");
    assert.deepEqual(result.blockers[0].lineNumbers, [4]);
    assert.equal(result.overridable, true);
  });

  it("treats a hold point skipped as N/A as unmet", () => {
    // Skipping the check is not evidence the covered work is sound.
    const result = evaluateQaChecklist([item("not_applicable", { isHoldPoint: true })]);

    assert.equal(result.canComplete, false);
    assert.equal(result.blockers[0].code, "hold_points");
  });

  it("treats a hold point marked as an observation as unmet", () => {
    const result = evaluateQaChecklist([item("observation", { isHoldPoint: true })]);

    assert.equal(result.canComplete, false);
    assert.equal(result.blockers[0].code, "hold_points");
  });

  it("counts an observation as resolved and needing no photo", () => {
    // An observation is a recorded concern, not a failure, so it does not
    // demand evidence and does not stop a non-hold-point checklist completing.
    const result = evaluateQaChecklist([item("pass"), item("observation")]);

    assert.equal(result.canComplete, true);
    assert.equal(result.observations, 1);
    // Excluded from the score alongside N/A: only pass/fail are scored.
    assert.equal(result.score, 100);
  });

  it("is not overridable while ordinary work is outstanding", () => {
    const result = evaluateQaChecklist([
      item("pending"),
      item("fail", { isHoldPoint: true, photoCount: 1 }),
    ]);

    assert.equal(result.overridable, false);
  });

  it("scores over applicable items, ignoring N/A", () => {
    const result = evaluateQaChecklist([
      item("pass"),
      item("pass"),
      item("fail", { photoCount: 1 }),
      item("not_applicable"),
    ]);

    // 2 of 3 applicable = 67%, the N/A is excluded entirely.
    assert.equal(result.score, 67);
    assert.equal(result.notApplicable, 1);
  });

  it("scores an all-N/A checklist as 100 rather than dividing by zero", () => {
    const result = evaluateQaChecklist([item("not_applicable"), item("not_applicable")]);
    assert.equal(result.score, 100);
  });

  it("handles an empty checklist", () => {
    const result = evaluateQaChecklist([]);
    assert.equal(result.canComplete, true);
    assert.equal(result.score, 100);
  });
});

describe("canRecordQaOverride", () => {
  const base = {
    reason: "Structural engineer inspected on site and approved the pour in writing.",
    isSeniorRole: true,
    actorId: "senior-1",
    inspectorId: "engineer-1",
  };
  const holdPointBlocked = evaluateQaChecklist([
    item("fail", { isHoldPoint: true, photoCount: 1 }),
  ]);

  it("allows a senior second person to release a hold point with a reason", () => {
    const decision = canRecordQaOverride({ ...base, evaluation: holdPointBlocked });
    assert.equal(decision.allowed, true);
  });

  it("refuses when something other than a hold point is outstanding", () => {
    const decision = canRecordQaOverride({
      ...base,
      evaluation: evaluateQaChecklist([item("pending")]),
    });
    assert.equal(decision.allowed, false);
  });

  it("refuses a junior role", () => {
    const decision = canRecordQaOverride({
      ...base,
      evaluation: holdPointBlocked,
      isSeniorRole: false,
    });
    assert.equal(decision.allowed, false);
  });

  it("refuses self-approval by the inspector", () => {
    const decision = canRecordQaOverride({
      ...base,
      evaluation: holdPointBlocked,
      actorId: "engineer-1",
    });
    assert.equal(decision.allowed, false);
  });

  it("refuses a token reason", () => {
    const decision = canRecordQaOverride({
      ...base,
      evaluation: holdPointBlocked,
      reason: "ok",
    });
    assert.equal(decision.allowed, false);
  });

  it("allows an override when there is no inspector recorded", () => {
    const decision = canRecordQaOverride({
      ...base,
      evaluation: holdPointBlocked,
      inspectorId: null,
    });
    assert.equal(decision.allowed, true);
  });
});

describe("QA checklist templates", () => {
  it("covers the seven supplied construction processes", () => {
    assert.equal(QA_CHECKLIST_TEMPLATES.length, 7);
    assert.deepEqual(
      qaChecklistTemplateOptions().map((option) => option.value),
      [
        "setting_out",
        "excavation_footing",
        "reinforcement",
        "concreting",
        "blockwork",
        "steelwork",
        "plastering",
      ],
    );
  });

  it("uses stable keys that are safe for inspection_type", () => {
    // qa_inspections.inspection_type has a ^[a-z][a-z0-9_]*$ check constraint.
    for (const template of QA_CHECKLIST_TEMPLATES) {
      assert.match(template.key, /^[a-z][a-z0-9_]*$/, template.key);
    }
  });

  it("gives every template items and at least one hold point", () => {
    for (const template of QA_CHECKLIST_TEMPLATES) {
      assert.ok(template.items.length > 0, `${template.key} has items`);
      assert.ok(
        template.items.some((entry) => entry.holdPoint),
        `${template.key} has a hold point`,
      );
    }
  });

  it("has no blank or duplicated item text", () => {
    for (const template of QA_CHECKLIST_TEMPLATES) {
      const seen = new Set<string>();
      for (const entry of template.items) {
        assert.ok(entry.text.trim().length > 3, `${template.key} item is not blank`);
        assert.ok(!seen.has(entry.text), `${template.key} item is not duplicated`);
        seen.add(entry.text);
      }
    }
  });

  it("flags only the drafted setting-out template for review", () => {
    const needsReview = QA_CHECKLIST_TEMPLATES.filter((template) => template.needsReview);
    assert.deepEqual(
      needsReview.map((template) => template.key),
      ["setting_out"],
    );
  });

  it("splits the concrete PPE and tools items the source form ran together", () => {
    const concrete = qaChecklistTemplate("concreting");
    assert.ok(concrete);
    // The source had one PPE line and one tools line; a single "yes" hid gaps.
    assert.ok(concrete.items.some((entry) => entry.text.includes("Hard hats")));
    assert.ok(concrete.items.some((entry) => entry.text.includes("Poker vibrator")));
    assert.ok(!concrete.items.some((entry) => entry.text.includes("Rakes Shovels Wheelbarrows")));
  });

  it("returns null for an unknown template key", () => {
    assert.equal(qaChecklistTemplate("nope"), null);
  });
});
