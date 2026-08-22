// Loads real Apps Script source files (unmodified — no module.exports added
// to them) into a Node vm context, so their logic can be unit tested without
// touching the actual files that get pushed to Apps Script via clasp.
//
// Apps Script concatenates every .js file in the project into one shared
// global namespace at runtime; this mirrors that by running the requested
// files' source, in order, as one script in one vm context. Top-level
// `const`/`let` bindings in the loaded files are NOT visible as properties
// on the returned object (a vm quirk), so the caller lists the names it
// wants pulled out via `exportNames` — those become the return value.
//
// `mockGlobals` supplies stand-ins for whichever Apps Script services the
// loaded code touches (SpreadsheetApp, MailApp, Utilities, ScriptApp, ...).
// Leave a service out if the code path under test never calls it — an
// unmocked global only matters once something actually references it.
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "..", "..");

function loadAppsScript(fileNames, mockGlobals, exportNames) {
  const source = fileNames
    .map(f => fs.readFileSync(path.join(REPO_ROOT, f), "utf8"))
    .join("\n;\n");
  const exportStatement = `\nvar __exports = { ${exportNames.join(", ")} };`;

  const context = vm.createContext(Object.assign({ console }, mockGlobals));
  vm.runInContext(source + exportStatement, context, { filename: fileNames.join("+") });
  return context.__exports;
}

module.exports = { loadAppsScript };
