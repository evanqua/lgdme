const test = require("node:test");
const assert = require("node:assert/strict");
const { loadAppsScript } = require("./lib/loadAppsScript");

// Fake Submissions sheet for optOutSubmissionsMatchedPartyAndNotify, which
// reads the sheet itself (via getOrCreateSubmissionsSheet) and writes cells.
function setup(statusOfPartner) {
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
    ["Schema.js", "Matching.js", "Duplicates.js", "PortalServer.js"],
    {
      SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }) },
      MailApp: { sendEmail: opts => sent.push(opts.to) },
      getContactEmail: () => "contact@example.org",
      getOrgName: () => "Test Org"
    },
    ["colIndex", "SUBMISSIONS_COLUMNS", "OPT_OUT_ACTIVE", "OPT_OUT_OPTED_OUT", "OPT_OUT_EXPIRED", "optOutSubmissionsMatchedPartyAndNotify"]
  );
  const partner = new Array(m.SUBMISSIONS_COLUMNS.length).fill("");
  partner[m.colIndex("submission_id")] = "partner";
  partner[m.colIndex("email")] = "partner@example.com";
  partner[m.colIndex("opt_out_status")] = m[statusOfPartner];
  rows = [m.SUBMISSIONS_COLUMNS.slice(), partner];
  return { m, sent, rows: () => rows };
}

test("naming an Active partner closes their listing and emails them", () => {
  const { m, sent, rows } = setup("OPT_OUT_ACTIVE");
  assert.equal(m.optOutSubmissionsMatchedPartyAndNotify("partner", "Robin", "Hospital Bed"), true);
  assert.equal(rows()[1][m.colIndex("opt_out_status")], m.OPT_OUT_OPTED_OUT);
  assert.equal(rows()[1][m.colIndex("successful_match")], "Yes");
  assert.deepEqual(sent, ["partner@example.com"]);
});

test("naming an Expired partner records the match without emailing them", () => {
  const { m, sent, rows } = setup("OPT_OUT_EXPIRED");
  assert.equal(m.optOutSubmissionsMatchedPartyAndNotify("partner", "Robin", "Hospital Bed"), true);
  assert.equal(rows()[1][m.colIndex("opt_out_status")], m.OPT_OUT_OPTED_OUT);
  assert.equal(rows()[1][m.colIndex("successful_match")], "Yes");
  assert.deepEqual(sent, []);
});

test("naming an already opted-out partner changes nothing", () => {
  const { m, sent, rows } = setup("OPT_OUT_OPTED_OUT");
  m.optOutSubmissionsMatchedPartyAndNotify("partner", "Robin", "Hospital Bed");
  assert.equal(rows()[1][m.colIndex("successful_match")], "");
  assert.deepEqual(sent, []);
});
