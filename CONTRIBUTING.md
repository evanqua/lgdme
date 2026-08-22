# Contributing

Thanks for considering a contribution. This is a small, volunteer-maintained project, so the process is kept as light as it can be while staying predictable.

## Contents

1. [Before you start](#1-before-you-start)
2. [Local development workflow](#2-local-development-workflow)
3. [Running the test suite](#3-running-the-test-suite)
4. [Coding conventions](#4-coding-conventions)
5. [What belongs in this repo, and what does not](#5-what-belongs-in-this-repo-and-what-does-not)
6. [Submitting a change](#6-submitting-a-change)
7. [Commit messages](#7-commit-messages)
8. [Reporting a bug](#8-reporting-a-bug)
9. [Reporting a security issue](#9-reporting-a-security-issue)

## 1. Before you start

For anything larger than a small fix, open an issue first and describe what you want to change and why. This avoids spending time on a pull request that turns out to conflict with the project's direction, or that duplicates work already in progress.

Read `ARCHITECTURE.md` before touching core logic (matching, the schema, the token portal). It explains several decisions that are not obvious from the code alone, and it will save you from re-deriving constraints that are already documented.

## 2. Local development workflow

This project has no build step and no npm dependencies in the deployed code. Development happens directly against the Apps Script files (`.js` and `.html`) in this repo.

1. Fork and clone the repo.
2. Create your **own** Apps Script project and Spreadsheet to develop against, following `SETUP.md` sections 3 through 5. Do not develop against someone else's live deployment; `clasp create` in your own clone gives you an isolated project to push to.
3. Make your change.
4. Push it to your own test project with `clasp push --force`, and exercise it manually, either from the Apps Script editor's function dropdown for a single function, or through the deployed Web App for anything touching the UI, routing, or email.
5. Run the local unit test suite (see below) before opening a pull request.

A GitHub Actions workflow (`.github/workflows/test.yml`) runs `npm test` automatically on every push and pull request against `main`, and its status shows as the "Tests" badge on the README. This only runs the local logic suite described in section 3 below; it does not, and cannot, exercise a real Spreadsheet or Web App deployment, so it is not a substitute for the manual verification in section 2.

## 3. Running the test suite

```
npm test
```

This runs a small, dependency-free suite (`test/`, using Node's built-in `node:test`) that loads the real source files into an isolated context and checks pure logic: matching rules, column lookups, the `ITEM_CATEGORIES`/`ITEM_FIELD_DEFS` length-parity contract, and intake form validation. It does not touch a real Spreadsheet, send real email, or exercise the Web App's HTTP routes; those still need the manual verification described in section 2 above.

If you add or change logic in `Schema.js`, `ItemConfig.js`, `Matching.js`, or `WebApp.js`'s `validateSubmission`, add or update a test alongside it. `test/lib/loadAppsScript.js` is the harness that loads real source files into the test environment; look at an existing test file for the pattern before writing a new one.

## 4. Coding conventions

These are load-bearing, not stylistic preferences. Departing from them tends to reintroduce bugs this codebase has already fixed once.

- **Look up Spreadsheet columns by name, never by a hardcoded position.** Use `colIndex("column_name")` (and the equivalent for `MatchLog`/`AuditFlags`), not a numeric index. This is what lets the sheet's column order change without breaking the code, and what makes an unknown column name fail loudly (`colIndex` throws) instead of silently reading the wrong cell.
- **`ITEM_CATEGORIES` (`SiteConfig.js`) and `ITEM_FIELD_DEFS` (`ItemConfig.js`) are paired by array position, not by name.** If you add a category to one, add the matching field-def block to the other, at the same index. Do not retype a category's name inside `ItemConfig.js`; it should only ever exist in `SiteConfig.js`.
- **Every opt-out status write goes through `setOptOutStatus()`**, never a direct cell write, so that `opt_out_timestamp` always stays stamped alongside `opt_out_status`.
- **User-facing organization identity goes through `Config.js`'s getters** (`getOrgName()`, `getContactEmail()`, and so on), never a hardcoded string. A literal organization name anywhere outside `Config.js`'s own defaults is a bug.
- **Apps Script's filename namespace is flat and shared across `.js` and `.html`.** A new server file paired with a new HTML view needs a distinct base name for each, following the existing `PortalServer.js` / `Portal.html` pattern, not a shared name across the two extensions.
- **Write comments that explain why, not what.** A comment describing a non-obvious constraint, a subtle invariant, or the reason behind an unusual choice is welcome. A comment restating what the next line of code already says is not.
- **Do not add a build step, a transpiler, or a runtime npm dependency to the deployed code.** The `test/` directory is the one place npm tooling belongs in this repo, and it is explicitly excluded from what gets pushed to Apps Script (`.claspignore`). If a change seems to require a build step, that is a sign to reconsider the approach rather than a sign to add one.

## 5. What belongs in this repo, and what does not

This repository is meant to work for any organization that clones it, not only the one it originated from. Contributions should keep it that way.

**Belongs here:** bug fixes, new item categories added generically (as an example, not tied to one organization's real inventory), improvements to the matching or notification logic, accessibility fixes, documentation improvements, new tests.

**Does not belong here:** any organization's real legal or consent text (the placeholder in `IntakeForm.html` is deliberately generic; do not replace it with one specific organization's actual wording), any organization's real item category list or service area (`SiteConfig.js`'s shipped lists are illustrative examples on purpose), features tied to one specific organization's internal process or a specific research study, and any real production credentials, spreadsheet IDs, or script IDs (`.clasp.json` is gitignored for exactly this reason; never force-add it to a commit).

If you are adapting this system for your own organization rather than contributing back to the shared template, that customization belongs in your own fork or downstream repository, not in a pull request here.

## 6. Submitting a change

1. Open a pull request against `main` with a clear description of what changed and why.
2. Keep pull requests focused. A change that fixes a bug and also reorganizes unrelated files is harder to review and harder to revert if something goes wrong.
3. Note in the description whether you tested the change manually against a live Apps Script deployment, and what you tested, in addition to running `npm test`.
4. Be responsive to review feedback. This is a small project without a large review bandwidth, so a pull request that goes quiet for an extended period may be closed and can always be reopened later.

## 7. Commit messages

Write commit messages that explain the reasoning behind a change, not just a restatement of the diff. A commit message like "fix bug" or "update file" is not useful six months later; a commit message like "exclude opted-out rows from the stale-listing nudge, since they no longer need a reminder to renew" is.

## 8. Reporting a bug

Open an issue with: what you expected to happen, what actually happened, and the exact steps to reproduce it. If the bug involves the Web App's behavior, include the relevant URL pattern (for example, `?view=intake`) and, if you have access to it, anything relevant from **View > Executions** in the Apps Script editor.

## 9. Reporting a security issue

Do not open a public issue for a security vulnerability. See `SECURITY.md` for how to report one privately.
