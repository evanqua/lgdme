# CLAUDE.md

Guidance for Claude Code (or any agent) working in this repository.

## What this is

A Google Apps Script Web App that matches donors and requesters of large
durable medical equipment (hospital beds, wheelchairs, stair lifts, and
similar items), notifies both sides by email when a match is found, and lets
either side manage their listing through a tokenized self-service portal. No
build step, no external dependencies. Everything runs inside the Apps
Script sandbox (V8 runtime) and is deployed with `clasp`.

This is a template repo. Everything about it (item categories, service-area
cities, org name/contact email, consent/waiver text, receipt wording) ships
as either a generic default or an obvious placeholder, meant to be
reconfigured per adopting organization. See `SETUP.md` for the clone-to-live
walkthrough and `README.md` for versioning conventions.

## Architecture

One system, one Spreadsheet, three sheets it owns (`Submissions`, `MatchLog`,
`AuditFlags`) via `Schema.js`. All routing goes through a single Web App
deployment (`WebApp.js`'s `doGet`); there is no separate legacy form or
parallel intake path.

| File | Responsibility |
|---|---|
| `WebApp.js` | `doGet` router; renders each view; `submitIntake`/`submitIntakeInternal` (intake form submission handling, validation, photo upload). |
| `Schema.js` | `Submissions`/`MatchLog`/`AuditFlags` sheet schemas, `colIndex()`/`matchLogColIndex()`/`auditFlagsColIndex()` column lookups, `setOptOutStatus()`. |
| `ItemConfig.js` | `ITEM_FIELD_DEFS`: per-category donate/receive field definitions, paired **by array position** with `SiteConfig.js`'s `ITEM_CATEGORIES`. `getItemConfig()` builds the combined `{categoryName: fieldDefs}` map and throws if the two arrays are out of sync. |
| `SiteConfig.js` | `ITEM_CATEGORIES` and `SERVICE_AREA_CITIES`: the two adopter-editable content lists every other file reads from rather than keeping its own copy. |
| `Matching.js` | Match-finding (`findActiveMatches`), notification emails (`sendSubmitterEmail`, `sendMatchAlertEmail`), `MatchLog` writes. |
| `PortalServer.js` | Token-based self-service portal backend (`Portal.html`): report match outcome, report no-match, confirm receipt, renew listing, feedback. |
| `OptOutServer.js` | Token-less opt-out backend (`OptOut.html`, `?view=optout`) for someone without a handy notification email. Looks a row up by email + item instead of token. |
| `HomeServer.js` | Public no-login home page view model (`Index.html`): category-level status only, never exact counts or individual listings; also builds the internal-only analytics view model (`Analytics.html`, `?view=analytics`, unlinked). |
| `Config.js` | Script-Properties-backed org identity (`ORG_NAME`, `CONTACT_EMAIL`, `EXPIRATION_DAYS`, `HIGH_DEMAND_THRESHOLD`) with code-level fallback defaults, plus `ANALYTICS_PASSWORD` (no fallback — see below) gating `?view=analytics`. |
| `Installer.js` | `setupNewInstance()`: idempotent one-time setup (seeds config, creates sheets, installs daily triggers) for a freshly cloned Apps Script project. |
| `Triggers.js` | Daily time-based trigger functions: `dailySubmissionMaintenance` (expiration + stale-listing nudges) and `runAuditFlags` (manual-review-only audit flagging). Not auto-installed except via `setupNewInstance()`. |
| `Receipts.js` | PDF donation receipt generation, triggered from `PortalServer.js`'s confirm-receipt flow. Ships with placeholder tax/legal wording. |

HTML views (`Index.html`, `IntakeForm.html`, `Portal.html`, `OptOut.html`,
`Analytics.html`) are Apps Script HTML templates (`<?= ?>`/`<?!= ?>`
scriptlets), each paired with its `*Server.js` file. Apps Script shares one
filename namespace across script and HTML files regardless of extension, so
a `.js` and `.html` file can't share a base name, hence names like
`PortalServer.js` / `Portal.html`.

## Key invariants

- **`ITEM_CATEGORIES` (`SiteConfig.js`) and `ITEM_FIELD_DEFS` (`ItemConfig.js`)
  are paired by array position, not by name.** Adding, removing, or
  reordering an entry in one without doing the identical operation in the
  other breaks `getItemConfig()` (it throws on length mismatch).
- **`Submissions` columns are looked up by name via `colIndex()`, never by
  fixed position.** Add new columns by appending to `SUBMISSIONS_COLUMNS`
  (`Schema.js`); `ensureSubmissionsColumns()` backfills the header on any
  already-live sheet, but only if new columns are appended, not inserted.
- **Every opt-out status write goes through `setOptOutStatus()`**, never a
  direct cell write. It's what keeps `opt_out_timestamp` stamped alongside
  `opt_out_status`.
- **`getOrgName()`/`getContactEmail()`/etc. (`Config.js`), not hardcoded
  strings**, for anything user-facing that should vary per organization.
- **`?view=analytics` (`WebApp.js`'s `renderAnalyticsPage()`) must stay
  gated on `getAnalyticsPassword()` (`Config.js`), and `buildAnalyticsViewModel()`
  must only ever be called after that check passes.** The password check
  exists specifically to keep that call — and the submitter names/emails it
  returns — off the wire for an unauthorized request; computing it
  unconditionally and only hiding the result client-side would defeat that.

## Placeholders that ship intentionally unfinished

- `IntakeForm.html`'s "Consent / waiver" fieldset is obvious placeholder
  text, not reviewed legal language. Every adopter needs their own.
- `Receipts.js`'s donation-receipt wording is placeholder tax/legal text.
- `SiteConfig.js`'s `ITEM_CATEGORIES` is a short illustrative example (not a
  real category list); `SERVICE_AREA_CITIES` ships empty.
- `Config.js`'s `CONFIG_DEFAULTS` are generic placeholders
  (`Your Organization LgDME System` / `contact@example.org`).

Do not treat any of the above as real content when reasoning about what the
system currently says to users. Check whether the specific deployment has
actually replaced it.

## Contribution workflow: Issue, PR, and semantic versioning

This follows the standard open source pattern of Issue first, then a PR that
closes it, then a version bump sized by what actually changed. Apply this to
any change beyond a trivial typo or formatting fix, and expect it when
proposing or reviewing a change in this repo.

**1. Open an Issue before starting real work.** State what the change is and
why. This gives a place for discussion before code exists, and something for
the PR to reference. Skip this only for genuinely small fixes (a typo, a
broken link, an off-by-one in a comment).

**2. Do the work on a branch, then open a PR against `main`.** The PR
description should say `Closes #<issue number>` (or `Fixes #<issue number>`)
so GitHub links and auto-closes the issue on merge. See `CONTRIBUTING.md` for
the full local dev workflow (your own test Apps Script project, `npm test`,
manual verification).

**3. Title the PR, and write its commits, using a Conventional Commits style
prefix.** This is what lets the version bump in step 4 be a mechanical
decision instead of a judgment call each time:

| Prefix | Meaning | SemVer bump |
|---|---|---|
| `fix:` | A bug fix, no behavior added | Patch (`0.y.Z`) |
| `feat:` | A new, backward-compatible feature or field | Minor (`0.Y.z`) |
| `docs:` | Documentation only, no code change | None (no release needed on its own) |
| `refactor:` | Internal restructuring, no behavior change | None, unless it also fixes something, then use `fix:` |
| `test:` | Test-only change | None |
| `chore:` | Tooling, config, dependency-adjacent housekeeping | None |
| `feat!:` or a `BREAKING CHANGE:` footer in the commit body | An incompatible change to the `Submissions`/`MatchLog` schema, the `Config.js`/`SiteConfig.js` shape, or Web App routing | Major (`X.0.0`) once this project reaches `1.0.0`; before `1.0.0`, SemVer's initial-development rule means any of these can still land as a minor bump (see `README.md`'s Versioning section), but the PR must still call out the break explicitly in its description and in the `CHANGELOG.md` entry |

**4. Add a `CHANGELOG.md` entry under `## [Unreleased]` as part of the same
PR**, in the matching Added/Changed/Fixed/Removed section (Keep a Changelog
format, already used throughout this file). Reviewing a PR without a
changelog entry is an incomplete review; ask for one rather than adding it
yourself on the author's behalf.

**5. Cutting an actual release is a separate, deliberate step**, not
something that happens automatically on every merge. When it's time to cut
one: rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` with the correct
version (patch if only `fix:`/none-bump entries accumulated since the last
release, minor if any `feat:` landed, major-per-`1.0.0`-rules if any
breaking change landed), tag the commit (`git tag vX.Y.Z`), and push the tag.
A git tag marks a reviewed checkpoint of the code, not a live deployment;
match a tagged release to what's actually live by giving its `clasp deploy`
description the same version number, per `README.md`'s Versioning section.

## Working conventions

- No build step in the deploy path, no TypeScript. Plain Apps Script
  (`.js`) and HTML template (`.html`) files pushed as-is via `clasp push`.
- `.clasp.json` is gitignored (it holds a real project's `scriptId`); see
  `.clasp.json.example` and `SETUP.md` for how each instance creates its own.
- `npm test` (or `node --test test/`) runs a small, dependency-free local
  suite covering pure logic only: `colIndex`, the `ITEM_CATEGORIES`/
  `ITEM_FIELD_DEFS` length-parity contract, `findActiveMatches`/`normalize`/
  `itemLabel`, and `validateSubmission`. It loads the real source files into
  a Node `vm` context (`test/lib/loadAppsScript.js`) rather than adding
  `module.exports` to them, and is excluded from what `clasp push` sends
  (`.claspignore`). It does not touch a real Spreadsheet, send real email, or
  exercise the Web App's HTTP routes; verify those by running the relevant
  function from the Apps Script editor's function dropdown, or by exercising
  the deployed Web App directly.
