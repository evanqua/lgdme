// New flat schema for the Web App intake system. Lives in its own "Submissions"
// tab so the legacy "Large DME Form" / "Opt Out" tabs and their data are never
// touched by any function in this file.
const SUBMISSIONS_SHEET = "Submissions";

const OPT_OUT_ACTIVE = "Active";
const OPT_OUT_OPTED_OUT = "Opted Out";
const OPT_OUT_EXPIRED = "Expired";

// Sentinel value for the "who did you match with?" dropdowns (Portal.html,
// OptOut.html) when the reporter can't identify who it was. Shared across
// server files rather than redefined per file.
const MATCH_VALUE_UNSURE = "__unsure__";

// Proposed flat column list (your requested columns + additions called out below):
//   - last_name: kept because Step 1 said not to drop existing questions; legacy
//     had "Last name (not shared)" and nothing in the new schema replaced it.
//   - details_json: the JSON details column you asked for, placed right after item_type.
//   - photo_urls: new, holds the Phase-1-style uploaded photo link(s). Cross-cutting
//     rather than item-specific, so it's a flat column rather than living in details_json.
//   - notification_count / initial_match_count / successful_match: carried over from
//     the legacy tracking columns (ensureTrackingColumns in Code.js) — nothing in your
//     list replaced these, so they're kept flat rather than dropped.
// If you'd rather fold photo_urls or the tracking counters into details_json instead,
// say so and I'll adjust before building on top of this.
const SUBMISSIONS_COLUMNS = [
  "timestamp",
  "submission_id",
  "token",
  "email",
  "first_name",
  "last_name",
  "city",
  "phone",
  "phone_share_consent",
  "donate_or_receive",
  "item_type",
  "details_json",
  "photo_urls",
  "opt_out_status",
  "notification_consent",
  "notification_expiry",
  "notification_count",
  "initial_match_count",
  "successful_match",
  // Free-text feedback collected on the opt-out/check-in flow (Portal.html,
  // and the legacy equivalent's "Opt-Out Feedback" column). See PortalServer.js.
  "feedback",
  // Stamped whenever opt_out_status transitions away from Active (see
  // setOptOutStatus below) — every write site goes through that helper
  // rather than setting opt_out_status directly, so this is always populated
  // alongside it. Rows opted out before this column existed (or migrated
  // from the legacy sheet) are simply blank here; analytics (HomeServer.js)
  // treats a blank as "unknown date" rather than falling back to a guess.
  // Appended at the end (not inserted near opt_out_status) per
  // ensureSubmissionsColumns' append-only backfill contract above.
  "opt_out_timestamp"
];

function getOrCreateSubmissionsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SUBMISSIONS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SUBMISSIONS_SHEET);
    sheet.getRange(1, 1, 1, SUBMISSIONS_COLUMNS.length).setValues([SUBMISSIONS_COLUMNS]);
    sheet.setFrozenRows(1);
  } else {
    ensureSubmissionsColumns(sheet);
  }
  return sheet;
}

// Backfills any header appended to SUBMISSIONS_COLUMNS after this sheet was
// first created on an already-live sheet. Relies on new columns always
// being appended to the end of SUBMISSIONS_COLUMNS so colIndex() stays
// aligned with the sheet's actual header positions.
function ensureSubmissionsColumns(sheet) {
  const lastCol = sheet.getLastColumn();
  const existingHeaders = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const missing = SUBMISSIONS_COLUMNS.filter(c => existingHeaders.indexOf(c) === -1);
  if (missing.length) {
    sheet.getRange(1, existingHeaders.length + 1, 1, missing.length).setValues([missing]);
  }
}

function colIndex(name) {
  const idx = SUBMISSIONS_COLUMNS.indexOf(name);
  if (idx === -1) throw new Error(`Unknown Submissions column: ${name}`);
  return idx;
}

// Every write site that transitions opt_out_status (PortalServer.js,
// OptOutServer.js via optOutSubmissionsRow, Triggers.js's expiration sweep)
// goes through this instead of setting the cell directly, so
// opt_out_timestamp is always stamped alongside it — analytics (HomeServer.js)
// relies on that to compute time-to-opt-out and to date-bucket successful
// donations by when they actually closed out, not when they were submitted.
function setOptOutStatus(sheet, rowIndex, status) {
  sheet.getRange(rowIndex, colIndex("opt_out_status") + 1).setValue(status);
  sheet.getRange(rowIndex, colIndex("opt_out_timestamp") + 1).setValue(new Date());
}

// Logs every match a person is shown in a notification email, so the token
// portal can later ask "who did you actually match with?" as a dropdown of
// real notified parties instead of free text.
const MATCHLOG_SHEET = "MatchLog";
const MATCHLOG_COLUMNS = [
  "timestamp",
  "submission_id",         // whose inbox this notification landed in
  "matched_submission_id", // the other party shown to them in that email
  "matched_email",
  "context"                // "initial" (their own submit-time email) or "new_match_alert"
];

function getOrCreateMatchLogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(MATCHLOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(MATCHLOG_SHEET);
    sheet.getRange(1, 1, 1, MATCHLOG_COLUMNS.length).setValues([MATCHLOG_COLUMNS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function matchLogColIndex(name) {
  const idx = MATCHLOG_COLUMNS.indexOf(name);
  if (idx === -1) throw new Error(`Unknown MatchLog column: ${name}`);
  return idx;
}

// Scheduled function output only — never acted on automatically, per the
// build plan (manual review only). Flags: (a) submissions with many
// notifications and no response after a threshold, (b) opt-outs whose
// reported matched party doesn't appear in MatchLog for that submission.
const AUDITFLAGS_SHEET = "AuditFlags";
const AUDITFLAGS_COLUMNS = [
  "timestamp",
  "submission_id",
  "flag_type",
  "detail"
];

function getOrCreateAuditFlagsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(AUDITFLAGS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(AUDITFLAGS_SHEET);
    sheet.getRange(1, 1, 1, AUDITFLAGS_COLUMNS.length).setValues([AUDITFLAGS_COLUMNS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function auditFlagsColIndex(name) {
  const idx = AUDITFLAGS_COLUMNS.indexOf(name);
  if (idx === -1) throw new Error(`Unknown AuditFlags column: ${name}`);
  return idx;
}
