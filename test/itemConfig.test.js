const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadAppsScript } = require("./lib/loadAppsScript");

const REPO_ROOT = path.join(__dirname, "..");

function load() {
  return loadAppsScript(["SiteConfig.js", "ItemConfig.js"], {}, [
    "ITEM_CATEGORIES",
    "ITEM_FIELD_DEFS",
    "getItemConfig"
  ]);
}

test("ITEM_CATEGORIES and ITEM_FIELD_DEFS stay the same length (positional pairing contract)", () => {
  const { ITEM_CATEGORIES, ITEM_FIELD_DEFS } = load();
  assert.equal(
    ITEM_CATEGORIES.length,
    ITEM_FIELD_DEFS.length,
    "every category in SiteConfig.js needs exactly one field-def block in ItemConfig.js, in the same order"
  );
});

test("getItemConfig() does not throw against the committed category/field-def lists", () => {
  const { getItemConfig } = load();
  assert.doesNotThrow(() => getItemConfig());
});

test("getItemConfig() throws when ITEM_CATEGORIES/ITEM_FIELD_DEFS fall out of sync", () => {
  // Load fresh source with an extra category appended, so this test doesn't
  // depend on (or mutate) the real committed SiteConfig.js.
  const siteConfigSrc = fs.readFileSync(path.join(REPO_ROOT, "SiteConfig.js"), "utf8");
  const itemConfigSrc = fs.readFileSync(path.join(REPO_ROOT, "ItemConfig.js"), "utf8");
  const brokenSiteConfig = siteConfigSrc.replace(
    "const ITEM_CATEGORIES = [",
    'const ITEM_CATEGORIES = [\n  "__test_extra_category_with_no_field_defs__",'
  );
  assert.notEqual(brokenSiteConfig, siteConfigSrc, "expected replacement to actually match ITEM_CATEGORIES' declaration");

  const vm = require("node:vm");
  const context = vm.createContext({ console });
  vm.runInContext(
    brokenSiteConfig + "\n;\n" + itemConfigSrc + "\nvar __exports = { getItemConfig };",
    context
  );
  assert.throws(() => context.__exports.getItemConfig(), /out of sync/);
});

test("every category has a donate and receive field list, and every field def has the required shape", () => {
  const { getItemConfig } = load();
  const config = getItemConfig();
  for (const [category, fields] of Object.entries(config)) {
    assert.ok(Array.isArray(fields.donate), `${category}: missing donate field list`);
    assert.ok(Array.isArray(fields.receive), `${category}: missing receive field list`);
    for (const direction of ["donate", "receive"]) {
      fields[direction].forEach(f => {
        assert.equal(typeof f.id, "string");
        assert.equal(typeof f.label, "string");
        assert.ok(["text", "textarea", "select"].includes(f.type), `${category}/${direction}/${f.id}: unexpected type "${f.type}"`);
        assert.equal(typeof f.required, "boolean");
        if (f.type === "select") {
          assert.ok(Array.isArray(f.options) && f.options.length > 0, `${category}/${direction}/${f.id}: select field needs options`);
        }
      });
    }
  }
});
