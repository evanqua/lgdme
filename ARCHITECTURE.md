# Architecture

This document describes how the system is built and why, at a level useful to someone extending the code or evaluating whether it fits their needs. For the setup walkthrough, see `SETUP.md`. For the exact data model, see `SCHEMA.md`. For a compact contributor-facing summary, see `CLAUDE.md`.

## Contents

1. [Design goals](#1-design-goals)
2. [Why Google Apps Script](#2-why-google-apps-script)
3. [High-level request flow](#3-high-level-request-flow)
4. [File map](#4-file-map)
5. [The matching engine](#5-the-matching-engine)
6. [Notification email flow](#6-notification-email-flow)
7. [The token portal](#7-the-token-portal)
8. [Scheduled triggers](#8-scheduled-triggers)
9. [Configuration model](#9-configuration-model)
10. [Data model summary](#10-data-model-summary)
11. [Known constraints of the platform](#11-known-constraints-of-the-platform)

## 1. Design goals

- **Zero hosting cost and zero infrastructure to maintain.** A volunteer-run organization should not need a server, a database subscription, or a DevOps person to keep this running.
- **One person can deploy the whole thing in an afternoon**, using an account they already have.
- **No account required for the public.** Anyone can browse the home page, submit a listing, or manage an existing listing through a link, without creating a login.
- **Deliberately minimal data exposure.** The public home page never shows exact counts, individual listings, or photos. Contact information is only shared between two parties once they are actually matched.
- **Configuration over forking.** An adopting organization should be able to run this as-is with a handful of edits (org name, item categories, legal text) rather than needing to modify core logic.

## 2. Why Google Apps Script

Apps Script trades flexibility for operational simplicity. There is no server to provision, patch, or pay for; Google runs the code. A Google Sheet doubles as a free, durable, human-readable database that a non-technical volunteer can open and read directly, without a database client or a generated admin panel. Sending email, storing files, and hosting a small web app are all built into the platform with no separate service to integrate.

The tradeoffs are real and worth knowing before you build on top of this:

- The runtime is Google's own V8-based sandbox, not Node.js. There is no `npm install` for the deployed code, and no way to add a runtime dependency.
- Execution is quota-limited (see section 11) rather than scaling on demand the way a normal server would.
- The Spreadsheet, used as a database, does not have real transactions, indexes, or query planning. Every read in this codebase pulls the whole sheet into memory and filters in code.

For the scale this system is designed for (a regional donation-matching service, not a high-traffic consumer product), these tradeoffs are the right ones.

## 3. High-level request flow

Every request to the deployed Web App, whether a page load or a form action, enters through a single function: `doGet(e)` in `WebApp.js`. It is a straightforward router keyed off query parameters, in priority order:

1. `?token=<value>` present. Look the token up against the `Submissions` sheet. If it matches a row, render the self-service portal (`PortalServer.js` / `Portal.html`) for that submission. If it does not match anything, render the opt-out page in its "not found" state instead of a generic error, since an expired or mistyped token is the most likely explanation.
2. `?view=optout`. Render the token-less opt-out page (`OptOutServer.js` / `OptOut.html`), which looks a submission up by email and item instead of by token. This is what you hand out publicly for someone who no longer has a notification email handy.
3. `?view=intake`. Render the intake form (`IntakeForm.html`), the entry point for a brand new submission.
4. `?view=analytics`. Render an internal analytics view (`Analytics.html`). Nothing in the public-facing UI links to this; it is reachable only by whoever already has the exact URL.
5. Anything else, including the bare URL. Render the public home page (`HomeServer.js` / `Index.html`). This is the default a first-time visitor lands on.

Form submissions from the intake form do not go through a normal HTTP POST. `IntakeForm.html` calls `submitIntake` via `google.script.run`, the Apps Script mechanism for calling a server-side function directly from client-side JavaScript inside an HtmlService page. This is specifically what allows `<input type="file">` uploads (for donor photos) to arrive as real Blobs on the server side; a raw POST from a sandboxed HtmlService page cannot deliver a file the same way. The token portal's actions (`portalReportOutcome`, `portalConfirmReceipt`, and so on) use the same `google.script.run` pattern.

## 4. File map

| File | Responsibility |
|---|---|
| `WebApp.js` | The `doGet` router described above, plus `submitIntake`/`submitIntakeInternal` (validation, photo upload, row creation for a new submission). |
| `Schema.js` | Column definitions for all three sheets (`Submissions`, `MatchLog`, `AuditFlags`), and the `colIndex()` / `matchLogColIndex()` / `auditFlagsColIndex()` lookup functions every other file uses instead of a hardcoded column position. |
| `SiteConfig.js` | `ITEM_CATEGORIES` and `SERVICE_AREA_CITIES`, the two adopter-editable content lists. |
| `ItemConfig.js` | `ITEM_FIELD_DEFS`, the per-category donate and receive field definitions, paired with `ITEM_CATEGORIES` by array position. `getItemConfig()` builds the combined lookup and validates the two lists agree on length. |
| `Matching.js` | The matching predicate (`findActiveMatches`), the two notification email builders (`sendSubmitterEmail`, `sendMatchAlertEmail`), and `MatchLog` writes. |
| `PortalServer.js` | Backend for the token-based self-service portal: report a match outcome, report no match, confirm receipt, renew a stale listing, optional feedback. |
| `OptOutServer.js` | Backend for the token-less opt-out page, for someone without a handy notification email. |
| `HomeServer.js` | Builds the public home page's view model (category status, the two bar charts) and the internal analytics view model. Deliberately withholds exact counts and individual listings from the public version. |
| `Config.js` | Reads org identity and behavior settings (`ORG_NAME`, `CONTACT_EMAIL`, `EXPIRATION_DAYS`, `HIGH_DEMAND_THRESHOLD`) from Script Properties, with code-level fallback defaults. |
| `Installer.js` | `setupNewInstance()`, the one-time idempotent setup function described in `SETUP.md`. |
| `Triggers.js` | The two daily scheduled functions: `dailySubmissionMaintenance` and `runAuditFlags`. |
| `Receipts.js` | Builds and emails a PDF donation receipt when a recipient confirms receipt through the portal. |

HTML views (`Index.html`, `IntakeForm.html`, `Portal.html`, `OptOut.html`, `Analytics.html`) are Apps Script HTML templates using `<?= ?>` and `<?!= ?>` scriptlets, each paired with a same-purpose `*Server.js` file. Apps Script shares one filename namespace across script and HTML files regardless of extension, so a `.js` file and an `.html` file cannot share a base name; this is why the pairing is `PortalServer.js` next to `Portal.html`, not `Portal.js` next to `Portal.html`.

## 5. The matching engine

A match is defined entirely by four conditions, checked in `findActiveMatches` (`Matching.js`):

1. Same `item_type`.
2. Opposite `donate_or_receive` direction (a Donate row can only match a Receive row, and vice versa).
3. `opt_out_status` is `Active` on both sides.
4. Neither row's `notification_expiry` has passed.

There is no fuzzy matching, geographic radius, or ranking. Every row satisfying all four conditions is considered an equally valid match, and all of them are shown.

Matching runs at two moments:

- **At submission time**, in `processNewSubmission`, which finds matches for the new submitter and also checks whether the new submission itself is a match for anyone already active and subscribed to notifications.
- **On the daily maintenance trigger**, only to recompute a match count for a stale-listing nudge email; the trigger does not send new match notifications on its own, since a match is always the result of a new submission arriving.

Matching intentionally works off `item_type` and `donate_or_receive` as flat, first-class columns rather than parsing free text, which keeps the matching logic simple and exact.

## 6. Notification email flow

Two emails matter here, both built in `Matching.js`:

- `sendSubmitterEmail`, sent once, immediately after a new submission is created, to the person who just submitted. It lists whatever matches already exist for them, or says there are none yet.
- `sendMatchAlertEmail`, sent to every existing active, notification-subscribed submitter whose listing the new submission happens to match. Each of these is a separate email to a separate person.

Every match shown in either email is also logged as a row in `MatchLog` (`logMatchesForRecipient`), recording which submission was shown to which recipient, and when. This is what lets the token portal later offer a real dropdown of "who did you actually match with," populated from `MatchLog`, instead of asking someone to type in an email address from memory. It is also what lets the audit pass (section 8) detect a self-reported match outcome that does not correspond to any notification that was actually sent.

Both notification emails link to the recipient's own token portal (`?token=<their token>`), never to a generic or dead link.

## 7. The token portal

Every submission gets a `token`, a random UUID minted once at submission time (`WebApp.js`, `submitIntakeInternal`) and reused in every subsequent email sent about that submission. The token is a bearer capability: whoever has it can view and act on that one submission through `?token=<value>`, with no separate login. `PortalServer.js`'s `findSubmissionByToken` is the only place a token gets resolved to a row, and it is a straightforward lookup, not a cryptographic verification; the security of the scheme rests entirely on the token being long, random, and not exposed anywhere it should not be. See `SECURITY.md` for the full threat model.

From the portal, a submitter can report that they found a match (selecting from a `MatchLog`-backed dropdown, not free text), report that they did not find a match, confirm receipt of a donated item (which triggers the PDF receipt flow in `Receipts.js`), or renew a listing that is approaching expiration.

## 8. Scheduled triggers

Two daily triggers exist, both installed by `setupNewInstance()` and defined in `Triggers.js`:

- **`dailySubmissionMaintenance`** walks every active row. It expires anything older than the configured `EXPIRATION_DAYS`, and sends a "still looking?" nudge email at roughly one third and two thirds of the way to expiration, plus a final "expiring soon" warning seven days out. The nudge timing scales with `EXPIRATION_DAYS` rather than being hardcoded, so changing the expiration window in Script Properties automatically re-times the nudges instead of drifting out of proportion with it.
- **`runAuditFlags`** writes to the `AuditFlags` sheet only; it never modifies `Submissions` or acts on anything automatically. It flags two situations for a human to review later: a listing that has generated several notifications with no response, and a self-reported match outcome that does not correspond to any real entry in `MatchLog`.

Neither trigger is installed automatically just by pushing code; they only get installed by running `setupNewInstance()`, or by adding them manually in the Apps Script editor's Triggers panel.

## 9. Configuration model

Two layers exist for a reason:

- **Script Properties** (`Config.js`) hold single string or number values: organization name, contact email, expiration window, high-demand threshold. These can be changed at any time from the Apps Script editor without a redeploy, since they are read live on every request.
- **Code constants** (`SiteConfig.js`, `ItemConfig.js`) hold lists and structured data: item categories, service-area cities, per-category form fields. These have to be code, not Script Properties, because Script Properties only stores strings, not arrays or objects. Changing these requires a `clasp push`, but not a new deployment version (a `clasp push` updates the editor's HEAD, which is enough for testing; getting a change onto a URL you have already shared publicly still needs `clasp deploy` against that deployment, as described in `SETUP.md`).

Every user-facing string that should vary by organization goes through `getOrgName()` / `getContactEmail()` rather than being hardcoded. A hardcoded organization name anywhere in the codebase is a bug; it should route through `Config.js` instead.

## 10. Data model summary

The full schema, described independently of any particular database technology, lives in `SCHEMA.md`. In short: one Google Sheet holds three tabs. `Submissions` is one row per donate-or-receive listing, append-only in spirit (rows are updated in place for status changes, never deleted by any code path). `MatchLog` is one row per notification-shown event, append-only, and exists purely to support the portal's dropdown and the audit pass. `AuditFlags` is output-only, written by the daily audit trigger, read only by a human.

## 11. Known constraints of the platform

- **Execution time limit.** A single Apps Script function invocation is capped (roughly six minutes for most account types). Every loop in this codebase runs in-memory over an array already pulled from the Sheet, which is fast at the scale this system targets, but would need rethinking well before a `Submissions` sheet reached tens of thousands of active rows.
- **No true database transactions.** Two triggers or two form submissions racing each other in the same moment can, in principle, both read the same stale sheet snapshot before either writes back. This is a low-probability edge case at the volume this system is built for, and the codebase does not currently guard against it.
- **Filename namespace is flat and shared.** See section 4.
- **Cross-page links inside an HtmlService page need special handling.** Every HtmlService page renders inside a sandboxed iframe on its own origin. A link to another page on the same Web App needs both `target="_top"` and an absolute URL built server-side via `ScriptApp.getService().getUrl()`; a plain relative link resolves against the iframe's own origin and silently 404s, and `script.google.com` refuses to be framed at all without `target="_top"` set.
- **Apps Script Web App URLs cannot be pointed at a custom domain.** See `SETUP.md` section 9.
