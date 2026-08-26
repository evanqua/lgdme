# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This project is currently pre-1.0 (`0.y.z`). Per the SemVer spec's own rule for
initial development, anything, including the `Submissions`/`MatchLog` sheet
schema, `SiteConfig.js`/`Config.js`'s config shape, and Web App routing, may
still change between minor versions without a major-version bump. Once the
system is stable enough for other orgs to depend on it without expecting
breakage, `1.0.0` marks that commitment; see [Versioning](README.md#versioning)
in the README for how versions map to git tags and Apps Script deployments.

## [Unreleased]

### Added
- `SETUP.md` section 3 now documents three ways to get the code, ordered by
  how well future updates can be pulled in later: a plain clone, a public
  GitHub fork (with `origin`/`upstream` remotes set up automatically via
  `gh repo fork`), or a private downstream copy that still tracks `upstream`
  for updates, matching the pattern ReCARES's own production deployment
  uses.
- `.github/FUNDING.yml` pointing to recares.org, so GitHub shows a Sponsor
  button on the repo.
- Issue templates for bug reports and feature requests, and a pull request
  template reinforcing the Issue/PR/CHANGELOG/test checklist from
  `CLAUDE.md`'s Contribution workflow section.
- Repository description, homepage link, and discoverability topics set on
  GitHub.
- Three starter issues filed for newcomers (line-ending normalization, an
  accessibility fallback for the home page charts, and README screenshots).
- `.gitattributes` normalizing `.js`/`.html`/`.md`/`.json` to LF line endings
  in the repository regardless of a contributor's local `core.autocrlf`
  setting. Closes #1.

### Fixed
- `ARCHITECTURE.md`'s `HomeServer.js` row described the two bar charts as
  part of the public home page's view model; they were moved to the
  internal-only analytics view model (`?view=analytics`) before this repo
  went public. Also closed issue #2, which was filed against the stale
  public-home-page description.

## [0.2.1] - 2026-08-22

Documentation and metadata only, no code or schema change. Cut as its own
release so this version has a citable archive.

### Added
- README badges: license, latest release (reads live from GitHub's Releases
  API, no manual updating needed), CI test status, and a PRs-welcome badge.
  A placeholder comment marks where to add a Zenodo DOI badge once this
  release (or a later one) is archived.
- An Origin and support section in the README crediting ReCARES as the
  project's sponsor, with a link to recares.org and a note on how to support
  ongoing maintenance.
- A See it in action section in the README, and a matching note in
  `SETUP.md`, linking ReCARES's own production deployment as a real-world
  example.
- A GitHub Actions workflow (`.github/workflows/test.yml`) running the local
  test suite on every push and pull request against `main`.

## [0.2.0] - 2026-08-22

Official start release: the repository is now public, with a full setup,
architecture, and contribution documentation set, a local test suite, and a
documented contribution process.

### Added
- `ARCHITECTURE.md`: design goals, request flow, the matching engine, the
  token portal's security model, and the platform's real constraints.
- `CONTRIBUTING.md`: local dev workflow, coding conventions, what belongs in
  this repo versus a downstream fork.
- `SECURITY.md`: the security model of a deployed instance (token handling,
  PII exposure, uploaded-photo storage, Google account permissions), and how
  to report a vulnerability.
- `CODE_OF_CONDUCT.md`.
- A local, dependency-free `node:test` suite (`test/`) covering `colIndex`,
  the `ITEM_CATEGORIES`/`ITEM_FIELD_DEFS` length-parity contract,
  `findActiveMatches`/`normalize`/`itemLabel`, and `validateSubmission`.
  Excluded from what `clasp push` sends.
- GitHub's private vulnerability reporting, enabled on this repository.
- A documented Issue/PR/semantic-versioning contribution workflow
  (`CLAUDE.md`), including a Conventional Commits style prefix convention
  mapped to SemVer bump size.

### Changed
- `SETUP.md` substantially expanded: Google account vs Google Workspace
  tradeoffs, email sending quotas, the Spreadsheet-as-database model,
  uploaded-photo storage, and a troubleshooting section.
- Repository visibility changed from private to public.

## [0.1.0] - 2026-08-22

Initial public template release: a single, unified Web App system with no
legacy-form baggage.

### Added
- Web App intake form (`WebApp.js`/`IntakeForm.html`) with a flat `Submissions`
  schema (`Schema.js`), per-item-type dynamic form fields and match-email
  rendering (`ItemConfig.js`/`Matching.js`), and a `token`/`MatchLog` scheme
  used for notification emails.
- Token portal (`PortalServer.js`/`Portal.html`) for reporting match outcomes,
  reporting no-match, and confirming receipt, with PDF donation receipts
  (`Receipts.js`).
- Generic, token-less opt-out page (`OptOutServer.js`/`OptOut.html`),
  reachable via a token link or `?view=optout`.
- Manual-review audit flagging and daily maintenance triggers (`Triggers.js`).
- Public, no-login category-activity home page (`HomeServer.js`/`Index.html`)
  as the Web App's default route, with a "How it works" explainer and
  dependency-free HTML/CSS activity charts (`Analytics.html`).
- Replicability: `Config.js` (Script-Properties-backed org identity/expiration
  window), `SiteConfig.js` (adopter-editable item categories and service-area
  cities), `Installer.js`'s `setupNewInstance()`, `SETUP.md`, `SCHEMA.md`.
- `ITEM_CATEGORIES` (`SiteConfig.js`) as the single source of truth for item
  category names; `ItemConfig.js` builds its field definitions by pairing
  against that list by array position instead of keeping its own
  independently-typed copy of the names.

### Known placeholders (not yet real content, see `CLAUDE.md`)
- Consent/waiver text and donation receipt wording ship as clearly-marked
  filler, not organization-approved copy. Replace both before collecting
  real submissions.
- `SiteConfig.js`'s `ITEM_CATEGORIES` ships as a short illustrative example
  (not a real category list) and `SERVICE_AREA_CITIES` ships empty. Every
  adopter is expected to replace both for their own organization.
