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
