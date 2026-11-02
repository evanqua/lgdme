const test = require("node:test");
const assert = require("node:assert/strict");
const { loadAppsScript } = require("./lib/loadAppsScript");

const EXPORTS = [
  "colIndex", "SUBMISSIONS_COLUMNS", "MATCHLOG_COLUMNS", "OPT_OUT_ACTIVE", "OPT_OUT_EXPIRED", "OPT_OUT_DUPLICATE",
  "duplicateKey", "replaceDuplicateSubmissions", "replacedSubmissionIds", "liveRowIndex", "liveSubmissionId",
  "recipientsShownAny", "processNewSubmission", "findSubmissionByToken", "liveNotifiedPartiesFor"
];

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = n => new Date(Date.now() + n * DAY);

function makeFakeSheet(initialRows) {
  const rows = initialRows.map(r => r.slice());
  return {
    rows: rows,
    getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
    getRange: (row, col, numRows, numCols) => ({
      getValues: () => rows.slice(row - 1, row - 1 + (numRows || 1)).map(r => r.slice(col - 1, col - 1 + (numCols || 1))),
      setValue: v => { rows[row - 1][col - 1] = v; },
      setValues: vals => {
        vals.forEach((r, i) => {
          if (!rows[row - 1 + i]) rows[row - 1 + i] = [];
          r.forEach((v, j) => { rows[row - 1 + i][col - 1 + j] = v; });
        });
      }
    }),
    getLastRow: () => rows.length,
    getLastColumn: () => rows[0].length,
    setFrozenRows: () => {}
  };
}

// Loads the app against fake Submissions/MatchLog sheets. Call
// app.setSheets(submissionsRows, matchLogRows) before anything that reads them.
function loadApp() {
  const sentEmails = [];
  const sheets = {};
  const app = loadAppsScript(
    ["SiteConfig.js", "ItemConfig.js", "Schema.js", "Matching.js", "Duplicates.js", "PortalServer.js", "OptOutServer.js"],
    {
      MailApp: { sendEmail: opts => sentEmails.push(opts) },
      ScriptApp: { getService: () => ({ getUrl: () => "https://example.com/exec" }) },
      SpreadsheetApp: {
        getActiveSpreadsheet: () => ({
          getSheetByName: name => sheets[name] || null,
          insertSheet: name => { sheets[name] = makeFakeSheet([[]]); return sheets[name]; }
        })
      },
      getOrgName: () => "Test Org"
    },
    EXPORTS
  );
  app.sentEmails = sentEmails;
  app.sheets = sheets;
  app.setSheets = (submissionsRows, matchLogRows) => {
    sheets.Submissions = makeFakeSheet(submissionsRows);
    sheets.MatchLog = makeFakeSheet([app.MATCHLOG_COLUMNS].concat(matchLogRows || []));
  };
  return app;
}

function rowMaker(m) {
  return o => {
    const row = new Array(m.SUBMISSIONS_COLUMNS.length).fill("");
    const full = Object.assign({
      email: "pat@example.com", first_name: "Pat", last_name: "Lee", city: "Oakland", phone: "(510) 555-1234",
      donate_or_receive: "Donate", item_type: "Hospital Bed", details_json: JSON.stringify({ mattress: "Yes" }),
      opt_out_status: m.OPT_OUT_ACTIVE,
      notification_expiry: daysFromNow(30), notification_consent: true
    }, o);
    for (const [k, v] of Object.entries(full)) row[m.colIndex(k)] = v;
    return row;
  };
}

function statusOf(m, sheet, id) {
  const row = sheet.rows.find(r => r[m.colIndex("submission_id")] === id);
  return row[m.colIndex("opt_out_status")];
}

test("duplicateKey ignores case, spacing, phone formatting and blank/reordered detail fields", () => {
  const m = loadApp();
  const mk = rowMaker(m);
  const a = mk({ submission_id: "a", details_json: JSON.stringify({ mattress: "Yes", notes: "" }) });
  const b = mk({
    submission_id: "b", email: " PAT@example.com", first_name: "pat ", city: "oakland", phone: "+1 510.555.1234",
    details_json: JSON.stringify({ mattress: "yes" }), photo_urls: "https://photo", notification_consent: false
  });
  assert.equal(m.duplicateKey(a), m.duplicateKey(b));
});

test("duplicateKey differs for a different person, item, direction or detail", () => {
  const m = loadApp();
  const mk = rowMaker(m);
  const base = m.duplicateKey(mk({}));
  for (const change of [
    { first_name: "Sam" }, { last_name: "Kim" }, { email: "other@example.com" }, { phone: "510-555-9999" }, { city: "Berkeley" },
    { item_type: "Hoyer Lift" }, { donate_or_receive: "Receive" }, { details_json: JSON.stringify({ mattress: "No" }) }
  ]) {
    assert.notEqual(m.duplicateKey(mk(change)), base, JSON.stringify(change));
  }
});

test("replaceDuplicateSubmissions closes only older, Active, unexpired copies", () => {
  const m = loadApp();
  const mk = rowMaker(m);
  const rows = [
    m.SUBMISSIONS_COLUMNS,
    mk({ submission_id: "old-active" }),
    mk({ submission_id: "old-expired-unswept", notification_expiry: daysFromNow(-1) }),
    mk({ submission_id: "old-expired", opt_out_status: m.OPT_OUT_EXPIRED }),
    mk({ submission_id: "someone-else", first_name: "Sam" }),
    mk({ submission_id: "new" })
  ];
  m.setSheets(rows);
  const sheet = m.sheets.Submissions;
  const data = sheet.getDataRange().getValues();

  assert.equal(m.replaceDuplicateSubmissions(sheet, data, 5), 1);
  assert.equal(statusOf(m, sheet, "old-active"), m.OPT_OUT_DUPLICATE);
  // The Date comes from the vm realm, so instanceof Date would be false here.
  assert.equal(Object.prototype.toString.call(sheet.rows[1][m.colIndex("opt_out_timestamp")]), "[object Date]");
  assert.equal(data[1][m.colIndex("opt_out_status")], m.OPT_OUT_DUPLICATE, "in-memory snapshot updated too");
  assert.equal(statusOf(m, sheet, "old-expired-unswept"), m.OPT_OUT_ACTIVE);
  assert.equal(statusOf(m, sheet, "old-expired"), m.OPT_OUT_EXPIRED);
  assert.equal(statusOf(m, sheet, "someone-else"), m.OPT_OUT_ACTIVE);
  assert.equal(statusOf(m, sheet, "new"), m.OPT_OUT_ACTIVE);
});

test("a row never replaces a copy submitted after it", () => {
  const m = loadApp();
  const mk = rowMaker(m);
  m.setSheets([m.SUBMISSIONS_COLUMNS, mk({ submission_id: "first" }), mk({ submission_id: "second" })]);
  const sheet = m.sheets.Submissions;
  assert.equal(m.replaceDuplicateSubmissions(sheet, sheet.getDataRange().getValues(), 1), 0);
  assert.equal(statusOf(m, sheet, "second"), m.OPT_OUT_ACTIVE);
});

test("a chain of resubmissions resolves to the newest copy, and stops at a copy that wasn't replaced", () => {
  const m = loadApp();
  const mk = rowMaker(m);
  const D = m.OPT_OUT_DUPLICATE;
  const data = [
    m.SUBMISSIONS_COLUMNS,
    mk({ submission_id: "ancient", opt_out_status: D }),
    mk({ submission_id: "expired-copy", opt_out_status: m.OPT_OUT_EXPIRED }),
    mk({ submission_id: "a", opt_out_status: D }),
    mk({ submission_id: "unrelated", first_name: "Sam" }),
    mk({ submission_id: "b", opt_out_status: D }),
    mk({ submission_id: "c" })
  ];
  assert.equal(m.liveSubmissionId(data, "a"), "c");
  assert.equal(m.liveSubmissionId(data, "b"), "c");
  assert.equal(m.liveSubmissionId(data, "c"), "c");
  assert.equal(m.liveSubmissionId(data, "ancient"), "expired-copy");
  assert.equal(m.liveSubmissionId(data, "missing"), "missing");
  assert.equal(m.liveRowIndex(data, "missing"), -1);
  assert.deepEqual([...m.replacedSubmissionIds(data, 6)], ["b", "a"]);
});

test("recipientsShownAny lists who MatchLog shows was sent any of the given listings", () => {
  const m = loadApp();
  const log = [m.MATCHLOG_COLUMNS, [new Date(), "r1", "a", "", "initial"], [new Date(), "r2", "x", "", "new_match_alert"], [new Date(), "r3", "b", "", "new_match_alert"]];
  const shown = m.recipientsShownAny(log, ["a", "b"]);
  assert.deepEqual(Object.keys(shown).sort(), ["r1", "r3"]);
});

test("resubmitting an identical donation closes the old one and only alerts recipients who hadn't seen it", () => {
  const m = loadApp();
  const mk = rowMaker(m);
  const recv = o => mk(Object.assign({ donate_or_receive: "Receive", details_json: "{}", phone: "" }, o));
  const oldDonation = mk({ submission_id: "old", token: "old-token" });
  const sawOld = recv({ submission_id: "saw-old", email: "saw@example.com", first_name: "Sawyer", token: "t1" });
  const neverSaw = recv({ submission_id: "never-saw", email: "never@example.com", first_name: "Nova", token: "t2" });
  const newDonation = mk({ submission_id: "new", token: "new-token" });
  m.setSheets(
    [m.SUBMISSIONS_COLUMNS, oldDonation, sawOld, neverSaw, newDonation],
    [[new Date(), "saw-old", "old", "pat@example.com", "new_match_alert"]]
  );

  m.processNewSubmission(m.sheets.Submissions, newDonation);

  assert.equal(statusOf(m, m.sheets.Submissions, "old"), m.OPT_OUT_DUPLICATE);
  assert.deepEqual(m.sentEmails.map(e => e.to).sort(), ["never@example.com", "pat@example.com"]);
  const own = m.sentEmails.find(e => e.to === "pat@example.com");
  assert.match(own.htmlBody, /This replaces your earlier/);
  const alert = m.sentEmails.find(e => e.to === "never@example.com");
  assert.equal((alert.htmlBody.match(/pat@example\.com/g) || []).length, 2, "the donor appears once in the table (mailto href + text)");
});

test("an ordinary new submission still alerts everyone and sends no replacement note", () => {
  const m = loadApp();
  const mk = rowMaker(m);
  const recipient = mk({ submission_id: "r", donate_or_receive: "Receive", details_json: "{}", email: "r@example.com" });
  const donation = mk({ submission_id: "new" });
  m.setSheets([m.SUBMISSIONS_COLUMNS, recipient, donation]);

  m.processNewSubmission(m.sheets.Submissions, donation);

  assert.deepEqual(m.sentEmails.map(e => e.to).sort(), ["pat@example.com", "r@example.com"]);
  assert.doesNotMatch(m.sentEmails.find(e => e.to === "pat@example.com").htmlBody, /This replaces/);
});

test("an old portal link opens the replacement, and the match dropdown offers the replacement once", () => {
  const m = loadApp();
  const mk = rowMaker(m);
  const recipient = mk({ submission_id: "r", donate_or_receive: "Receive", details_json: "{}", email: "r@example.com" });
  m.setSheets(
    [m.SUBMISSIONS_COLUMNS, mk({ submission_id: "old", token: "old-token", opt_out_status: m.OPT_OUT_DUPLICATE }), recipient, mk({ submission_id: "new", token: "new-token" })],
    [[new Date(), "r", "old", "pat@example.com", "new_match_alert"]]
  );

  const found = m.findSubmissionByToken("old-token");
  assert.equal(found.row[m.colIndex("submission_id")], "new");
  assert.equal(found.rowIndex, 4);

  const parties = m.liveNotifiedPartiesFor("r");
  assert.deepEqual([...parties.map(p => p.submissionId)], ["new"]);
});
