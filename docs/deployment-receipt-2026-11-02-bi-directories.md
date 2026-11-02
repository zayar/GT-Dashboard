# BI directories production deployment, 2 November 2026

The user explicitly authorized production deployment with “please deploy”.

## Target and release

- Public URL: https://bi.greattime.app/
- Firebase project: `aesthetics-441d8`; Hosting site: `gtportal1`; channel: `live`.
- Source: this `gt_bi` checkout of `zayar/GT-Dashboard`, baseline `fe61c4c`, with
  the local member/catalog directory fix and empty-history parsing correction.
  Changes were uncommitted at deployment. The user subsequently requested
  committing and pushing the BI fixes to main.
- Final release: `projects/aesthetics-441d8/sites/gtportal1/channels/live/releases/1793619652673000`.
- Final version: `projects/aesthetics-441d8/sites/gtportal1/versions/01386cfa4bf90b5d`.
- Release time: `2026-11-02T11:40:52.673Z` (18:10:52 Myanmar time).
- Serving entrypoint: `/assets/index-CQ2QlIGO.js`; stylesheet:
  `/assets/index-BSuIEBeG.css`. Public HTML was checked after publication.
- Uploaded 13 build files via the Firebase Hosting API using the existing
  Firebase login. Existing cache headers and SPA rewrite were preserved.
- No API, Business app, worker, schema, migration, credential permissions, or
  customer/financial data was modified.

## Validation

The initial published directory build exposed an additional empty-history UI bug:
BigQuery serialized empty array aggregates as the string `"null"`. The customer
page parsed that into null, then attempted array operations. The final release
normalizes empty results to arrays and retains handling for malformed JSON.
Live checking of direct service links also exposed a stale initial error while
the selected clinic loaded. Valid service fetches now clear that error.

- Customer directory visually showed `10,466 loaded`, with pagination covering
  all 10,466 records. A concurrent read-only source count also returned 10,466.
  The earlier investigation count was 10,463; the source gained three records
  before live verification.
- Service directory visually showed `138 services`, including unused services.
  A direct link to an unused catalog service also opened successfully, showing
  zero bookings/customers/value and empty service history.
- An imported member without visits opened successfully after the final release,
  displaying DOB/age, zero lifetime visits and empty history sections.
- The full final Vitest suite passed: 123 tests across 29 files.
- Eight BigQuery SELECT fixture checks passed for directory size, historical
  records, tenant scope, phone suffix collisions, search escaping, payments,
  invoice deduplication and profiles without activity.
- Production build passed. Strict TypeScript validation retains the same 70
  diagnostics as the unchanged baseline, with no new diagnostics.

No personal screenshots or member records are included in this receipt.

## Rollback

The pre-change live version was
`projects/aesthetics-441d8/sites/gtportal1/versions/510cd1d84e5ae587`.
It can be released again to the same live channel if rollback is required.
The first directory-only release was version `72fad5d82b3330f1`; the final release
supersedes it with empty-history rendering and direct service-link corrections.
The intermediate empty-history version was `5f2dffd2a7122cbd`. Existing versions
and release history were retained.
