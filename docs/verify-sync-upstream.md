> Historical contributor notes from PR #22 head e1f0058. These are not release acceptance evidence. Local file sources, version fallbacks and install-chain claims below are superseded by `pr22-install-validation.md`.

# 复验报告：upstream/main ff 合入与全套门禁（task-9 独立核验）

- 复验人：大理寺卿（二）dalisi-qing-2，受首辅 lead 节制
- 时间：2026-11-08 14:38–14:55 (Asia/Shanghai)
- 结论：**带条件通过** —— ①ff 结果与 ④静态变更面通过；②门禁除 4 件预期失败外全绿；③授权实测**坐实「环境依赖」判断但进一步定位为「版本依赖」**：test-model-prepared.mjs 在本机 DSH 0.2.1-rc.5 下必然失败，非仅缺 env
- 写入范围：仅本文件；③的临时文件已全部删净（证据见 §③）

## ① ff 结果亲验

```
$ git log -3 --format='%H %s'
425dd48f286a36321b41461a9b98022b0239b02c site: recommend memory plugins in README and site
002f16de338c011f9a27b8a7e07a8b9c0ec3e96a release: prepare Cabinet Mode 0.5.4
bd878a7c183e9ba541f7898cacc688d869bea4bf Merge pull request #21 from fslong520/fix/edge-direction-and-session-click
```

→ 通过：HEAD=425dd48，上为 002f16d / bd878a7，与任务书一致；bd878a7 即 PR #21 的 merge commit，证明 ff 确实经上游合并点推进。

```
$ git diff --stat c18a0e9..425dd48
（18 个文件）
 .github/workflows/ci.yml        |  39 +++++++++
 CHANGELOG.md                    |  65 +++++++++++
 README.md                       |  78 +++++++++++++-----
 README.zh.md                    |  57 +++++++++----
 cordis.patch.yml                |   7 +-
 index.js                        | 155 ++++++++++++++++++++++++++++++++++--
 locale/en.json                  |   6 ++
 locale/zh.json                  |   6 ++
 package-lock.json               |   4 +-
 package.json                    |   7 +-
 scripts/test-model-prepared.mjs | 173 ++++++++++++++++++++++++++++++++++++++++
 scripts/test-model-routing.mjs  |   2 +-
 scripts/verify.mjs              |   2 +-
 site/assets/css/style.css       |  11 +++
 site/en/index.html              |  86 +++++++++++++++-----
 site/index.html                 |  88 +++++++++++++++-----
 site/llms.txt                   |  24 ++++--
 site/sitemap.xml                |   4 +-
 18 files changed, 713 insertions(+), 101 deletions(-)
```

→ 通过：恰 18 文件、+713/-101，与工部所报一致。

```
$ git diff c18a0e9..425dd48 -- client.js
（空输出）
```

→ 通过：client.js 零变更（我方 c18a0e9 的修复未被上游回退）。

```
$ git status --porcelain
?? docs/acceptance/member-config-acceptance.md
?? docs/research-upstream-sync.md
?? docs/verify-pr21-copy-install.md
?? docs/verify/member-config-verification.md
```

→ 通过：恰四份未跟踪 docs（任务书预期「四份未跟踪 docs」）。

```
$ grep -rn -E '^(<<<<<<<|=======|>>>>>>>)' client.js index.js cordis.patch.yml scripts/ locale/
（无输出）
```

→ 通过：无冲突标记残留。

## ② 门禁复跑（逐个 exit code 与首行）

| 脚本 | exit | 首行输出 | 判定 |
|---|---|---|---|
| node --check client.js | 0 | （无输出） | 通过 |
| node --check index.js | 0 | （无输出） | 通过 |
| scripts/test-avatars.mjs | 0 | `Six distinct avatars: source dimensions, PNG bytes and both embedded modules agree.` | 通过 |
| scripts/test-client-inject.mjs | 0 | `PASS client injection contract double: targeted remote negative with real declarations, optional service absence/presence, disposal` | 通过 |
| scripts/test-client.mjs | 0 | `PASS: avatars, stale-team warnings, and distinct member/owner/group identities; mocked React, not browser E2E`（共 5 行 PASS） | 通过 |
| scripts/test-install.mjs | 0 | `PASS: fallback install/uninstall (4 target shapes), dry runs, backups, duplicate and bundle guards` | 通过 |
| scripts/test-market-index.mjs | **1** | `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@deepseek-ai/dsh-plugin-market-index' imported from .../scripts/test-market-index.mjs` | **预期失败（基线既有，缺包）** |
| scripts/test-member-settings.mjs | 0 | `PASS member editor: late snapshots, revision conflicts, atomic reset, cancel/unmount, profile independence; host preset/role/alias/default/off boundaries (mock contracts)` | 通过 |
| scripts/test-model-picker.mjs | 0 | `PASS model picker render: loading hint, empty/failure fallback, refresh, retained choices, manual Save and Chinese/English error translation` | 通过 |
| scripts/test-model-prepared.mjs（无 env） | **1** | `TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string. Received undefined at .../test-model-prepared.mjs:7` | **预期失败（缺 env，§③ 已带 env 实测）** |
| scripts/test-model-routing.mjs | 0 | `PASS routing: aliases, real role/preset gate, default restoration, missing service and disposal` | 通过 |
| scripts/test-roster.mjs | 0 | `PASS: native roster aliases, reused rows, text mutations, idempotence and cleanup (mock DOM)` | 通过 |
| scripts/test-model-selection.cjs | **1** | `TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string. Received undefined` | **预期失败（基线既有，缺 env）** |
| scripts/test-prompt-assembly.cjs | **1** | `Error: Set DSH_MODULE_ROOT to the installed official DSH node_modules directory`（脚本 :3 自抛） | **预期失败（基线既有，缺 env）** |
| scripts/verify.mjs | 0 | 尾行 `Result: PASS=43 FAIL=0 WARN=1` + `Verification passed.` | 通过 |

→ 汇总：**15 项中 11 绿、4 失败，四件失败与任务书预期完全吻合**（test-market-index.mjs / test-model-selection.cjs / test-prompt-assembly.cjs 基线既有 + test-model-prepared.mjs 缺 env）。**无预期外失败（含新增 test-model-prepared.mjs 的环境/版本失败，不是本版验收通过证据）**。

verify.mjs 的 WARN 原文（本机口径变化，如实记录）：

```
[PASS] 22-row plugin list order matches the DSH 0.2.2-rc.1 reference Standard Mode
  dsh version (informational only, no gate): 0.2.1-rc.5
[WARN] dsh version differs from the tested reference  (0.2.2-rc.1 tested, running 0.2.1-rc.5; informational only, no version gate and no failure)
```

（上游把 `TESTS_ON` 从 `0.2.1-rc.3` 改成 `0.2.2-rc.1`，见 scripts/verify.mjs:39。故本机 0.2.1-rc.5 现在恒出 WARN，与 task-6 时「rc.3 tested」的 WARN 是同一条规则的不同参照值。）

## ③ 【授权动作】test-model-prepared.mjs 带 env 实测

**跑前取证（防误删他人文件）**：

```
$ ls /var/opt/node24/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-agent-loop/lib/ | grep -c '^cabinet-test-'
0
$ ls .../dsh-agent-loop/lib/cabinet-test-*.mjs
ls: cannot access '...': No such file or directory
```

→ 跑前存量为 0，本目录无他人遗留 cabinet-test 文件。

**env 定位**（首辅给的两条线索均须修正）：

```
$ ls -d /var/opt/node24/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai   ← 存在
$ ls -d /opt/node24/lib/node_modules/@deepseek-ai                                     ← 仅此一层（dsh 装在 @deepseek-ai/dsh 下）
$ node -p "require('/var/opt/node24/lib/node_modules/@deepseek-ai/dsh/package.json').version"
0.2.1-rc.5
```

→ 正确的 `DSH_MODULE_ROOT` 是 **`/var/opt/node24/lib/node_modules/@deepseek-ai/dsh/node_modules`**（不是首辅提示的 `.../lib/node_modules` 或 `.../lib/node_modules/@deepseek-ai`——那两层都没有 `@deepseek-ai` 子目录）。`/opt/node24` 是指向 `/var/opt/node24` 的同一体（`readlink -f /opt/node24` → `/var/opt/node24`）。

**带 env 实测**：

```
$ export DSH_MODULE_ROOT=/var/opt/node24/lib/node_modules/@deepseek-ai/dsh/node_modules
$ ls "$DSH_MODULE_ROOT/@deepseek-ai" >/dev/null && echo "@deepseek-ai 存在"
@deepseek-ai 存在
$ node scripts/test-model-prepared.mjs
file:///.../scripts/test-model-prepared.mjs:40
 function reopen(seed){agent.session=sessionApi.Session.create(role,seed);...agent.model=new AgentModel(...)...}
                                                                                                                                                                ^
TypeError: AgentModel is not a constructor
    at reopen (file:///.../scripts/test-model-prepared.mjs:40:161)
    at file:///.../scripts/test-model-prepared.mjs:41:2
EXIT=1
```

→ **带 env 仍失败，且失败点前移**：无 env 时死在 :7（`path.join(undefined,'@deepseek-ai')`），带 env 后死在 :40 `AgentModel is not a constructor`。**未硬凑绿，如实报失败原文。**

**临时文件清理（授权动作闭环）**：

```
（脚本内 finally 已 fs.unlinkSync(exposed)）
$ ls "$DSH_MODULE_ROOT/@deepseek-ai/dsh-agent-loop/lib/" | grep '^cabinet-test-' || echo "无残留"
无残留
```

→ 跑后残留 0，`cabinet-test-*.mjs` 已删净（rm 输出：本例为 `无残留`；脚本自身用 `fs.unlinkSync` 删，我方另行 grep 复核为 0）。**该写入仅发生在 §③ 这一次带 env 运行中，且已清理。**

**「环境依赖」判断的进一步定位（重要，点名到行号）**：

`AgentModel is not a constructor` 的根因不是 env，是**本机 DSH 版本不够**：

- 脚本 :11 `const {AgentModel, agentEvents, installModelSelection, modelSelectionProjectionDefinition} = await load('dsh-agent');`
- 本机 `@deepseek-ai/dsh-agent@0.2.1-rc.5` 的 `lib/index.js:702` 导出仅为：
  `export { AgentRegistry, AgentRegistry as default, agentCarrier, agentEvents, assembleContextFor, emitAgentEvent, foldConsumedWork, installModelSelection };`
  → **无 `AgentModel`，无 `modelSelectionProjectionDefinition`**（后者在本机 `@deepseek-ai` 全树 grep 零命中）。
- 脚本自身 :173 的 PASS 文案写明 `official rc.1 preStep -> prepareRequest cases; real AgentModel/Cordis/SystemPrompt; ...`
- 本机 `dsh-agent-loop/lib/index.js:2023` 导出为 `AgentLoop, turnBoundaryProjectionDefinition` 等，**无 `ReactLoopAgent` 导出**（类体在 :747 存在但未 export，脚本 :26 要求能 import 到它）。

→ 结论：**test-model-prepared.mjs 是面向 DSH 0.2.2-rc.1 的新测试，在本机 0.2.1-rc.5 上属「缺依赖包/缺导出」，不是单纯缺 env。** 设 `DSH_MODULE_ROOT` 只能让它走到下一处版本墙。是否把它记为「本机不可运行的基线外失败」由首辅裁断；我方不改脚本、不改 env 配置。

## ④ 上游变更面静态审阅（运行期一律「未验证」）

### cordis.patch.yml（新增/替换键，行号为当前文件）

| 行号 | 变更 | 本机 0.2.1-rc.5 静态判定 |
|---|---|---|
| cordis.patch.yml:88 | `tool-fs` 新增 `config: { applyPatch: false }` | 本机 `dsh-tool-fs/lib/index.js` **全包 grep `applyPatch` 零命中**，`Config`（:1194 起）无此键 → 本机不识别 |
| cordis.patch.yml:156 | `tool-subagent` `modelSelectionSettings: true` → `modelSelection: true` | 本机 `dsh-tool-subagent/lib/index.js:314` schema 仍是 `modelSelectionSettings: z.boolean()`，:360 `const modelSelectionCapable = config.modelSelectionSettings === true;` → **本机仍读旧键，新键 `modelSelection` 不被读** |
| cordis.patch.yml:157 | 新增 `modelDiscovery: true` | 本机 `dsh-tool-subagent` 全包 grep `modelDiscovery` **零命中** → 不识别 |
| cordis.patch.yml:149-150（原 148-150） | 删除 `- id: tool-subagent-list-agents` / `name: '@deepseek-ai/dsh-tool-subagent-control/list-agents'` | 本机 `dsh-tool-subagent-control/package.json` **仍导出 `./list-agents`**（exports 键实测存在）→ 本机有该入口，patch 不再挂它 |

**未知键会被拒绝吗（静态）**：本机 `zod@4.6.7` 实测 `z.object({a:z.string()}).safeParse({a:'x',b:1})` → `{"success":true,"data":{"a":"x"}}`，即**未知键默认被静默丢弃、不报错**；cordis-plugin-loader 的 `resolveConfig` 走 schemastery/zod 同类路径。→ 静态推断：`applyPatch`/`modelSelection`/`modelDiscovery` 在本机**大概率被静默忽略而不炸加载**；但这只是 schema 层推断，**运行期是否真的不炸、功能是否退化，未验证**。

### locale/en.json、locale/zh.json（新增）

两文件均为新建，各 6 行，内容为 `meta.title` / `meta.description` 双语（en: `Cabinet mode`；zh: `内阁模式`）。同时 package.json 新增 `"./locale/*.json": "./locale/*.json"`（exports）与 `"locale/*.json"`（files）。

→ 静态看是市场/展示用元数据，非运行期逻辑。**本机 dsh-client-locale 装配是否读取它们、读取后是否生效：未验证。**

### 其它（静态）

- package.json `version` 0.5.0 → **0.5.4**；新增 exports `./locale/*.json`、`./icon`；files 增 `locale/*.json`。
- scripts/verify.mjs:39 `TESTS_ON` 0.2.1-rc.3 → **0.2.2-rc.1**（本机 0.2.1-rc.5 因此恒 WARN，见 §②）。
- scripts/test-model-routing.mjs:17 由同步 `apply(...)` 改为 `await apply(...)`（配合 index.js 新增的异步 apply 路径）。
- index.js +149/-6：新增 `attachPreparedMemberModel`、session projection 注册、`prepareModelSessionApi` 相关异步路径（diff 概览实测）。**client.js 零变更**（§① 已证）。
- README.md:3 明写：`Targets DSH 0.2.2-rc.1`、`On DSH 0.2.1-rc.3/rc.5 retain the previously verified package, including 0.5.0: the current preset omits the separate list_agents entry required on rc.5.`

→ **上游自己声明 0.5.4 面向 0.2.2-rc.1，且明示 rc.5 应继续用 0.5.0。** 这与我方 §③ 实测互为印证。

## 缺陷（点名到行号）

1. **【高】版本面不匹配：0.5.4 + 新测试面向 0.2.2-rc.1，本机为 0.2.1-rc.5。**
   - 证据：scripts/test-model-prepared.mjs:11 引 `AgentModel`，本机 `@deepseek-ai/dsh-agent/lib/index.js:702` 导出无此项；脚本 :173 自称 `official rc.1`；README.md:3 自称 `Targets DSH 0.2.2-rc.1` 并建议 rc.5 用 0.5.0。
   - 影响：本机跑该测试必然失败（§③ 实测 `AgentModel is not a constructor`，exit 1）。
   - 是否阻断合入：离线门禁其余 11 项全绿，故**不判合入失败**，但这是必须上呈的版本风险。
2. **【中】cordis.patch.yml 新键在本机不被识别（运行期未验证）。**
   - cordis.patch.yml:88 `applyPatch`（本机 dsh-tool-fs 无此键）、:156 `modelSelection`（本机 :314/:360 仍读 `modelSelectionSettings`）、:157 `modelDiscovery`（本机零命中）。
   - 影响：本机上这三项配置大概率被静默丢弃 → **子智能体 child model selection / fs applyPatch 行为可能与上游意图不同**。运行期是否报错、功能是否退化**未验证**。
3. **【中】list_agents 入口被 patch 删除，但本机 rc.5 仍需要它。**
   - cordis.patch.yml 原 :148-150 的 `tool-subagent-list-agents` 行已删；本机 `dsh-tool-subagent-control/package.json` exports 仍含 `./list-agents`；README.md:3 明说 `the current preset omits the separate list_agents entry required on rc.5`。
   - 影响：本机 rc.5 上**子智能体列表工具可能缺失**。运行期未验证。
4. **【低】本机恒出 verify WARN。** scripts/verify.mjs:39 TESTS_ON=0.2.2-rc.1 vs 本机 0.2.1-rc.5（:459 逻辑为 informational only，不判失败）。

## 未验证清单

1. **运行期兼容全部未验证**：cordis.patch.yml 新键（applyPatch / modelSelection / modelDiscovery）在本机 0.2.1-rc.5 是否被静默忽略、是否报错、子智能体选模型与 fs 打补丁行为是否退化——仅静态 schema 推断（zod 4.6.7 未知键默认丢弃，实测）。
2. **locale/*.json 装配未验证**：本机 dsh-client-locale 是否读取新增 meta、市场/设置页是否显示，未实测。
3. **浏览器/UI 未验证**：未开 3080 页面、未截图。
4. **进程内存未验证**：DSH web PID 645970（2026-11-07 11:57:50 起）内存仍是旧代码；本轮未重启（按令禁重启）。
5. **装机目录与本仓库一致性未复测**：本轮只读仓库与门禁，未 md5 比对装机 client.js（上一轮 task-6 已比过，但本轮 ff 后仓库 client.js 零变更，逻辑上应仍同；**本轮未重跑 md5，标未验证**）。
6. **test-model-prepared.mjs 在真 0.2.2-rc.1 上是否通过：未验证**（本机无 0.2.2-rc.1 环境）。
7. **父提交链与远端一致性未验**：未 fetch、未比对 `refs/remotes/upstream/main` 与本地 HEAD 是否同点（禁改 git 配置与网络操作在令外，本轮未做）。
8. **`git diff --stat` 的 +713/-101 只核了总数与 18 文件清单**，未逐 hunk 审 index.js 全部 149 行新增（仅审了概览与关键标识符）。

## 可复现命令汇总

```
cd /home/fslong/Documents/玩机/cabinet-fork/dsh-cabinet-mode
git log -3 --format='%H %s'
git diff --stat c18a0e9..425dd48
git diff c18a0e9..425dd48 -- client.js
git status --porcelain
grep -rn -E '^(<<<<<<<|=======|>>>>>>>)' client.js index.js cordis.patch.yml scripts/ locale/
node --check client.js && node --check index.js
for f in scripts/test-*.mjs scripts/test-*.cjs; do node "$f"; echo "EXIT=$?"; done
node scripts/verify.mjs
DSH_MODULE_ROOT=/var/opt/node24/lib/node_modules/@deepseek-ai/dsh/node_modules node scripts/test-model-prepared.mjs
ls /var/opt/node24/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-agent-loop/lib/ | grep '^cabinet-test-' || echo 无残留
```
