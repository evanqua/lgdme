// ITEM_CONFIG drives both the intake form (Index.html renders fields from this)
// and email rendering (Matching.js looks up labels from this) for the new
// flat-schema Web App system. The retired legacy Google Form system
// (Code.js, now removed) never read this file.
//
// Category names themselves live in ONE place: ITEM_CATEGORIES (SiteConfig.js).
// ITEM_FIELD_DEFS below is a plain array of {donate, receive} field-def blocks,
// matched to ITEM_CATEGORIES *by position* — entry N here describes the item
// named at ITEM_CATEGORIES[N]. Adding a category means adding one name to
// ITEM_CATEGORIES and one field-def block here, in the same position; you
// never type the category name itself in this file.
//
// Field option lists for "select" fields were only invented where the legacy
// header text itself spelled out the choices (e.g. "electric or manual" ->
// Electric/Manual). Everything else defaults to free text because the original
// Google Form's exact dropdown wording isn't available in this repo. Flip any
// field's `type` to "select" and add `options` if you want stricter input.
// Each block also carries a `description` — 1-2 sentences shown on the
// intake form beneath the item-type dropdown once that category is
// selected, meant to help someone pick the right category rather than
// guess from the name alone. Useful for calling out what does NOT belong
// in a given category (e.g. distinguishing a specialty/sport wheelchair
// from a standard transport chair), or pointing to other channels your
// organization already has for commonly-donated items. May contain a
// hardcoded <a> link (safe: this is fixed developer content, never user
// input) — IntakeForm.html renders it via innerHTML, not textContent.
const ITEM_FIELD_DEFS = [
  // Hospital Bed
  {
    description: "An adjustable medical bed frame (electric, semi-electric, or manual) designed for home care positioning, separate from a standard home bed frame.",
    donate: [
      { id: "electric_semi_manual", label: "Electric, semi-electric, or manual?", type: "select", options: ["Electric", "Semi-electric", "Manual"], required: false },
      { id: "width", label: "Width", type: "text", required: false },
      { id: "side_rails", label: "Side rails", type: "text", required: false },
      { id: "mattress_included", label: "Mattress included?", type: "select", options: ["Yes", "No"], required: false },
      { id: "details_link", label: "Details / link", type: "textarea", required: false }
    ],
    receive: [
      { id: "electric_semi_manual", label: "Electric, semi-electric, or manual?", type: "select", options: ["Electric", "Semi-electric", "Manual"], required: false },
      { id: "width", label: "Width", type: "text", required: false },
      { id: "preferences", label: "Anything else that would help a donor know this is a fit, such as the intended user's mobility needs or room size (1-3 sentences)", type: "textarea", required: false }
    ]
  },
  // Wheelchair
  {
    description: "A manual or powered wheelchair for everyday mobility.",
    donate: [
      { id: "manual_or_power", label: "Manual or power?", type: "select", options: ["Manual", "Power"], required: false },
      { id: "seat_width", label: "Seat width", type: "text", required: false },
      { id: "battery_condition", label: "Battery/charging condition (if power)", type: "text", required: false },
      { id: "details_link", label: "Details / link", type: "textarea", required: false }
    ],
    receive: [
      { id: "preferences_and_width", label: "What you're looking for, including manual vs. power and seat width (1-3 sentences)", type: "textarea", required: false }
    ]
  },
  // Mobility Scooter
  {
    description: "A battery-powered scooter with 3 or 4 wheels, steered with handlebars rather than a joystick.",
    donate: [
      { id: "wheels", label: "3 or 4 wheels?", type: "select", options: ["3 wheels", "4 wheels"], required: false },
      { id: "battery_condition", label: "Battery/charging condition", type: "text", required: false },
      { id: "details_link", label: "Details / link", type: "textarea", required: false }
    ],
    receive: [
      { id: "preferences", label: "What you're looking for, including 3 vs. 4 wheels and how it will be used (e.g. indoor/outdoor) (1-3 sentences)", type: "textarea", required: false }
    ]
  },
  // Miscellaneous Large DME
  {
    description: "For true large durable medical equipment that doesn't fit any category above.",
    donate: [
      { id: "description_link", label: "Description / link", type: "textarea", required: false }
    ],
    receive: [
      { id: "description_link", label: "What you're looking for, including why it doesn't fit another category above (1-3 sentences)", type: "textarea", required: false }
    ]
  }
];

// Built lazily (not at top-level file-load time) and cached on first call.
// Apps Script's cross-file top-level execution order isn't dependency-aware —
// "ItemConfig.js" sorts before "SiteConfig.js" alphabetically, so an eager
// `const ITEM_CONFIG = ...` here could run before ITEM_CATEGORIES exists.
// Deferring the build into a function sidesteps that entirely, since no
// function body runs until the whole project has finished loading.
let _itemConfigCache = null;
function getItemConfig() {
  if (_itemConfigCache) return _itemConfigCache;
  if (ITEM_CATEGORIES.length !== ITEM_FIELD_DEFS.length) {
    throw new Error(
      `ITEM_CATEGORIES (SiteConfig.js, ${ITEM_CATEGORIES.length} entries) and ` +
      `ITEM_FIELD_DEFS (ItemConfig.js, ${ITEM_FIELD_DEFS.length} entries) are out of sync — ` +
      `every category needs exactly one field-def block, in the same order.`
    );
  }
  const config = {};
  ITEM_CATEGORIES.forEach((name, i) => {
    config[name] = ITEM_FIELD_DEFS[i];
  });
  _itemConfigCache = config;
  return config;
}
