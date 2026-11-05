# Changelog

All notable changes to this project are documented in this file.

## [0.3.0] - 2026-11-05

### Added

- **Per-member model selection.** Each office group in the 「内阁成员」 settings
  section gets a **Model** picker: *Follow Lead (default)* or a `provider/id`
  route enumerated from the runtime model catalog (`session.modelCatalog`
  remote — never a hard-coded list; the picker degrades to a manual
  `provider/id` text input when the catalog is unreachable). The host half
  validates the field (`provider/id`, ≤ 200 chars, corrupt values fall back to
  the Lead default) and applies it per member through the agent-scope
  `system-prompt/assemble` / `agent/request` waterfalls. Caveat: a member's
  route is snapshotted per prompt assembly — a teammate session is routed from
  its spawn-time configuration onward, a saved change takes effect at that
  member's next request, and members already live when the plugin mounts are
  re-attached from the agent registry; recreating the member or restarting the
  host remains the fallback boundary.

- **「内阁成员」settings section in the DSH settings page.** `client.js` now
  registers a page through the official `settings.section` slot (section id
  `cabinet`, label 「内阁成员」/ "Cabinet members"), mounted only while the
  browser half can reach the `configForms` service:
  - **Display name** per member, ≤ 40 characters; empty keeps the runtime name
    (`lead` / `hanlin` / …), i.e. the 0.2.0 rendering.
  - **Avatar** per member: source PNG / JPEG / WebP ≤ 2MB, centre-cropped in the
    browser and normalized to a 96×96 PNG whose data URL must stay ≤ 48KB; the
    five built-in bureau avatars stay one click away.
  - **Prompt** per member, ≤ 4000 characters; clearing the box injects nothing
    for that member.
  - Per-member **Restore default**, page-level **Reset all**, and
    autosave (text edits debounce ~0.4 s; avatar uploads and resets write
    immediately) with a saved / failed status line.
- **Host half `index.js` owns the configuration and the prompt injection.** The
  profile-root `cabinet-ui` row declares a fully volatile `Config` (`members`
  carries the small text fields, each avatar is its own top-level `avatar*`
  field) and registers one prompt section `cabinet:member` whose text provider
  runs on every assembly and resolves the current member through
  `ctx.agentTeams.tryMembership(agent)` — so a saved setting applies on the next
  turn without remounting the plugin. The section uses `interpolate: false` (user
  text may contain `{{…}}`) and an unconfigured deployment renders an empty
  section, which the prompt registry drops.
- `@deepseek-ai/dsh-client-ui-settings` added to `dsh.client.inject`;
  `@deepseek-ai/schemastery` declared in `dependencies` as the configuration
  schema runtime (a Host without it still loads the bundle: no settings page,
  panel keeps v0.2.0 rendering).
- **README (zh/en)** gained a full 「内阁成员配置」/ "Cabinet member settings"
  section: entry path, editable fields and their limits, storage location,
  clear / restore / reset semantics, the Lead's default 御下术 and how to turn it
  off, damaged-configuration fallback, and the known limitations below.
- **Lead directive: dispatch scale cap (anti-death-loop).** Each subtask must carry a single deliverable and one write scope, with a difficulty-tiered call budget written into the task brief — ≤30 tool calls for simple single-file tasks, ≤100 for multi-file merge/conflict/field-debugging work — and ≤2 retries on the same failure; task briefs must state the budget and stop conditions (report "failed/unverified" at the limit), no unbounded polling or third retry.

- Profile-wide Cabinet member settings for display names, portraits and duty prompts.
- Explicit atomic Save/Cancel with revision checks to prevent stale tabs overwriting settings.
- Cabinet-only runtime prompt sections. Standard and other presets remain unchanged.
- Default Lead policy and four office duty prompts; clear disables a block and restore
  restores its factory default. Runtime identities and task ownership remain unchanged.
- Settings are shared by browsers connected to the same DSH_HOME/profile, not isolated
  by browser account. Native roster names remain runtime identities.

### Changed

- **Default prompt content changed: the Lead now receives 御下术 (Lead only).**
  The Lead's system prompt gains a ten-point 御下术 plus one red line that
  overrides every tactic; teammates never receive it. This applies even to a
  deployment upgraded from 0.2.0 that never opens the settings page. Clearing the
  Lead's prompt box turns it off (nothing injected); **Restore default** brings
  the factory text back.
- **Version `0.2.0` → `0.3.0`**, and the README release links now target
  `v0.3.0` (`scripts/verify.mjs` pins README links to `package.json`'s version).

### Notes

- The settings page, the stored values and the prompt injection all hang off the
  profile-root `cabinet-ui` Loader row, which only a **bundle install (Method A)**
  creates. The Method B fallback installer still writes the preset insert only,
  so it has no settings page and no injection — behaviour identical to 0.2.0.
- The native team roster still only receives **avatars**; a configured display
  name applies to the Cabinet panel (member cards and task owner labels), while
  the roster keeps the runtime name, and runtime identity phrases
  (`You are teammate "<name>".`) are untouched.
- README links target v0.3.0 and become available when that release is published.

## [0.2.7] - 2026-11-05

### Fixed

- Cover composite and legacy official names including dalisi-pingshi and
  jiancha-yushi, separator variants, full pinyin bureaus and numeric suffixes.
  Preserve exact member/Owner identity and reject unrelated prefix lookalikes.
- Refresh native roster avatars when a row is reused or its text node changes,
  without observing injected attributes or repeatedly rewriting image sources.
- Replace dark initial-letter fallback blocks with a light, unranked portrait
  for unknown members. Add all-alias, panel and native DOM lifecycle regressions
  plus documented canonical spawn names. Existing README screenshots remain.

## [0.2.6] - 2026-11-05

### Changed

- Use the requested senior offices: 工部尚书 (second rank), 大理寺卿
  (third rank), and 左都御史 (second rank). Redraw Works with a golden-pheasant
  badge and Dali with a peacock badge, preserving the approved portrait style.
  The censor retains the appropriate xiezhi badge.
- Align persona, Chinese labels, README galleries and costume notes; preserve
  internal IDs, legacy lower-office aliases and distinct original member names.

## [0.2.5] - 2026-11-05

### Changed

- Use Chinese official titles consistently: 内阁首辅, 翰林院编修, 工部主事,
  大理寺评事 and 监察御史. Keep the existing rank-appropriate portraits,
  English internal keys, original member identities and legacy censor aliases.
- Align the persona and README galleries with these titles; the Lead tag remains
  Chinese in both UI locales. Add title, alias and identity regression checks.

## [0.2.4] - 2026-11-05

### Changed

- Replace all five Cabinet portraits with original Ming-style chibi officials,
  using role-specific crane, duck, egret and xiezhi rank badges. Document the
  chief secretary's additional-rank artistic setting and costume references.
- Preserve role matching and member identity labels; regenerate the 128px PNGs
  and embedded browser/module assets through the existing Pillow pipeline.
- Add byte-parity regression checks for the five PNGs and both embedded modules,
  and include exact illustration prompts and bilingual README galleries.

## [0.2.3] - 2026-11-05

### Documentation

- Include the separately required Enable now / Installed-page toggle after market
  installation; restarting alone does not activate a disabled bundle. Confirmed
  with a real rc.5 market uninstall/reinstall to 0.2.2 in an isolated web profile.

## [0.2.2] - 2026-11-05

### Documentation

- Make the plugin market the preferred installation path for users and AI
  assistants in both READMEs, with tested UI steps, the exact raw index URL,
  verification boundaries and explicit tarball/local-directory fallbacks.

## [0.2.1] - 2026-11-05

### Changed

- Refresh the five member portraits with chibi artwork and recognize role aliases,
  numeric suffixes and common separators (#3).
- Preserve original member identities beside localized role labels, including
  task owners and foreign-owner groups; add identity collision regressions (#4).
- Explain the exact raw JSON market URL and recovery from GitHub webpage URLs
  producing `$.format must be 1`, including on the generated index branch.
- Describe the runtime sidebar and avatars correctly in the market listing.

### Fixed

- Publish icon and index README changes even when marketplace.json is unchanged.
  Preserve registry propagation waiting and protection against version loss.

## [0.2.0] - 2026-11-05

### Added

- **Host half `index.js` + browser half `client.js`.** The package is no longer
  YAML-only. `client.js` registers the right-Sidebar **「内阁」 / Cabinet** tab:
  the Lead → minister dispatch tree (each task hangs under its `ownerName`, with
  `blockedBy` dependencies shown as chips), running members highlighted with a
  pulsing status dot, task colours (pending gray / in progress blue / completed
  green), and a per-member row with avatar, name, status label and current model.
- **Five member avatars** embedded as 128px data URLs (square sources in
  `docs/images/avatars/`, downscaled by `src/build_avatars.py`; originals are
  1MB+ and are never embedded directly): 首辅 bright yellow, 翰林院编修 cyan,
  工部主事 red, 大理寺评事 dark, 都察院御史 crimson.
- **README (zh/en) sections** 「内阁面板与成员形象」/ "Cabinet panel and member
  avatars" and 「生效说明」/ "How it takes effect". The former "no runtime
  JavaScript" / "one preset row" wording now describes `index.js` + `client.js`
  and the two inserted rows.

### Changed

- **`package.json`**: `0.1.6` → `0.2.0`, plus `exports` (`.`, `./client`) and
  `dsh.client` (`platform: web`, `immediately`, `inject`). Both are hard
  requirements of the DSH client-plugin loader: it throws when a `dsh.client`
  declaration has no `exports."./client"` (`dsh-client-modules`).
- **`cordis.patch.yml`**: appends the Loader row `cabinet-ui` →
  `dsh-cabinet-mode` so the host scans the package as a client plugin. The
  `preset-cabinet` declaration, and the 22-row plugin list are retained; persona rules change as described below.
- **persona**: the Lead's rules are enforced — mandatory decomposition and
  delegation (`spawn_teammate` plus a `team_task_*` board) before any hands-on
  work, the single-user-facing interface (only the Lead talks to the user;
  members answer through the Lead), and a member task-status line.
- **`scripts/verify.mjs`**: the package-fields check now allows `exports` and
  `dsh.client` while still rejecting `main` / `types` entries.

### Fixed

- The fallback installer writes only the persona preset, without referring to an
  uninstalled UI package. Regression tests cover dry runs, backups, install and
  uninstall, duplicate prevention and existing bundle guards.
- Composition verification installs the current checkout into a temporary
  DSH_HOME, avoiding stale installed versions and changes to the user profile.
- Chinese bureau and role names resolve to the matching member avatars.
- Team read failures warn that retained members/tasks may be stale.

### Notes

- The full panel requires a bundle install and a DSH restart; the fallback path
  installs only the persona preset.
- README links target v0.2.0 and become available when that release is published.

## [0.1.6] - 2026-11-03

### Fixed

- **The rollback guard reads a fresh baseline.** It now requests the published
  index with a one-shot `?t=` cache-buster; without it, a five-minute-stale
  `raw.githubusercontent.com` copy could let a lagging registry shrink the index.
  (Dalisi verification §13, D-12.)
- **A missing published index is no longer confused with an unreadable one.** Only a
  `404`/`ENOENT` is treated as "first release, nothing to protect"; any other read
  or parse failure aborts the refresh instead of silently skipping the guard, unless
  `MARKET_ALLOW_SHRINK=1` is set. (Dalisi verification §13, D-13.)
- `--check` reads the published index through the same cache-buster, so a stale CDN
  copy can no longer fake a match or a mismatch.

These fixes ship in `0.1.6`; `0.1.5`'s tarball still contains the earlier script.
They only affect the maintainer-side index refresh, not installing the bundle.

## [0.1.5] - 2026-11-03

### Fixed

- **The market-index refresh no longer races npm propagation.** The index job now
  waits for the just-published version to appear in the registry packument
  (`MARKET_EXPECT_VERSION`, polled every 15 s for up to 10 min) instead of
  regenerating from a stale, partially propagated packument.
- **Registry reads bypass stale caches.** Every fetch sends
  `cache-control: no-cache` and `pragma: no-cache`, and the packument URL carries a
  one-shot `?t=` cache-buster.
- **The index can no longer shrink silently.** Before writing, the generator
  compares its version set with the currently published index and refuses to
  replace a larger index with a smaller one (for example while the registry lags),
  unless `MARKET_ALLOW_SHRINK=1` is set. The manual `Market index` workflow exposes
  this as the `allow_shrink` dispatch input for a legitimate shrink after
  `npm deprecate` or unpublish.
- **Prerelease tags no longer refresh the index.** The release workflow skips the
  market-index job for tags containing `-`: the index rules exclude prereleases, so
  a refresh would only fail with a false "no installable versions" error, and a
  prerelease must not touch the stable index.
- Removed the ineffective `package-manager-cache: false` input from
  `actions/setup-node` in the release workflow.

### Context

- `dsh-cabinet-mode@0.1.4` was published to npm on 2026-11-03 by the
  tag-triggered Trusted Publishing (OIDC) flow, with a provenance attestation on
  sigstore, and its GitHub Release was created. The market-index job that follows
  the publish failed twice because the registry still served a packument containing
  only the `0.0.0-stage` placeholder; this release fixes that chain and is the
  first end-to-end run of tag → npm publish → automatic index refresh.
- The first OIDC publish, the GitHub Release, the generated `market-index` branch,
  parsing the index, and installing from the npm spec were exercised while
  handling 0.1.4; a real install/update in the DSH plugin market GUI remains
  unverified.

## [0.1.4] - 2026-11-03

### Added

- **npm publication through npm Trusted Publishing (OIDC).** Pushing a `v*` tag
  now runs `.github/workflows/release.yml`, which verifies the tree, packs the
  tarball, publishes `dsh-cabinet-mode` to `registry.npmjs.org` with
  `npm publish --access public` authenticated by the workflow's OIDC identity
  (`id-token: write`, no `NPM_TOKEN`), creates the GitHub Release, and refreshes
  the plugin market index branch. The npm-side trusted publisher must be created
  on npmjs.com first; the preconditions are documented in both READMEs. The first
  version was bootstrapped with `npm stage publish` (the npm registry refuses a
  trusted publisher for a package that does not exist yet), which left the public
  prerelease placeholder `0.0.0-stage` on the registry. Prerelease versions are
  published with `--tag next` so `latest` never points at a version the index
  skips; the first bootstrap also needs that flag because npm rejects an untagged
  prerelease.
- **Plugin market index (format 1).** `scripts/market-index.mjs` builds
  `marketplace.json` from the npm registry: it lists every published version,
  skips prereleases and deprecated versions, keeps `engines.dsh` optional (this
  package still declares no DSH version gate, so entries carry no `engines`
  member), writes integer-second `publishTimestamp` values, and sorts versions in
  descending SemVer order. `--check` compares the registry with the published
  index byte for byte. The script uses only Node built-ins; two test seams
  (`MARKET_REGISTRY_MANIFEST`, and a local path / `file:` URL in
  `MARKET_INDEX_URL`) allow offline fixture runs without changing the production
  defaults.
- `scripts/publish-market-index.sh` publishes `marketplace.json`, `icon.svg` and a
  README to the orphan `market-index` branch, force-pushing only when the content
  changed (three attempts). It is the only publisher implementation (CI and
  `npm run market:publish` both call it) and refuses to run on a working tree with
  modified or staged tracked files; run it only in a disposable clone with no
  uncommitted work (Windows uses Git Bash).
- `.github/workflows/market-index.yml`: manual and weekly refresh of the index
  branch. `.github/workflows/ci.yml`: pull-request checks (repository
  verification, script syntax, `npm pack --dry-run` and tarball content checks).
- **Install/update from the plugin market.** Both READMEs document the index URL
  `https://raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/market-index/marketplace.json`,
  adding it as an index source in the DSH plugin market, installing from it, and
  the required DSH restart. The documented update path is the real one for
  third-party plugins — uninstall the old version, install the new one, restart —
  because the market has no in-place update.

### Changed

- The release workflow no longer says "Nothing is published to npm": the GitHub
  Release is now an additional artifact, not the only distribution channel.
- README install/upgrade examples point at the 0.1.4 GitHub Release assets, and
  the npm-related "unverified" statements now describe the npm/index flow
  accurately.
- `docs/cross-platform.md` records the npm Trusted Publishing path, the market
  index generator, and the code-level update chain (no in-place update, SemVer-only
  comparison, no periodic check, 10-minute index cache).
- `files` in `package.json` now lists `docs/cross-platform.md` and `docs/images`
  explicitly instead of the whole `docs/` directory, so internal research and
  verification material stays in git but out of the npm tarball.
- Removed the unused `@deepseek-ai/dsh-plugin-market-index` devDependency and the
  Windows-only Node copy of the branch publisher: the repository stays
  dependency-free and the publish pipeline needs no install step.

### Unverified

- The release workflow, the npm publish and the index refresh have **not run
  yet**: no version is on npm, the `market-index` branch does not exist, and a
  real plugin-market install/update has not been performed. The UI labels and
  click path of the plugin market are unverified. The
  `dsh-cabinet-mode@<version>` install spec was confirmed locally by executing the
  format-1 reader (`@deepseek-ai/dsh-plugin-market-index@0.2.1-rc.5`,
  `marketInstallTarget`). The market update path documented in the READMEs (no
  in-place update; uninstall → install → restart; SemVer-only comparison; no
  periodic auto-check; 10-minute index cache) is a code-level finding recorded in
  `docs/research/market-index-research.md` §5, not an end-to-end test.

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
  URL, then fully quit and restart. Upgrades were performed and verified on
  Windows: v0.1.0 → v0.1.1 via the plugin CLI on DSH 0.2.1-rc.3, then
  v0.1.1 → v0.1.2 and v0.1.2 → v0.1.3 via the embedded-pnpm route on
  DSH 0.2.1-rc.5.

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
