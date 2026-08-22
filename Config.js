// Org-level configuration for this deployment, backed by Script Properties
// so a cloned instance (see setupNewInstance() in Installer.js) can be
// configured without editing code. Falls back to this instance's current
// values when a property hasn't been set, so nothing changes here until
// someone explicitly reconfigures.
const CONFIG_DEFAULTS = {
  ORG_NAME: "Your Organization LgDME System",
  CONTACT_EMAIL: "contact@example.org",
  EXPIRATION_DAYS: "60",
  // Minimum active (unmatched) requests a category needs before the home
  // page's "High Demand" badge shows (HomeServer.js) — a boolean threshold,
  // never a displayed count.
  HIGH_DEMAND_THRESHOLD: "5"
};

function getConfigValue(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  return value || CONFIG_DEFAULTS[key];
}

function getOrgName() {
  return getConfigValue("ORG_NAME");
}

function getContactEmail() {
  return getConfigValue("CONTACT_EMAIL");
}

function getExpirationDays() {
  return parseInt(getConfigValue("EXPIRATION_DAYS"), 10);
}

function getHighDemandThreshold() {
  return parseInt(getConfigValue("HIGH_DEMAND_THRESHOLD"), 10);
}

// The new Web App intake form's URL — what every "resubmit"/"list a new
// item" link in outbound email now points to, in both systems, now that the
// old standalone Google Form links have been retired.
function getIntakeFormUrl() {
  return ScriptApp.getService().getUrl() + "?view=intake";
}
