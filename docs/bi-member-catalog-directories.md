# BI customer and service directories

## Investigation, 2 November 2026

Read-only checks of the BI reporting source found 10,463 `gtdermaluxe`
`clinic_members` records and 138 catalog services in `ServicesView`. Only two
members and two services appeared in `MainDataView` treatment activity.
The Customers and Services pages used activity as their starting dataset and
limited the final result to 100 rows. Registered records without activity were
therefore omitted even though the import was already present in the reporting
source. This was not an import failure.

## Resulting behavior

`frontend/src/utils/directoryQueries.ts` supplies the queries for both directories
and their profile pages:

- Customers start with the selected clinic's member profiles. Activity-only and
  invoice-only historical customers remain available. Branch profile names and
  metadata take priority, with global member metadata used per missing field.
- Exact phone joins are made within the selected clinic. Phone suffixes do not
  merge separate identities. Existing invoice deduplication and PASS/split payment
  calculations remain in place. Names are presentation fields, not join keys.
- Services include the selected clinic's complete catalog, including unused and
  inactive services, plus historical services still present in activity. The
  existing name-based route and one-row-per-name grouping are retained. Current
  catalog price, duration and description take priority over historical values.
- Both profile pages can open records with no visits. Missing history yields zero
  activity and empty history sections. Imported records do not fabricate visits,
  sales, package balances, or historical invoices.
- The 100-row directory limit is removed. Existing client pagination, sorting,
  search, and customer CSV export work over the returned dataset. Request sequence
  guards prevent a delayed directory response replacing a newer clinic/search.

No GT+ API or Business app contract, database schema, migration, import, or stored
customer/financial record is changed. Other activity-based reports still describe
recorded activity. Large directories use the existing full-result/client-pagination
approach; server pagination would be a separate scaling change.

## Validation

- Read-only production queries returned 10,463 distinct Dermaluxe customer phones
  (10,461 without visits), all 138 catalog services (136 unused), and valid profiles
  for an unvisited member and an unused service.
- `cd frontend && npm test`: 120 tests across 28 files passed. Focused component
  tests and the production build were repeated after the final source changes.
- `cd frontend && npm run build`: passed. Existing bundle-size, Tailwind and
  Browserslist warnings remain.
- Eight literal-CTE BigQuery regression queries passed: >100 imported members,
  historical activity/invoice-only records, exact phone collisions, tenant scope,
  branch metadata, search escaping, unique visits, partial/split/PASS payments,
  invoice deduplication, >100 catalog services, and empty-history profiles.
- The strict TypeScript check reports the same 70 diagnostics as an isolated
  `HEAD` source baseline; none are added by this change and none concern the
  changed components or query helper.
- Local preview was blocked by runtime restrictions. Authorized production
  verification confirmed the live customer and service directories. It also
  exposed JSON `null` history aggregates for imported members; the final release
  normalizes these to empty arrays, with three focused regression tests.
  See the deployment receipt for final live verification.

To rerun the SQL regression fixtures, first confirm the intended BI query service,
then run from `frontend`:

```sh
BI_READ_ONLY_QUERY_URL=https://CONFIRMED-BI-SERVICE/query node scripts/check-directory-queries.mjs
```

The script requires an explicit endpoint and sends SELECT statements with literal
fixtures only. It creates no tables and does not modify data.

## Release state

Deployed with explicit user authorization on 2 November 2026. Source was uncommitted at deployment; the user subsequently requested the
commit and push of both BI fixes to main. Production hosting is Firebase project
`aesthetics-441d8`, configured site `gtportal1`. See the
[deployment receipt](deployment-receipt-2026-11-02-bi-directories.md).
