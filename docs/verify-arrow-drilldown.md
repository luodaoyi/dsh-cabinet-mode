# 核验报告：箭头方向修复与任务名点击下钻（task-3）

- 核验人：大理寺卿（dalisi-qing），独立复跑，不采信工部自报
- 日期：2026-11-07
- 对象：`client.js`（M，124+/29-）、`scripts/test-client.mjs`（M，97+/0），仅此二文件改动
- 结论：**通过**（附 4 项低危缺陷/自报不实项，均不动摇两处修复本身；浏览器视觉实测未验证）

---

## 0. 开工与收工现场基线

```
$ git status --porcelain
 M client.js
 M scripts/test-client.mjs
?? docs/acceptance/member-config-acceptance.md
?? docs/research-arrow-drilldown.md
?? docs/verify/member-config-verification.md
$ git diff --numstat
124	29	client.js
97	0	scripts/test-client.mjs
```

收工时（含 /tmp 临时副本跑证后）复跑同一命令，输出逐字相同；`/tmp/dalisi-head` 已删除。**client.js 最终为工部改后状态，diff 与开工时一致。**

## ① 复跑全量（全部亲手跑，记录原文与 exit code）

| 命令 | 结果 | 与工部自报比对 |
|---|---|---|
| `node --check client.js` | exit=0 | 相符 |
| `node scripts/verify.mjs` | `Result: PASS=43 FAIL=0 WARN=1` + `Verification passed.`，exit=0 | 相符（WARN 为 dsh 0.2.1-rc.5 vs 参考 rc.3，信息性） |
| `node scripts/test-client.mjs` | 3 行 PASS，exit=0；第 3 行输出在 `scripts/test-client.mjs:370` | 相符（基线见下） |
| `scripts/test-avatars.mjs` | exit=0 | 相符 |
| `scripts/test-client-inject.mjs` | exit=0（`test-client-inject: ok`） | 相符 |
| `scripts/test-install.mjs` | exit=0 | 相符 |
| `scripts/test-member-settings.mjs` | exit=0（4 行 PASS） | 相符 |
| `scripts/test-model-picker.mjs` | exit=0 | 相符 |
| `scripts/test-model-routing.mjs` | exit=0 | 相符 |
| `scripts/test-roster.mjs` | exit=0 | 相符 |
| `scripts/test-market-index.mjs` | **exit=1**，`ERR_MODULE_NOT_FOUND` | 与「基线即失败（缺模块）」相符 |
| `scripts/test-model-selection.cjs` | **exit=1**，`ERR_INVALID_ARG_TYPE` | 与「基线即失败」相符 |
| `scripts/test-prompt-assembly.cjs` | **exit=1**，`:3 if(!process.env.DSH_MODULE_ROOT)throw Error(...)` | 与「缺 env」相符 |

**基线对照（改前 vs 改后）**：用 `git archive HEAD` 解包到 `/tmp` 独立跑：

- HEAD 版 `test-client.mjs` + HEAD 版 client.js → **2 行 PASS，exit=0**（工部所报基线 2 行相符）；
- 新版 `test-client.mjs` + HEAD 版 client.js → **exit=1**（见 ②  discriminate 项）；
- 三个失败脚本在 HEAD 副本与工作副本**同样 exit=1、同样首行错误**（ERR_MODULE_NOT_FOUND / ERR_INVALID_ARG_TYPE / 缺 DSH_MODULE_ROOT），证明系基线既有失败，与本次改动无关，工部「改前改后逐字相同」相符。

> 方法备注：循环里 `node f | tail; echo $?` 首轮取到的是 tail 的退出码，已改用 `out=$(node f 2>&1); rc=$?` 原样重跑取真值，上表为重跑结果。

## ② diff 审查（`git diff` 逐 hunk 读，全部亲手读原文）

### 2.1 箭头（依赖边）方向 —— 符合

- `client.js:3321-3327`（hunk `@@ -3267,2 +3321,7`）：`const from = rectOf(blockerId); const to = rectOf(task.id);` —— **from=阻塞者、to=被阻塞任务，确凿**（改前为 from=task.id / to=blockerId）。
- `client.js:3336-3337`：`fromId: blockerId, toId: task.id` 与之同步翻转；`client.js:3409` `edge.ex = edge.e[0]`，而 `edge.e` 由 `edge.to`（t 端）推得（`client.js:3346-3377` 几何：`ex/ey` 取 `t.left/t.right/t.top/t.bottom`）；`TaskEdgeLayer` 圆点 `cx: edge.ex, cy: edge.ey`（`client.js:3171-3177`）→ **圆点落在被阻塞端，确凿**。
- **键名未改**：`client.js:3316` `const key = task.id + '->' + blockerId;` 不在任何 hunk 内；`data-cabinet-edge` 格式断言 `scripts/test-client.mjs:227` 仍通过。
- **keyframes 符号未改**：`client.js:2417` `@keyframes cabinetEdgeFlow{to{stroke-dashoffset:-24}}` 不在任何 hunk（新增的 2412-2416 为注释）。推演自洽性：负向 offset 使 dash 图案沿路径向终点滑动，路径已反转为 blocker→blocked，故流光朝被阻塞任务——与改前「朝 blocker」同机制不同落点，逻辑自洽；但注释自认 desk derivation（`client.js:2415-2416`「not a browser observation (未验证)」），**浏览器视觉未验证**。
- **层A 未动**：`git diff -U0 client.js | grep '^@@'` 全部 hunk 落在 2410/2412/2562/3032/3035/3047/3085/3090/3104/3152/3155/3286/3321/3336/3379/3625/3666/3725/3734/3751/4193（新侧行号）；旧侧 3107–3234 与 3671–4110 完全无 hunk —— `buildConnectorPaths`（旧 3143-3234）与 TaskEdgeLayer 渲染体、`render` 装配区均**确未动**。

### 2.2 点击下钻 —— 符合（方案二，照 fork 先例）

- **通道形态对照原生** `dsh-experimental-client-ui-agent-team/lib/client.js:478-491`（亲手读原文）：
  ```js
  if (childSessionId === parentSessionId) { ctx.uiWorkspace.openSession(parentSessionId); return; }
  ctx.uiWorkspace.openSession({ parentSessionId, childSessionId, mode: "continuable" });
  ```
  `client.js:2577-2586` `openCabinetSession`：child===parent 走 string 分支，否则 `{parentSessionId: parentSessionId ?? childSessionId, childSessionId, mode:'continuable'}` —— **目标形态一致**；差异仅原生多一道 `retainedBy.mainView` 守卫（本实现无，行为差异**未验证**）。
- **可选通道照 remote/configForms 先例**：`ctx.inject(['remote','remote.session'])` 在 `client.js:4186`、`ctx.inject(['configForms'])` 在 `client.js:4229`，新增 `ctx.inject(['uiWorkspace'])` 在 `client.js:4197-4205`，同一模式；通道缺失时 `cabinetOpenSession` 保持 null，点击返回 false 静默降级（`client.js:2577-2586` try/catch 兜底）。
- **manifest 未动**：`git status -- package.json cordis.patch.yml` 干净；client.js 旧 3671–4110 无 hunk。工部所称「manifest :4068」行号不实（见缺陷 D3），但「未动」结论成立。
- **豁免逐条核**（原文行号）：
  - `MemberCard canOpen` `client.js:3032-3040`：`onOpen` 为函数、`isCurrent !== true`、`phase !== 'failed'/'provisioning'`、`member.id` 非空字符串，缺一不绑；`client.js:3047-3048` onClick+cursor 仅在 canOpen 时挂。
  - `TaskLine` `client.js:3085`（签名）、`3090-3094`（`openTask = typeof onOpenOwner === 'function'`）、`3104-3106`：**onClick 只挂 key='subj' 的任务名 span**，状态点/状态字 span 未挂（hunk 仅动 subj 行）。
  - `CabinetPanel 解析` `client.js:3625-3642`：`openableMember` 排除无 id / 自身（`member.id !== sessionId`）/ failed / provisioning；`ownerMemberOf` 排除 `isLeadTask`（`client.js:3624`）与无 ownerName；`ownerOpener` 不可开时返回 **null**（工部自报「返回 undefined」措辞不精确，见 D4，行为等价）。foreign owner 经 `memberByName`（`client.js:3572`，只映射在册成员）得 undefined → 不绑。
  - 装配传参：`client.js:3666-3667`（lead 卡 onOpen）、`3725`（成员卡 onOpen）、`3734-3735`、`3751-3752`（两处 TaskLine onOpenOwner），与 hunk 行号逐一吻合。
- **点击绑定与豁免的可执行证明**：新断言在 `scripts/test-client.mjs:272-366`，覆盖 lead 任务 / unassigned / failed-owner / provisioning-owner / 无 id / 无通道 6 类不绑 + teammate 任务绑定 + click 触发一次 + 无通道返回 false 不抛 + 成员卡 self/failed/provisioning/no-id/no-channel 惰性，全部亲手复跑通过。

### 2.3 新增断言能否区分修复前后 —— 能（实测）

```
$ git archive HEAD 解包 /tmp/dalisi-head，覆盖入新版 scripts/test-client.mjs
$ node scripts/test-client.mjs   # HEAD 版 client.js
exit=1
AssertionError [ERR_ASSERTION]: t-build->t-research: start anchor lies on the BLOCKER row t-research
$ 旧版 test-client.mjs + HEAD client.js → exit=0（2 行 PASS）
$ 工作副本复跑 → exit=0（3 行 PASS）
$ rm -rf /tmp/dalisi-head   # 现场已恢复，git diff 与开工一致
```

方向断言在旧代码上必红、在新代码上必绿，**证明断言真能区分修复前后**。临时副本全程在 /tmp，仓库零写入。

## ③ 受保护文件核对 —— 零改动

`git status --porcelain -- cordis.patch.yml index.js package.json README.md README.zh.md CHANGELOG.md scripts/verify.mjs` → **空输出**（=相对 HEAD 零改动；index.js persona/prompts 区随 index.js 整体零 diff）。哈希（sha256 前 16 位）与 mtime：

| 文件 | sha256[:16] | mtime |
|---|---|---|
| cordis.patch.yml | 3ff41af0e534e7af | 2026-11-06 01:14:46 |
| index.js | dc0a079c0e43d78f | 2026-11-06 13:51:29 |
| package.json | 797e25ff36ee65e3 | 2026-11-06 13:51:29 |
| README.md | 82a96c44d79e59d2 | 2026-11-07 00:26:00 |
| README.zh.md | d64c8446e3a05608 | 2026-11-07 00:26:00 |
| CHANGELOG.md | 50290a8dcaf21b1c | 2026-11-07 00:26:01 |
| scripts/verify.mjs | 9bf6269407e3f791 | 2026-11-06 14:05:46 |

全部 mtime 早于本轮 task-2 作业时段，且 verify.mjs 复跑仍输出其既有 43 条断言原文（未被篡改）。

## 缺陷清单（点名到文件行号，均不推翻「通过」）

- **D1（测试文案，低危）** `scripts/test-client.mjs:236`：旧断言 message 仍写 `'every edge ends in a dot on the blocker side'`，与新几何（点在被阻塞端）矛盾；断言本体只数 `edgeDots.length === 5`，方向中性，不影响判定，但文案应改为 blocked side，否则误导后人。
- **D2（自报数字不符，记账级）** 工部自报「git diff --stat：client.js **211** 行变更」，实测 `git diff --numstat` 为 **124+/29-（合计 153）**，`--stat` 显示 `client.js | 153`；两文件合计 insertions 221、总变更 250，均不等于 211。test-client.mjs +97 与「仅此二文件 M」相符。
- **D3（行号引用不实，低危）** 工部自报「manifest **:4068** 未动」：`client.js:4068` 实为 i18n 字典行（`'member.status.failed'` 一带），仓内 client.js 无此 manifest；真实 manifest 为 `package.json` `"dsh.client"` inject 区（未改动）。结论「未动」成立（package.json git 干净 + 旧 3671–4110 无 hunk），引用行号错误。
- **D4（措辞不精确，低危）** 工部自报「CabinetPanel 解析 isLeadTask/unassigned 返回 undefined」：`client.js:3641-3642` `ownerOpener` 实际返回 **null**（内部 `ownerMemberOf` 才产生 undefined）；`typeof null !== 'function'` 行为等价，无功能影响。

## 未验证项（诚实标注）

1. **浏览器视觉实测未做**：流光 dashoffset 0→-24 朝向、圆点/线在真实 DOM 的落点均为 desk derivation（`client.js:2415-2416` 工部已自标未验证）；本轮只做离线断言与几何推演。
2. **面板无箭头头部**：grep `marker|arrow|polygon` 仅命中注释 `client.js:2414/3292`，渲染体只有 path+circle（`client.js:3163-3179`）——方向由起点/终点锚、端点圆点与流光体现；注释中「with the arrow」无对应可视箭头（task-1 已发现的既有状态，task-2 未新增）。用户所指「箭头」是否即此，需浏览器截图确认。
3. **`uiWorkspace.openSession` 运行时可用性未实测**：仅静态确认与 remote/configForms 同为 `ctx.inject` 可选通道；真实部署下注入是否到位、`member.id` 与 `sessions.byId` 恒等（task-1 遗留未验证）未跑。
4. **原生 `retainedBy.mainView` 守卫未复刻**（`agent-team/lib/client.js:481`）：本实现无此守卫，未保留会话时点击行为差异未验证。
5. **成员卡「有 id 但面板无 isCurrent 语义」类边角**与 foreign-owner 任务的面板级点击未在 `clickTeam` fixture 中逐项覆盖（foreign owner 经代码路径推导为不绑，未被断言直接钉死）。
6. `scripts/test-market-index.mjs`、`test-model-selection.cjs`、`test-prompt-assembly.cjs` 三脚本失败原因仅确认「HEAD 与工作副本同错」，未修复、未深挖（属既有失败，不在本任务写入范围）。

## 核验命令清单（可复现）

```bash
cd cabinet-fork/dsh-cabinet-mode
node --check client.js
node scripts/verify.mjs
node scripts/test-client.mjs
for f in scripts/test-*.mjs scripts/test-*.cjs; do out=$(node "$f" 2>&1); echo "$f rc=$?"; done
git diff client.js; git diff scripts/test-client.mjs; git diff -U0 client.js | grep '^@@'
git status --porcelain -- cordis.patch.yml index.js package.json README.md README.zh.md CHANGELOG.md scripts/verify.mjs
sha256sum cordis.patch.yml index.js package.json README.md README.zh.md CHANGELOG.md scripts/verify.mjs
# 甄别：git archive HEAD | tar -x -C /tmp/xx；cp 新 test-client.mjs 入内跑 → exit=1
```
