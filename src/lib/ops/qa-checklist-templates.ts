/**
 * Company-wide site inspection checklist templates.
 *
 * Digitises the seven CONSTRUCTION PROCESS inspection forms. Templates are
 * fixed in code (not per-site editable) by decision, so every site runs the
 * same checks and a template change is a reviewed code change — the same
 * approach already used for IT runbooks in it-checklists.ts.
 *
 * Fidelity to the source forms
 * ----------------------------
 * Item wording is kept as written wherever it was sound, because these are the
 * company's own standards. Four deliberate departures, all flagged in the
 * checklist audit and each marked `// SOURCE:` below:
 *   1. Concrete's PPE and tools items were single run-on lines; a "yes" on
 *      those hid any one missing item, so they are split into discrete checks.
 *   2. Concrete's "applied directly to concrete" reads as a typo for subgrade.
 *   3. Reinforcement's blank row 11 is dropped.
 *   4. Setting out & surveying was an empty form — its items are DRAFTED here
 *      and need an engineer's review before first use.
 *
 * Hold points
 * -----------
 * `holdPoint: true` marks a check that must pass before the work it guards can
 * proceed — overwhelmingly the "covering work" cases (pour over reinforcement,
 * plaster over services) where a defect becomes expensive or invisible once
 * buried. See qa-checklist-rules.ts for how they are enforced.
 */

export type QaChecklistTemplateItem = {
  /** Wording shown to the engineer, from the source form unless noted. */
  text: string;
  /**
   * Must pass before the guarded work proceeds. Failing or skipping one blocks
   * completion unless a senior role records an override reason.
   */
  holdPoint?: boolean;
  /**
   * Acceptance criterion where the source form left the verdict to judgement.
   * Advisory text shown under the item — not a separate check.
   */
  criterion?: string;
};

export type QaChecklistTemplate = {
  /** Stable key. Written to qa_inspections.inspection_type — do not rename. */
  key: string;
  /** CONSTRUCTION PROCESS as printed on the source form. */
  process: string;
  /** Order the processes typically occur in on site. */
  sequence: number;
  /** True when the item list is drafted rather than taken from a source form. */
  needsReview?: boolean;
  items: QaChecklistTemplateItem[];
};

export const QA_CHECKLIST_TEMPLATES: QaChecklistTemplate[] = [
  {
    key: "setting_out",
    process: "Setting out and surveying",
    sequence: 1,
    // SOURCE: the supplied form contained no items — drafted for review.
    needsReview: true,
    items: [
      { text: "Approved setting-out drawing and coordinate schedule available on site" },
      { text: "Site benchmark / datum identified, protected and recorded" },
      { text: "Instrument calibration certificate valid and in date" },
      {
        text: "Baseline and reference pegs established and protected against disturbance",
        holdPoint: true,
      },
      { text: "Building grid lines set out and checked against the drawing" },
      { text: "Overall dimensions and diagonals verified square", criterion: "Diagonals equal within the project survey tolerance" },
      { text: "Existing services and boundaries located and marked before any excavation", holdPoint: true },
      { text: "Levels transferred and recorded against the site datum" },
      { text: "Profile boards fixed square, level and clearly marked" },
      { text: "Setting-out independently checked by a second person and recorded", holdPoint: true },
      { text: "As-set-out record kept and filed with the survey data" },
    ],
  },
  {
    key: "excavation_footing",
    process: "Excavation and footing",
    sequence: 2,
    items: [
      { text: "Surface encumbrances such as trees, existing sidewalks, foundations etc. removed or supported" },
      { text: "Employees in PPE and protected from loose rock or soil that could pose hazard by falling or rolling" },
      { text: "Barriers provided at all remotely located excavations" },
      { text: "Inspection of existing water lines or electric cables", holdPoint: true },
      { text: "Excavation carried out as per setting out boundary and height as per specs" },
      { text: "Check blinding surface is well compacted, has right levels and compaction is up to desired density", holdPoint: true },
      { text: "Check termite control application well applied as per instruction" },
      { text: "Footing size and location as per specs", holdPoint: true },
      { text: "Check that concrete is fresh, well vibrated and is of recommended strength" },
      { text: "Ensure blinding is cured and attains correct strength" },
    ],
  },
  {
    key: "reinforcement",
    process: "Reinforcement",
    sequence: 3,
    items: [
      // SOURCE: blank row 11 on the form is omitted.
      { text: "Reinforcement steel placed as per structural drawing", holdPoint: true },
      { text: "Rebar free from cracks and injury defects" },
      { text: "Placing of bar diameter, number, spacing match with the construction schedule", holdPoint: true },
      { text: "Check rebars are straight" },
      { text: "Check hooks and bends are placed as specified by structural designer" },
      { text: "Check the clear cover", holdPoint: true, criterion: "As specified on the structural drawing for the exposure class" },
      { text: "Check that spacer blocks are available and enough" },
      { text: "Check the rebars are rust free." },
      { text: "Check minimum 50mm clear distance is maintained between two bars", criterion: "Minimum 50mm between bars" },
      { text: "Check the rods are tied properly with binding wire" },
    ],
  },
  {
    key: "concreting",
    process: "Concreting",
    sequence: 4,
    items: [
      { text: "Check concrete mix and grade are as per specs and if admixture is to be used", holdPoint: true },
      // SOURCE: the form listed all PPE on one line; split so one missing item cannot pass.
      { text: "Hard hats available and in good condition" },
      { text: "Gum boots available and in good condition" },
      { text: "Gloves available and in good condition" },
      { text: "Work suits available and in good condition" },
      // SOURCE: the form listed all tools on one line; split for the same reason.
      { text: "Rakes, shovels and wheelbarrows available and serviceable" },
      { text: "Poker vibrator available and in working condition", holdPoint: true },
      { text: "Fuel for equipment available, if applicable" },
      { text: "Electricity source available, if applicable" },
      { text: "Power float available, if applicable" },
      { text: "Straight edge available" },
      { text: "Check if site plan is available" },
      { text: "Check that hardcore surface is well prepared and compacted to desired density", holdPoint: true },
      { text: "Check that termite control application is as per instruction" },
      { text: "Check that formwork is plumb, free from dust particles and well supported", holdPoint: true },
      { text: "Check that levels and pegging are consistent and as per given specs" },
      { text: "Check that damp proofing membrane is well fixed and is of recommended type", holdPoint: true },
      {
        text: "If using ready mix concrete, ensure trucks do not wait for more than an hour from batching time. However, if additive is added waiting time should be specified from supplier",
        criterion: "Maximum 1 hour from batching unless the supplier specifies otherwise",
      },
      { text: "Check that test cube samples are collected and tested", holdPoint: true },
      // SOURCE: form read "applied directly to concrete" — reads as a typo for subgrade.
      { text: "Check that subgrade is moist if concrete is being placed directly onto it, to prevent extraction of water from the concrete" },
      { text: "Check that concrete is thoroughly compacted using a vibrator until a form of 2 circles is shown around the vibrator" },
      { text: "Check that concrete is kept damp after setting for not less than 7 days", criterion: "Minimum 7 days curing" },
    ],
  },
  {
    key: "blockwork",
    process: "Blockwork",
    sequence: 5,
    items: [
      { text: "Check that surface is clean and free from foreign particles" },
      { text: "Check that blocks to be used are as per specification", holdPoint: true },
      { text: "Check mortar ratio to be used", holdPoint: true, criterion: "As specified for the wall type" },
      { text: "Check that maximum height of blockwork per day is not more than 1.2m", criterion: "Maximum 1.2m per day" },
      { text: "Check that brickforce is fixed as per specs" },
      { text: "Check that setting out and alignment of blockwork is as per drawing", holdPoint: true },
      { text: "Dimensions and diagonals of room are checked" },
      { text: "Location and dimension of doors and openings are marked" },
      { text: "Blockwork should be in proper alignment and plumb with specified bond." },
      { text: "Check if the first course is aligned, level and diagonal to the room size", holdPoint: true },
      { text: "All courses in plumb, line and level" },
      { text: "Mortar mix is uniform and of optimum workability" },
    ],
  },
  {
    key: "steelwork",
    process: "Steelwork",
    sequence: 6,
    items: [
      { text: "Check if steel is free from defects and visually acceptable e.g. warping, twisting, damaged section" },
      { text: "Check if fabricator is qualified and has necessary welding facilities", holdPoint: true },
      { text: "Check if steel specifications and markings are provided" },
      { text: "Check grade of steel and type are as per specs", holdPoint: true },
      { text: "Check if steel markings, cuttings and dimensions are as per specs" },
      { text: "Check if weld surfaces are clean and free from dust particles" },
      { text: "All bolt positions and drilling sizes as per drawing" },
      { text: "Check if concrete foundations release for steel erection are well set and correct", holdPoint: true },
      { text: "Check if lifting and erection of steel, if applicable, is practiced in a safe manner" },
      { text: "Check that steel is straight or at the right elevation" },
    ],
  },
  {
    key: "plastering",
    process: "Plastering",
    sequence: 7,
    items: [
      { text: "Ensure that masonry works are completed in areas to be plastered" },
      { text: "Doors and window frames to be fixed as required" },
      {
        text: "All service lines such as electricals and plumbing facilities to be cut, laid and approved before plaster works",
        holdPoint: true,
      },
      { text: "Fixing of wire meshes protruding at interfaces" },
      { text: "Removal and cleaning of old mortar flakes" },
      { text: "Moisturizing of masonry units to avoid extraction of water from plaster" },
      { text: "Check that plaster is line, level and vertical" },
      { text: "Check that the surface finish is as per specification" },
      { text: "Check that adjacent surfaces are cleaned from splashing" },
      { text: "Making of grooves as specified if any" },
      { text: "Check that plaster is cured" },
    ],
  },
];

export const QA_CHECKLIST_TEMPLATE_BY_KEY = new Map(
  QA_CHECKLIST_TEMPLATES.map((template) => [template.key, template]),
);

export function qaChecklistTemplate(key: string) {
  return QA_CHECKLIST_TEMPLATE_BY_KEY.get(key) ?? null;
}

/** Options for the "start a checklist" picker, in construction sequence. */
export function qaChecklistTemplateOptions() {
  return [...QA_CHECKLIST_TEMPLATES]
    .sort((a, b) => a.sequence - b.sequence)
    .map((template) => ({
      value: template.key,
      label: template.process,
      itemCount: template.items.length,
      holdPointCount: template.items.filter((item) => item.holdPoint).length,
      needsReview: Boolean(template.needsReview),
    }));
}
