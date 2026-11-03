# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the version is `0.x`, the JSON schema and scoring weights may still change
between minor versions; such changes are called out below.

## Unreleased

### Changed

- `instructions.tests` and `instructions.quality` accept a documented aggregate script, such
  as `npm run check`, when the script runs the tests, the linter, or the type checker —
  directly or through other scripts (`npm run …`, `run-s` / `run-p` / `npm-run-all`, Composer
  `@script`), up to five calls deep. Evidence uses a fixed label and never the script name.
  Repositories documented this way score higher; other scores do not change.

## 0.1.0 — unreleased

First public release. Message: **audit coding-agent readiness in one command.**

### Added

- `agentworthy check [path]` — a deterministic, local, read-only readiness audit
  of a repository, reported as an Agent Readiness Score out of 100.
- Four scored categories — Instructions (30), Automation (25), Repository
  Context (25), and Safety (20) — documented in
  [docs/SCORING.md](docs/SCORING.md).
- 19 detectors across those categories, documented in
  [docs/DETECTORS.md](docs/DETECTORS.md): `AGENTS.md` quality, setup, test,
  quality and architecture instructions; test, lint, type-check, CI and
  dependency automation; README, architecture documentation, project metadata,
  ignore rules and generated-content separation; `.gitignore`, secret-path
  exclusion, security policy and lockfile safety.
- Evidence-based, ecosystem-neutral discovery for Node, PHP, Python, Rust, Go,
  Ruby, Dart/Flutter, Swift, Java (Maven/Gradle), .NET, Elixir, and Make-based repositories,
  with checks reported as not applicable rather than failing when an ecosystem
  convention does not exist.
- Terminal report with aligned per-finding detector ids and score
  contributions, plus prioritized recommendations.
- `--format json` — a versioned, stable machine-readable report
  (`schemaVersion: 1`) for CI and integrations. Evidence carries file paths and
  labels, never file contents.
- `--min-score <0-100>` — exit code `2` when the score is below the threshold,
  with the explanation on stderr so JSON output stays parseable.
- `--help` and `--version`.
- Exit codes: `0` success, `1` runtime or invocation error, `2` threshold not
  met.
- CI validation on macOS, Linux, and Windows against Node.js 22 and 24, plus a
  dogfooding job that runs the tool against its own repository.

### Notes

- No LLM API, account, credential, or telemetry is involved at any point, and
  `check` never writes to or executes code from the analyzed repository.
- Node.js 22 or newer is required.
