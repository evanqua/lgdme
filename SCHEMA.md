# Schema

Stack-agnostic description of this system's data model — written so it could double as a spec for reimplementing the matching/notification logic on a non-Google backend, not just as an internal reference for this repo. Concrete types below are described generically (string, boolean, datetime, enum, JSON) rather than as Google Sheets cell types.

Three tables (in this implementation: three tabs of one Google Sheet), plus one static config structure that isn't stored data but drives both the intake form and email rendering.

## `submissions`

One row per donate-or-receive listing. Append-only in spirit — rows are updated in place (status, counters) but never deleted by any code path.

| Column | Type | Meaning |
|---|---|---|
| `timestamp` | datetime | When the listing was submitted. Age is computed from this (expiration, stale nudges, landing-page freshness). |
| `submission_id` | string (UUID) | Stable identity for this row. Used for self-exclusion in matching and as the join key into `match_log`. Never reused. |
| `token` | string (UUID) | Capability token — anyone holding it can view/act on this specific row via the self-service portal. Minted once at submission time, reused in every email link to this listing. Treat as a bearer secret: don't log it anywhere public, don't let it leak into the public landing page. |
| `email` | string | Submitter's contact email. |
| `first_name` | string | |
| `last_name` | string | Not shown to matched parties — display-only for the org's own records. |
| `city` | string | Shown to matched parties for rough geographic matching. |
| `phone` | string | Only shown to a matched party if `phone_share_consent` is true. |
| `phone_share_consent` | boolean | |
| `donate_or_receive` | enum: `Donate` \| `Receive` | Which side of the exchange this listing is. |
| `item_type` | string | Must be a key in the `item_config` structure below. |
| `details_json` | JSON object | Item-type-specific answers, keyed by field id (see `item_config`). Free-form beyond that — no separate schema to keep in sync when `item_config` changes. |
| `photo_urls` | string | Comma-separated URLs to uploaded photos (publicly viewable links). |
| `opt_out_status` | enum: `Active` \| `Opted Out` \| `Expired` | `Active` is the only status that participates in matching or counts toward landing-page availability. |
| `notification_consent` | boolean | Whether this submitter wants "new match" emails for as long as their listing is active. |
| `notification_expiry` | datetime | After this date, matching notification emails stop even if `opt_out_status` is still `Active` (resubmitting renews it). |
| `notification_count` | integer | How many "new match" emails this row has triggered. Also the primary signal used by the unresponsive-listing audit flag. |
| `initial_match_count` | integer | Snapshot of how many matches existed at submission time — informational, not re-derived later. |
| `successful_match` | string | Set when the submitter reports (or the recipient confirms) which `submission_id` they matched with. Cross-checked against `match_log` by the audit pass. |

**Matching rule**: two rows match if `item_type` is equal, `donate_or_receive` is opposite, both are `Active`, and neither's `notification_expiry` has passed.

## `match_log`

One row per (recipient, shown-match) pair — logged every time a notification email includes a given listing in its match table. Never edited after insert, only appended to. Exists so opt-out / match-outcome reporting can be a dropdown of real notified parties instead of free text, and so an audit pass can detect a reported outcome that doesn't correspond to any real notification.

| Column | Type | Meaning |
|---|---|---|
| `timestamp` | datetime | When the notification was sent. |
| `submission_id` | string | Whose inbox this notification landed in. |
| `matched_submission_id` | string | The other party shown to them in that email. |
| `matched_email` | string | Denormalized copy of that party's email, for display without a second lookup. |
| `context` | enum: `initial` \| `new_match_alert` | `initial` = shown in the submitter's own just-submitted confirmation email; `new_match_alert` = shown because someone else's new listing triggered a notification to this existing submitter. |

## `audit_flags`

Output-only table for a scheduled review pass. Nothing in the system reads this table back or acts on it automatically — it exists purely for a human to review.

| Column | Type | Meaning |
|---|---|---|
| `timestamp` | datetime | When the flag was raised. |
| `submission_id` | string | The row being flagged. |
| `flag_type` | enum: `unresponsive_after_notifications` \| `unverified_match_outcome` | See below. |
| `detail` | string | Human-readable explanation. |

Flag conditions:
- `unresponsive_after_notifications`: `opt_out_status = Active` and `notification_count` is at or above a threshold (3 in this implementation), i.e. this listing has been shown to several people with no resulting opt-out/match-report.
- `unverified_match_outcome`: `opt_out_status = Opted Out`, `successful_match` is set, but `match_log` has no row proving that `matched_submission_id` was ever actually shown to this `submission_id`.

## `item_config`

Not stored data — a static structure (one entry per acceptable item category) that drives both intake-form field rendering and email field-label rendering. Adding or changing a category here changes both automatically; there is nothing else to keep in sync.

```
item_config: {
  [category_name: string]: {
    donate: FieldDef[],
    receive: FieldDef[]
  }
}

FieldDef: {
  id: string,               // key this answer is stored under in submissions.details_json
  label: string,             // shown on the form and in match emails
  type: "text" | "textarea" | "select",
  options?: string[],        // required when type = "select"
  required: boolean
}
```

`donate` and `receive` are independent field lists for the same category — a category's donate-side questions (e.g. "mattress included?") are often different from its receive-side questions (e.g. "preferences").
