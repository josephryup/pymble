# Departmental workbooks

Seven Word documents, one per department, generated from **one** content library
so they cannot drift apart.

```bash
node scripts/workbooks/build-dept-workbooks.js docs/workbooks
```

| File | What it is |
|---|---|
| `workbook-content.js` | The module content library — purpose, workflow, how to operate, what happens if you don't, SLAs. Keyed by module id. **Edit here.** |
| `modules.json` | The module → role access matrix, extracted from `src/lib/ops/constants.ts`. Regenerate if `OPS_MODULES` changes. |
| `build-dept-workbooks.js` | Departments, styling, and the generator. |
| `build-workbook.js` | The older single all-staff workbook (`docs/Pymble-Ops-Workbook.docx`). |

## Why generated rather than written

Each department sees 29–47 of the system's 79 modules, and the overlap between
departments is large — Material Requests appears in six of the seven books.
Seven hand-written documents would disagree with each other within a month, and
with the code sooner than that. Access comes from the system's own role matrix,
not from anyone's memory of it.

## Adding or changing a module

1. If the module is new, regenerate `modules.json` from `OPS_MODULES`.
2. Add or edit its entry in `workbook-content.js`.
3. Re-run the build. The generator **throws** if any module a department can
   open has no content entry, so a new module cannot be silently omitted.

## Departments and roles

| Workbook | Roles |
|---|---|
| Procurement | Procurement Manager, Procurement Officer, Procurement Assistant |
| Engineering | Engineering Manager, Engineer, Engineering Intern |
| Projects and Commercial | Projects Manager, Quantity Surveyor |
| Finance | Finance Manager, Accountant, Accountant Intern |
| Operations | Operations Manager, Manager, Supervisor |
| Health, Safety and Environment | HSE Officer, HSE Assistant Officer |
| Human Resource | Human Resource, HR Officer, Admin / Receptionist |

Developer and IT Manager are deliberately excluded — they are not staff-facing
departments and their modules are covered by the IT handbook in the app.
