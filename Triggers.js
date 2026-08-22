// Time-based trigger functions for the new flat-schema Submissions sheet.
// Neither of these is wired to a trigger automatically — install them from
// the Apps Script editor (Triggers > Add Trigger) as daily time-based
// triggers once you're ready.

// Expires listings past the configured expiration window, and sends a
// "still looking?" nudge (linking to the token portal, per Phase 3 item 3)
// at 1/3 and 2/3 of the way to expiration, scaled off getExpirationDays()
// rather than fixed 30/60/90-day marks - so a change to the configured
// expiration window (Config.js) automatically re-times these instead of
// drifting out of proportion with it.
function dailySubmissionMaintenance() {
  const sheet = getOrCreateSubmissionsSheet();
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  const expirationDays = getExpirationDays();
  const nudgeDays = [Math.round(expirationDays / 3), Math.round(expirationDays * 2 / 3)];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[colIndex("opt_out_status")] !== OPT_OUT_ACTIVE) continue;

    const ageInDays = Math.floor((now - new Date(row[colIndex("timestamp")])) / (1000 * 60 * 60 * 24));

    if (ageInDays > expirationDays) {
      setOptOutStatus(sheet, i + 1, OPT_OUT_EXPIRED);
      continue;
    }

    // Computed relative to the configured expiration window, and asks the
    // submitter to resubmit rather than just "still looking?" - this is the
    // last chance to act before the listing flips to Expired. Fires
    // alongside the 1/3 and 2/3 nudges below rather than replacing them.
    if (ageInDays === expirationDays - 7) {
      sendExpiringSoonEmail(row, data);
    }

    if (nudgeDays.indexOf(ageInDays) !== -1) {
      sendStaleNudgeEmail(row, data);
    }
  }
}

// Reuses Matching.js's findActiveMatches() - the same matching logic that
// computes initial_match_count at submission time - rather than a second,
// independent count, so a nudge email can never disagree with what the
// matching system itself would show.
function currentMatchCountFor(row, data) {
  const itemType = row[colIndex("item_type")];
  const targetDirection = row[colIndex("donate_or_receive")] === "Donate" ? "Receive" : "Donate";
  return findActiveMatches(data, itemType, targetDirection).length;
}

function sendExpiringSoonEmail(row, data) {
  const label = itemLabel(row);
  const intakeFormUrl = getIntakeFormUrl();
  const optOutUrl = ScriptApp.getService().getUrl() + "?token=" + row[colIndex("token")];
  const matchCount = currentMatchCountFor(row, data);
  const subject = `Action needed: your ${label} listing expires in 7 days`;
  const body = `<p>Hello ${row[colIndex("first_name")]},</p>
                <p>Your listing for <b>${label}</b> expires in 7 days.</p>
                <p>There ${matchCount === 1 ? "is" : "are"} currently <b>${matchCount}</b> active ${matchCount === 1 ? "match" : "matches"} for it.</p>
                <p>To keep appearing in the system, please resubmit here: <a href="${intakeFormUrl}">${intakeFormUrl}</a></p>
                <hr><p style="color:gray;font-size:12px;"><a href="${optOutUrl}">Opt Out Form</a></p>
                <p>${getOrgName()}</p>`;
  MailApp.sendEmail({ to: row[colIndex("email")], subject: subject, htmlBody: body });
}

function sendStaleNudgeEmail(row, data) {
  const label = itemLabel(row);
  const portalUrl = ScriptApp.getService().getUrl() + "?token=" + row[colIndex("token")];
  const matchCount = currentMatchCountFor(row, data);
  const subject = `Still looking for your ${label}?`;
  const body = `<p>Hello ${row[colIndex("first_name")]},</p>
                <p>Your listing for <b>${label}</b> has been active for a while. Let us know if you're still looking:</p>
                <p>There ${matchCount === 1 ? "is" : "are"} currently <b>${matchCount}</b> active ${matchCount === 1 ? "match" : "matches"} for it.</p>
                <p><a href="${portalUrl}">Visit your listing</a> to confirm it's still active or remove it.</p>
                <hr><p style="color:gray;font-size:12px;"><a href="${portalUrl}">Opt Out Form</a></p>
                <p>${getOrgName()}</p>`;
  MailApp.sendEmail({ to: row[colIndex("email")], subject: subject, htmlBody: body });
}

// Manual-review-only audit pass (build plan Phase 3). Never modifies
// Submissions, and never acts on a flag itself.
const AUDIT_NOTIFICATION_THRESHOLD = 3;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// successful_match may hold an actual submission_id (set via the token-portal
// "report outcome" flow, or the opt-out page) or free text ("Yes (not sure
// who)", "No") — only the former is something MatchLog can actually verify.
// Without this guard, every free-text row would false-positive as "unverified."
function looksLikeToken(value) {
  return typeof value === "string" && UUID_SHAPE.test(value);
}

function runAuditFlags() {
  const flags = auditNewSystemFlags();

  if (flags.length) {
    const auditSheet = getOrCreateAuditFlagsSheet();
    auditSheet.getRange(auditSheet.getLastRow() + 1, 1, flags.length, AUDITFLAGS_COLUMNS.length).setValues(flags);
  }
  return { flagsWritten: flags.length };
}

function auditNewSystemFlags() {
  const sheet = getOrCreateSubmissionsSheet();
  const data = sheet.getDataRange().getValues();
  const now = new Date();
  const flags = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const submissionId = row[colIndex("submission_id")];
    const status = row[colIndex("opt_out_status")];
    const notificationCount = parseInt(row[colIndex("notification_count")], 10) || 0;

    // (a) many notifications sent, listing still active with no response
    if (status === OPT_OUT_ACTIVE && notificationCount >= AUDIT_NOTIFICATION_THRESHOLD) {
      flags.push([now, submissionId, "unresponsive_after_notifications",
        `${notificationCount} notifications sent, no response yet.`]);
    }

    // (b) reported match outcome doesn't correspond to anyone MatchLog shows
    // was actually notified about this submission
    const successfulMatch = row[colIndex("successful_match")];
    if (status === OPT_OUT_OPTED_OUT && looksLikeToken(successfulMatch)) {
      const wasNotifiedAboutThem = notifiedPartiesFor(submissionId)
        .some(p => p.submissionId === successfulMatch);
      if (!wasNotifiedAboutThem) {
        flags.push([now, submissionId, "unverified_match_outcome",
          `Reported match with "${successfulMatch}" but MatchLog shows no notification linking them.`]);
      }
    }
  }
  return flags;
}
