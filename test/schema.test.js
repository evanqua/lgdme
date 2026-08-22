const test = require("node:test");
const assert = require("node:assert/strict");
const { loadAppsScript } = require("./lib/loadAppsScript");

function load() {
  return loadAppsScript(["Schema.js"], {}, [
    "colIndex",
    "SUBMISSIONS_COLUMNS",
    "MATCHLOG_COLUMNS",
    "AUDITFLAGS_COLUMNS",
    "OPT_OUT_ACTIVE",
    "OPT_OUT_OPTED_OUT",
    "OPT_OUT_EXPIRED"
  ]);
}

test("colIndex returns the position of a known column", () => {
  const { colIndex } = load();
  assert.equal(colIndex("email"), 3);
  assert.equal(colIndex("token"), 2);
});

test("colIndex throws on an unknown column name", () => {
  const { colIndex } = load();
  assert.throws(() => colIndex("not_a_real_column"), /Unknown Submissions column/);
});

test("SUBMISSIONS_COLUMNS has no duplicate names (colIndex/indexOf silently returns the first match)", () => {
  const { SUBMISSIONS_COLUMNS } = load();
  const seen = new Set(SUBMISSIONS_COLUMNS);
  assert.equal(seen.size, SUBMISSIONS_COLUMNS.length);
});

test("opt-out status enum values stay distinct strings", () => {
  const { OPT_OUT_ACTIVE, OPT_OUT_OPTED_OUT, OPT_OUT_EXPIRED } = load();
  const values = [OPT_OUT_ACTIVE, OPT_OUT_OPTED_OUT, OPT_OUT_EXPIRED];
  assert.equal(new Set(values).size, 3);
});
