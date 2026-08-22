// Run setupNewInstance() ONCE, from the Apps Script editor's function
// dropdown (Run button, not deployed/triggered), in a fresh copy of this
// project. See SETUP.md for the full clone-to-running walkthrough.
//
// Idempotent by design: safe to re-run (e.g. after adding a sheet manually,
// or if a trigger got deleted) without clobbering existing config or
// creating duplicate triggers.
//
// What this CANNOT do: create the Web App deployment itself. Apps Script's
// API doesn't expose "deploy a new Web App" the way it exposes sheet/
// trigger creation — that step still needs `clasp deploy` or the editor's
// Deploy > New deployment dialog, and (per appsscript.json's `webapp` block)
// remember to confirm access is set to "Anyone"/ANYONE_ANONYMOUS if you want
// it usable without a Google login.
function setupNewInstance() {
  return [
    setupConfig_(),
    setupSheets_(),
    setupTriggers_()
  ];
}

// Seeds Script Properties with this codebase's current defaults (see
// Config.js) but only for keys that aren't already set, so re-running this
// never overwrites a value you've already customized.
function setupConfig_() {
  const props = PropertiesService.getScriptProperties();
  const existing = props.getProperties();
  const toSet = {};
  Object.keys(CONFIG_DEFAULTS).forEach(key => {
    if (!existing[key]) toSet[key] = CONFIG_DEFAULTS[key];
  });
  if (Object.keys(toSet).length) props.setProperties(toSet);
  return {
    step: "config",
    note: "ORG_NAME / CONTACT_EMAIL / EXPIRATION_DAYS / HIGH_DEMAND_THRESHOLD seeded with this codebase's defaults in Script Properties — " +
      "go set your org's real values there (Project Settings > Script Properties) before going live."
  };
}

function setupSheets_() {
  getOrCreateSubmissionsSheet();
  getOrCreateMatchLogSheet();
  getOrCreateAuditFlagsSheet();
  return { step: "sheets", note: "Submissions, MatchLog, and AuditFlags sheets exist with correct headers." };
}

// Apps Script triggers do NOT carry over when a project is copied — must be
// created fresh in every new instance. Guarded against duplicates so
// re-running setupNewInstance() is safe.
function setupTriggers_() {
  const existingHandlers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  const created = [];

  if (existingHandlers.indexOf("dailySubmissionMaintenance") === -1) {
    ScriptApp.newTrigger("dailySubmissionMaintenance").timeBased().everyDays(1).atHour(6).create();
    created.push("dailySubmissionMaintenance");
  }
  if (existingHandlers.indexOf("runAuditFlags") === -1) {
    ScriptApp.newTrigger("runAuditFlags").timeBased().everyDays(1).atHour(7).create();
    created.push("runAuditFlags");
  }

  return {
    step: "triggers",
    note: created.length
      ? `Installed daily triggers: ${created.join(", ")}.`
      : "Both daily triggers already existed — nothing to install."
  };
}
