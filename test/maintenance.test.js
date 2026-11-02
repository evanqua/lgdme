const test = require("node:test");
const assert = require("node:assert/strict");
const { loadAppsScript } = require("./lib/loadAppsScript");

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

// Runs dailySubmissionMaintenance over the given rows (60-day window) and
// returns the emails it sent plus the sheet's rows afterward.
function runMaintenance(makeRows) {
  const sent = [];
  let rows = null;
  const sheet = {
    getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
    getLastColumn: () => rows[0].length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => rows.slice(r - 1, r - 1 + (nr || 1)).map(row => row.slice(c - 1, c - 1 + (nc || 1))),
      setValue: v => { rows[r - 1][c - 1] = v; }
    })
  };
  const m = loadAppsScript(
    ["Schema.js", "Matching.js", "Triggers.js"],
    {
      SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }) },
      MailApp: { sendEmail: opts => sent.push(opts) },
      ScriptApp: { getService: () => ({ getUrl: () => "https://example.com/exec" }) },
      getExpirationDays: () => 60,
      getOrgName: () => "Test Org"
    },
    ["colIndex", "SUBMISSIONS_COLUMNS", "OPT_OUT_ACTIVE", "OPT_OUT_EXPIRED", "dailySubmissionMaintenance", "activePeriodAgeInDays"]
  );
  const make = o => {
    const row = new Array(m.SUBMISSIONS_COLUMNS.length).fill("");
    const full = Object.assign({ item_type: "Hospital Bed", donate_or_receive: "Donate", opt_out_status: m.OPT_OUT_ACTIVE, first_name: "Pat" }, o);
    for (const [k, v] of Object.entries(full)) row[m.colIndex(k)] = v;
    return row;
  };
  rows = [m.SUBMISSIONS_COLUMNS.slice()].concat(makeRows(make));
  m.dailySubmissionMaintenance();
  return { m, sent, rows };
}

// Submitted `submittedDaysAgo` days (plus an hour) ago; renewed `renewedDaysAgo`
// days (plus an hour) ago if given, which moves notification_expiry to the
// renewal + 60 days, exactly as portalStaleResponse does.
function listing(make, email, submittedDaysAgo, renewedDaysAgo) {
  const now = Date.now();
  const start = now - (renewedDaysAgo === undefined ? submittedDaysAgo : renewedDaysAgo) * DAY - HOUR;
  return make({
    email: email, token: email + "-token",
    timestamp: new Date(now - submittedDaysAgo * DAY - HOUR),
    notification_expiry: new Date(start + 60 * DAY)
  });
}

test("a listing never renewed is nudged, warned and expired on the same days as before", () => {
  const { m, sent, rows } = runMaintenance(make => [
    listing(make, "day20@example.com", 20),
    listing(make, "day40@example.com", 40),
    listing(make, "day53@example.com", 53),
    listing(make, "day30@example.com", 30),
    listing(make, "day61@example.com", 61)
  ]);
  assert.deepEqual(sent.map(e => e.to).sort(), ["day20@example.com", "day40@example.com", "day53@example.com"]);
  assert.match(sent.find(e => e.to === "day53@example.com").subject, /expires in 7 days/);
  assert.equal(rows[5][m.colIndex("opt_out_status")], m.OPT_OUT_EXPIRED);
  assert.equal(rows[4][m.colIndex("opt_out_status")], m.OPT_OUT_ACTIVE);
});

test("a renewed listing isn't warned right after renewing, and is warned 7 days before its new expiry", () => {
  const { m, sent, rows } = runMaintenance(make => [
    listing(make, "just-renewed@example.com", 53, 2),
    listing(make, "renewed-long-ago@example.com", 106, 53),
    listing(make, "renewed-not-due@example.com", 70, 10)
  ]);
  assert.deepEqual(sent.map(e => e.to), ["renewed-long-ago@example.com"]);
  assert.match(sent[0].subject, /expires in 7 days/);
  assert.equal(rows[3][m.colIndex("opt_out_status")], m.OPT_OUT_ACTIVE, "renewed 10 days ago, not expired at day 70");
});

test("a renewed listing expires once its renewed period runs out", () => {
  const { m, rows } = runMaintenance(make => [listing(make, "a@example.com", 130, 61)]);
  assert.equal(rows[1][m.colIndex("opt_out_status")], m.OPT_OUT_EXPIRED);
});

test("the expiring-soon email links to the portal renewal, not the intake form", () => {
  const { sent } = runMaintenance(make => [listing(make, "a@example.com", 53)]);
  assert.match(sent[0].htmlBody, /href="https:\/\/example\.com\/exec\?token=a@example\.com-token">visit your listing/);
  assert.doesNotMatch(sent[0].htmlBody, /view=intake/);
});

test("activePeriodAgeInDays falls back to timestamp when there's no expiry", () => {
  const { m } = runMaintenance(() => []);
  const row = new Array(m.SUBMISSIONS_COLUMNS.length).fill("");
  row[m.colIndex("timestamp")] = new Date(Date.now() - 5 * DAY - HOUR);
  assert.equal(m.activePeriodAgeInDays(row, new Date(), 60), 5);
});
