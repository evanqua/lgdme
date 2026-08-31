// Public, no-login home page — build plan Phase 1 item 4, built against the
// new custom Web App (IntakeForm.html) rather than the native Google Form the
// plan originally described, since intake has since moved there. This is now
// the DEFAULT route (WebApp.js's doGet falls through to renderHomePage() for
// any request that isn't a ?token=, ?view=optout, ?view=intake, or
// ?view=analytics) — it used
// to live behind ?view=browse, with the intake form as the default; the two
// were swapped so a first-time visitor lands on an explanatory page instead
// of a bare form. (?view=browse still works too — nothing special-cases it,
// it just falls through to the same default.)
//
// Deliberately shows category-level STATUS only, never exact counts of
// current listings, individual listings, or photos — so nobody can browse
// specific available items before submitting. This also means the two
// historical charts (successful-donations, monthly trend) live on a separate
// internal-only page (buildAnalyticsViewModel, ?view=analytics, WebApp.js)
// rather than on this page — reachable by direct URL only, not linked from
// here or anywhere else a visitor could click into.
//
// Chart implementation note: both charts are plain HTML/CSS/SVG (no charting
// library, no external requests) to keep this dependency-free, consistent
// with the rest of this project's no-build-step approach.

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Bucket label for a successful-donation row whose item_type doesn't match
// any known category (renamed/retired category, migrated legacy data, bad
// input, etc.) — see buildSuccessfulDonationsChart. Such rows are never
// dropped from the total, only from having their own named line.
const OTHER_CATEGORY_LABEL = "Other";

function buildHomeViewModel() {
  const { categories, donateRowsByCategory, receiveRowsByCategory } = loadSubmissionRowsByCategory();
  const activeReceiveCountsByCategory = countActiveReceiveRowsByCategory(receiveRowsByCategory);

  const categoryStatuses = categories.map(category => {
    const rows = donateRowsByCategory[category];
    const activeRows = rows.filter(r => r[colIndex("opt_out_status")] === OPT_OUT_ACTIVE);
    const isAvailable = activeRows.length > 0;

    const mostRecentActive = mostRecentByTimestamp(activeRows);
    const mostRecentAny = mostRecentByTimestamp(rows);

    let freshnessLabel;
    if (isAvailable) {
      freshnessLabel = `Last listing was ${relativeTimeAgo(mostRecentActive[colIndex("timestamp")])}`;
    } else if (mostRecentAny) {
      // Deliberately no "(already matched)" qualifier here — just the same
      // relative-time phrasing as the available case, per product instruction.
      freshnessLabel = `Last listing was ${relativeTimeAgo(mostRecentAny[colIndex("timestamp")])}`;
    } else {
      freshnessLabel = "No listings yet";
    }

    return {
      category: category,
      status: isAvailable ? "Available now" : "No active listings",
      freshnessLabel: freshnessLabel,
      ctaLabel: isAvailable ? "Request" : "Notify me",
      ctaUrl: buildIntakeUrl(category, isAvailable),
      // Donate-side CTA, always shown alongside the request/notify one — see
      // buildDonateUrl below.
      donateCtaUrl: buildDonateUrl(category),
      // Boolean only — the underlying per-category count is never exposed on
      // the page (see getHighDemandThreshold() / countActiveReceiveRowsByCategory).
      highDemand: activeReceiveCountsByCategory[category] >= getHighDemandThreshold()
    };
  }).sort((a, b) => categorySortRank(a.status) - categorySortRank(b.status));

  const sinceMidnight = startOfTodayLocal();

  return {
    categories: categoryStatuses,
    totals: {
      // Cumulative, all-time — not windowed to the last 6 months like the
      // analytics-page chart (buildAnalyticsViewModel below).
      totalExchangesAllTime: countAllTimeSuccessfulDonations(),
      // Combined across every category — never broken out per category on
      // this page (see category-card status, which only shows Available/None,
      // and the High Demand badge, which is a boolean, not a count).
      openRequests: sumValues(activeReceiveCountsByCategory),
      // Feeds the small "new since midnight" badge on each stat (Index.html)
      // — how much of the total above is attributable to rows dated today,
      // using the same per-total counting rule as the total itself (see
      // countNewSuccessfulDonationsSince/countNewActiveReceiveRowsSince) so
      // the badge always reads as "this is the part of the total that's new
      // today," never a differently-defined number.
      newExchangesToday: countNewSuccessfulDonationsSince(donateRowsByCategory, sinceMidnight),
      newRequestsToday: countNewActiveReceiveRowsSince(receiveRowsByCategory, sinceMidnight)
    },
    // Exposed only as the raw threshold number for the "Current categories"
    // footnote — never combined with a per-category count, so this still
    // can't be used to infer any individual category's actual request count.
    highDemandThreshold: getHighDemandThreshold(),
    introLinks: {
      intakeUrl: buildFormUrl("intake"),
      optOutUrl: buildFormUrl("optout")
    }
  };
}

// Internal-only (?view=analytics, not linked anywhere a visitor could click
// into) — the two historical charts that used to live on the public home
// page, moved off it entirely per product decision, plus opt-out/match-rate
// totals and time-to-opt-out statistics. Loads the raw Submissions rows once
// and hands them to each builder below, rather than each builder re-reading
// the sheet — also means every figure on this page is computed straight from
// rows, not from an intermediate per-category grouping that could silently
// drop rows whose item_type doesn't match a known category (see
// buildSuccessfulDonationsChart).
function buildAnalyticsViewModel() {
  const sheet = getOrCreateSubmissionsSheet();
  const data = sheet.getDataRange().getValues();
  const categories = Object.keys(getItemConfig());
  const months = lastNMonthLabels(6);

  return {
    recentOptOuts: buildRecentOptOuts(data),
    successfulDonationsChart: buildSuccessfulDonationsChart(data, categories, months),
    monthlyChart: buildMonthlyTotalChart(data, months),
    optOutTotals: buildOptOutTotals(data),
    timeToOptOut: buildTimeToOptOutStats(data)
  };
}

// Human-readable feed of the most recent individual opt-outs (Opted Out or
// Expired), newest first — the Submissions sheet is the source of truth but
// isn't a convenient place to just eyeball "what happened recently" (wide
// sheet, unsorted, a details_json blob column). Only rows with a recorded
// opt_out_timestamp are eligible (see setOptOutStatus, Schema.js) - rows
// opted out before that column existed have no reliable date to sort by, so
// they're left out rather than shown out of order at the top or bottom.
const RECENT_OPT_OUTS_LIMIT = 25;

function buildRecentOptOuts(data) {
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = row[colIndex("opt_out_status")];
    if (status !== OPT_OUT_OPTED_OUT && status !== OPT_OUT_EXPIRED) continue;
    const optOutTimestamp = row[colIndex("opt_out_timestamp")];
    if (!optOutTimestamp) continue;

    rows.push({
      optOutTimestamp: new Date(optOutTimestamp),
      name: row[colIndex("first_name")],
      email: row[colIndex("email")],
      item: row[colIndex("item_type")],
      direction: row[colIndex("donate_or_receive")],
      status: status,
      outcome: describeOptOutOutcome(row[colIndex("successful_match")], status),
      matchedWith: status === OPT_OUT_OPTED_OUT ? resolveMatchedWithLabel(row[colIndex("successful_match")], data) : "",
      feedback: row[colIndex("feedback")] || ""
    });
  }

  rows.sort((a, b) => b.optOutTimestamp - a.optOutTimestamp);

  return rows.slice(0, RECENT_OPT_OUTS_LIMIT).map(r => ({
    date: Utilities.formatDate(r.optOutTimestamp, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"),
    name: r.name,
    email: r.email,
    item: r.item,
    direction: r.direction,
    status: r.status,
    outcome: r.outcome,
    matchedWith: r.matchedWith,
    feedback: r.feedback
  }));
}

function describeOptOutOutcome(successfulMatchValue, status) {
  if (status === OPT_OUT_EXPIRED) return "Expired (no action taken)";
  return isConfirmedSuccess(successfulMatchValue) ? "Matched" : "No match reported";
}

// successful_match holds either a raw submission_id (a confirmed match
// picked from a dropdown) or free text ("No", "Yes (not sure who)") - see
// Triggers.js's looksLikeToken(), reused here rather than redefined. Only
// the submission_id case needs resolving into something readable.
function resolveMatchedWithLabel(successfulMatchValue, data) {
  const v = (successfulMatchValue || "").toString().trim();
  if (!v || v === "No") return "";
  if (!looksLikeToken(v)) return v;
  for (let i = 1; i < data.length; i++) {
    if (data[i][colIndex("submission_id")] === v) {
      return data[i][colIndex("first_name")] + " (" + data[i][colIndex("email")] + ")";
    }
  }
  return v;
}

// "No active listings" categories sort before "Available now" ones;
// everything else preserves categories' existing (ITEM_CATEGORIES) order,
// since Array#sort is stable in the V8 runtime Apps Script runs on.
function categorySortRank(status) {
  return status === "Available now" ? 1 : 0;
}

function loadSubmissionRowsByCategory() {
  const sheet = getOrCreateSubmissionsSheet();
  const data = sheet.getDataRange().getValues();
  const categories = Object.keys(getItemConfig());

  const donateRowsByCategory = {};
  const receiveRowsByCategory = {};
  categories.forEach(c => { donateRowsByCategory[c] = []; receiveRowsByCategory[c] = []; });

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const itemType = row[colIndex("item_type")];
    if (!donateRowsByCategory[itemType]) continue; // unrecognized/stale category, skip
    if (row[colIndex("donate_or_receive")] === "Donate") {
      donateRowsByCategory[itemType].push(row);
    } else if (row[colIndex("donate_or_receive")] === "Receive") {
      receiveRowsByCategory[itemType].push(row);
    }
  }

  return { categories, donateRowsByCategory, receiveRowsByCategory };
}

function buildFormUrl(view) {
  return ScriptApp.getService().getUrl() + "?view=" + view;
}

function mostRecentByTimestamp(rows) {
  if (!rows.length) return null;
  return rows.reduce((latest, r) =>
    new Date(r[colIndex("timestamp")]) > new Date(latest[colIndex("timestamp")]) ? r : latest
  );
}

// Coarsest-fit relative time, from hours up through years — e.g. "3 hours
// ago", "5 days ago", "2 weeks ago", "4 months ago", "1 year ago". Replaces
// the old absolute-date freshness label.
function relativeTimeAgo(value) {
  const diffMs = Date.now() - new Date(value).getTime();
  const hours = diffMs / (1000 * 60 * 60);
  if (hours < 24) return pluralize(Math.max(1, Math.floor(hours)), "hour") + " ago";
  const days = hours / 24;
  if (days < 7) return pluralize(Math.floor(days), "day") + " ago";
  const weeks = days / 7;
  if (days < 30) return pluralize(Math.floor(weeks), "week") + " ago";
  const months = days / 30;
  if (days < 365) return pluralize(Math.floor(months), "month") + " ago";
  const years = days / 365;
  return pluralize(Math.floor(years), "year") + " ago";
}

function pluralize(n, unit) {
  return n + " " + unit + (n === 1 ? "" : "s");
}

// Pre-fills the intake form: donate_or_receive=Receive ("Notify me" is just
// a receive-side submission with the notification box pre-checked, same
// expiry/renewal logic already in place, no new expiry handling needed),
// item_type=category, and notify=1 only for the "no active listings" case.
// view=intake is required now that the intake form isn't the default route.
function buildIntakeUrl(category, isAvailable) {
  const base = ScriptApp.getService().getUrl();
  let url = base + "?view=intake&donate_or_receive=Receive&item_type=" + encodeURIComponent(category);
  if (!isAvailable) url += "&notify=1";
  return url;
}

// Donate-side counterpart to buildIntakeUrl above — every category card
// shows both a Donate button and a Request/Notify me button now, so a
// visitor can go either direction from the same card.
function buildDonateUrl(category) {
  const base = ScriptApp.getService().getUrl();
  return base + "?view=intake&donate_or_receive=Donate&item_type=" + encodeURIComponent(category);
}

// Cumulative all-time count of confirmed successful donations (see
// isConfirmedSuccess below) — unlike buildSuccessfulDonationsChart's
// per-category/per-month series, this isn't windowed to the last 6 months.
function countAllTimeSuccessfulDonations() {
  const sheet = getOrCreateSubmissionsSheet();
  const data = sheet.getDataRange().getValues();

  let count = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[colIndex("donate_or_receive")] !== "Donate") continue;
    if (isConfirmedSuccess(row[colIndex("successful_match")])) count++;
  }
  return count;
}

// Per-category active (still-open, unmatched) receive-side counts, new
// system only — same OPT_OUT_ACTIVE filter buildHomeViewModel already
// applies to donateRowsByCategory for the "Available now" status, just
// applied to the receive side. Feeds both the aggregate openRequests total
// and the per-category High Demand threshold; never exposed per-category as
// a number on the page itself.
function countActiveReceiveRowsByCategory(receiveRowsByCategory) {
  const counts = {};
  Object.keys(receiveRowsByCategory).forEach(category => {
    counts[category] = receiveRowsByCategory[category].filter(r => r[colIndex("opt_out_status")] === OPT_OUT_ACTIVE).length;
  });
  return counts;
}

function sumValues(obj) {
  return Object.keys(obj).reduce((total, k) => total + obj[k], 0);
}

// Start of today in the script's local timezone (Apps Script's V8 runtime
// defaults Date methods like getHours/setHours to the project's timezone,
// same assumption relativeTimeAgo and the analytics builders already make)
// — the cutoff for the two stats-strip "new since midnight" badges below.
function startOfTodayLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// How many of the rows countAllTimeSuccessfulDonations() counts are new
// since sinceDate — same isConfirmedSuccess filter and same
// opt_out_timestamp-falling-back-to-timestamp date convention as
// buildSuccessfulDonationsChart, so this is exactly "how much of that total
// is from today," not a differently-defined count.
function countNewSuccessfulDonationsSince(donateRowsByCategory, sinceDate) {
  let count = 0;
  Object.keys(donateRowsByCategory).forEach(category => {
    donateRowsByCategory[category].forEach(row => {
      if (!isConfirmedSuccess(row[colIndex("successful_match")])) return;
      const successDate = row[colIndex("opt_out_timestamp")] || row[colIndex("timestamp")];
      if (new Date(successDate) >= sinceDate) count++;
    });
  });
  return count;
}

// How many of the rows countActiveReceiveRowsByCategory() counts are new
// since sinceDate — same OPT_OUT_ACTIVE filter as that function, dated by
// submission timestamp (a request has no opt_out_timestamp until it stops
// being active).
function countNewActiveReceiveRowsSince(receiveRowsByCategory, sinceDate) {
  let count = 0;
  Object.keys(receiveRowsByCategory).forEach(category => {
    receiveRowsByCategory[category].forEach(row => {
      if (row[colIndex("opt_out_status")] !== OPT_OUT_ACTIVE) return;
      if (new Date(row[colIndex("timestamp")]) >= sinceDate) count++;
    });
  });
  return count;
}

// Overlaid line chart: one line per category, tracking successful donations
// (i.e. actually confirmed via the opt-out/check-in flow — see
// isConfirmedSuccess below — not just submitted) over the rolling window,
// plus a bold "Total" line. Replaced the old per-category donated-vs-requested
// bar chart, which only showed raw submission counts, not completed matches.
// Deliberately ships with no color-coded key (Index.html) — with up to 15
// categories a legend would be both unreadable and impossible to keep
// colorblind-safe, so identity is conveyed by hovering/clicking a line
// instead, per direct product instruction.
//
// Every row directly marked as a successful donation counts toward the
// total — this walks the raw Submissions rows once rather than summing
// per-category counts, so a row whose item_type doesn't match any known
// category (a renamed/retired category, migrated legacy data, bad input)
// still counts instead of being silently skipped; it's just bucketed under
// OTHER_CATEGORY_LABEL instead of getting its own named line. Bucketed by
// the date the donor actually opted out as successful (opt_out_timestamp,
// Schema.js), not the original submission date — falling back to the
// submission timestamp only for rows opted out before that column existed.
function buildSuccessfulDonationsChart(data, categories, months) {
  const perCategoryCounts = {};
  categories.forEach(c => { perCategoryCounts[c] = months.map(() => 0); });
  perCategoryCounts[OTHER_CATEGORY_LABEL] = months.map(() => 0);

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[colIndex("donate_or_receive")] !== "Donate") continue;
    if (!isConfirmedSuccess(row[colIndex("successful_match")])) continue;

    const itemType = row[colIndex("item_type")];
    const bucketKey = perCategoryCounts[itemType] ? itemType : OTHER_CATEGORY_LABEL;
    const successDate = row[colIndex("opt_out_timestamp")] || row[colIndex("timestamp")];
    const idx = months.findIndex(m => m.key === monthKey(new Date(successDate)));
    if (idx !== -1) perCategoryCounts[bucketKey][idx]++;
  }

  // Only include the Other line if it actually has anything in it, so
  // orgs whose data cleanly matches known categories don't get a
  // meaningless always-zero line.
  const seriesKeys = categories.concat(
    perCategoryCounts[OTHER_CATEGORY_LABEL].some(c => c > 0) ? [OTHER_CATEGORY_LABEL] : []
  );
  const series = seriesKeys.map(category => ({ category: category, counts: perCategoryCounts[category] }));
  const totalCounts = months.map((m, i) => series.reduce((sum, s) => sum + s.counts[i], 0));
  const maxCount = Math.max(1, ...totalCounts, ...series.map(s => Math.max(...s.counts)));

  return {
    windowLabel: months[0].label + " – " + months[months.length - 1].label,
    monthLabels: months.map(m => m.label),
    series: series,
    totalCounts: totalCounts,
    maxCount: maxCount,
    // All-time count of confirmed successful donations, independent of the
    // 6-month window above and computed the same row-direct way (see
    // countAllTimeSuccessfulDonations, already used identically on the
    // public home page) — this is the number to trust as "the total."
    allTimeTotal: countAllTimeSuccessfulDonations()
  };
}

// A "successful match" value that's neither blank nor the literal "No" (see
// PortalServer.js's optOutSubmissionsRow/portalReportOutcome and
// OptOutServer.js's optOutInternal) means someone actually confirmed it
// through the opt-out/check-in flow — deliberately stricter than
// "submitted," which the monthly-additions chart below already covers.
function isConfirmedSuccess(value) {
  const v = (value || "").toString().trim();
  return v !== "" && v !== "No";
}

// Simple aggregate trend (all categories combined) rather than the old
// per-category-per-month table, which was hard to read as a data grid and
// harder still to render as a legible multi-series chart on a phone screen.
// Walks the raw rows directly (like buildSuccessfulDonationsChart above)
// rather than a per-category grouping, so an unrecognized item_type still
// counts toward "donations added" instead of being dropped.
function buildMonthlyTotalChart(data, months) {
  const counts = months.map(() => 0);
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[colIndex("donate_or_receive")] !== "Donate") continue;
    const idx = months.findIndex(m => m.key === monthKey(new Date(row[colIndex("timestamp")])));
    if (idx !== -1) counts[idx]++;
  }
  return {
    monthLabels: months.map(m => m.label),
    counts: counts,
    maxCount: Math.max(1, ...counts)
  };
}

// --- Analytics: opt-out/expiration/match totals and time-to-opt-out stats
// (?view=analytics only) ---

// Per-direction (and combined) counts of where every submission currently
// stands, plus the rates derived from them. matchedRate is out of every
// submission (including still-active ones); matchedRateOfOptedOut is out of
// only the ones that actually closed out one way or another — a materially
// different denominator, both are useful.
function buildOptOutTotals(data) {
  return {
    donate: directionTotals(data, "Donate"),
    receive: directionTotals(data, "Receive"),
    combined: directionTotals(data, null)
  };
}

function directionTotals(data, direction) {
  let total = 0, active = 0, expired = 0, optedOut = 0, matched = 0, notMatched = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (direction && row[colIndex("donate_or_receive")] !== direction) continue;
    total++;
    const status = row[colIndex("opt_out_status")];
    if (status === OPT_OUT_ACTIVE) {
      active++;
    } else if (status === OPT_OUT_EXPIRED) {
      expired++;
    } else if (status === OPT_OUT_OPTED_OUT) {
      optedOut++;
      if (isConfirmedSuccess(row[colIndex("successful_match")])) matched++;
      else notMatched++;
    }
  }
  return {
    total: total,
    active: active,
    expired: expired,
    optedOut: optedOut,
    matched: matched,
    notMatched: notMatched,
    expiredRate: rate(expired, total),
    matchedRate: rate(matched, total),
    matchedRateOfOptedOut: rate(matched, optedOut)
  };
}

function rate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

// Days between submission and opt-out, split by direction (donor vs.
// requester) and by whether that opt-out reported a confirmed match — the
// four groups the user asked to compare. Only rows that actually have an
// opt_out_timestamp are included (see setOptOutStatus, Schema.js) — a row
// opted out before that column existed has no recorded date, so it's
// excluded rather than assigned a misleading 0-day or full-window duration.
function buildTimeToOptOutStats(data) {
  return {
    donate: timeToOptOutForDirection(data, "Donate"),
    receive: timeToOptOutForDirection(data, "Receive")
  };
}

function timeToOptOutForDirection(data, direction) {
  const withMatch = [];
  const withoutMatch = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[colIndex("donate_or_receive")] !== direction) continue;
    if (row[colIndex("opt_out_status")] !== OPT_OUT_OPTED_OUT) continue;

    const optOutTimestamp = row[colIndex("opt_out_timestamp")];
    if (!optOutTimestamp) continue;

    const days = (new Date(optOutTimestamp) - new Date(row[colIndex("timestamp")])) / (1000 * 60 * 60 * 24);
    if (days < 0) continue; // guard against bad/backfilled data

    (isConfirmedSuccess(row[colIndex("successful_match")]) ? withMatch : withoutMatch).push(days);
  }
  return {
    withMatch: summarizeDurations(withMatch),
    withoutMatch: summarizeDurations(withoutMatch)
  };
}

function summarizeDurations(daysArr) {
  if (!daysArr.length) {
    return { count: 0, mean: null, median: null, p25: null, p75: null, p90: null };
  }
  const sorted = daysArr.slice().sort((a, b) => a - b);
  return {
    count: sorted.length,
    mean: round1(sorted.reduce((sum, v) => sum + v, 0) / sorted.length),
    median: round1(percentile(sorted, 50)),
    p25: round1(percentile(sorted, 25)),
    p75: round1(percentile(sorted, 75)),
    p90: round1(percentile(sorted, 90))
  };
}

// Linear-interpolation percentile (same convention as numpy's default) over
// an already-sorted array.
function percentile(sorted, p) {
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - (rank - lower)) + sorted[upper] * (rank - lower);
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function monthKey(date) {
  return date.getFullYear() + "-" + date.getMonth();
}

function lastNMonthLabels(n) {
  const now = new Date();
  const result = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({ key: monthKey(d), label: MONTH_ABBR[d.getMonth()] + " " + d.getFullYear() });
  }
  return result;
}
