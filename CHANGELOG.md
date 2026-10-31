# Changelog

All notable changes to this project are documented in this file.

## [0.1.3] - 2026-10-31

### Fixed

- **rc.5 install notes are now conditional and match observed behavior.** The
  desktop-carrier `dsh` CLI runs `dsh plugin --profile desktop list/add ...`
  (exit 0, verified on DSH 0.2.1-rc.5); the real gates are the profile
  initialization prompt (fully quit DeepSeek Harness before installing/upgrading)
  and the `--dump-config` rejection on desktop profiles. The previous blanket
  "rc.5 rejects `dsh plugin`" wording was wrong.
- **The unverified list now reflects reality**: DSH 0.2.1-rc.5 real install and
  upgrade were tested on Windows (2026-10-31); what remains untested is the
  post-restart UI (mode picker / preset card / icon display), teammate behavior,
  Linux/macOS, real `remove`, and other DSH versions.

### Added

- Explicit **Upgrade** section: the same install command with the new version
  URL, then fully quit and restart. Upgrades v0.1.1 → v0.1.2 (rc.3, plugin CLI)
  and v0.1.2 → v0.1.3 (rc.5, embedded pnpm) were performed and verified.

### Changed

- `scripts/verify.mjs` no longer hard-codes the package version; version sync is
  enforced by the CHANGELOG-section check and the README release-URL checks,
  both derived from `package.json`.

## [0.1.2] - 2026-10-31

### Added

- **Bundle icon**: the package now ships `icon.svg` (a Ming-dynasty
  grand-secretary portrait provided by the project owner, embedded as a bitmap
  inside the SVG) and declares it via `"icon": "./icon.svg"`, following the same
  convention as the shipped `dsh-experimental-agent-team-profile` bundle.
- **README hero image** (`docs/images/cabinet-portrait.jpg`) and a team-layout
  diagram (`docs/images/cabinet-team.svg`) in both READMEs, plus a Screenshots
  section inviting real runtime captures.
- **DSH 0.2.1-rc.5 install note**: desktop builds at rc.5 reject
  `dsh plugin --profile desktop ...`; the READMEs now document the plugin-page
  route and the embedded-pnpm route (with `dsh.profile.bundles` kept).

### Fixed

- `scripts/verify.mjs` now also asserts the icon file, the `icon` field and the
  `files` entry, and the package version was bumped so the release URLs in the
  READMEs stay in sync (`v0.1.2`).

## [0.1.1] - 2026-10-29

### Added

- **"DSH-side constraints" (中文：DSH 侧限制与说明) sections** in `README.md` and
  `README.zh.md`, recording verified facts instead of implying the mode is
  unrestricted: Agent Team member/task/message limits from the profile's
  `@deepseek-ai/dsh-experimental-agent-team-profile` configuration
  (`maxMembers: 8`, `maxTasks: 256`, `maxMessageBytes: 65536`,
  `disposalTimeoutMs: 5000`; the deployment default for `maxMembers` is 16 and this
  desktop profile sets 8), the Team-tool dependency on that profile bundle,
  permission/sandbox ownership by DSH permission presets, the trusted-configuration
  warning, and the no-OS-restriction / no-plugin-allowlist / no-npm-account facts.
- **No DSH version gate.** The package declares no `engines.dsh` and no DSH
  `peerDependencies`; the README no longer pins a DSH version and explains how to
  adapt the 22 plugin rows if a DSH version ships a different built-in Standard Mode
  plugin set. 0.2.1-rc.3 is recorded as the **tested reference only**; no
  multi-version testing has been performed.

### Changed

- **F1 (documentation timeliness):** `README.md`, `README.zh.md` and
  `docs/cross-platform.md` now record the Windows-tested GitHub Release asset URL
  installation and the real `dsh plugin --profile desktop add` (2026-10-29,
  `dsh plugin --profile desktop list` = 3 packages). Linux and macOS remain
  code-level inferences and are still marked as not tested.
- **F3 (docs wording/paths):** local absolute paths in `docs/cross-platform.md` are
  generalized to `<DSH_HOME>` / `<repo>` placeholders; README wording changed from
  "ships no JavaScript" to "no plugin-runtime JavaScript (no `main`/`lib`); optional
  Node.js fallback scripts only".
- Version bump to **0.1.1**; release URL and tarball filename examples in both
  READMEs now point at `v0.1.1` / `dsh-cabinet-mode-0.1.1.tgz`.

### Fixed

- **F2 (backup timestamp granularity):** `scripts/install.mjs` and
  `scripts/uninstall.mjs` backup names now use second-granularity timestamps
  (`YYYYMMDD-HHMMSS`) plus a short random suffix, so install → uninstall → install
  within the same minute never overwrites an earlier backup. Size and SHA-256
  verification are unchanged.
- `scripts/verify.mjs`: the DSH version check is informational only (no version
  gate, never fails on a different DSH version); added assertions for the absence of
  DSH version-gate fields, the DSH-side constraints sections, `<DSH_HOME>`
  placeholder usage, and version consistency across `package.json`, READMEs and
  `CHANGELOG.md`.

The preset itself is unchanged: the 22-row plugin list, the cross-platform
`!!js process.platform` guards for `tool-bash`/`tool-pwsh`, and the dual-identity
persona are byte-identical to 0.1.0.

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
