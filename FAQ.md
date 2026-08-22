# FAQ

Short answers to the questions that come up most before an organization decides whether to adopt this. For anything not covered here, email **evanqua@berkeley.edu**.

## Is this actually free?

Yes. The code is open source (AGPL-3.0), and it runs entirely on Google's own infrastructure (Sheets, Apps Script, Gmail, Drive), which is free for a personal Google account and typically already included in a nonprofit's existing Google Workspace subscription. There is no server to rent and no separate hosting bill. See `SETUP.md` section 2 for the one real cost tradeoff: a personal Gmail account has a lower daily email-sending limit than a Google Workspace account.

## Do I need a developer on staff to run this?

To set it up the first time, you need someone comfortable following a technical walkthrough (`SETUP.md`): creating a Google Cloud/Apps Script project, running a command-line tool, and clicking through a few configuration screens. No ongoing coding is required after that. Editing the item categories or organization name later is a matter of following documented steps, not writing new code.

## What is the actual ongoing workload once it is running?

Less than most people expect. Matching, notification emails, listing expiration, and stale-listing reminders all run automatically on a daily schedule. There is no dashboard to babysit and no queue to clear by hand. In practice, the main ongoing responsibility is not technical maintenance at all, it is making sure people in your service area actually know the system exists: outreach to potential donors and recipients, word of mouth, and keeping your organization's own links to the intake form current on your website or in your communications. A system nobody knows about will not generate matches no matter how well the code runs.

## Who owns the data?

You do. Every submission lives in a Google Sheet inside your own Google account or Workspace, not on any server this project runs. Nothing is sent to a third party. See `SECURITY.md` for the full data handling and permissions model.

## Can I change the equipment categories and questions to match what my organization actually accepts?

Yes. `SiteConfig.js`'s `ITEM_CATEGORIES` list and `ItemConfig.js`'s per-category form fields are exactly what you edit for this; see `SETUP.md` section 6. This repository ships with a short illustrative example, not a real category list, specifically so you replace it with your own.

## Do I have to be a 501(c)(3) or any particular kind of organization to use this?

No. Nothing in the code checks or cares what kind of organization is running it. Any group matching donors of physical items with people who need them can use this as-is.

## Can multiple organizations run this independently, in different regions?

Yes, and that is the intended use. Each organization deploys its own completely separate copy: its own Google Sheet, its own Apps Script project, its own Web App URL. There is no shared backend or shared data between deployments.

## Is there real, published data on how well this works?

Not yet, and it is worth being direct about why. ReCARES is currently pursuing IRB approval to study and publish outcome and usability data from its own deployment. Until that approval is in place, no success or usability data can be published in an academic context, so none is claimed here. What can be said honestly: this codebase runs ReCARES's real, live production matching system (see the README's "See it in action" section), not a prototype.

## Something is not working. What do I do?

Check `SETUP.md`'s Troubleshooting section first; it covers the handful of issues that come up most (deployment access errors, a code change not appearing live, a stopped trigger). If that does not resolve it, open a [GitHub issue](https://github.com/evanqua/lgdme/issues) with what you expected, what happened instead, and the steps to reproduce it (see `.github/ISSUE_TEMPLATE`). For anything you would rather not put in a public issue, or a general question about adopting this for your organization, email evanqua@berkeley.edu.

## I found a security problem. Where do I report it?

Not as a public issue. See `SECURITY.md` for private reporting options, including GitHub's private vulnerability reporting and a direct email contact.

## Can I get support from ReCARES directly?

ReCARES is a small, volunteer-driven nonprofit, not a vendor with a support contract to sell. That said, questions about adopting this for your own organization are genuinely welcome at evanqua@berkeley.edu. If this system has benefited your organization, consider supporting ReCARES's ongoing work; see the README's "Origin and support" section.
