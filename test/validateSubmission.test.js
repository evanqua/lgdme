const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadAppsScript } = require("./lib/loadAppsScript");

const REPO_ROOT = path.join(__dirname, "..");

function load() {
  return loadAppsScript(["SiteConfig.js", "ItemConfig.js", "WebApp.js"], {}, [
    "validateSubmission",
    "ITEM_CATEGORIES"
  ]);
}

function validSubmission(itemType) {
  return {
    email: "someone@example.com",
    first_name: "Alex",
    city: "Anytown",
    phone: "555-123-4567",
    donate_or_receive: "Donate",
    item_type: itemType,
    consent_agreed: "on"
  };
}

test("validateSubmission accepts a fully filled-out submission", () => {
  const { validateSubmission, ITEM_CATEGORIES } = load();
  const errors = validateSubmission(validSubmission(ITEM_CATEGORIES[0]));
  // errors is an array from inside the vm context (a different realm), so
  // compare by length/content rather than assert.deepEqual(errors, []) —
  // strict deepEqual's cross-realm identity check fails even though the
  // values are structurally identical.
  assert.equal(errors.length, 0, `expected no errors, got: ${JSON.stringify(errors)}`);
});

test("validateSubmission rejects a missing/malformed email", () => {
  const { validateSubmission, ITEM_CATEGORIES } = load();
  const form = validSubmission(ITEM_CATEGORIES[0]);

  form.email = "";
  assert.ok(validateSubmission(form).some(e => /email/i.test(e)));

  form.email = "not-an-email";
  assert.ok(validateSubmission(form).some(e => /email/i.test(e)));
});

test("validateSubmission requires first_name, city, and phone", () => {
  const { validateSubmission, ITEM_CATEGORIES } = load();

  const missingName = validSubmission(ITEM_CATEGORIES[0]);
  missingName.first_name = "  ";
  assert.ok(validateSubmission(missingName).some(e => /first name/i.test(e)));

  const missingCity = validSubmission(ITEM_CATEGORIES[0]);
  missingCity.city = "";
  assert.ok(validateSubmission(missingCity).some(e => /city/i.test(e)));

  const missingPhone = validSubmission(ITEM_CATEGORIES[0]);
  missingPhone.phone = "";
  assert.ok(validateSubmission(missingPhone).some(e => /phone/i.test(e)));
});

test("validateSubmission rejects an invalid donate_or_receive value", () => {
  const { validateSubmission, ITEM_CATEGORIES } = load();
  const form = validSubmission(ITEM_CATEGORIES[0]);
  form.donate_or_receive = "Maybe";
  assert.ok(validateSubmission(form).some(e => /Donate or Receive/i.test(e)));
});

test("validateSubmission rejects an item_type not in ITEM_CATEGORIES", () => {
  const { validateSubmission } = load();
  const form = validSubmission("Not A Real Category");
  assert.ok(validateSubmission(form).some(e => /valid item type/i.test(e)));
});

test("validateSubmission requires the consent/waiver checkbox", () => {
  const { validateSubmission, ITEM_CATEGORIES } = load();
  const form = validSubmission(ITEM_CATEGORIES[0]);
  form.consent_agreed = undefined;
  assert.ok(validateSubmission(form).some(e => /consent/i.test(e)));
});

test("validateSubmission enforces a required item-specific field when one is marked required", () => {
  // No field in the committed ItemConfig.js is currently required:true, so
  // this exercises the branch with a synthetic field-def override rather
  // than depending on that staying true of the real data.
  const siteConfigSrc = fs.readFileSync(path.join(REPO_ROOT, "SiteConfig.js"), "utf8");
  const itemConfigSrc = fs.readFileSync(path.join(REPO_ROOT, "ItemConfig.js"), "utf8");
  const webAppSrc = fs.readFileSync(path.join(REPO_ROOT, "WebApp.js"), "utf8");

  const testCategory = "__test_category__";
  const fakeSiteConfig = `const ITEM_CATEGORIES = ["${testCategory}"];`;
  const fakeItemConfig = itemConfigSrc
    .replace(/const ITEM_FIELD_DEFS = \[[\s\S]*?\n\];/, `const ITEM_FIELD_DEFS = [{
      description: "test",
      donate: [{ id: "must_fill", label: "Must Fill", type: "text", required: true }],
      receive: []
    }];`);
  assert.notEqual(fakeItemConfig, itemConfigSrc, "expected to replace ITEM_FIELD_DEFS");

  const context = vm.createContext({ console });
  vm.runInContext(
    [fakeSiteConfig, fakeItemConfig, webAppSrc, "var __exports = { validateSubmission };"].join("\n;\n"),
    context
  );
  const { validateSubmission } = context.__exports;

  const form = validSubmission(testCategory);

  const missingRequiredField = validateSubmission(form);
  assert.ok(missingRequiredField.some(e => /Must Fill/.test(e)));

  form["field__must_fill"] = "a value";
  assert.equal(validateSubmission(form).length, 0);

  function validSubmission(itemType) {
    return {
      email: "someone@example.com",
      first_name: "Alex",
      city: "Anytown",
      phone: "555-123-4567",
      donate_or_receive: "Donate",
      item_type: itemType,
      consent_agreed: "on"
    };
  }
});
