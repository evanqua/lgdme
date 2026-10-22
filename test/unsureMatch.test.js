const test = require("node:test");
const assert = require("node:assert/strict");
const { loadAppsScript } = require("./lib/loadAppsScript");

function load() {
  return loadAppsScript(["Schema.js", "Matching.js", "OptOutServer.js", "HomeServer.js"], {}, [
    "colIndex", "SUBMISSIONS_COLUMNS", "OPT_OUT_ACTIVE", "OPT_OUT_OPTED_OUT", "MATCH_TEXT_UNSURE",
    "findActiveMatches", "findRecentlyClosedUnsureMatches", "claimedReceiveIds", "isCountedDonation"
  ]);
}

function rowMaker(m) {
  return o => {
    const row = new Array(m.SUBMISSIONS_COLUMNS.length).fill("");
    for (const [k, v] of Object.entries(o)) row[m.colIndex(k)] = v;
    return row;
  };
}

const daysAgo = n => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

test("an opted-out 'not sure who' donor stays selectable for 14 days, never in findActiveMatches", () => {
  const m = load();
  const mk = rowMaker(m);
  const base = { item_type: "Hospital Bed", donate_or_receive: "Donate", opt_out_status: m.OPT_OUT_OPTED_OUT, successful_match: m.MATCH_TEXT_UNSURE };
  const recent = mk({ ...base, submission_id: "recent", opt_out_timestamp: daysAgo(3) });
  const old = mk({ ...base, submission_id: "old", opt_out_timestamp: daysAgo(15) });
  const plainNo = mk({ ...base, submission_id: "no", successful_match: "No", opt_out_timestamp: daysAgo(1) });
  const data = [m.SUBMISSIONS_COLUMNS, recent, old, plainNo];

  const ids = m.findRecentlyClosedUnsureMatches(data, "Hospital Bed", "Donate").map(r => r[m.colIndex("submission_id")]);
  assert.deepEqual([...ids], ["recent"]);
  assert.equal(m.findActiveMatches(data, "Hospital Bed", "Donate").length, 0);
});

test("a recipient who received an item from an unknown donor counts as a match, once", () => {
  const m = load();
  const mk = rowMaker(m);
  const recip = mk({ donate_or_receive: "Receive", submission_id: "r1", successful_match: m.MATCH_TEXT_UNSURE });
  const donorNamingThem = mk({ donate_or_receive: "Donate", submission_id: "d1", successful_match: "r1" });

  assert.equal(m.isCountedDonation(recip, m.claimedReceiveIds([m.SUBMISSIONS_COLUMNS])), true);
  assert.equal(m.isCountedDonation(recip, m.claimedReceiveIds([m.SUBMISSIONS_COLUMNS, donorNamingThem])), false);
  assert.equal(m.isCountedDonation(donorNamingThem, {}), true);
});
