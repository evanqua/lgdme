// Web App router (doGet) plus intake submission handling. The intake form
// (IntakeForm.html) replaces the native Google Form as the entry point for
// new submissions and reads/writes only the new "Submissions" tab (via
// Schema.js); never touches "Large DME Form" or "Opt Out".
const UPLOAD_FOLDER_NAME = "Large DME Web App Uploads";
const UPLOAD_FOLDER_PROP_KEY = "UPLOAD_FOLDER_ID";

function doGet(e) {
  const params = (e && e.parameter) || {};

  if (params.token) {
    // A token that doesn't match a Submissions row is invalid/expired —
    // the retired legacy system (Code.js) used to be a second place to look
    // one up; renderOptOutPage(token) now just shows "not found" for this.
    if (findSubmissionByToken(params.token)) return renderPortal(params.token);
    return renderOptOutPage(params.token);
  }
  // Generic entry point for the in-app opt-out replacement (no token —
  // e.g. someone without a recent notification email). Replaces the old
  // standalone Opt-Out Google Form URL as the thing to hand out publicly.
  if (params.view === "optout") return renderOptOutPage(null);
  if (params.view === "intake") return renderIntakeForm(params);
  // Internal-only charts moved off the public home page (build plan Step 5)
  // — reachable only by whoever already has this exact URL, and now also
  // gated by the ANALYTICS_PASSWORD script property (see Config.js).
  if (params.view === "analytics") return renderAnalyticsPage(params);

  // Default: the home page (HomeServer.js/Index.html). This used to be
  // ?view=browse with the intake form as the default — swapped so a
  // first-time visitor lands on an explanatory page, not a bare form.
  // Nothing special-cases ?view=browse anymore; it just falls through here too.
  return renderHomePage();
}

// The analytics password form (below) submits via POST so the password
// doesn't end up sitting in the URL bar or browser history the way a GET
// query param would. Every other view here is GET-only (plain links/redirects),
// so this just hands POST requests to the same router rather than duplicating it.
function doPost(e) {
  return doGet(e);
}

// Public, no-login home page (HomeServer.js/Index.html) — this is the link to
// hand out to someone who hasn't decided yet whether to join; it links into
// the intake form below rather than the reverse.
function renderHomePage() {
  const template = HtmlService.createTemplateFromFile("Index");
  template.homeDataJson = JSON.stringify(buildHomeViewModel());
  return template.evaluate()
    .setTitle(getOrgName())
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// Internal-only analytics view (HomeServer.js/Analytics.html) — the
// successful-donations and monthly-trend charts that used to live on the
// public home page, now reachable only via ?view=analytics and gated by the
// ANALYTICS_PASSWORD script property (Config.js). Not linked from the home
// page or anywhere else, so this is a second layer on top of the URL not
// being discoverable, not a replacement for it — see SETUP.md before relying
// on it for anything more sensitive than "keep casual visitors out."
//
// Deliberately simple: a plain shared password compared server-side, no
// per-user accounts or sessions. The page re-prompts on every visit rather
// than remembering you across page loads (no cookie/session mechanism), and
// buildAnalyticsViewModel() (the sensitive part — it includes submitters'
// names/emails) is only ever computed and sent to the browser once the
// password check below has passed, so a wrong/missing password never ships
// the data down for a client-side gate to fail at.
function renderAnalyticsPage(params) {
  params = params || {};
  const configuredPassword = getAnalyticsPassword();
  const attempted = Object.prototype.hasOwnProperty.call(params, "password");
  const authorized = configuredPassword !== "" && params.password === configuredPassword;

  const template = HtmlService.createTemplateFromFile("Analytics");
  template.authorized = authorized;
  template.passwordConfigured = configuredPassword !== "";
  template.showError = attempted && !authorized;
  template.analyticsDataJson = authorized ? JSON.stringify(buildAnalyticsViewModel()) : "null";
  return template.evaluate()
    .setTitle(getOrgName() + " — Analytics")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// The submission form (IntakeForm.html), routed via ?view=intake now that the
// home page above owns the default route.
function renderIntakeForm(params) {
  const template = HtmlService.createTemplateFromFile("IntakeForm");
  template.itemConfigJson = JSON.stringify(getItemConfig());
  template.serviceCitiesJson = JSON.stringify(SERVICE_AREA_CITIES); // SiteConfig.js
  template.expirationDays = getExpirationDays();
  template.homeUrlJson = JSON.stringify(ScriptApp.getService().getUrl());
  // Populated by the home page's category CTAs (?view=intake&donate_or_receive=...&item_type=...&notify=1)
  // so a visitor arriving from there doesn't have to re-pick what they already chose.
  template.prefillJson = JSON.stringify({
    direction: params.donate_or_receive || "",
    itemType: params.item_type || "",
    notify: params.notify === "1"
  });
  return template.evaluate()
    .setTitle(getOrgName())
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// Phase 3 token portal (PortalServer.js/Portal.html). Routed here by presence of
// ?token= so it doesn't collide with the intake form or the home page.
function renderPortal(token) {
  const template = HtmlService.createTemplateFromFile("Portal");
  template.portalDataJson = JSON.stringify(buildPortalViewModel(token));
  return template.evaluate()
    .setTitle(getOrgName() + " — My Listing")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// Full in-app replacement for the retired native Opt-Out Google Form
// (OptOutServer.js/OptOut.html). Routed here when a token doesn't match a
// Submissions row, or via ?view=optout with no token at all.
function renderOptOutPage(token) {
  const template = HtmlService.createTemplateFromFile("OptOut");
  template.checkinDataJson = JSON.stringify(buildOptOutViewModel(token));
  // For the post-submit success screen's "back to main menu" link — same
  // cross-page link constraint as IntakeForm.html's back-link (see CLAUDE.md).
  template.homeUrlJson = JSON.stringify(ScriptApp.getService().getUrl());
  return template.evaluate()
    .setTitle(getOrgName() + " — My Listing")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// Lets Index.html/IntakeForm.html pull in shared partials later if needed;
// unused for now but this is the standard Apps Script pattern for
// multi-file HTML templates.
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getUploadFolder() {
  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty(UPLOAD_FOLDER_PROP_KEY);
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (err) {
      // Stored ID no longer resolves (folder deleted) — fall through and recreate.
    }
  }
  const folder = DriveApp.createFolder(UPLOAD_FOLDER_NAME);
  props.setProperty(UPLOAD_FOLDER_PROP_KEY, folder.getId());
  return folder;
}

// Entry point called from IntakeForm.html via google.script.run — not doPost, because
// google.script.run's form-serialization is what turns <input type="file"> into
// real Blob objects for us. A raw doPost(e) posted to the Web App URL only gives
// filenames, not content, so it can't do the sharing fix. See chat explanation.
//
// Wrapped in try/catch so a server-side exception (auth, Drive, Sheets, etc.)
// comes back to the browser as a readable {success:false, errors:[...]} instead
// of an opaque google.script.run failure — check View > Executions in the Apps
// Script editor for the full stack trace behind any message logged here.
function submitIntake(formObject) {
  try {
    return submitIntakeInternal(formObject);
  } catch (err) {
    console.error(`submitIntake failed: ${err && err.stack ? err.stack : err}`);
    return { success: false, errors: [`Server error: ${err && err.message ? err.message : err}`] };
  }
}

function submitIntakeInternal(formObject) {
  const errors = validateSubmission(formObject);
  if (errors.length) {
    return { success: false, errors: errors };
  }

  const direction = formObject.donate_or_receive === "Donate" ? "donate" : "receive";
  const fieldDefs = getItemConfig()[formObject.item_type][direction];

  const details = {};
  fieldDefs.forEach(f => {
    details[f.id] = (formObject["field__" + f.id] || "").toString().trim();
  });

  // Photo upload is donor-only (nothing to photograph when requesting) — the
  // field is hidden client-side for Receive, but a submission could still
  // reach here with one attached if that's bypassed, so drop it server-side too.
  const photoUrls = formObject.donate_or_receive === "Donate" ? uploadPhotos(formObject.photo) : [];

  const now = new Date();
  const submissionId = Utilities.getUuid();
  const token = Utilities.getUuid();
  const expiry = new Date(now.getTime() + getExpirationDays() * 24 * 60 * 60 * 1000);

  const row = new Array(SUBMISSIONS_COLUMNS.length).fill("");
  row[colIndex("timestamp")] = now;
  row[colIndex("submission_id")] = submissionId;
  row[colIndex("token")] = token;
  row[colIndex("email")] = formObject.email.trim();
  row[colIndex("first_name")] = formObject.first_name.trim();
  row[colIndex("last_name")] = (formObject.last_name || "").trim();
  row[colIndex("city")] = (formObject.city || "").trim();
  row[colIndex("phone")] = (formObject.phone || "").trim();
  row[colIndex("phone_share_consent")] = isChecked(formObject.phone_share_consent);
  row[colIndex("donate_or_receive")] = formObject.donate_or_receive;
  row[colIndex("item_type")] = formObject.item_type;
  row[colIndex("details_json")] = JSON.stringify(details);
  row[colIndex("photo_urls")] = photoUrls.join(", ");
  row[colIndex("opt_out_status")] = OPT_OUT_ACTIVE;
  row[colIndex("notification_consent")] = isChecked(formObject.notification_consent);
  row[colIndex("notification_expiry")] = expiry;
  row[colIndex("notification_count")] = 0;
  row[colIndex("initial_match_count")] = 0;
  row[colIndex("successful_match")] = "";
  // Feedback is only collected later, on the token portal's opt-out flow
  // (Portal.html) — blank at submit time.
  row[colIndex("feedback")] = "";

  const sheet = getOrCreateSubmissionsSheet();
  sheet.appendRow(row);

  const result = processNewSubmission(sheet, row);
  return { success: true, matchCount: result.matchCount };
}

function isChecked(value) {
  return value === "on" || value === "true" || value === true;
}

function validateSubmission(formObject) {
  const errors = [];
  if (!formObject.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formObject.email)) {
    errors.push("A valid email is required.");
  }
  if (!formObject.first_name || !formObject.first_name.toString().trim()) {
    errors.push("First name is required.");
  }
  if (!formObject.city || !formObject.city.toString().trim()) {
    errors.push("City is required.");
  }
  if (!formObject.phone || !formObject.phone.toString().trim()) {
    errors.push("Phone number is required.");
  }
  if (formObject.donate_or_receive !== "Donate" && formObject.donate_or_receive !== "Receive") {
    errors.push("Please choose Donate or Receive.");
  }
  if (!getItemConfig()[formObject.item_type]) {
    errors.push("Please choose a valid item type.");
  }
  if (!isChecked(formObject.consent_agreed)) {
    errors.push("You must agree to the consent/waiver terms.");
  }

  const itemConfig = getItemConfig();
  if (itemConfig[formObject.item_type] && (formObject.donate_or_receive === "Donate" || formObject.donate_or_receive === "Receive")) {
    const direction = formObject.donate_or_receive === "Donate" ? "donate" : "receive";
    const fieldDefs = itemConfig[formObject.item_type][direction] || [];
    fieldDefs.forEach(f => {
      if (f.required && !(formObject["field__" + f.id] || "").toString().trim()) {
        errors.push(`"${f.label}" is required.`);
      }
    });
  }

  return errors;
}

function uploadPhotos(photoBlobs) {
  if (!photoBlobs) return [];
  const blobs = Array.isArray(photoBlobs) ? photoBlobs : [photoBlobs];
  const folder = getUploadFolder();
  const urls = [];
  blobs.forEach(blob => {
    if (!blob || typeof blob.getName !== "function" || blob.getName() === "") return; // empty file input
    try {
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      urls.push(file.getUrl());
    } catch (err) {
      console.error(`Could not upload/share photo: ${err}`);
    }
  });
  return urls;
}
