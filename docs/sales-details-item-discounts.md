# Sales Details: item discounts and assigned member IDs

Tester feedback on 2 November 2026 requested an item discount column in Sales →
Sales Details and Excel, and blank Member ID cells when no member code is assigned.

## Implementation

- The new `Item Discount` column follows `Item Price` in the detailed table and
  XLSX export. It displays the saved `order_items.metadata.discount` amount for
  the entire line; quantity is already included in that saved amount.
- The existing `Discount` field remains the invoice discount. Item totals, invoice
  totals, payments and stored values are not recalculated. Missing item discounts
  display numeric zero; payment-only rows without an item remain blank.
- Summary view sums the displayed item discounts once per invoice. Extra payment
  rows do not add discounts. Detailed view retains each line's own amount.
- Sales Details uses the selected clinic's assigned `ClinicMember.member_id`, then
  an assigned `Member.member_id`. Both missing/blank yields an empty Member ID.
  It no longer falls back to the internal `Order.member_id` foreign key. Other
  report mappers retain their existing ID behavior.
- The CheckIn/Out report and Sales Details share the existing saved-discount
  semantics through `readOrderItemDiscount`. Manual price differences and markup
  are not inferred as discounts.
- Table/summary and export row preparation were extracted from the component so
  the production UI and XLSX workbook use the same tested transformations.

Existing tenant/date filters, API requests, payment filters and zero-value filters
are preserved. No backend contract, migration or stored data changes are needed.

## Validation

42 focused tests passed across sales/payment mappings, check-in/out mappings,
Sales Details table/XLSX, canonical sales metrics and salesperson summaries.
Coverage includes quantities greater than one, invalid/absent metadata, invoice
versus item discounts, split payments, payment-only rows, assigned/blank IDs,
summary aggregation and reading the generated XLSX workbook back into rows.
The build and diff checks passed. Strict TypeScript checking retains the same 70
baseline diagnostics; no new diagnostic messages were introduced.

A bounded read-only source check of GTPITI invoice `CO-3667453` found a saved
5,000 item discount on the 45,000 → 40,000 line, invoice discount zero, and no
assigned member code in either profile field. The live table after deployment
showed the 5,000 item discount and blank Member ID on both lines. The actual
browser-downloaded XLSX was inspected separately and matched the same values;
the existing assigned member ID `at3` was retained. The export download completed
even though browser download-event observation timed out; the newly written file
was identified by its exact filename and modification timestamp.

## Deployment

Published to the BI portal under the user's existing explicit deployment approval
for this portal. The production target remained Firebase project
`aesthetics-441d8`, site `gtportal1`, live channel. Hosting headers and SPA rewrite
were preserved.

- Release: `projects/aesthetics-441d8/sites/gtportal1/channels/live/releases/1793630358994000`
- Version: `projects/aesthetics-441d8/sites/gtportal1/versions/8be267985f0045c7`
- Time: `2026-11-02T14:39:18.994Z` (21:09:18 Myanmar time)
- JavaScript asset: `/assets/index-CnX-Ozhm.js`
- Rollback version: `projects/aesthetics-441d8/sites/gtportal1/versions/01386cfa4bf90b5d`

Public HTML was checked after CDN propagation and referenced the expected build.
Source was uncommitted at deployment. The user subsequently requested
committing and pushing the directory and Sales Details fixes to main.
No personal screenshots or exported customer records are stored in this repository.
