# Setup

How to stand up your own instance of this system.

## 1. Clone the repo

```
git clone https://github.com/evanqua/lgdme.git
cd lgdme
```

## 2. Create a fresh Apps Script project

This repo is bound to one specific organization's Google Sheet/script (see `.clasp.json`'s `scriptId`). To run your own instance, create your own:

```
clasp create --type sheets --title "<Your Org> LgDME System"
```

This generates a new `.clasp.json` pointing at your own script + spreadsheet, and overwrites the one in this repo — do not commit the original `.clasp.json` over yours, or you'll be pointing at someone else's live project.

Push the code:

```
clasp push --force
```

(`--force` skips an interactive confirmation prompt that non-interactive shells can't answer; in an interactive terminal you can omit it.)

## 3. Fill in your org config

Open the project (`clasp open`) → **Project Settings → Script Properties**, and set:

| Property | Meaning | Default if unset |
|---|---|---|
| `ORG_NAME` | Shown in page titles, headers, and email signatures | `Your Organization LgDME System` |
| `CONTACT_EMAIL` | Shown wherever a "contact us" link appears | `contact@example.org` |
| `EXPIRATION_DAYS` | How long a listing stays active before expiring / triggering "still looking?" nudges | `60` |

You don't have to set these before step 4 — `setupNewInstance()` will seed them with the defaults above if you skip this, and you can edit them later. Just don't ship the placeholder defaults to your own users.

Separately, edit `SiteConfig.js` directly (these aren't Script Properties — they're code, since they're arrays, not single values) and `clasp push` again:

| Constant | Meaning |
|---|---|
| `SERVICE_AREA_CITIES` | Powers the intake form's city dropdown (`IntakeForm.html`). Ships empty — an empty list just means the dropdown only offers "Other" (free text), which still works, so this isn't a hard blocker, just worth filling in. |
| `ITEM_CATEGORIES` | The one place item category names live. Adding/renaming a category here also needs a matching entry in `ItemConfig.js`'s `ITEM_FIELD_DEFS` — see the comment at the top of that file. |

## 4. Run `setupNewInstance()` once

In the Apps Script editor, select `setupNewInstance` from the function dropdown (top toolbar) and click **Run**. The first run will prompt you to authorize the script — approve it (this is what lets it create sheets/triggers under your account).

This creates the `Submissions`, `MatchLog`, and `AuditFlags` sheets with correct headers, seeds any unset config properties from the table above, and installs two daily time-based triggers (`dailySubmissionMaintenance`, `runAuditFlags`). It's idempotent — safe to re-run if you're not sure it worked.

## 5. Deploy the Web App

`setupNewInstance()` cannot do this part — Apps Script's API doesn't expose "create a Web App deployment" the way it exposes sheets/triggers. Either:

- **Apps Script editor**: Deploy → New deployment → type "Web app" → Execute as **Me**, Who has access **Anyone** → Deploy.
- **clasp**: `clasp deploy -d "Initial deployment"`, then `clasp deployments` to get the deployment ID and build the URL yourself: `https://script.google.com/macros/s/<deploymentId>/exec`.

Either way, confirm the deployment's access is set to **Anyone** (not "Anyone with a Google account" or restricted to your domain) if you want it usable without a Google login — `appsscript.json`'s `webapp` block (`access: "ANYONE_ANONYMOUS"`) is meant to enforce this automatically, but it's worth checking directly in the deployment settings if visitors report an access error.

**A gotcha you will hit if you add new files**: Apps Script shares one filename namespace across script (`.js`/`.gs`) and HTML files regardless of type. A `Foo.js` and a `Foo.html` in the same project collide and `clasp push` rejects it. This repo works around it with paired names like `PortalServer.js` / `Portal.html` — follow that convention for anything new.

## 6. Confirm it worked

- Open the bare deployment URL → should show the public home page, with all your `ITEM_CATEGORIES` listed as "No active listings" (nothing submitted yet).
- Append `?view=intake` → should show the intake form.
- Submit a test listing through the form, then check the `Submissions` sheet for the new row, including a populated `token` column.
- Take that row's `token` value and open `<deployment URL>?token=<value>` → should show the token portal for that submission.
- In the Apps Script editor → **Triggers** (clock icon, left sidebar) → confirm `dailySubmissionMaintenance` and `runAuditFlags` are listed as daily triggers.

## What this repo intentionally does NOT set up for you

- **Receipt wording** (`Receipts.js`) ships with placeholder text — replace it with your org's real donation-receipt/tax-acknowledgment language before recipients see it for real.
- **Consent/waiver wording** (`IntakeForm.html`'s "Consent / waiver" fieldset) ships with obvious placeholder text — replace it with your own reviewed legal language covering what gets shared with a match, who else can see submissions, and what liability your organization does or doesn't assume, before collecting any real submissions.
