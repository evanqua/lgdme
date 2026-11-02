const test = require("node:test");
const assert = require("node:assert/strict");
const { loadAppsScript } = require("./lib/loadAppsScript");

function load() {
  return loadAppsScript(["Schema.js", "Matching.js"], {}, [
    "colIndex",
    "SUBMISSIONS_COLUMNS",
    "OPT_OUT_ACTIVE",
    "OPT_OUT_OPTED_OUT",
    "findActiveMatches",
    "normalize",
    "itemLabel"
  ]);
}

function makeRowFactory(colIndex, columnCount) {
  return overrides => {
    const row = new Array(columnCount).fill("");
    for (const [key, value] of Object.entries(overrides)) {
      row[colIndex(key)] = value;
    }
    return row;
  };
}

test("findActiveMatches pairs same item_type + opposite direction + Active status", () => {
  const { colIndex, SUBMISSIONS_COLUMNS, OPT_OUT_ACTIVE, findActiveMatches } = load();
  const makeRow = makeRowFactory(colIndex, SUBMISSIONS_COLUMNS.length);

  const header = SUBMISSIONS_COLUMNS;
  const wantedMatch = makeRow({ item_type: "Hospital Bed", donate_or_receive: "Donate", opt_out_status: OPT_OUT_ACTIVE, submission_id: "keep" });
  const data = [header, wantedMatch];

  const matches = findActiveMatches(data, "Hospital Bed", "Donate");
  assert.equal(matches.length, 1);
  assert.equal(matches[0][colIndex("submission_id")], "keep");
});

test("findActiveMatches excludes a different item_type", () => {
  const { colIndex, SUBMISSIONS_COLUMNS, OPT_OUT_ACTIVE, findActiveMatches } = load();
  const makeRow = makeRowFactory(colIndex, SUBMISSIONS_COLUMNS.length);
  const data = [SUBMISSIONS_COLUMNS, makeRow({ item_type: "Hoyer Lift", donate_or_receive: "Donate", opt_out_status: OPT_OUT_ACTIVE })];

  assert.equal(findActiveMatches(data, "Hospital Bed", "Donate").length, 0);
});

test("findActiveMatches excludes the wrong direction", () => {
  const { colIndex, SUBMISSIONS_COLUMNS, OPT_OUT_ACTIVE, findActiveMatches } = load();
  const makeRow = makeRowFactory(colIndex, SUBMISSIONS_COLUMNS.length);
  const data = [SUBMISSIONS_COLUMNS, makeRow({ item_type: "Hospital Bed", donate_or_receive: "Receive", opt_out_status: OPT_OUT_ACTIVE })];

  assert.equal(findActiveMatches(data, "Hospital Bed", "Donate").length, 0);
});

test("findActiveMatches excludes rows that are not Active (e.g. Opted Out)", () => {
  const { colIndex, SUBMISSIONS_COLUMNS, OPT_OUT_OPTED_OUT, findActiveMatches } = load();
  const makeRow = makeRowFactory(colIndex, SUBMISSIONS_COLUMNS.length);
  const data = [SUBMISSIONS_COLUMNS, makeRow({ item_type: "Hospital Bed", donate_or_receive: "Donate", opt_out_status: OPT_OUT_OPTED_OUT })];

  assert.equal(findActiveMatches(data, "Hospital Bed", "Donate").length, 0);
});

test("findActiveMatches excludes rows whose notification_expiry has already passed", () => {
  const { colIndex, SUBMISSIONS_COLUMNS, OPT_OUT_ACTIVE, findActiveMatches } = load();
  const makeRow = makeRowFactory(colIndex, SUBMISSIONS_COLUMNS.length);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const data = [SUBMISSIONS_COLUMNS, makeRow({
    item_type: "Hospital Bed", donate_or_receive: "Donate", opt_out_status: OPT_OUT_ACTIVE, notification_expiry: yesterday
  })];

  assert.equal(findActiveMatches(data, "Hospital Bed", "Donate").length, 0);
});

test("findActiveMatches includes a row with a blank notification_expiry", () => {
  const { colIndex, SUBMISSIONS_COLUMNS, OPT_OUT_ACTIVE, findActiveMatches } = load();
  const makeRow = makeRowFactory(colIndex, SUBMISSIONS_COLUMNS.length);
  const data = [SUBMISSIONS_COLUMNS, makeRow({
    item_type: "Hospital Bed", donate_or_receive: "Donate", opt_out_status: OPT_OUT_ACTIVE, notification_expiry: ""
  })];

  assert.equal(findActiveMatches(data, "Hospital Bed", "Donate").length, 1);
});

test("normalize lowercases, trims, and strips a trailing 's' for loose text matching", () => {
  const { normalize } = load();
  assert.equal(normalize("  Hospital Beds  "), "hospital bed");
  assert.equal(normalize("Wheelchair"), "wheelchair");
  assert.equal(normalize(""), "");
  assert.equal(normalize(null), "");
});

test("itemLabel reads Donate as a donation and Receive as a request", () => {
  const { colIndex, SUBMISSIONS_COLUMNS, itemLabel } = load();
  const makeRow = makeRowFactory(colIndex, SUBMISSIONS_COLUMNS.length);

  assert.equal(itemLabel(makeRow({ item_type: "Hospital Bed", donate_or_receive: "Donate" })), "Hospital Bed donation");
  assert.equal(itemLabel(makeRow({ item_type: "Hospital Bed", donate_or_receive: "Receive" })), "Hospital Bed request");
});

test("itemLabel special-cases Miscellaneous Large DME", () => {
  const { colIndex, SUBMISSIONS_COLUMNS, itemLabel } = load();
  const makeRow = makeRowFactory(colIndex, SUBMISSIONS_COLUMNS.length);

  assert.equal(
    itemLabel(makeRow({ item_type: "Miscellaneous Large DME", donate_or_receive: "Donate" })),
    "Miscellaneous Large DME donation"
  );
});

// --- processNewSubmission and dailySubmissionMaintenance need the full app
// loaded (SiteConfig.js/ItemConfig.js for getItemConfig(), plus mocked
// MailApp/ScriptApp/SpreadsheetApp) rather than just the pure matching
// helpers the tests above exercise. ---

function makeFakeSheet(initialRows) {
  const rows = initialRows.map(r => r.slice());
  return {
    getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
    getRange: (row, col) => ({
      setValue: v => { rows[row - 1][col - 1] = v; },
      setValues: vals => {
        vals.forEach((r, i) => {
          if (!rows[row - 1 + i]) rows[row - 1 + i] = [];
          r.forEach((v, j) => { rows[row - 1 + i][col - 1 + j] = v; });
        });
      }
    }),
    getLastRow: () => rows.length,
    setFrozenRows: () => {}
  };
}

// submissionsRows must already include the new row itself (last row), the
// same way WebApp.js's submitIntakeInternal appends it before ever calling
// processNewSubmission.
// Sending to any address in failFor throws, like MailApp does for a bad address.
function loadFullAppForEmailTest(submissionsRows, failFor) {
  const sentEmails = [];
  const submissionsSheet = makeFakeSheet(submissionsRows);
  let matchLogSheet = null;

  const mockGlobals = {
    MailApp: {
      sendEmail: opts => {
        if ((failFor || []).indexOf(opts.to) !== -1) throw new Error(`Invalid email: ${opts.to}`);
        sentEmails.push(opts);
      }
    },
    ScriptApp: { getService: () => ({ getUrl: () => "https://example.com/exec" }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: name => (name === "Submissions" ? submissionsSheet : matchLogSheet),
        insertSheet: () => { matchLogSheet = makeFakeSheet([[]]); return matchLogSheet; }
      })
    },
    getOrgName: () => "Test Org"
  };

  const exported = loadAppsScript(
    ["SiteConfig.js", "ItemConfig.js", "Schema.js", "Matching.js", "Duplicates.js"],
    mockGlobals,
    ["colIndex", "SUBMISSIONS_COLUMNS", "OPT_OUT_ACTIVE", "processNewSubmission"]
  );
  return { ...exported, submissionsSheet, sentEmails };
}

test("one subscriber's bad address doesn't stop alerts to the others, and isn't logged or counted", () => {
  const { colIndex, SUBMISSIONS_COLUMNS, OPT_OUT_ACTIVE } = loadAppsScript(
    ["Schema.js"], {}, ["colIndex", "SUBMISSIONS_COLUMNS", "OPT_OUT_ACTIVE"]
  );
  const makeRow = makeRowFactory(colIndex, SUBMISSIONS_COLUMNS.length);
  const base = { item_type: "Hospital Bed", opt_out_status: OPT_OUT_ACTIVE, notification_consent: true, notification_count: 0 };
  const bad = makeRow({ ...base, donate_or_receive: "Receive", submission_id: "bad", email: "bad@example.com", first_name: "Bo" });
  const good = makeRow({ ...base, donate_or_receive: "Receive", submission_id: "good", email: "good@example.com", first_name: "Gil" });
  const donor = makeRow({ ...base, donate_or_receive: "Donate", submission_id: "donor", email: "donor@example.com", first_name: "Dana" });

  const { submissionsSheet, sentEmails, processNewSubmission } =
    loadFullAppForEmailTest([SUBMISSIONS_COLUMNS, bad, good, donor], ["bad@example.com"]);
  processNewSubmission(submissionsSheet, donor);

  assert.deepEqual(sentEmails.map(e => e.to).sort(), ["donor@example.com", "good@example.com"]);
  const rows = submissionsSheet.getDataRange().getValues();
  assert.equal(rows[1][colIndex("notification_count")], 0);
  assert.equal(rows[2][colIndex("notification_count")], 1);
});

test("dailySubmissionMaintenance keeps going past a nudge that fails to send", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const sent = [];
  let sheet = null;
  const m = loadAppsScript(
    ["Schema.js", "Matching.js", "Triggers.js"],
    {
      SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }) },
      MailApp: { sendEmail: opts => { if (opts.to === "bad@example.com") throw new Error("Invalid email"); sent.push(opts.to); } },
      ScriptApp: { getService: () => ({ getUrl: () => "https://example.com/exec" }) },
      getExpirationDays: () => 60,
      getIntakeFormUrl: () => "https://example.com/exec?view=intake",
      getOrgName: () => "Test Org"
    },
    ["colIndex", "SUBMISSIONS_COLUMNS", "OPT_OUT_ACTIVE", "OPT_OUT_EXPIRED", "dailySubmissionMaintenance"]
  );
  const makeRow = makeRowFactory(m.colIndex, m.SUBMISSIONS_COLUMNS.length);
  // An hour past the day boundary, so ageInDays floors to exactly `days`.
  const aged = (days, o) => makeRow({
    item_type: "Hospital Bed", donate_or_receive: "Donate", opt_out_status: m.OPT_OUT_ACTIVE,
    timestamp: new Date(Date.now() - days * DAY - 60 * 60 * 1000), notification_expiry: new Date(Date.now() + (60 - days) * DAY), ...o
  });
  sheet = makeFakeSheet([
    m.SUBMISSIONS_COLUMNS,
    aged(20, { email: "bad@example.com" }),   // 1/3 nudge, fails
    aged(53, { email: "good@example.com" }),  // 7-day warning
    aged(70, { email: "old@example.com", notification_expiry: new Date(Date.now() - 10 * DAY) })
  ]);
  // getOrCreateSubmissionsSheet backfills headers, which reads row 1.
  sheet.getLastColumn = () => m.SUBMISSIONS_COLUMNS.length;
  const setOnly = sheet.getRange;
  sheet.getRange = (r, c, nr, nc) => Object.assign(setOnly(r, c), {
    getValues: () => sheet.getDataRange().getValues().slice(r - 1, r - 1 + (nr || 1)).map(row => row.slice(c - 1, c - 1 + (nc || 1)))
  });

  m.dailySubmissionMaintenance();

  assert.deepEqual(sent, ["good@example.com"]);
  assert.equal(sheet.getDataRange().getValues()[3][m.colIndex("opt_out_status")], m.OPT_OUT_EXPIRED);
});
