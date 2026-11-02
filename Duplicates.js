// Duplicate-submission handling. When someone submits a listing whose
// contact details and item details are identical to one of their own
// listings that is still Active, the older row is closed as
// OPT_OUT_DUPLICATE (Schema.js) and the new row takes its place. Match
// tables, alerts, nudges, the opt-out page and home-page counts all only
// look at Active rows, so from then on only the new row shows up in them.
//
// No column records which row replaced which. A new row only ever replaces
// rows above it, so the replacement for a Duplicate row is always the first
// row below it with the same duplicateKey() that is not itself a Duplicate
// (see liveRowIndexFrom).

// Columns that may differ between two copies of the same listing: row
// identity, photos (re-uploaded each time), consent checkboxes, counters,
// status and outcome. Every other Submissions column is part of
// duplicateKey(), so a column added to SUBMISSIONS_COLUMNS later counts
// toward "the same listing" unless it's listed here. Names a sheet doesn't
// have are simply ignored.
const DUPLICATE_IGNORED_COLUMNS = [
  "timestamp", "submission_id", "token", "photo_urls", "phone_share_consent",
  "opt_out_status", "notification_consent", "notification_expiry", "notification_count",
  "initial_match_count", "successful_match", "research_consent", "feedback",
  "feedback_research_consent", "opt_out_timestamp"
];

// Compared ignoring case and extra whitespace; phone by digits and
// details_json by its non-blank answers.
function duplicateKey(row) {
  return JSON.stringify(SUBMISSIONS_COLUMNS
    .filter(c => DUPLICATE_IGNORED_COLUMNS.indexOf(c) === -1)
    .map(c => {
      const value = row[colIndex(c)];
      if (c === "phone") return phoneDigits(value);
      if (c === "details_json") return normalizedDetails(value);
      return normalizeDuplicateText(value);
    }));
}

// true/"TRUE" and false/"FALSE"/blank compare equal, for checkbox columns.
function normalizeDuplicateText(value) {
  if (value === true) return "true";
  if (value === false || value === null || value === undefined) return "";
  const text = String(value).trim().replace(/\s+/g, " ").toLowerCase();
  return text === "false" ? "" : text;
}

// "(510) 555-1234", "510.555.1234" and "+1 510 555 1234" are the same number.
function phoneDigits(value) {
  const digits = String(value === null || value === undefined ? "" : value).replace(/\D/g, "");
  return digits.length === 11 && digits.charAt(0) === "1" ? digits.slice(1) : digits;
}

// Field order and blank fields don't matter, only the non-blank answers.
function normalizedDetails(value) {
  let details;
  try {
    details = JSON.parse(value || "{}");
  } catch (err) {
    return normalizeDuplicateText(value);
  }
  if (!details || typeof details !== "object") return normalizeDuplicateText(value);
  return Object.keys(details).sort()
    .map(k => [k, normalizeDuplicateText(details[k])])
    .filter(pair => pair[1] !== "");
}

// Closes every Active, unexpired row above newRowIndex that duplicates it.
// Rows past notification_expiry are left for the daily sweep to mark Expired.
// Updates `data` as well as the sheet, so a caller still working off the
// same snapshot (processNewSubmission, Matching.js) sees the old rows as
// closed. Returns how many rows were replaced.
function replaceDuplicateSubmissions(sheet, data, newRowIndex) {
  const key = duplicateKey(data[newRowIndex]);
  const now = new Date();
  let replaced = 0;
  for (let i = 1; i < newRowIndex; i++) {
    const row = data[i];
    if (row[colIndex("opt_out_status")] !== OPT_OUT_ACTIVE) continue;
    const expiryVal = row[colIndex("notification_expiry")];
    if (expiryVal && new Date(expiryVal) < now) continue;
    if (duplicateKey(row) !== key) continue;

    setOptOutStatus(sheet, i + 1, OPT_OUT_DUPLICATE);
    row[colIndex("opt_out_status")] = OPT_OUT_DUPLICATE;
    row[colIndex("opt_out_timestamp")] = now;
    replaced++;
  }
  return replaced;
}

// Submission ids the row at newRowIndex stands in for: the unbroken run of
// same-key Duplicate rows above it, which covers rows it replaced directly
// and rows those had replaced in turn.
function replacedSubmissionIds(data, newRowIndex) {
  const key = duplicateKey(data[newRowIndex]);
  const ids = [];
  for (let i = newRowIndex - 1; i >= 1; i--) {
    if (duplicateKey(data[i]) !== key) continue;
    if (data[i][colIndex("opt_out_status")] !== OPT_OUT_DUPLICATE) break;
    ids.push(data[i][colIndex("submission_id")]);
  }
  return ids;
}

// Index in data of the row standing in for data[idx]: itself, or the row
// that replaced it if it's a Duplicate. Stays on idx if the replacement is
// gone (e.g. deleted by hand).
function liveRowIndexFrom(data, idx) {
  if (data[idx][colIndex("opt_out_status")] !== OPT_OUT_DUPLICATE) return idx;
  const key = duplicateKey(data[idx]);
  for (let i = idx + 1; i < data.length; i++) {
    if (data[i][colIndex("opt_out_status")] !== OPT_OUT_DUPLICATE && duplicateKey(data[i]) === key) return i;
  }
  return idx;
}

// Same as liveRowIndexFrom, by submission_id. -1 if no row has that id.
function liveRowIndex(data, submissionId) {
  for (let i = 1; i < data.length; i++) {
    if (data[i][colIndex("submission_id")] === submissionId) return liveRowIndexFrom(data, i);
  }
  return -1;
}

function liveSubmissionId(data, submissionId) {
  const i = liveRowIndex(data, submissionId);
  return i === -1 ? submissionId : data[i][colIndex("submission_id")];
}

// Recipient submission_ids that MatchLog shows were already sent any of
// submissionIds, keyed for lookup. Lets notifyExistingSubscribers (Matching.js)
// skip people a resubmitted listing isn't news to.
function recipientsShownAny(matchLogData, submissionIds) {
  const wanted = {};
  submissionIds.forEach(id => { wanted[id] = true; });
  const shown = {};
  for (let i = 1; i < matchLogData.length; i++) {
    const row = matchLogData[i];
    if (wanted[row[matchLogColIndex("matched_submission_id")]]) shown[row[matchLogColIndex("submission_id")]] = true;
  }
  return shown;
}
