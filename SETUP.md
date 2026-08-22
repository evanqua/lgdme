# Setup

This is a full walkthrough for standing up your own instance of the LgDME System: a Google account and Sheet to hold the data, a deployed Web App for the public to use, and the Google services that send email and store uploaded photos.

Read the whole document once before starting. A few decisions (which Google account to use, whether you need Google Workspace) are much easier to make before you have live data than after.

If you want to see a real, deployed instance before starting, [ReCARES](https://recares.org) (the organization that sponsored this project) runs its own production instance at [script.google.com/a/recares.org/macros/s/AKfycbyC3RX01ff9HI_jRCdj3TGWT5k6Y7yjNMArB3W-rH85DGi0kwb5RcSyiLbziTw6bmGV/exec](https://script.google.com/a/recares.org/macros/s/AKfycbyC3RX01ff9HI_jRCdj3TGWT5k6Y7yjNMArB3W-rH85DGi0kwb5RcSyiLbziTw6bmGV/exec). It is a live system serving real submitters, not a sandbox, so please do not submit test listings there; use your own instance once you get to step 13 below.

## Contents

1. [What you need before you start](#1-what-you-need-before-you-start)
2. [Choosing an account: personal Gmail vs Google Workspace](#2-choosing-an-account-personal-gmail-vs-google-workspace)
3. [Clone the repo](#3-clone-the-repo)
4. [Create your Apps Script project and Spreadsheet](#4-create-your-apps-script-project-and-spreadsheet)
5. [Push the code](#5-push-the-code)
6. [Configure your organization](#6-configure-your-organization)
7. [Replace the placeholder legal and receipt text](#7-replace-the-placeholder-legal-and-receipt-text)
8. [Run setupNewInstance() once](#8-run-setupnewinstance-once)
9. [Deploy the Web App](#9-deploy-the-web-app)
10. [How email sending actually works](#10-how-email-sending-actually-works)
11. [How the Spreadsheet works as the database](#11-how-the-spreadsheet-works-as-the-database)
12. [Uploaded photos and Google Drive](#12-uploaded-photos-and-google-drive)
13. [Confirm it worked](#13-confirm-it-worked)
14. [Ongoing operation](#14-ongoing-operation)
15. [Troubleshooting](#15-troubleshooting)

## 1. What you need before you start

- A Google account. This can be a personal Gmail account or a Google Workspace account belonging to an organization. See section 2 below before picking one, since it affects daily email volume and what your notification emails look like to recipients.
- [Node.js](https://nodejs.org/) installed, to run `clasp` (Google's Apps Script command line tool) and the optional local test suite.
- `clasp` itself: `npm install -g @google/clasp`, then `clasp login` once to authorize it against your Google account.
- Familiarity with Google Sheets and the Apps Script editor is helpful but not required. Nothing in this system requires writing spreadsheet formulas.

This system has no server to rent, no database to provision, and no hosting bill. Everything runs inside Google's infrastructure, for free, within the quotas described in section 10.

## 2. Choosing an account: personal Gmail vs Google Workspace

Everything this system does (matching, storing data, sending email, deploying the public Web App) runs as one Google account: whichever account you use when you deploy it. That account's identity becomes the system's identity in a few concrete ways:

- **Every notification email is sent from that account's address.** A personal Gmail account named `janedoe@gmail.com` will send match notifications that appear to come from `janedoe@gmail.com`, not from your organization. A Google Workspace account on your own domain (`operations@yourorg.org`) sends as that address instead.
- **Daily email volume is capped by that account's quota.** A personal Gmail account can send roughly 100 emails per day through `MailApp` (the service this system uses). A Google Workspace account can send roughly 1,500 per day. Every match notification, opt-out confirmation, and stale-listing nudge counts against this quota. If you expect more than a handful of submissions per day, a personal account will not have enough headroom for long.
- **The Spreadsheet and all uploaded photos live in that account's Google Drive.** Whoever has access to that Drive can see the raw data, including every submitter's contact information.
- **The Web App deployment is owned by that account.** Only that account (or a Workspace admin, if it is a Workspace account) can manage or redeploy it later.

For a real organization, a Google Workspace account (even a low-cost single-user plan on your own domain) is strongly recommended over a personal Gmail account. It gets you a higher email quota, an email address recipients will recognize as belonging to your organization, and a way to hand off ownership to a successor without sharing a personal password. A personal Gmail account is fine for testing, evaluation, or a very low-volume pilot, but plan to migrate before real launch.

If you decide to migrate later, moving to a new account means recreating the Apps Script project under the new account (Apps Script projects cannot be transferred to a different Google account after the fact) and copying the Spreadsheet's data over. It is much less work to make this decision up front.

## 3. Clone the repo

```
git clone https://github.com/evanqua/lgdme.git
cd lgdme
```

## 4. Create your Apps Script project and Spreadsheet

This repository is a template. It is not bound to any live Google Sheet or Apps Script project until you create one. From inside the cloned repo:

```
clasp create --type sheets --title "<Your Org> LgDME System"
```

Run this while logged in (via `clasp login`) as the account you chose in section 2. This command does two things at once: it creates a brand new Google Sheet, and it creates a container-bound Apps Script project attached to that Sheet. It then writes a `.clasp.json` file into your local copy pointing at both.

`.clasp.json` is deliberately excluded from this repo's git history (see `.gitignore`) because it identifies one specific live project. `clasp create` overwrites it with your own project's identifiers. Never commit your `.clasp.json` into a shared or public fork; anyone with its `scriptId` combined with editor access to the underlying Sheet could see or change your live data.

## 5. Push the code

```
clasp push --force
```

`--force` skips an interactive confirmation prompt that a non-interactive shell cannot answer. If you are running this in a normal terminal, you can omit `--force` and answer the prompt yourself.

This uploads every `.js` and `.html` file (excluding anything listed in `.claspignore`, such as the local test suite) into the Apps Script project you just created.

## 6. Configure your organization

Two separate places hold adopter-specific configuration: Script Properties (for simple text values) and `SiteConfig.js` (for lists, which have to be code since Script Properties only holds strings).

### Script Properties

Open the project (`clasp open`), then go to **Project Settings > Script Properties**, and set:

| Property | Meaning | Default if unset |
|---|---|---|
| `ORG_NAME` | Shown in page titles, headers, and email signatures | `Your Organization LgDME System` |
| `CONTACT_EMAIL` | Shown wherever a "contact us" link appears | `contact@example.org` |
| `EXPIRATION_DAYS` | How long a listing stays active before it expires, and how the "still looking?" nudge timing is scaled | `60` |
| `HIGH_DEMAND_THRESHOLD` | Minimum number of active unmatched requests before the home page's "High Demand" badge shows for a category | `5` |

You do not have to set these before step 8. `setupNewInstance()` seeds all four with the defaults above if you skip this, and you can edit them at any time afterward without redeploying code (Script Properties are read live, not baked into a deployment). Just do not let the placeholder defaults reach real users; nobody should ever see "Your Organization LgDME System" in a live email.

### SiteConfig.js

`SiteConfig.js` holds two lists that are code, not Script Properties, because they are arrays rather than single values:

| Constant | Meaning |
|---|---|
| `ITEM_CATEGORIES` | The full list of equipment categories your system accepts. This repo ships with four illustrative examples, not a real category list. Edit this list to match what your organization actually collects. |
| `SERVICE_AREA_CITIES` | Powers the intake form's city dropdown. Ships empty. An empty list just means the dropdown only offers "Other" (free text), which still works, so this is not a hard blocker, just worth filling in for a better experience. |

If you add, remove, or reorder a category in `ITEM_CATEGORIES`, you must make the matching change in `ItemConfig.js`'s `ITEM_FIELD_DEFS` array at the same array position. The two lists are paired by position, not by name; see the comment at the top of `ItemConfig.js` for the full explanation, and `ARCHITECTURE.md` for why the codebase is built this way. Getting the two lists out of sync causes `getItemConfig()` to throw loudly rather than silently produce wrong forms, so a mismatch will surface immediately as an error rather than as subtly broken behavior.

After editing `SiteConfig.js` or `ItemConfig.js`, push the change again with `clasp push --force`.

## 7. Replace the placeholder legal and receipt text

Two pieces of user-facing text ship as obvious, marked placeholders. Both have real legal and financial implications, so this repository does not attempt to write them for you.

- **`IntakeForm.html`'s "Consent / waiver" fieldset.** This is what a submitter agrees to when they use your system: what information gets shared with a match, who else can see submissions, and what liability your organization does or does not assume for the condition of exchanged equipment. Replace the placeholder paragraph with language your organization has actually reviewed, ideally by someone with relevant legal background.
- **`Receipts.js`'s donation receipt wording.** This is the text included in the PDF generated when a recipient confirms receipt through the token portal. Donation receipts can have tax implications depending on your jurisdiction and your organization's status; do not treat the placeholder text as valid without review.

Neither placeholder blocks the system from running end to end for testing purposes. Both must be replaced before real submitters see them.

## 8. Run setupNewInstance() once

In the Apps Script editor, select `setupNewInstance` from the function dropdown at the top of the toolbar, and click **Run**.

The first run prompts you to authorize the script. Review and approve the requested permissions; this is what lets the script create sheets, install triggers, send email, and manage uploaded files under your account. See `SECURITY.md` for exactly what each permission is used for.

This single function call:

- Creates the `Submissions`, `MatchLog`, and `AuditFlags` sheets in your Spreadsheet, with the correct column headers.
- Seeds any Script Property you have not already set with the defaults from step 6.
- Installs two daily time-based triggers: `dailySubmissionMaintenance` (expiration and stale-listing nudges) and `runAuditFlags` (manual-review audit flagging).

It is idempotent: safe to run again later if you are unsure whether it succeeded, if a trigger was accidentally deleted, or if a sheet got renamed. Re-running never overwrites a Script Property you have already customized, and never creates duplicate triggers.

## 9. Deploy the Web App

`setupNewInstance()` cannot do this part. Apps Script's API does not expose "create a Web App deployment" the way it exposes sheet and trigger creation, so this step is manual, either way:

- **Apps Script editor:** Deploy menu, New deployment, type "Web app", execute as **Me**, who has access **Anyone**, then Deploy.
- **clasp:** `clasp deploy -d "Initial deployment"`, then `clasp deployments` to find the deployment ID and build the URL yourself: `https://script.google.com/macros/s/<deploymentId>/exec`.

Either way, confirm the deployment's access is set to **Anyone**, not "Anyone with a Google account" or restricted to your Workspace domain, if you want the public to be able to use it without signing in. `appsscript.json`'s `webapp` block (`access: "ANYONE_ANONYMOUS"`) is meant to set this automatically, but it is worth checking directly in the deployment settings if a visitor reports an access error.

A deployment is pinned to a specific version snapshot of your code. Pushing new code with `clasp push` updates the editor's live copy, but does **not** change what an existing deployment serves. To ship a code change to a URL you have already shared publicly, use `clasp deploy -i <deploymentId> -d "<description>"` to re-point that same deployment at a new version, rather than creating a second deployment with a different URL.

Apps Script Web App URLs live on Google's own domain (`script.google.com`) and cannot be pointed at a custom domain of your own. If you want a nicer URL, the usual approach is a redirect from a page on your organization's own site to the Apps Script URL; the Web App itself will still ultimately load from `script.google.com`.

## 10. How email sending actually works

Every outbound email (submission confirmations, match alerts, stale-listing nudges, opt-out confirmations, donation receipts) goes through Apps Script's `MailApp` service, sent as the Google account that owns the deployment.

Two limits matter in practice:

- **Daily quota.** A personal Gmail account gets roughly 100 `MailApp` sends per day; a Google Workspace account gets roughly 1,500. Google enforces this per account, resets it daily, and the exact number can change; check your account's current quota in the Apps Script editor under **Project Settings** if you need the authoritative figure. Once the quota is hit, further sends fail silently from the recipient's point of view (no email arrives) until the quota resets. There is no built-in queueing or retry in this codebase; a submission or match that happens after the quota is exhausted for the day simply does not trigger an email until the account's quota resets.
- **Sender identity.** Recipients see the deploying account's actual address in the "From" field. Google Workspace accounts can additionally configure verified "send as" aliases in Gmail settings if you want mail to appear to come from a different address than the account's primary one; this codebase does not configure that for you.

If your organization expects meaningful volume (dozens of submissions and matches per day, which can easily produce several times that many emails once notifications to existing subscribers are counted), budget for a Google Workspace account from the start rather than discovering the personal-account ceiling in production.

## 11. How the Spreadsheet works as the database

There is no separate database. The Google Sheet created in step 4 **is** the data store; `Submissions`, `MatchLog`, and `AuditFlags` are its three tabs, described in full in `SCHEMA.md`.

A few consequences worth knowing before you touch the Sheet directly:

- **Column order matters for the header row, not for the code.** Every read and write in this codebase looks up a column by name (`colIndex("email")`, for example), never by a fixed position. You can reorder columns in the Sheet UI without breaking anything, as long as the header text in row 1 stays exactly as the code expects. Renaming a header, or leaving a header blank, will break the corresponding lookup.
- **Do not delete rows or columns that code depends on.** Deleting a row simply removes that submission; deleting a column that a lookup expects causes that lookup to throw an error the next time it runs.
- **Manual edits are live immediately.** There is no build or deploy step between editing a cell in the Sheet UI and that change taking effect; the running system reads the Sheet directly on every request.
- **Back it up like any other important spreadsheet.** Google Sheets keeps version history (File > Version history), and you can export a copy at any time (File > Download), but this codebase does not do automated backups on your behalf.

## 12. Uploaded photos and Google Drive

When a donor attaches a photo to a listing, the file is uploaded into a Drive folder named `Large DME Web App Uploads`, created automatically in the deploying account's Drive the first time it is needed. Each uploaded file is individually set to "anyone with the link can view," so the link included in match notification emails works for the matched recipient without requiring them to sign in. The folder itself is not made public; only files that have actually been shared this way are reachable, and only by someone who has the specific link.

See `SECURITY.md` for the security implications of this.

## 13. Confirm it worked

- Open the bare deployment URL. You should see the public home page, with every category from `ITEM_CATEGORIES` listed as "No active listings" (nothing has been submitted yet).
- Append `?view=intake` to the URL. You should see the intake form.
- Submit a test listing through the form, then check the `Submissions` sheet for the new row, including a populated `token` column.
- Take that row's `token` value and open `<deployment URL>?token=<value>`. You should see the token portal for that submission.
- In the Apps Script editor, go to **Triggers** (the clock icon in the left sidebar) and confirm `dailySubmissionMaintenance` and `runAuditFlags` are both listed as daily triggers.
- Submit a second test listing in the opposite direction for the same category (one Donate, one Receive), and confirm both submitters receive a match notification email.

## 14. Ongoing operation

- **Check View > Executions in the Apps Script editor periodically**, especially after any code change. This is the primary way to see a stack trace if a trigger or a form submission failed.
- **Watch your email quota** if submission volume grows. See section 10.
- **`ITEM_CATEGORIES` and `SERVICE_AREA_CITIES` can be edited at any time** and take effect on the next `clasp push`; no other migration step is needed.
- **`ItemConfig.js`'s per-category field definitions can be edited independently of the category list**, as long as the array length and position stay matched to `ITEM_CATEGORIES`. Adding a new question to an existing category's form does not require touching `SiteConfig.js` at all.

## 15. Troubleshooting

**Visitors get a Google Drive style "unable to open the file" error instead of the home page.** Check `appsscript.json`'s `webapp` block still has `"access": "ANYONE_ANONYMOUS"`. Deploying via `clasp deploy` with no manifest present, or with that block removed, silently defaults to a developer-only-access deployment.

**A legitimate deployment URL shows "page not found," but only for you.** If you are signed into multiple Google accounts in the same browser, Google sometimes inserts a `/u/N/` account-selector segment into the URL based on which account is currently active in that tab. Try an incognito window, or manually remove any `/u/N/` segment from the URL, before assuming the deployment itself is broken.

**A code change does not seem to be live.** Confirm you both pushed and deployed. `clasp push` updates the editor's HEAD copy only; a previously created deployment keeps serving whatever version it was pinned to until you run `clasp deploy -i <deploymentId> -d "<description>"` against that same deployment ID.

**`getItemConfig()` throws an "out of sync" error.** `ITEM_CATEGORIES` (`SiteConfig.js`) and `ITEM_FIELD_DEFS` (`ItemConfig.js`) have a different number of entries. Every category needs exactly one field-def block, in the same order; see section 6.

**A trigger stopped running.** Apps Script triggers are tied to the account that created them, and do not automatically transfer if a project is copied or if ownership changes hands. Re-run `setupNewInstance()`, which reinstalls any missing trigger without duplicating an existing one.
