// Matching + email logic for the new flat-schema Submissions sheet. Mirrors the
// behavior of Code.js's getMatches/notifyExistingSubscribers/sendSubmitterEmail,
// but keyed on item_type + donate_or_receive directly (no more parsing two
// separate donate/request item-name columns) and on submission_id instead of
// row position / timestamp string equality for self-exclusion.

function processNewSubmission(sheet, newRow) {
  const data = sheet.getDataRange().getValues();
  const itemType = newRow[colIndex("item_type")];
  const newDirection = newRow[colIndex("donate_or_receive")];
  const targetDirection = newDirection === "Donate" ? "Receive" : "Donate";

  const matchesForSubmitter = findActiveMatches(data, itemType, targetDirection);
  sheet.getRange(data.length, colIndex("initial_match_count") + 1).setValue(matchesForSubmitter.length);

  sendSubmitterEmail(newRow, matchesForSubmitter);
  logMatchesForRecipient(newRow, matchesForSubmitter, "initial");
  notifyExistingSubscribers(sheet, data, newRow);

  return { matchCount: matchesForSubmitter.length };
}

function findActiveMatches(data, itemType, direction) {
  const now = new Date();
  const matches = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[colIndex("item_type")] !== itemType) continue;
    if (row[colIndex("donate_or_receive")] !== direction) continue;
    if (row[colIndex("opt_out_status")] !== OPT_OUT_ACTIVE) continue;
    const expiryVal = row[colIndex("notification_expiry")];
    if (expiryVal && new Date(expiryVal) < now) continue;
    matches.push(row);
  }
  return matches;
}

function notifyExistingSubscribers(sheet, data, newRow) {
  const itemType = newRow[colIndex("item_type")];
  const newDirection = newRow[colIndex("donate_or_receive")];
  const subscriberDirection = newDirection === "Donate" ? "Receive" : "Donate";
  const newSubmissionId = newRow[colIndex("submission_id")];
  const now = new Date();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[colIndex("submission_id")] === newSubmissionId) continue;
    if (row[colIndex("item_type")] !== itemType) continue;
    if (row[colIndex("donate_or_receive")] !== subscriberDirection) continue;
    if (row[colIndex("opt_out_status")] !== OPT_OUT_ACTIVE) continue;
    if (!row[colIndex("notification_consent")]) continue;
    const expiryVal = row[colIndex("notification_expiry")];
    if (expiryVal && new Date(expiryVal) < now) continue;

    const theirMatches = findActiveMatches(data, itemType, newDirection);
    sendMatchAlertEmail(row, theirMatches, newSubmissionId);
    logMatchesForRecipient(row, theirMatches, "new_match_alert");

    const count = (parseInt(row[colIndex("notification_count")], 10) || 0) + 1;
    sheet.getRange(i + 1, colIndex("notification_count") + 1).setValue(count);
  }
}

// Logs one MatchLog row per matched party shown to recipientRow in a
// notification email, so the token portal can later offer a dropdown of
// people this submission was actually notified about (see Schema.js).
function logMatchesForRecipient(recipientRow, matchRows, context) {
  if (!matchRows.length) return;
  const sheet = getOrCreateMatchLogSheet();
  const now = new Date();
  const recipientId = recipientRow[colIndex("submission_id")];
  const rows = matchRows.map(m => {
    const out = new Array(MATCHLOG_COLUMNS.length).fill("");
    out[matchLogColIndex("timestamp")] = now;
    out[matchLogColIndex("submission_id")] = recipientId;
    out[matchLogColIndex("matched_submission_id")] = m[colIndex("submission_id")];
    out[matchLogColIndex("matched_email")] = m[colIndex("email")];
    out[matchLogColIndex("context")] = context;
    return out;
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, MATCHLOG_COLUMNS.length).setValues(rows);
}

// Loose string comparison for matching item/email text entered by hand at
// different times (e.g. "Hospital Bed" vs "hospital beds") - trailing "s"
// stripped so simple pluralization doesn't cause a false mismatch. Shared by
// OptOutServer.js's email+item lookup and PortalServer.js's
// findSubmissionsRowByEmailAndItem.
function normalize(str) {
  if (!str) return "";
  return str.toString().toLowerCase().trim().replace(/s$/, "");
}

function itemLabel(row) {
  const direction = row[colIndex("donate_or_receive")] === "Donate" ? "donation" : "request";
  const itemType = row[colIndex("item_type")];
  return itemType === "Miscellaneous Large DME" ? `Miscellaneous Large DME ${direction}` : `${itemType} ${direction}`;
}

function fieldDefsFor(row) {
  const itemType = row[colIndex("item_type")];
  const direction = row[colIndex("donate_or_receive")] === "Donate" ? "donate" : "receive";
  const config = getItemConfig()[itemType];
  return (config && config[direction]) || [];
}

function generateMatchTable(rows, highlightSubmissionId) {
  let table = `<table border="1" style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:13px;">
    <tr style="background-color:#4A90E2;color:white;">
      <th style="padding:8px;">Posted</th><th style="padding:8px;">Item</th><th style="padding:8px;">Name</th>
      <th style="padding:8px;">City</th><th style="padding:8px;">Contact</th><th style="padding:8px;">Details</th><th style="padding:8px;">Photo</th>
    </tr>`;

  rows.forEach(row => {
    const isNew = highlightSubmissionId && row[colIndex("submission_id")] === highlightSubmissionId;
    const bg = isNew ? "#FFFFCC" : "#FFFFFF";
    const d = new Date(row[colIndex("timestamp")]);
    const formattedDate = (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear().toString().slice(-2);

    let contact = `<a href="mailto:${row[colIndex("email")]}">${row[colIndex("email")]}</a>`;
    if (row[colIndex("phone_share_consent")] && row[colIndex("phone")]) {
      contact += `, ${row[colIndex("phone")]}`;
    }

    let details = {};
    try { details = JSON.parse(row[colIndex("details_json")] || "{}"); } catch (err) { details = {}; }
    const detailParts = fieldDefsFor(row)
      .map(f => details[f.id] ? `${f.label}: ${details[f.id]}` : null)
      .filter(Boolean);

    const photoUrls = (row[colIndex("photo_urls")] || "").toString().split(",").map(s => s.trim()).filter(Boolean);
    const photoCell = photoUrls.length
      ? photoUrls.map((url, idx) => `<a href="${url}">Photo${photoUrls.length > 1 ? " " + (idx + 1) : ""}</a>`).join(" ")
      : "—";

    table += `<tr style="background-color:${bg};">
      <td style="padding:8px;white-space:nowrap;">${formattedDate}</td>
      <td style="padding:8px;"><b>${row[colIndex("item_type")]}</b></td>
      <td style="padding:8px;">${row[colIndex("first_name")]}</td>
      <td style="padding:8px;">${row[colIndex("city")]}</td>
      <td style="padding:8px;">${contact}</td>
      <td style="padding:8px;">${detailParts.join(" • ")}</td>
      <td style="padding:8px;">${photoCell}</td>
    </tr>`;
  });

  return table + "</table>";
}

function sendSubmitterEmail(newRow, matches) {
  const email = newRow[colIndex("email")];
  const name = newRow[colIndex("first_name")];
  const label = itemLabel(newRow);
  const optOutUrl = ScriptApp.getService().getUrl() + "?token=" + newRow[colIndex("token")];
  const subject = matches.length ? `Matches found for your ${label}` : `No current matches for your ${label} yet`;
  let body = `<p>Hello ${name},</p>`;
  if (matches.length) {
    body += `<p>We found matches for your <b>${label}</b>:</p>${generateMatchTable(matches, null)}`;
  } else {
    body += `<p>No current matches for <b>${label}</b>. We will notify you if a new match appears.</p>`;
  }
  body += `<hr><p style="color:gray;font-size:12px;"><a href="${optOutUrl}">Opt Out Form</a></p>`;
  MailApp.sendEmail({ to: email, subject: subject, htmlBody: body + `<p>${getOrgName()}</p>` });
}

function sendMatchAlertEmail(subscriberRow, matches, highlightSubmissionId) {
  const email = subscriberRow[colIndex("email")];
  const name = subscriberRow[colIndex("first_name")];
  const label = itemLabel(subscriberRow);
  const subject = `New Match Alert: ${label}`;
  const optOutUrl = ScriptApp.getService().getUrl() + "?token=" + subscriberRow[colIndex("token")];
  const body = `<p>Hello ${name},</p>
    <p>A new match for your <b>${label}</b> has been found!</p>
    ${generateMatchTable(matches, highlightSubmissionId)}
    <hr>
    <p style="color:gray;font-size:12px;"><a href="${optOutUrl}">Opt Out Form</a></p>`;
  MailApp.sendEmail({ to: email, subject: subject, htmlBody: body });
}
