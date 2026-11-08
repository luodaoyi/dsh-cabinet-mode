# PR #22 installation validation

This supersedes the historical contributor-machine notes. Base: e1f005896122703dc8c8480274e81d40601f7f49, integrated on main 425dd48f286a36321b41461a9b98022b0239b02c.

## Contract and behavior

- The public pinned source is @rsrsai/dsh@0.1.13, verified in the npm registry. No developer filesystem source is used.
- Official DSH 0.2.2-rc.1 remote calls return Result envelopes, including listBundles. Installation and enable application outcomes are checked separately.
- Installed packages use updateBundle; the host refuses a downgrade or unknown version. Each awaited operation has a 120-second deadline. Timeout is not cancellation. An unknown outcome blocks another operation in this client; inspect the native manager before retrying. This is not a cross-client host lock.
- Closing the card suppresses stale state writes and skips automatic enable after an unfinished install. Completed late replies can be reconciled on the next click. Restart notices remain across card remounts within the same client.
- The monitoring prompt does not promise scheduling or interpret interrupt acknowledgement as stopped tools. No runtime watchdog was added.

## Executed validation (2026-11-08)

- node --check client.js; node scripts/test-client.mjs: pass, including ten remote-double installation scenarios (not real installs).
- Official rc.1: node scripts/verify.mjs: 43 PASS, 0 FAIL, 0 WARN; test-model-prepared.mjs: 120 cases; test-prompt-assembly.cjs: 12 assemblies. Identity/model adapters are fixtures, with no model requests.
- Real official PluginManager plus Cordis/Loader, without HMR, in a newly created temporary profile: inspect and install public Respire 0.1.12, updateBundle to 0.1.13, enable, final listBundles version 0.1.13 and enabled true. Install/update/enable report restart-required. The actual pnpm operations succeeded. No user profile or model credentials were used.
- Real Chrome/React card via a local Result-envelope bridge to the official manager: public 0.1.13 install and enable, duplicate click protection, remount inventory readback; unmount during delayed installation did not enable after closing. The delayed lifecycle case uses a controlled remote double. This is not the full native DSH desktop transport or a model/team E2E test.
- Initial test-tool failures (Corepack resolution and a missing pnpm executable path) were corrected using isolated pnpm 11.13.1. Their failed runs are not counted as passes.

The five-tab settings flow retains the existing explicit Save/Cancel member configuration semantics. The memory-plugin operation is a separate explicit action. Historical platform evidence does not certify this preset for old DSH hosts; retain the documented older package there.
## Independent-review correction (2026-11-08)

The de84b6c inventory effect referenced an undeclared generation variable. The earlier tab renderer did not execute useEffect, and the earlier browser remount observation preceded that final edit; it therefore did not validate de84b6c. That claim is withdrawn for that commit.

The effect now captures token.epoch locally. An effect-running hook regression covers first mount, remount, manager replacement and an initial reply arriving after a completed operation. These are explicitly test doubles.

Real Chrome with React was rerun on the corrected source, using the official rc.1 PluginManager and the task-owned installed profile: first mount and remount both displayed 0.1.13 without initialInstalled. Calling the official updateBundle with target 0.1.12 returned application=failed and diagnostic "0.1.12 is not a version newer than the installed 0.1.13"; final inventory remained version 0.1.13, enabled=true. This confirms the host refuses downgrades; the old frontend call was not proven to downgrade anything. The card now also refuses newer/uncomparable versions before mutation, with seven regression cases. Nonstable or unknown versions are left to the native manager.
