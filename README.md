# Cabinet Mode (内阁模式) for DeepSeek Harness

[中文](README.zh.md) | English

A small **declarative DSH bundle** that adds **Cabinet Mode** (`内阁模式`) to
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 0.2.1-rc.3.
Install the bundle, restart DSH, and pick **内阁模式** when starting a new
session. The mode is a research-team preset modeled on the Great Ming Research
Bureau cabinet (大明科研司·内阁): a Lead (内阁首辅) directs members (阁臣) of four
bureaus, defaults to research before touching code, and must never fabricate
sources.

The bundle ships no JavaScript and has no dependencies. It declares one
`@deepseek-ai/dsh-agent-preset` row and reuses the plugin list shipped with DSH
**Standard Mode**, so the mode has the same tools as Standard Mode; only the
persona differs.

---

## Install with an AI agent (copy this prompt)

```text
Install the "Cabinet Mode" (内阁模式) DSH bundle for me.

1. Check that `dsh --version` is 0.2.1-rc.3. Do not continue on other versions without telling me.
2. Install the bundle into my DSH profile:
   dsh plugin --profile desktop add <absolute path to the dsh-cabinet-mode checkout or .tgz>
   (If you have the release tarball URL, that URL can be used instead of a local path.)
   If the `dsh` CLI is unavailable, open DSH Settings -> Plugins -> Add plugin and
   choose "local directory" with the absolute path of the dsh-cabinet-mode checkout.
3. Run `dsh plugin --profile desktop list` and confirm `dsh-cabinet-mode` is installed.
4. Do NOT also append cordis.patch.yml to my profile patch: the two installation
   methods are mutually exclusive and duplicate preset ids fail to load.
5. Tell me to fully quit and restart DSH, then create a new session and choose
   "内阁模式" (preset id: cabinet) in the mode picker.

If any step fails, show the exact error and stop. Do not retry more than once.
```

## Manual install (3 lines)

```sh
dsh plugin --profile desktop add https://github.com/luodaoyi/dsh-cabinet-mode/releases/download/v0.1.0/dsh-cabinet-mode-0.1.0.tgz
# fully quit and restart DeepSeek Harness
# New session -> mode picker -> 内阁模式
```

For a local checkout, replace the tarball URL with the absolute path of this
repository. On Windows the CLI is `dsh` (runs through `dsh.cmd`); the same
commands work on Linux and macOS.

---

## What you get

| | |
|---|---|
| Mode name | 内阁模式 (**Cabinet Mode**), preset id `cabinet`, order 5 |
| Identity | One persona shared by the Lead and every teammate. The Lead (内阁首辅) reads the request, splits it, assigns work, adjudicates, summarizes and closes the loop; members (翰林院编修 / 工部主事 / 大理寺评事 / 都察院御史) execute bureau-scoped work and must never claim to be the Lead. |
| Default posture | Research first, change code only when explicitly authorized; every conclusion must cite a path, line, command output or source; unverified items must be marked as such. |
| Tools | Same 22 plugin rows as Standard Mode (shell, filesystem, jobs, schedule, skills, goals, plan mode, compaction, delegation/workflow, ask-user, todo, web, present). |
| Platform | Cross-platform: `tool-bash` is enabled on Linux/macOS, `tool-pwsh` on Windows, exactly like Standard Mode. No absolute paths, no shell-specific install step, no build step. |
| Team tools | The nine Agent Team tools come from the `@deepseek-ai/dsh-experimental-agent-team-profile` profile bundle, not from this preset. If that bundle is not enabled in your DSH profile, the cabinet runs without teammate tools. |

## Requirements

- **DeepSeek Harness 0.2.1-rc.3.** Other versions are unverified: the preset
  declaration format is a 0.2.1 feature.
- Node.js **>= 20 only for the optional fallback scripts** (`scripts/*.mjs`).
  The recommended plugin install path does not use Node directly.
- Optional: enable **Agent Teams** for the full Lead/teammate workflow.

## Installation matrix

| Method | Windows | Linux | macOS | Notes |
|---|---|---|---|---|
| **A. DSH plugin manager** (recommended): plugin page "Add plugin -> local directory/package", or `dsh plugin --profile <profile> add <absolute path / .tgz / release URL>` | ✅ tested locally (bundle install + `dsh plugin list` + composition check) | ⚙️ code-level inference, **not tested on this machine** | ⚙️ code-level inference, **not tested on this machine** | Pure YAML bundle: no build, no dependencies, no OS-specific code. See [docs/cross-platform.md](docs/cross-platform.md). |
| **B. Fallback node scripts** (no plugin manager): `node scripts/install.mjs --profile <profile>` then `--apply`; writes the profile `cordis.patch.yml` | ✅ scripts tested on Windows (dry-run + temp copies) | ⚙️ code-level inference, **not tested** | ⚙️ code-level inference, **not tested** | Same file layout on all platforms: `<DSH_HOME>/profiles/<profile>/cordis.patch.yml`. |

**Method A and Method B are mutually exclusive.** Both create the preset
declaration `config.id: cabinet`. Installing both makes the preset id appear
twice, and the preset declaration then fails to load. Uninstall one method before
switching to the other.

### A. Install as a DSH bundle (recommended, all platforms)

1. Install the bundle into the profile you use:
   - **Plugin page:** Settings → Plugins → Add plugin → local directory / package,
     then select this repository (or its `.tgz`).
   - **CLI:** `dsh plugin --profile desktop add <absolute path to this repo, .tgz, or release URL>`
2. Confirm: `dsh plugin --profile desktop list` shows `dsh-cabinet-mode`.
3. Fully quit and restart DeepSeek Harness.
4. Create a new session and pick **内阁模式** in the mode picker.

### B. Fallback: write the profile patch layer (no plugin manager)

Requires Node.js >= 20. The scripts are cross-platform and dry-run by default.

```sh
node scripts/install.mjs --profile desktop          # dry run: prints the plan only
node scripts/install.mjs --profile desktop --apply  # backs up, writes, self-checks
node scripts/verify.mjs                             # repository + dsh composition check
# fully quit and restart DeepSeek Harness
```

The script writes `<DSH_HOME>/profiles/<profile>/cordis.patch.yml` (default
`%USERPROFILE%\.dsh` on Windows, `~/.dsh` on Linux/macOS). It refuses when the
bundle is already installed in the profile, refuses when `preset-cabinet` already
exists, keeps a timestamped backup, verifies the backup SHA-256, wraps the insert
in `BEGIN/END` markers, replaces the whole file when the target is empty/`[]`/comments-only
(appending in that case would produce invalid YAML), and restores the backup if
the post-write check fails.

## Enable and verify

- **Restart is required.** Preset declarations load eagerly; changes only affect
  sessions created afterwards.
- New session → mode picker → **内阁模式** (`cabinet`). The mode is fixed for the
  session once it has produced any output.
- Check the mode is present: Settings → Agent presets should show the
  **内阁模式** card; its configuration view is read-only.
- Repository check: `node scripts/verify.mjs` — it asserts the package fields,
  the preset declaration, the 22-row plugin list, the dual-identity persona,
  cross-platform guards, and (when `dsh` is on PATH) runs
  `dsh --profile web --patch ./cordis.patch.yml --dump-config`, expecting exit 0
  with exactly one `preset-cabinet` and the four shipped presets intact.

## Rollback

| Installed with | Remove with | Then |
|---|---|---|
| Method A (bundle) | `dsh plugin --profile desktop remove dsh-cabinet-mode` | Fully restart DSH |
| Method B (node script) | `node scripts/uninstall.mjs --profile desktop --apply` | Fully restart DSH |

The fallback uninstaller only removes its own `BEGIN/END` block. It refuses to
touch a `preset-cabinet` entry it did not write (bundle or manual install); remove
that through the plugin page instead. Both commands are dry-run by default; add
`--apply` to write.

## Unverified items

These were **not** tested on this machine and must not be presented as verified:

- Real bundle installation and the post-restart mode picker on **Linux and macOS**
  (code-level inference only; Windows was tested locally).
- Restart/UI behavior for every DSH version other than 0.2.1-rc.3.
- Live teammate behavior: whether a spawned teammate inherits this persona and
  actually follows the member identity instead of claiming to be the Lead.
- Whether the installed bundle or the fallback patch survives DSH app upgrades.
- Whether `config.id` syntax rules reject unusual ids (this id is `cabinet`).
- GitHub Release install from the release asset URL (the release workflow is
  prepared, but the first release was not used for an install test).

## Known limitations

- A preset is **not a sandbox**: declarations are trusted configuration and can
  execute host code. Review bundles before installing them.
- A user override of this preset replaces the whole plugin list; it does not merge
  future upstream changes.
- The persona is shared by the Lead and every teammate, so it must decide identity
  from the Agent Team runtime context (exact phrases
  `You are the Team Lead named "lead".`,
  `You are teammate "<name>".`, `Your Team Lead is named "lead".`); teammates are
  forbidden from claiming to be the Lead.
- The persona must not contain `{{cwd}}` or other unregistered prompt variables;
  DSH 0.2.1-rc.3 fails prompt assembly before the first model request.
- Team workflow depends on the Agent Teams profile bundle being enabled.

## Cross-platform notes

See [docs/cross-platform.md](docs/cross-platform.md) for the code-level analysis
of the install chain, the `!!js process.platform` guards, the fallback patch path,
and the Windows-tested vs Linux/macOS-inferred split. Sections:

- [Conclusion matrix (结论矩阵)](docs/cross-platform.md#结论矩阵) — platform × 13 items, with a tested-vs-inferred column
- [Item-by-item analysis (逐项论证)](docs/cross-platform.md#逐项论证)
- [Not tested on this machine (未在本机实测清单)](docs/cross-platform.md#未在本机实测清单)
- [Evidence index (依据索引)](docs/cross-platform.md#依据索引)

## License

[MIT](LICENSE)
