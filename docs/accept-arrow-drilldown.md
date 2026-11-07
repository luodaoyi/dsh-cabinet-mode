# 验收报告：箭头方向与任务名点击下钻（task-4）

- 验收人：左都御史（zuodu-yushi），受首辅节制，独立亲读亲跑，不采信提示词转述
- 日期：2026-11-07
- 验收基准：用户原话两问题——①「工作流流向反了」（经首辅确认 = 流程箭头方向画反，应为 首辅→阁臣）；②「点击子智能体的任务名字应该能点进去看子智能体会话」（用户选定 = 点击后直接跳转打开该子智能体会话）。用户另裁：只改码不重启，浏览器实测本轮不做
- 对象现场：`client.js`（M，124+/29-）、`scripts/test-client.mjs`（M，98+/1-），仅此二文件改动
- **结论：带条件通过**（四项离线验收证据链闭合；条件 = 下方「浏览器视觉实测未验证」清单与「生效前置」，浏览器端零验证为用户明裁范围，非证据缺环）

---

## 一、逐条对用户原话回对表

### 问题①：「工作流流向反了」→ 应为 首辅→阁臣 —— **已修，亲验通过**

| 检查点 | 现场证据（path:line，行号以本次亲读为准） | 判定 |
|---|---|---|
| 依赖边 from/to 为 blocker→blocked | `client.js:3326-3327` `const from = rectOf(blockerId); const to = rectOf(task.id);`；`:3336-3337` `fromId: blockerId, toId: task.id` 同步；`:3321-3325` 注释自述 "Geometry reversed: the path starts on the blocker's row and ends on the blocked task's row" | ✅ |
| 圆点落被阻塞端 | 锚点 `ex/ey` 取 `t`（=to=blocked 端）`client.js:3357/3368`、`edge.e = [ex, ey]` `:3377`；`edge.ex = edge.e[0]` `:3409`；渲染 `cx: edge.ex` `:3176` | ✅ |
| keyframes 流光推演注释自标未验证 | `client.js:2412-2416`："…this is a desk derivation from the SVG dash rule, **not a browser observation (未验证)**"；`:2410` CSS 注释已改 `blocker → blocked` | ✅ 自标到位 |
| 层A org-chart 未动 | `git diff -U0 client.js` hunk 表：旧侧行号命中 2410/2411/2556/2999/3001/3005/3042/3046/3056/3103/3105/3235/3267/3277/3320/3564/3588/3645/3654/3670/4110，**无一落在 `buildConnectorPaths` 旧 3143-3234 与 org-chart 渲染体旧 3602-3611**（3103/3105 属 TaskEdgeLayer 注释区，新 3152/3155） | ✅ 确未动 |
| 键名/断言格式未破 | `client.js:3316` `task.id + '->' + blockerId` 未改；`test-client.mjs:227` 格式断言仍绿 | ✅ |
| 第 3 行断言亲跑 | `node scripts/test-client.mjs` → **rc=0**，输出第 3 行（出处 `scripts/test-client.mjs:370`）：`PASS: edge direction blocker → blocked (start on blocker row, dot on blocked row) and click-to-open binding rules (lead/unassigned/inert never bind)` | ✅ |

### 问题②：「点击子智能体任务名字应该能点进去」→ 跳转打开子智能体会话 —— **已修，亲验通过**

| 检查点 | 现场证据（path:line） | 判定 |
|---|---|---|
| TaskLine onClick 绑定与豁免 | 签名 `client.js:3085`（`onOpenOwner`）；`:3094` `openTask = typeof onOpenOwner === 'function'`；`:3102-3106` **onClick/cursor 只挂 `key:'subj'` 任务名 span**，状态点/状态字未挂 | ✅ |
| MemberCard onClick 绑定与豁免 | `canOpen` `client.js:3039-3043`：onOpen 为函数、`isCurrent !== true`、`phase !== 'failed'/'provisioning'、`member.id` 非空字符串，缺一不绑；`:3047-3048` onClick + `cursor:'pointer'` 仅在 canOpen 时挂 | ✅ |
| 面板解析豁免（lead 任务/unassigned/failed/provisioning/isCurrent 不绑） | `openableMember` `client.js:3633-3637`（排除无 id/自身/failed/provisioning）；`ownerMemberOf` `:3639` 排除 `isLeadTask`（`:3622`）；`ownerOpener` `:3642` 不可开返回 **null**；装配点 `:3667`/`:3725`（onOpen）、`:3735`/`:3752`（onOpenOwner） | ✅ |
| openCabinetSession 目标形态对原生一致 | 本实现 `client.js:2577-2589`：child===parent 走 string 分支（`:2582`），否则 `{parentSessionId: parentSessionId ?? childSessionId, childSessionId, mode:'continuable'}`（`:2583`）；原生 `dsh-experimental-client-ui-agent-team/lib/client.js:478-491`（亲读）：`:481-484` string 分支、`:485-489` 同对象形态 —— **目标形态一致**；差异仅原生 `:480` `retainedBy.mainView` 守卫本实现未复刻（见未验证清单） | ✅（形态）/ 差异未验证 |
| ctx.inject(['uiWorkspace']) 照 fork 先例 | `client.js:4197-4205` 新增可选通道，与 `:4186` `ctx.inject(['remote','remote.session'])`、`:4229` `ctx.inject(['configForms'])` 同一模式（grep `ctx.inject(\[` 全清单 4 行亲核）；通道缺失时 `cabinetOpenSession` 保持 null，点击返回 false 静默降级（`:2579`/`:2587`）；manifest inject 区未动 | ✅ |
| 全量测试记录 | `node --check client.js` **rc=0**；`node scripts/verify.mjs` **rc=0**，`Result: PASS=43 FAIL=0 WARN=1`；`node scripts/test-client.mjs` **rc=0**（3 行 PASS）；其余 `test-avatars/test-client-inject/test-install/test-member-settings/test-model-picker/test-model-routing/test-roster` 7 个 **rc=0**；`test-market-index.mjs`/`test-model-selection.cjs`/`test-prompt-assembly.cjs` **rc=1**，首行（`package_json_reader:331` / `errors:543` / `test-prompt-assembly.cjs:3`）与案卷基线「ERR_MODULE_NOT_FOUND / ERR_INVALID_ARG_TYPE / 缺 DSH_MODULE_ROOT」吻合，**基线既有失败，非本次引入**（案卷 verify §① 已做 HEAD 副本对照） | ✅ |

## 二、寺卿 D1-D4 处置核对

| 缺陷 | 处置要求 | 亲验结果 | 判定 |
|---|---|---|---|
| D1（`test-client.mjs:236` 旧文案 blocker side 与新方向矛盾） | 已修 | 现场 `scripts/test-client.mjs:236`：`assert.equal(edgeDots.length, 5, 'every edge ends in a dot on the blocked side')` —— 文案已改 **blocked side**；断言本体仍只数 `edgeDots.length === 5`，方向中性，**断言逻辑未动**；numstat 由案卷 97+/0 变为 **98+/1-**，恰为该行一删一增 | ✅ 已修 |
| D2（自报 211 行 vs 实测 124+/29-） | 记账留痕不改码 | `git diff --numstat` 亲跑：`124 29 client.js`、`98 1 scripts/test-client.mjs`；自报数字不实记账在案 | ✅ 记账 |
| D3（manifest :4068 行号不实，实为 i18n 字典） | 记账留痕不改码 | 结论「manifest 未动」以 `git status --porcelain -- package.json` 空输出 + client.js 旧 3671-4110 无 hunk 为证，成立；行号引用错误记账在案 | ✅ 记账 |
| D4（ownerOpener 返回 null 非 undefined） | 记账留痕不改码 | `client.js:3642` 亲读返回 null；`typeof null !== 'function'` 行为等价，记账在案 | ✅ 记账 |

## 三、受保护文件复核（④）

`git status --porcelain -- cordis.patch.yml index.js package.json README.md README.zh.md CHANGELOG.md scripts/verify.mjs` → **空输出**（相对 HEAD 零改动）。
全量 `git status --porcelain`：`M client.js`、`M scripts/test-client.mjs`、4 个 `?? docs/*.md`（task-1/3 报告与既有验收文档），**无其他改动**。verify.mjs 复跑仍输出其既有 43 条断言（未被篡改）。✅

## 四、浏览器视觉实测未验证（逐项过，以案卷未验证清单为准）

1. **流光朝向**：`stroke-dashoffset 0→-24` 使 dash 向路径终点（= blocked 端）滑动，系 `client.js:2412-2416` 桌面推演，注释自标「not a browser observation (未验证)」——**浏览器视觉实测未验证**。
2. **点击真跳转**：`openCabinetSession` 目标形态与原生一致，但真实点击后是否真打开子会话——**浏览器视觉实测未验证**。
3. **`member.id` 与 `sessions.byId`/statusMap 恒等性**：仅 schema（`sessionIdSchema`）与 fork 既有用法旁证——**未验证**。
4. **`uiWorkspace.openSession` 运行时注入可用性**：仅静态确认与 remote/configForms 同为 `ctx.inject` 可选通道，真实部署下注入是否到位——**未验证**（`scripts/test-client-inject.mjs` 仅 mock 层验证）。
5. **原生 `retainedBy.mainView` 守卫未复刻差异**：原生 `agent-team/lib/client.js:480` 有该门槛，本实现（`client.js:2577-2589`）无——未保留会话时点击行为差异——**未验证**（已知差异，待用户裁断是否补）。
6. **面板无箭头头部**：grep `marker|arrow|polygon` 仅命中注释 `client.js:2414/3292`，渲染体只有 path+circle（`:3158-3181`）；用户所指「箭头」是否即此依赖边（唯一带端点圆点+流光的线）——**需浏览器截图确认**（task-1 已发现的既有状态，task-2 未新增）。
7. **foreign-owner 任务的面板级点击**未在 fixture 中被断言直接钉死（代码路径 `client.js:3645-3647` 推导为不绑）——**未验证**。
8. 三个基线失败脚本仅确认「同错同码」，未修复未深挖（既有失败，不在本任务写入范围）。

## 五、生效前置（用户须知）

改动只落盘未生效，**用户须自行**：
1. `plugin install` 指向 fork 绝对目录 `/home/fslong/Documents/玩机/cabinet-fork/dsh-cabinet-mode`；
2. **重启 DSH**。
浏览器端验证（流光朝向、点击跳转）在重启后方可进行。

## 六、遗留风险清单（按御下术点名到人到文件行号）

| 级别 | 缺陷 | 位置 | 说明 |
|---|---|---|---|
| P2 | retainedBy 守卫未复刻 | `client.js:2577-2589`（缺），对照原生 `agent-team/lib/client.js:480` | 未保留会话时行为差异未验证；建议浏览器实测后决定是否补 |
| P2 | 无箭头头部，方向仅由端点圆点+流光暗示 | `client.js:2418-2421`（边样式无 marker）、`:3158-3181`（渲染体无头） | 用户所指「箭头」是否即此需截图确认；若用户期待可见箭头头部，需另行排期 |
| P2 | 流光朝向系桌面推演 | `client.js:2412-2416` | 自标未验证，浏览器实测后销项 |
| P3 | D2/D3/D4 记账项 | 工部自报口径（211 行 / manifest:4068 / undefined 措辞） | 已修不改码，验收留痕 |
| P3 | 三个基线失败脚本 | `scripts/test-market-index.mjs`、`test-model-selection.cjs`、`test-prompt-assembly.cjs` | 既有失败，与本次无关 |

**本轮验收未发现新增缺陷（P0/P1 = 0）。**

## 七、核验命令清单（可复现）

```bash
cd cabinet-fork/dsh-cabinet-mode
node --check client.js                                   # rc=0
node scripts/verify.mjs                                  # rc=0, PASS=43 FAIL=0 WARN=1
node scripts/test-client.mjs                             # rc=0, 3 行 PASS（第 3 行出处 :370）
for f in scripts/test-*.mjs scripts/test-*.cjs; do out=$(node "$f" 2>&1); echo "$f rc=$?"; done
git diff --numstat                                        # 124 29 client.js / 98 1 test-client.mjs
git diff -U0 client.js | grep '^@@'                      # hunk 表（层A 旧 3143-3234 零命中）
git status --porcelain -- cordis.patch.yml index.js package.json README.md README.zh.md CHANGELOG.md scripts/verify.mjs  # 空
grep -n "ctx.inject(\[" client.js                         # 4186/4197/4229 同模式
```

## 八、只读纪律

本轮仅新建本报告 `docs/accept-arrow-drilldown.md`；未改 `client.js`、`scripts/`、受保护文件任何既有内容。
