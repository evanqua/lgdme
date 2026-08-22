# LgDME System

A Google Apps Script system that matches donors and requesters of durable medical equipment (hospital beds, wheelchairs, stair lifts, and similar items) and emails both sides when a match is found.

License: AGPL-3.0 — Copyright (C) 2026 The ReCARES Network. See [LICENSE](LICENSE).

Status: active development, pre-release (`0.x` — no API/schema stability guarantees yet)

## Versioning

This project follows [Semantic Versioning](https://semver.org/). Notable
changes are recorded in [CHANGELOG.md](CHANGELOG.md), and each released
version is tagged in git as `vMAJOR.MINOR.PATCH` (e.g. `v0.1.0`).

While the version stays `0.y.z`, treat everything — including the
`Submissions`/`MatchLog` sheet schema, `SiteConfig.js`/`Config.js`'s config
shape, and Web App routing — as potentially breaking between minor versions,
per SemVer's own rule for initial development. `1.0.0` is reserved for the
point this is stable enough for other organizations to depend on without
expecting breakage.

A git tag marks a reviewed checkpoint of the code, not a live deployment —
pushing/tagging `main` doesn't by itself change what a Web App URL serves.
Match a tagged release to what's actually live by giving its `clasp deploy`
description the same version number (e.g. `clasp deploy -i <id> -d "v0.2.0"`).
