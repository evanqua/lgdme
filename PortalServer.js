// Token-based self-service portal. Reuses the exact token minted at
// submission time (see WebApp.js) — one token per Submissions row, one link
// format (?token=...) across every outbound email. Routed to from WebApp.js's
// doGet when a token param is present; the intake form (Index.html) stays
// the no-param default.

function findSubmissionByToken(token) {
  const sheet = getOrCreateSubmissionsSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][colIndex("token")] === token) {
      return { sheet: sheet, row: data[i], rowIndex: i + 1, data: data };
    }
  }
  return null;
}

// Used by the generic (token-less) opt-out page (OptOutServer.js's
// optOutInternal) for someone who submitted through the intake form but
// doesn't have their token link handy. Walks backward, most recent wins, so
// a resubmitted listing is the one affected if there's more than one row for
// the same email + item.
function findSubmissionsRowByEmailAndItem(email, itemType) {
  const sheet = getOrCreateSubmissionsSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (normalize(row[colIndex("email")]) === normalize(email) &&
      normalize(row[colIndex("item_type")]) === normalize(itemType)) {
      return { sheet: sheet, row: row, rowIndex: i + 1 };
    }
  }
  return null;
}

// Shared by OptOutServer.js's generic opt-out page and this file's own
// portalReportOutcome/portalReportNoMatch below — same "opt out + record
// outcome + optional feedback" shape either way.
function optOutSubmissionsRow(found, wasSuccessful, matchedContact, feedback) {
  // Caller (OptOutServer.js's optOutInternal) already enforces matchedContact
  // being present whenever wasSuccessful is true — see its required-field
  // check. matchedContact is a raw submission_id (or the MATCH_VALUE_UNSURE
  // sentinel) - see resolveMatchedSubmissionAndNotify below.
  const successValue = wasSuccessful
    ? resolveMatchedSubmissionAndNotify(matchedContact.toString().trim(), found.row[colIndex("first_name")] || found.row[colIndex("email")], found.row[colIndex("item_type")])
    : "No";
  setOptOutStatus(found.sheet, found.rowIndex, OPT_OUT_OPTED_OUT);
  found.sheet.getRange(found.rowIndex, colIndex("successful_match") + 1).setValue(successValue);
  applyFeedback(found.sheet, found.rowIndex, feedback);
  return successValue;
}

// Resolves a matchedSubmissionId (or the MATCH_VALUE_UNSURE sentinel,
// Schema.js, for "not sure/don't remember") into the string to store in the
// *reporter's* own successful_match cell, opting out and notifying the
// matched party's own row as a side effect (unless the reporter wasn't sure
// who it was, in which case there's no row to act on). Shared by
// optOutSubmissionsRow above and portalReportOutcomeInternal below, so both
// entry points into "I found a match" behave identically.
function resolveMatchedSubmissionAndNotify(matchedSubmissionId, notifierIdentifier, itemName) {
  if (!matchedSubmissionId || matchedSubmissionId === MATCH_VALUE_UNSURE) {
    return "Yes (not sure who)";
  }
  optOutSubmissionsMatchedPartyAndNotify(matchedSubmissionId, notifierIdentifier, itemName);
  // Kept as the raw submission_id (rather than a human label) so this cell
  // stays consistent with how portalReportOutcome records a confirmed match —
  // see Triggers.js's looksLikeToken()-gated audit check.
  return matchedSubmissionId;
}

// Opts out the reported matched party's own Submissions row (unless already
// opted out) and emails them that they've been opted out on someone else's
// behalf, with a "reply to the contact email if this is a mistake" note
// (sendPartnerOptOutNotification, below).
function optOutSubmissionsMatchedPartyAndNotify(submissionId, notifierIdentifier, itemName) {
  const sheet = getOrCreateSubmissionsSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[colIndex("submission_id")] !== submissionId) continue;
    if (row[colIndex("opt_out_status")] !== OPT_OUT_OPTED_OUT) {
      setOptOutStatus(sheet, i + 1, OPT_OUT_OPTED_OUT);
      sheet.getRange(i + 1, colIndex("successful_match") + 1).setValue("Yes");
      sendPartnerOptOutNotification(row[colIndex("email")], row[colIndex("first_name")], notifierIdentifier, itemName);
    }
    return true;
  }
  return false;
}

// Notifies a matched partner that the person they were matched with has been
// opted out of their item, with a "contact us if this is a mistake" note.
function sendPartnerOptOutNotification(recipientEmail, recipientName, optedOutBy, itemName) {
  const subject = `Notification: Opt-Out for ${itemName}`;
  const body = `<p>Hello ${recipientName || ""},</p>
                <p>You have been opted out of your listing for <b>${itemName}</b> on behalf of <b>${optedOutBy}</b>.</p>
                <p>If you believe this is a mistake, please reach out to <a href="mailto:${getContactEmail()}">${getContactEmail()}</a>.</p>
                <p>${getOrgName()}</p>`;
  MailApp.sendEmail({ to: recipientEmail, subject: subject, htmlBody: body });
}

// Sends a confirmation if a matching submission was found, or a
// troubleshooting email (with a link back to the opt-out page) if not.
// Shared by OptOutServer.js's optOutInternal.
function sendOptOutConfirmation(email, item, found) {
  let subject, body;

  if (found) {
    subject = `Confirmation: Opt-Out for ${item}`;
    const intakeFormUrl = getIntakeFormUrl();
    body = `<p>Hello,</p>
            <p>This email confirms that we have located your record and you have successfully opted out of notifications for <b>${item}</b>.</p>
            <p>Your listing is now inactive. If you have a different item to list, you can resubmit here: <a href="${intakeFormUrl}">${intakeFormUrl}</a></p>`;
  } else {
    subject = `Action Required: Opt-Out Unsuccessful`;
    const optOutPageUrl = ScriptApp.getService().getUrl() + "?view=optout";
    body = `<p>Hello,</p>
            <p>We received an opt-out request for <b>${item}</b>, but <b>we were unable to find a matching submission in our records.</b></p>
            <p>To stop notifications and remove your listing, please <a href="${optOutPageUrl}">try again here</a> ensuring you use the <b>exact email</b> and <b>item name</b> from your original submission.</p>`;
  }

  MailApp.sendEmail({ to: email, subject: subject, htmlBody: body + `<p>${getOrgName()}</p>` });
}

// Feedback is optional and shared by every "closing" action on this page
// (report outcome, report no-match, confirm receipt) — see Portal.html's
// single feedback fieldset.
function applyFeedback(sheet, rowIndex, feedback) {
  if (feedback) {
    sheet.getRange(rowIndex, colIndex("feedback") + 1).setValue(feedback);
  }
}

// Display label for a Submissions row shown as a match option — "First
// (email, phone)" if phone sharing was consented to, else "First (email)".
// Shared by notifiedPartiesFor below (Portal.html's dropdowns) and
// OptOutServer.js's previewOptOutMatches (the generic opt-out page's match
// preview).
function submissionMatchLabel(row) {
  const firstName = row[colIndex("first_name")];
  const email = row[colIndex("email")];
  const phone = row[colIndex("phone_share_consent")] && row[colIndex("phone")] ? row[colIndex("phone")] : "";
  return phone ? `${firstName} (${email}, ${phone})` : `${firstName} (${email})`;
}

function findSubmissionById(submissionId) {
  const sheet = getOrCreateSubmissionsSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][colIndex("submission_id")] === submissionId) return data[i];
  }
  return null;
}

// Read-only view model embedded into Portal.html by WebApp.js's doGet.
function buildPortalViewModel(token) {
  const found = findSubmissionByToken(token);
  if (!found) return { found: false };

  const row = found.row;
  const direction = row[colIndex("donate_or_receive")];

  const notifiedParties = notifiedPartiesFor(row[colIndex("submission_id")]);

  const now = new Date();
  const ageInDays = Math.floor((now - new Date(row[colIndex("timestamp")])) / (1000 * 60 * 60 * 24));
  const staleCheckDays = [30, 60, 90];
  const isStale = row[colIndex("opt_out_status")] === OPT_OUT_ACTIVE &&
    staleCheckDays.some(d => ageInDays >= d);

  return {
    found: true,
    token: token,
    submissionId: row[colIndex("submission_id")],
    firstName: row[colIndex("first_name")],
    itemLabel: itemLabel(row),
    optOutStatus: row[colIndex("opt_out_status")],
    directionIsDonate: direction === "Donate",
    ageInDays: ageInDays,
    isStale: isStale,
    notifiedParties: notifiedParties
  };
}

// Every distinct party MatchLog shows was included in a notification email
// sent to this submission_id — the source list for the portal's "who did
// you match with" / "confirm receipt from" dropdowns.
function notifiedPartiesFor(submissionId) {
  const matchLogSheet = getOrCreateMatchLogSheet();
  const data = matchLogSheet.getDataRange().getValues();
  const seen = {};
  const parties = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[matchLogColIndex("submission_id")] !== submissionId) continue;
    const matchedId = row[matchLogColIndex("matched_submission_id")];
    if (seen[matchedId]) continue;
    seen[matchedId] = true;

    // Re-look-up the matched row (rather than trusting MatchLog's stored
    // email alone) so the dropdown can show first name + phone too — falls
    // back to the logged email if that row is somehow gone by now.
    const matchedRow = findSubmissionById(matchedId);
    const label = matchedRow ? submissionMatchLabel(matchedRow) : row[matchLogColIndex("matched_email")];
    parties.push({ submissionId: matchedId, label: label });
  }
  return parties;
}

// --- Actions, called from Portal.html via google.script.run. Each is
// wrapped in try/catch (mirrors submitIntake in WebApp.js) so a server-side
// exception comes back as a readable {success:false, error} instead of an
// opaque google.script.run failure. ---

// "Still looking? Yes" renews the notification window. There's no "No"
// branch here anymore — that used to opt out directly with no outcome
// recorded, leaving successful_match permanently blank (never asked whether
// they'd actually found a match). "No" is now handled client-side by
// Portal.html, which points the visitor at the existing outcomeCard
// (portalReportOutcome/portalReportNoMatch below) so every opt-out records
// an outcome and gets a chance at feedback.
function portalStaleResponse(token) {
  try {
    return portalStaleResponseInternal(token);
  } catch (err) {
    console.error(`portalStaleResponse failed: ${err && err.stack ? err.stack : err}`);
    return { success: false, error: `Server error: ${err && err.message ? err.message : err}` };
  }
}

function portalStaleResponseInternal(token) {
  const found = findSubmissionByToken(token);
  if (!found) return { success: false, error: "Invalid or expired link." };

  const newExpiry = new Date(Date.now() + getExpirationDays() * 24 * 60 * 60 * 1000);
  found.sheet.getRange(found.rowIndex, colIndex("notification_expiry") + 1).setValue(newExpiry);
  return { success: true, renewed: true };
}

function portalReportOutcome(token, matchedSubmissionId, feedback) {
  try {
    return portalReportOutcomeInternal(token, matchedSubmissionId, feedback);
  } catch (err) {
    console.error(`portalReportOutcome failed: ${err && err.stack ? err.stack : err}`);
    return { success: false, error: `Server error: ${err && err.message ? err.message : err}` };
  }
}

function portalReportOutcomeInternal(token, matchedSubmissionId, feedback) {
  const found = findSubmissionByToken(token);
  if (!found) return { success: false, error: "Invalid or expired link." };
  if (!matchedSubmissionId) return { success: false, error: "Please select who you matched with." };

  // Opts out and notifies the matched party's own row too (unless
  // MATCH_VALUE_UNSURE), so both sides of a confirmed match close out
  // together. A no-op if that row is already opted out, so whichever side
  // reports second doesn't send a duplicate notification.
  const successValue = resolveMatchedSubmissionAndNotify(matchedSubmissionId, found.row[colIndex("first_name")] || found.row[colIndex("email")], found.row[colIndex("item_type")]);

  setOptOutStatus(found.sheet, found.rowIndex, OPT_OUT_OPTED_OUT);
  found.sheet.getRange(found.rowIndex, colIndex("successful_match") + 1).setValue(successValue);
  applyFeedback(found.sheet, found.rowIndex, feedback);
  return { success: true };
}

// Counterpart to portalReportOutcome above for someone who never matched at
// all — previously the only way to close out a listing from this page was
// to pick a name from the notified-parties dropdown, which had no answer for
// "no one." Mirrors the opt-out page's existing Yes/No match-outcome
// question (OptOut.html), which already supports this.
function portalReportNoMatch(token, feedback) {
  try {
    return portalReportNoMatchInternal(token, feedback);
  } catch (err) {
    console.error(`portalReportNoMatch failed: ${err && err.stack ? err.stack : err}`);
    return { success: false, error: `Server error: ${err && err.message ? err.message : err}` };
  }
}

function portalReportNoMatchInternal(token, feedback) {
  const found = findSubmissionByToken(token);
  if (!found) return { success: false, error: "Invalid or expired link." };

  setOptOutStatus(found.sheet, found.rowIndex, OPT_OUT_OPTED_OUT);
  found.sheet.getRange(found.rowIndex, colIndex("successful_match") + 1).setValue("No");
  applyFeedback(found.sheet, found.rowIndex, feedback);
  return { success: true };
}

// Recipient-side only: confirming receipt is what triggers the (currently
// placeholder-worded) donation receipt. See generateDonationReceipt below.
function portalConfirmReceipt(token, matchedSubmissionId, feedback) {
  try {
    return portalConfirmReceiptInternal(token, matchedSubmissionId, feedback);
  } catch (err) {
    console.error(`portalConfirmReceipt failed: ${err && err.stack ? err.stack : err}`);
    return { success: false, error: `Server error: ${err && err.message ? err.message : err}` };
  }
}

function portalConfirmReceiptInternal(token, matchedSubmissionId, feedback) {
  const found = findSubmissionByToken(token);
  if (!found) return { success: false, error: "Invalid or expired link." };
  if (found.row[colIndex("donate_or_receive")] !== "Receive") {
    return { success: false, error: "Only the recipient of a match can confirm receipt." };
  }
  if (!matchedSubmissionId) return { success: false, error: "Please select which listing you received this from." };

  // Confirming receipt names a specific donor (the receipt is generated for
  // them), so also opt out and notify their row — same "both sides of a
  // confirmed match close out together" behavior as portalReportOutcome
  // above. A no-op if they're already opted out.
  optOutSubmissionsMatchedPartyAndNotify(matchedSubmissionId, found.row[colIndex("first_name")] || found.row[colIndex("email")], found.row[colIndex("item_type")]);

  setOptOutStatus(found.sheet, found.rowIndex, OPT_OUT_OPTED_OUT);
  found.sheet.getRange(found.rowIndex, colIndex("successful_match") + 1).setValue(matchedSubmissionId);
  applyFeedback(found.sheet, found.rowIndex, feedback);

  const receiptUrl = generateDonationReceipt(found.row, matchedSubmissionId);
  return { success: true, receiptUrl: receiptUrl };
}
