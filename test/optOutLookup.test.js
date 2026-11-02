const test = require("node:test");
const assert = require("node:assert/strict");
const { loadAppsScript } = require("./lib/loadAppsScript");

function load() {
  return loadAppsScript(["Schema.js", "Matching.js", "PortalServer.js", "OptOutServer.js"], {}, [
    "colIndex", "SUBMISSIONS_COLUMNS", "OPT_OUT_ACTIVE", "OPT_OUT_OPTED_OUT", "OPT_OUT_EXPIRED",
    "findOptOutRowIndex"
  ]);
}

function rowMaker(m) {
  return o => {
    const row = new Array(m.SUBMISSIONS_COLUMNS.length).fill("");
    const full = Object.assign({ email: "pat@example.com", item_type: "Hospital Bed", donate_or_receive: "Donate", opt_out_status: m.OPT_OUT_ACTIVE }, o);
    for (const [k, v] of Object.entries(full)) row[m.colIndex(k)] = v;
    return row;
  };
}

const idAt = (m, data, i) => (i === -1 ? null : data[i][m.colIndex("submission_id")]);

test("opt-out lookup prefers the most recent Active listing over a newer closed one", () => {
  const m = load();
  const mk = rowMaker(m);
  const data = [
    m.SUBMISSIONS_COLUMNS,
    mk({ submission_id: "older-active" }),
    mk({ submission_id: "newer-closed", opt_out_status: m.OPT_OUT_OPTED_OUT })
  ];
  assert.equal(idAt(m, data, m.findOptOutRowIndex(data, "PAT@example.com", "Hospital Beds", "Donate")), "older-active");
});

test("opt-out lookup falls back to the most recent closed listing when none is Active", () => {
  const m = load();
  const mk = rowMaker(m);
  const data = [
    m.SUBMISSIONS_COLUMNS,
    mk({ submission_id: "old", opt_out_status: m.OPT_OUT_EXPIRED }),
    mk({ submission_id: "new", opt_out_status: m.OPT_OUT_OPTED_OUT })
  ];
  assert.equal(idAt(m, data, m.findOptOutRowIndex(data, "pat@example.com", "Hospital Bed", "Donate")), "new");
});

test("opt-out lookup stays within the chosen direction, and matches either without one", () => {
  const m = load();
  const mk = rowMaker(m);
  const data = [
    m.SUBMISSIONS_COLUMNS,
    mk({ submission_id: "donation" }),
    mk({ submission_id: "request", donate_or_receive: "Receive" })
  ];
  assert.equal(idAt(m, data, m.findOptOutRowIndex(data, "pat@example.com", "Hospital Bed", "Donate")), "donation");
  assert.equal(idAt(m, data, m.findOptOutRowIndex(data, "pat@example.com", "Hospital Bed", "Receive")), "request");
  assert.equal(idAt(m, data, m.findOptOutRowIndex(data, "pat@example.com", "Hospital Bed")), "request");
  assert.equal(m.findOptOutRowIndex(data, "pat@example.com", "Hoyer Lift", "Donate"), -1);
});

