// Adopter-editable content config — the "what do we list, and where" answers
// for BOTH systems' forms, analogous to Config.js's org-identity answers.
// Edit the arrays below for your own org; every form that needs this data
// reads from here rather than keeping its own separate copy.

// Single source of truth for item category names — edit this one list to
// add/rename/remove a category anywhere in the app. ItemConfig.js's
// ITEM_CONFIG keys are built from this array at load time, paired by
// position with ITEM_FIELD_DEFS. You do NOT need to (and should not) retype
// a name in ItemConfig.js — only add/reorder the matching field-def entry
// there. OptOutServer.js's generic ?view=optout item dropdown also reads
// straight from this list.
//
// This is illustrative only — replace it with your own organization's item
// categories before deploying. Whatever you put here, ItemConfig.js's
// ITEM_FIELD_DEFS must be kept in lockstep by array position: entry N in
// ITEM_CATEGORIES must correspond to entry N in ITEM_FIELD_DEFS. Adding,
// removing, or reordering a category here means doing the same to the
// matching field-def block there.
const ITEM_CATEGORIES = [
  "Hospital Bed",
  "Wheelchair",
  "Mobility Scooter",
  "Miscellaneous Large DME"
];

// Service-area cities offered as a dropdown on the intake form
// (IntakeForm.html). Ships empty deliberately — an empty list just means the
// dropdown only offers "Other" (free text), which still works, so filling
// this in isn't a hard requirement. Populate it with your own service area's
// cities/towns if you want a dropdown instead.
const SERVICE_AREA_CITIES = [];
