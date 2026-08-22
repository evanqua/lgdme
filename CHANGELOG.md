# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This project is currently pre-1.0 (`0.y.z`). Per the SemVer spec's own rule for
initial development, anything — including the `Submissions`/`MatchLog` sheet
schema, `SiteConfig.js`/`Config.js`'s config shape, and Web App routing — may
still change between minor versions without a major-version bump. Once the
system is stable enough for other orgs to depend on it without expecting
breakage, `1.0.0` marks that commitment; see [Versioning](README.md#versioning)
in the README for how versions map to git tags and Apps Script deployments.

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

### Known placeholders (not yet real content — see `CLAUDE.md`)
- Consent/waiver text and donation receipt wording ship as clearly-marked
  filler, not organization-approved copy — replace both before collecting
  real submissions.
- `SiteConfig.js`'s `ITEM_CATEGORIES` ships as a short illustrative example
  (not a real category list) and `SERVICE_AREA_CITIES` ships empty — every
  adopter is expected to replace both for their own organization.
