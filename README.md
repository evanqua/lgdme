# LgDME System

[![License](https://img.shields.io/github/license/evanqua/lgdme)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/evanqua/lgdme)](https://github.com/evanqua/lgdme/releases)
[![Tests](https://img.shields.io/github/actions/workflow/status/evanqua/lgdme/test.yml?branch=main&label=tests)](https://github.com/evanqua/lgdme/actions/workflows/test.yml)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
<!-- Zenodo DOI badge: add here once the release is archived, e.g. [![DOI](https://zenodo.org/badge/DOI/<your-doi>.svg)](https://doi.org/<your-doi>) -->

A Google Apps Script system that matches donors and requesters of durable medical equipment (hospital beds, wheelchairs, stair lifts, and similar items) and emails both sides when a match is found. It runs entirely on Google's own infrastructure (Sheets, Apps Script, Gmail, Drive), with no server to host and no database to run.

License: AGPL-3.0. Copyright (C) 2026 The ReCARES Network. See [LICENSE](LICENSE).

Status: active development, pre-release (`0.x`, no API/schema stability guarantees yet)

## Origin and support

Development of this system was led and sponsored by [ReCARES](https://recares.org), a nonprofit durable medical equipment reuse program in the San Francisco Bay Area. ReCARES built this system to run its own donation matching program, then made it open source in full, with the hope that it can serve as a foundation for other communities: reducing waste and getting essential medical equipment to people who need it, without every organization having to build this kind of system from scratch.

If this system has benefited you, your community, or your organization, consider supporting ReCARES's ongoing work. Donation information is available at [recares.org](https://recares.org). Contributions there help fund the continued maintenance and development of this project as well as ReCARES's own equipment reuse program.

## See it in action

ReCARES runs its own production instance of this system, built from this same codebase:

**[LgDME System, ReCARES](https://script.google.com/a/recares.org/macros/s/AKfycbyC3RX01ff9HI_jRCdj3TGWT5k6Y7yjNMArB3W-rH85DGi0kwb5RcSyiLbziTw6bmGV/exec)**

This is a real, live deployment serving the Bay Area, not a demo environment. It is a good reference for what your own instance can look like once configured, but please do not submit test listings there. Use your own instance (see `SETUP.md`) for testing and evaluation.

## Documentation

- [SETUP.md](SETUP.md): full walkthrough for standing up your own instance, including Google account/Workspace requirements, email sending limits, and deployment.
- [ARCHITECTURE.md](ARCHITECTURE.md): how the system is built, the request flow, the matching engine, and the token portal.
- [SCHEMA.md](SCHEMA.md): the data model, described independently of any specific database technology.
- [CONTRIBUTING.md](CONTRIBUTING.md): how to propose a change, coding conventions, and what belongs in this repo versus a downstream fork.
- [SECURITY.md](SECURITY.md): the security model of a deployed instance, and how to report a vulnerability.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md): expected behavior in this project's spaces.
- [CHANGELOG.md](CHANGELOG.md): notable changes by version.

## Versioning

This project follows [Semantic Versioning](https://semver.org/). Notable
changes are recorded in [CHANGELOG.md](CHANGELOG.md), and each released
version is tagged in git as `vMAJOR.MINOR.PATCH` (e.g. `v0.1.0`).

While the version stays `0.y.z`, treat everything, including the
`Submissions`/`MatchLog` sheet schema, `SiteConfig.js`/`Config.js`'s config
shape, and Web App routing, as potentially breaking between minor versions,
per SemVer's own rule for initial development. `1.0.0` is reserved for the
point this is stable enough for other organizations to depend on without
expecting breakage.

A git tag marks a reviewed checkpoint of the code, not a live deployment.
Pushing/tagging `main` doesn't by itself change what a Web App URL serves.
Match a tagged release to what's actually live by giving its `clasp deploy`
description the same version number (e.g. `clasp deploy -i <id> -d "v0.2.0"`).

The "Latest release" badge at the top of this file reads directly from
GitHub's Releases API and updates itself the moment a new release is
published; nothing in this README needs manual editing when a new version
ships. See `CLAUDE.md`'s "Contribution workflow" section for the full
Issue/PR/version-bump process.
