# Changelog

All notable changes to this project are documented in this file.

## [0.1.0] - 2026-10-29

First public release.

### Added

- `cordis.patch.yml`: a pure declarative DSH bundle that inserts one
  `@deepseek-ai/dsh-agent-preset` declaration for **Cabinet Mode** (`config.id: cabinet`,
  display name `内阁模式`, `order: 5`).
- The preset's 22-row plugin list is copied verbatim from DeepSeek Harness 0.2.1-rc.3
  `@deepseek-ai/dsh-web-app` shipped `presets/standard.patch.yml`, except for the
  `persona` row, so the mode behaves exactly like the built-in Standard Mode apart
  from its identity prompt.
- Dual-identity persona: the same persona prefix is shared by the Lead and every
  teammate. Identity is decided only by the exact Team runtime-context phrases
  `You are the Team Lead named "lead".`, `You are teammate "<name>".`, and
  `Your Team Lead is named "lead".`; teammates must never claim to be the Lead.
  Lead duties: read the request, break it down, assign work, adjudicate, summarize,
  close the loop. Default posture is research-only; sources must never be fabricated.
- Cross-platform plugin rows: `tool-bash` is disabled on Windows via
  `!!js process.platform === 'win32'` and `tool-pwsh` on other platforms via
  `!!js process.platform !== 'win32'`, matching the shipped Standard Mode; Linux and
  macOS therefore use bash automatically. No absolute paths, no shell-specific install
  steps, no `lib/` build step.
- `README.md` (English) and `README.zh.md` (Chinese) with a first-screen copy-paste
  install prompt for AI agents, a three-line manual install, a Windows/Linux/macOS
  install matrix, rollback commands, and an explicit list of unverified items.
- Node.js fallback installer scripts (no third-party dependencies, dry-run by default):
  `scripts/install.mjs`, `scripts/uninstall.mjs`, `scripts/verify.mjs`. `--apply` writes
  the profile `cordis.patch.yml` with backup, SHA-256 verification, idempotency,
  BEGIN/END markers, empty/`[]`/comments-only target handling, and post-write
  structure checks with automatic restore on failure.
- `docs/cross-platform.md`: code-level cross-platform analysis of the bundle install
  chain, preset platform guards, and the fallback patch path. Windows was tested;
  Linux and macOS are code-level inferences and are marked as not tested.
- `.github/workflows/release.yml`: on a `v*` tag, packs the npm tarball, emits
  `SHA256SUMS.txt`, and publishes both as GitHub Release assets with the built-in
  `GITHUB_TOKEN`. Nothing is published to npm.

### Known limitations

- Real installation and the post-restart mode picker were only exercised on
  Windows with DSH 0.2.1-rc.3; Linux and macOS are code-level inferences.
- The mode is fixed for the lifetime of a session once the session has produced
  output.
- A preset is not a sandbox: declarations are trusted configuration and can run
  host code.
- Applying this bundle and also appending the same insert to a profile patch would
  declare `config.id: cabinet` twice; the preset declaration then fails to load.
  Use exactly one installation method.
- Teammate behavior under this persona (inheriting the same prefix and not claiming
  to be the Lead) was not live-tested.
