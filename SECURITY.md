# Security Policy

## Contents

1. [Supported versions](#1-supported-versions)
2. [Reporting a vulnerability](#2-reporting-a-vulnerability)
3. [Security model of a deployed instance](#3-security-model-of-a-deployed-instance)
4. [The token portal](#4-the-token-portal)
5. [Personal information handling](#5-personal-information-handling)
6. [Uploaded photos](#6-uploaded-photos)
7. [Web App access model](#7-web-app-access-model)
8. [Google account permissions](#8-google-account-permissions)
9. [Email](#9-email)
10. [Dependency footprint](#10-dependency-footprint)
11. [Known limitations](#11-known-limitations)

## 1. Supported versions

This project is pre-1.0 (see `README.md`'s Versioning section). There is one supported line: the latest commit on `main`. Older tagged versions do not receive security fixes; upgrade to the current `main` if you are running an older tag and a fix affects you.

## 2. Reporting a vulnerability

Do not open a public GitHub issue for a security vulnerability, since that discloses it before a fix is available. Use one of the two private channels below instead.

**Preferred: GitHub's private vulnerability reporting.** This repository has it enabled. Go to the Security tab, then Report a vulnerability, to open a private advisory that only the maintainer can see. This is the best option since it keeps the whole conversation, and any fix, attached to a proper security advisory.

**Alternative: email.** Contact evanqua@berkeley.edu directly. Include what you found, the steps to reproduce it, and its impact if you can. Expect an acknowledgment within a few days; this is a small, volunteer-maintained project, not a company with a dedicated security team.

If you fork this repository for your own organization's deployment, replace the email address above with your own maintainer's contact before relying on this section, since a security report sent to the address above will reach the upstream template's maintainer, not you.

If you are running your own deployment of this system and you discover a vulnerability that affects your specific instance's data (not the codebase itself), treat it as an operational incident for your organization first: rotate whatever is exposed, and consider whether affected submitters need to be notified, independent of whether you also report the underlying code issue upstream.

## 3. Security model of a deployed instance

There is no username and password anywhere in this system, by design. The public parts (the home page, the intake form, the token-less opt-out page) require no identity at all. The parts that are specific to one submission (the self-service portal) are protected by a capability token in the URL, not by a login. Understanding that model is the starting point for reasoning about this system's security.

## 4. The token portal

Every submission is assigned a random UUID (`token`) at the moment it is created, and that same token is reused in every subsequent email about that submission. Anyone who has the token can open `?token=<value>` and act on that submission: report a match outcome, confirm receipt, or renew a listing. There is no additional check beyond possessing the token.

This means the token is a bearer secret, in the same sense as a session cookie or an API key. Its security rests entirely on:

- **Being unguessable.** It is a randomly generated UUID (`Utilities.getUuid()`), not a sequential ID or anything derived from the submitter's data.
- **Only reaching the intended recipient.** It is sent by email, to the address the submitter themselves provided at submission time, and nowhere else in the UI exposes another person's token.
- **Never being logged somewhere with a different audience than the intended recipient.** If you extend this codebase, treat a `token` value the way you would treat a password: do not put it in analytics events, error messages shown to someone other than that submission's owner, or any log a broader group of people can read.

There is no token expiration or rotation in the current implementation; a token remains valid for as long as its `Submissions` row exists, even past the point the listing itself has expired (an expired listing's token still opens the portal, just showing the expired state, since a submitter reasonably still needs to be able to see and manage their own past submission).

## 5. Personal information handling

A `Submissions` row includes the submitter's email, first name, last name, city, and phone number. Only a subset of this is ever shown to a matched party:

- Email is always shown to a match, since it is the primary way two matched parties are expected to make contact.
- First name and city are shown to a match.
- Phone number is only shown to a match if the submitter checked `phone_share_consent`.
- Last name is never shown to a matched party; it exists only for the organization's own internal records.

Anyone with edit access to the underlying Google Sheet (see section 8) can see the raw, unfiltered data for every row, including whatever a matched party would not otherwise see. Limit Sheet access to people who genuinely need it, the same way you would limit access to any other system holding this much personal contact information.

The public home page is deliberately built to never show individual listings, exact counts, or photos, specifically to make the data harder to scrape and to keep submitters' information from being exposed to the general public before an actual match exists. If you extend the home page or the analytics view, preserve this constraint rather than adding a feature that surfaces individual-listing data publicly.

## 6. Uploaded photos

A donor-submitted photo is uploaded to a Drive folder in the deploying account's Drive, and the individual file is set to "anyone with the link can view." This means the photo is not protected by a login, only by the obscurity of its URL. The URL is included in match notification emails sent to the matched recipient. Anyone who obtains that URL by another means (forwarded email, a compromised inbox, a leaked log) could view the photo without further authentication. Do not treat a photo's Drive URL as access-controlled beyond that.

## 7. Web App access model

The deployment is configured (`appsscript.json`, `access: "ANYONE_ANONYMOUS"`) so that anyone can load the Web App without signing in. This is required for the public intake form and home page to work as intended, but it also means there is no platform-level authentication boundary at all; every route this codebase adds is public unless it is protected by something the codebase itself checks, such as a token. Keep this in mind if you add a new route: it is reachable by anyone with the URL, by default.

The `?view=analytics` route is not linked from anywhere in the public UI and carries no credential check. This is obscurity, not access control. Do not put anything in the analytics view that would be a real problem if someone guessed or was given that URL.

## 8. Google account permissions

The script runs as whichever Google account deployed it (`executeAs: "USER_DEPLOYING"` in `appsscript.json`), not as the visiting user. The first time you run `setupNewInstance()`, or the first time any function that needs a new scope executes, Apps Script prompts that account's owner to authorize the permissions the code actually uses:

- **Google Sheets**, to read and write `Submissions`, `MatchLog`, and `AuditFlags`.
- **Gmail (send only)**, to send notification, nudge, and receipt emails via `MailApp`.
- **Google Drive**, to store and share uploaded photos, and to generate the PDF donation receipt.
- **External network access is not used.** This codebase makes no outbound HTTP requests to any third-party service; nothing here sends your data anywhere outside Google's own infrastructure.

Whoever holds that Google account's credentials effectively holds full read and write access to every submission ever made through the system. Protect that account's login the same way you would protect a database administrator's credentials.

## 9. Email

Notification emails are sent from the deploying account's own address, using Google's own outbound infrastructure (see `SETUP.md` section 10 for quota details). Because Google is the sending infrastructure and the sending account is a real, authenticated Google account, this system does not introduce its own email spoofing risk beyond whatever risk already exists on that account.

## 10. Dependency footprint

The deployed application has zero runtime dependencies. There is no `npm install` step for what actually runs in Apps Script, and therefore no third-party package supply chain to audit for the deployed code. The local `test/` suite (not deployed) also has zero dependencies, using only Node's built-in `node:test` module.

## 11. Known limitations

- **No token expiration or rotation**, as described in section 4.
- **No rate limiting on the public intake form.** Anyone can submit repeatedly. There is no CAPTCHA or similar protection in this codebase.
- **No audit log of who viewed what.** `MatchLog` records what was shown to whom by the system itself, but there is no record of who has actually opened a given portal link.
- **No automated backup.** See `SETUP.md` section 11 for how to back up the Spreadsheet manually.

If you find a gap not listed here, that is exactly what section 2 is for.
