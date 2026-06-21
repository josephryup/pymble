# Zambian tax + payroll compliance

Pymble Operations is registered in Zambia. Three external regimes govern the numbers we generate: **Zambia Revenue Authority (ZRA)** for income tax and Value Added Tax, **NAPSA** for pensions, and the **Workers' Compensation Fund Control Board (WCFCB)** for occupational injury cover. This doc explains how each is wired into the codebase and what the team must do annually to keep it correct.

## 1. Where the rates live

All statutory rates are in one file:

[src/lib/ops/statutory/rates.ts](../src/lib/ops/statutory/rates.ts)

Each tax year is its own entry in `ZAMBIAN_TAX_YEARS`. The active year is exported as `CURRENT_TAX_YEAR`. Historical payroll runs reproduce identically because [payroll-actions.ts](../src/lib/ops/payroll-actions.ts) records the `tax_year` on each `payroll_run_items` row.

### Annual update procedure (every January)

1. ZRA publishes the new budget in late December / early January. Pull the new PAYE bands.
2. Add a new entry to `ZAMBIAN_TAX_YEARS` keyed by the calendar year (don't edit the old one).
3. If NAPSA ceilings or WCF construction-sector rates change, update them in the new entry.
4. Run `npm test -- tests/statutory-calculator.test.ts` to confirm the calculator still passes its baseline assertions.
5. Optionally add a year-specific test case to lock the new bands in place.
6. Update `CURRENT_TAX_YEAR` only after the new rates are confirmed in writing (ZRA Practice Note or Statutory Instrument).
7. Smoke test: run a draft payroll for one worker and verify the deductions match a manual ZRA calculator.
8. Open a PR + get sign-off from the Finance Manager or external accountant before merging.

If a tax year isn't present when payroll runs, the calculator falls back to the most recent known year and flags it in the `statutory_citation` written onto each row — so a missed update is visible, not silent.

## 2. PAYE (income tax)

Implemented as marginal bands in `computePaye` ([statutory/calculator.ts](../src/lib/ops/statutory/calculator.ts)). Each Kwacha of gross monthly pay falls into one band and is taxed at that band's rate.

Default 2024 / 2025 bands (verify with ZRA before each tax year):
- 0 – 5,100: 0%
- 5,100 – 7,100: 20%
- 7,100 – 9,200: 30%
- 9,200+: 37.5%

Test coverage: [tests/statutory-calculator.test.ts](../tests/statutory-calculator.test.ts) — 4 PAYE assertions covering each band crossing.

## 3. NAPSA (pension)

- Employee: 5% of gross, capped at the monthly contribution ceiling (K1,377.30 in 2024)
- Employer: 5% of gross, same ceiling
- Both stored on the payroll row (`napsa_employee`, `napsa_employer`)
- The employee side reduces the worker's net; the employer side does not

## 4. Workers' Compensation Fund

- Employer-only contribution, rate depends on industry sector
- Construction default in the config is 2%
- If WCFCB reassesses Pymble into a different rate, change `wcfEmployerRate` in the active tax-year entry

## 5. Value Added Tax (invoice side)

- Standard rate 16% (`vatRate` in the rates file; can be moved year-to-year if ZRA changes the headline rate)
- Tax invoice numbering: monotonic per (prefix, year) via the `public.ops_next_invoice_number(prefix)` function (Sprint 9, migration `20260626090000_pymble_ops_invoice_sequence.sql`)
- Invoice PDF template includes all ZRA-required fields: supplier legal name + TPIN + VAT registration number; buyer name + TPIN; invoice number; date; line items; VAT amount broken out; total. See [InvoicePdf.tsx](../src/lib/ops/pdf/InvoicePdf.tsx).

### Verify before each year-end

- Run the SQL probe: `select count(*) as gaps from generate_series(1, max_seq) g where g not in (select seq from invoices where year = current);` to confirm no gaps in the year's sequence
- Spot-check a recent invoice PDF against ZRA's Tax Invoice Requirements guide
- Confirm the organisation profile still has the correct TPIN and bank details

## 6. Payslip

Per worker per payroll run. Includes:
- Worker identity + trade + mobile money number
- Earnings (gross from approved attendance)
- Employee deductions (PAYE, NAPSA, cash advances)
- Net pay (the worker takes home)
- Employer contributions (NAPSA employer side, WCF) shown for transparency
- Total employment cost (gross + employer contributions)
- Statutory citation footer naming the rule set applied

Template: [PayslipPdf.tsx](../src/lib/ops/pdf/PayslipPdf.tsx)
Download: `GET /api/ops/pdf/payslip/[itemId]` — gated to Finance, Human Resources, Leadership. Every download writes a `payslip.pdf_downloaded` audit event.

## 7. Reporting cadence

| Filing | Due | Source |
|-|-|-|
| PAYE (monthly) | 10th of following month | sum of `paye_amount` on payroll_run_items for the period |
| NAPSA (monthly) | 10th of following month | sum of `napsa_employee + napsa_employer` |
| WCF (annual) | ZRA WCF return | sum of `wcf_employer` for the year |
| VAT (monthly / quarterly per registration) | per ZRA | sum of `vat_amount` on invoices.issued_at in period |

A future sprint should add ZRA-export CSV endpoints for each of these. For now the data is queryable directly from the tables.

## 8. Sign-off

Before payroll goes live with real worker funds, the Finance Manager (or an external accountant) must:
- Confirm PAYE bands match the current ZRA Practice Note
- Confirm NAPSA contribution rate + monthly ceiling
- Confirm WCF construction-sector rate for the year
- Sign off on a test payslip vs a manual calculation, in writing

Keep the sign-off doc with the year's payroll records.
