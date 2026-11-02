// Generic, token-less opt-out page (Web App's ?view=optout route) — the
// full in-app replacement for the retired native Opt-Out Google Form. Looks
// a submitter's row up in "Submissions" (Schema.js) by email + item, the
// same way PortalServer.js's token-based portal looks a row up by token;
// this is the token-less path for someone without a recent notification
// email handy (or whose email predates the token portal).
//
// A ?token= value reaching this page (WebApp.js's doGet) means the token
// didn't match anything in Submissions either (findSubmissionByToken,
// PortalServer.js, always gets first try) — always "not found" here.
//
// This used to also search a legacy "Large DME Form" sheet from a since-
// retired native Google Form intake system, sharing the Token/MatchLog
// scheme with the new system per CLAUDE.md's "one consistent link format"
// instruction. That legacy system (Code.js) has been fully retired — the
// native Form is closed and no more legacy submissions will ever arrive —
// so this file now only ever reads/writes "Submissions".

function buildOptOutViewModel(token) {
  if (!token) {
    return { found: true, generic: true, itemOptions: ITEM_CATEGORIES }; // SiteConfig.js
  }
  return { found: false, generic: false };
}

// Gated on optOutSubmitterRowExists — without that check, anyone could pick
// an arbitrary direction/item combo here and see every current match's name,
// email, and phone number without ever having submitted anything themselves.
// verified:false (rather than an error) tells OptOut.html to show the
// "we couldn't find a submission" note instead of a match list.
function previewOptOutMatches(direction, item, email) {
  try {
    return previewOptOutMatchesInternal(direction, item, email);
  } catch (err) {
    console.error(`previewOptOutMatches failed: ${err && err.stack ? err.stack : err}`);
    return { success: false, error: `Server error: ${err && err.message ? err.message : err}`, verified: false, matches: [] };
  }
}

function optOutSubmitterRowExists(email, direction, item) {
  const normalizedEmail = normalize(email);
  const normalizedItem = normalize(item);
  if (!normalizedEmail || !normalizedItem || (direction !== "Donate" && direction !== "Receive")) return false;

  const sheet = getOrCreateSubmissionsSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[colIndex("donate_or_receive")] !== direction) continue;
    if (normalize(row[colIndex("email")]) === normalizedEmail && normalize(row[colIndex("item_type")]) === normalizedItem) return true;
  }
  return false;
}

// Opted-out rows of the opposite direction whose owner reported a match but
// did not know who with, closed within the last UNSURE_MATCH_VISIBLE_DAYS.
// For the opt-out match dropdown only; never feed this into an email.
function findRecentlyClosedUnsureMatches(data, itemType, direction) {
  const cutoff = Date.now() - UNSURE_MATCH_VISIBLE_DAYS * 24 * 60 * 60 * 1000;
  const matches = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[colIndex("item_type")] !== itemType) continue;
    if (row[colIndex("donate_or_receive")] !== direction) continue;
    if (row[colIndex("opt_out_status")] !== OPT_OUT_OPTED_OUT) continue;
    if ((row[colIndex("successful_match")] || "").toString().trim() !== MATCH_TEXT_UNSURE) continue;
    const closedAt = new Date(row[colIndex("opt_out_timestamp")]).getTime();
    if (!closedAt || closedAt < cutoff) continue;
    matches.push(row);
  }
  return matches;
}

function previewOptOutMatchesInternal(direction, item, email) {
  if (!optOutSubmitterRowExists(email, direction, item)) {
    return { success: true, verified: false, matches: [] };
  }

  const targetAction = direction === "Donate" ? "Receive" : "Donate";
  const sheet = getOrCreateSubmissionsSheet();
  const data = sheet.getDataRange().getValues();
  // Dropdown only: recently opted-out people who did not know who they
  // matched with stay selectable for UNSURE_MATCH_VISIBLE_DAYS. Emails use
  // findActiveMatches alone, so these people are never shown as contacts.
  const selectable = findActiveMatches(data, item, targetAction)
    .concat(findRecentlyClosedUnsureMatches(data, item, targetAction));
  const matches = selectable.map(row => ({
    value: row[colIndex("submission_id")],
    label: submissionMatchLabel(row)
  }));

  return { success: true, verified: true, matches: matches };
}

// Full opt-out submission — replaces the native Opt-Out Form entirely.
// payload: { email, direction, item, wasSuccessful, matchedContact, feedback }.
// matchedContact is a raw submission_id or the
// MATCH_VALUE_UNSURE sentinel (Schema.js), not free text — see
// resolveMatchedSubmissionAndNotify (PortalServer.js).
function optOut(payload) {
  try {
    return optOutInternal(payload || {});
  } catch (err) {
    console.error(`optOut failed: ${err && err.stack ? err.stack : err}`);
    return { success: false, error: `Server error: ${err && err.message ? err.message : err}` };
  }
}

function optOutInternal(payload) {
  // matchedContact is a required dropdown pick (OptOut.html), not free text —
  // whenever someone reports success, they must have selected an actual
  // current match rather than leaving it blank.
  if (payload.wasSuccessful && !(payload.matchedContact || "").toString().trim()) {
    return { success: false, error: "Please select who you matched with." };
  }

  const email = (payload.email || "").trim();
  const item = (payload.item || "").trim();
  if (!email || !item) return { success: false, error: "Please fill in your email and which item you listed." };

  // Their most recent Active listing in the chosen direction, if any
  // (findOptOutRowIndex, PortalServer.js), so an older listing that's still
  // sending emails isn't skipped for a newer one that's already closed.
  const found = findSubmissionsRowByEmailAndItem(email, item, payload.direction);
  if (!found) {
    return {
      success: false,
      error: `We couldn't find a matching submission. Double-check the exact email and item from your original submission, or contact ${getContactEmail()}.`
    };
  }

  optOutSubmissionsRow(found, payload.wasSuccessful, (payload.matchedContact || "").toString().trim(), payload.feedback);
  sendOptOutConfirmation(email, item, true);

  return { success: true };
}
