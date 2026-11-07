# 调研：内阁面板箭头方向与任务名点击下钻通道考据

- 任务：task-1（翰林院编修，只读考据）
- 仓库：`cabinet-fork/dsh-cabinet-mode/`（工作区相对路径，下文 `client.js` 均指该目录）
- 结论先行：
  1. **面板内没有任何「箭头头部」图形**（无 SVG marker、无 polygon、无 CSS 三角、无字符箭头）；唯一带端点圆点 + 流光方向的线是**任务依赖边**，它画的是 `被阻塞任务 → 阻塞者`（圆点与流光都落在阻塞者一侧），在「首辅先立任务、阁臣任务 blockedBy 首辅任务」的典型板上呈现为**阁臣 → 首辅**，与应然 首辅→阁臣 相反——这是「画反」最可能所指。
  2. **面板成员名与任务名目前零点击处理**（全文件 onClick 清单见 §2），只有「等待 N」折叠 chip 可点。
  3. **打开子会话的现成通道存在且有两套上游范例**：`ctx.uiWorkspace.openSession(...)`；成员数据 `member.id` 就是该成员的（子）会话 id（schema 为 `sessionIdSchema`），可直接用。
- 证据格式：`path:line`；未实测项一律标「未验证」，汇总见文末「未验证清单」。
- 装机副本核验：`md5sum` 装机 `~/.dsh/profiles/web/node_modules/dsh-cabinet-mode/client.js` 与 fork `client.js` 均为 `678918fe88766e62dd1793a0e2ebcb0c`（version 均 0.4.0），故下文行号对用户所见面板同样成立。

---

## 1. 问题①：流程箭头在哪、怎么画的、为何读作反向

### 1.0 先证「没有箭头头部」（穷举，防漏判）

- 全文件 SVG 元素仅两处：`client.js:3109`（TaskEdgeLayer）、`client.js:3603`（org-chart 连线层）。`grep -n "h('svg'" client.js` 输出仅此两行。
- 箭头字符穷举（python 逐行扫 `→ ← ↑ ↓ ⇒ ⇐ ➜ ➔ ⟶ ↳ ↪ ↘ ↗ ↙ ↖ ▶ ► ▾ ▼ ▲`），命中的**只有注释与文案**：
  - `client.js:2410` 注释 `task dependency edges (blocked → blocker)`
  - `client.js:3192` 注释 `lead → row 0 bus`
  - `client.js:3204` 注释 `(4) row N → row N-1`
  - `client.js:3237-3239` 注释
  - `client.js:2524` 提示词文案、`client.js:3083` 「▾/▸ 等待 N」chip 折叠符
- 无 `marker`/`marker-end`/`polygon`/`clip-path`/CSS 三角：`grep -n "marker\|polygon\|triangle\|clipPath\|clip-path\|borderTop\|width:0" client.js` 仅命中 `client.js:2400`（卡片 border）与 `client.js:2941`（RailList 左侧竖线）；伪元素 `content:` 只有 `client.js:2382`（头像环）与 `client.js:2398`（in_progress 蓝条），均非箭头。
- 边样式 `client.js:2410-2421`：`fill:none;stroke-width:1.5` + 三态配色 + `cabinetEdgeFlow` 流光，**无箭头头部定义**。

→ 面板上所有「线」都是无头线段；**唯一能被读成箭头方向的是依赖边的「端点圆点 + 流光」**。

### 1.1 线层 A：品字形 org-chart 连线（首辅卡 ↔ 阁臣卡）

- 几何函数 `buildConnectorPaths`：`client.js:3143-3234`（区域注释 `client.js:3132-3142`）。
- 方向由数据/布局决定，逐段：
  - 起点 `ax/ay` = 首辅卡**底边中点**：`client.js:3153-3154`（`ay = lead.top + lead.height - base.top`）。
  - 主干 首辅 → 第 0 行总线（向下）：`client.js:3192-3195`（注释 `lead → row 0 bus`，`M ax ay L ax first.busY`）。
  - 每行总线 + 各卡短脚（向下接到卡顶）：`client.js:3199-3201`。
  - **跨行折线按「第 N 行 → 第 N-1 行」构造**（即从**下方行**的总线端点接回**上一行**总线）：注释 `client.js:3204`、候选侧路 `client.js:3209-3213`、落笔 `client.js:3231`。
- 渲染：`client.js:3602-3611` —— `h('svg')` 内 `linkPaths.map(... h('path', { d, style: { fill:'none', stroke: LINE, strokeWidth: 2, strokeLinecap:'round' } }))`，**无箭头头部**。
- 量测与装配：`measureLinks` `client.js:3413-3434`（`buildConnectorPaths(base, leadRect, nodes, -8)` 在 `:3420`），节点取 `[data-cabinet-node]` `:3419`（卡片容器 `:3674-3677`），首辅取 `leadRef` `:3405/:3417`。
- 判读：主干方向是 首辅→阁臣（正确），但**该层无头部**，方向只由构造顺序暗示；跨行折线的构造方向确为「下行行 → 上一行」（阁臣行 → 首辅行）。**用户是否读到这一层，未验证**（无截图、未做浏览器实测）。

### 1.2 线层 B：任务依赖边（唯一带端点圆点 + 流光，最像「流程箭头」）

- 几何函数 `buildTaskEdges`：`client.js:3245-3356`（语义注释 `client.js:3235-3244`：「from the blocked task's row to its blocker's row」）。
- 方向数据源：`task.blockedBy`；键名即方向 `task.id + '->' + blockerId`：`client.js:3258-3262`；CSS 注释同口径 `client.js:2410`。
- 端点：`from = rectOf(task.id)`（被阻塞任务）、`to = rectOf(blockerId)`（阻塞者）：`client.js:3267-3281`；锚点计算把 `to` 放在路径终点：`client.js:3286-3319`（`ex/ey` 取 `t` 侧，`:3298-3299` / `:3308-3309`）。
- 路径与端点标记：`edge.d = 'M <from> C ... <to>'`：`client.js:3344-3348`；**圆点落在 `edge.e`（= 阻塞者一端）**：`client.js:3349-3350`（`edge.ex = edge.e[0]`），渲染 `h('circle', cx: edge.ex, cy: edge.ey, r: 3)`：`client.js:3120-3128`。
- 流光方向：`@keyframes cabinetEdgeFlow{to{stroke-dashoffset:-24}}` `client.js:2412`，注释明写 **「travelling toward the blocker」** `client.js:3238-3239`；样式类 `client.js:2413-2421`。
- 图层叠放与指针：`client.js:3103-3112`（注释：画在卡片之上、`pointerEvents:'none'`，行仍可点）。
- 断言旁证：`scripts/test-client.mjs:178-201`（键形如 `'t-audit->t-build'`、`edge.d` 为 `M ... C ...` 正则、`edge.ex/ey` 为 number）。

**判读（为何读作反向）**：这条线的「头」（圆点）与流光都指向**阻塞者**，语义是「被阻塞 → 阻塞」。内阁板上典型形态是首辅先立任务、阁臣任务 `blockedBy` 它，则线从**阁臣卡出发指回首辅卡** = **阁臣 → 首辅**，与裁决的应然 **首辅 → 阁臣** 相反。
→ **首选结论：用户所指的「画反的流程箭头」= 依赖边方向（层 B）。** 备选：org-chart 跨行折线的构造方向（层 A，无头，读到概率低）。
**未验证**：无用户截图、未做浏览器截图比对，具体所指层未实测。

### 1.3 修复落点（供 task-2 参考，本轮未改码）

- 若反转依赖边为 `阻塞者 → 被阻塞任务`（首辅→阁臣方向）：
  - `client.js:3267-3281` 端点语义（`from/to` 对调）、`client.js:3286-3319` 锚点、`client.js:3344-3350` `edge.d` 与 `ex/ey`（圆点改落被阻塞端）。
  - 流光方向复核：`client.js:2412` `stroke-dashoffset` 符号（方向随路径反向，需实测确认，**未验证**）。
  - 键名 `blocked->blocker`（`client.js:3262`）与 `scripts/test-client.mjs:180-201` 的 key 断言：若只换几何不改键，`:191` 的 `d` 形状正则仍应通过——**未复跑验证**。
- 若改 org-chart 折线方向：`client.js:3197-3232`（`plan()` 段序与 `paths.push` 顺序）。

---

## 2. 问题②：成员名 / 任务名渲染处与点击现状

### 2.1 渲染处

| 元素 | 组件 | 名称/任务名 span | 容器 |
|---|---|---|---|
| 成员卡（首辅） | `MemberCard` `client.js:2999-3040` | `client.js:3008-3012`（`title: memberLabel(member.name)`） | `client.js:3002-3005` |
| 成员卡（阁臣） | 同上，装配 `client.js:3639-3657` | 同上 | 同上 |
| 首辅卡装配 | `client.js:3580-3589` | — | — |
| 任务行 | `TaskLine` `client.js:3042-3100` | `client.js:3054-3058`（`title: task.subject`） | `Row` `client.js:3096-3100`（`data-cabinet-task`） |
| 任务行装配 | 卡内 `RailList` `client.js:3648-3655`、分组卡 `client.js:3664-3671` | — | — |

### 2.2 点击现状：面板内成员/任务行**零点击**

- 全文件 `onClick` 清单（`grep -n "onClick" client.js`）：
  - `client.js:3081` ——「等待 N」折叠 chip（**面板内唯一交互**，组件 `TaskLine`，`client.js:3078-3083`）
  - `client.js:3831 / 3844 / 3847 / 3862 / 3922 / 3928 / 3931 / 3932` —— 全部在设置页 `CabinetMemberSettings`（`client.js:3710` 起），与面板无关。
- `MemberCard`（`:2999-3040`）与 `TaskLine`（`:3042-3100`）**无 onClick、无 cursor:pointer**。
- 原生 roster 头像注入 `installTeamRosterAvatars` `client.js:2749-2856`：只做头像插入（`rowFor`/`anchorIn`/`injectInto`，`:2754-2774`），该区间 `onClick`/`addEventListener` 零命中 —— 未加任何点击。
  - 旁证：`rowFor` 取 `closest('button')` `client.js:2754-2761`，说明**原生** roster 行本身是 `<button>`；原生行可点开会话（见 §3.1 范例 1），但内阁面板自绘的卡片是 `div`，不可点。

---

## 3. 问题③：点击任务名 → 打开该子智能体会话 的实现通道

### 3.1 (a) DSH web 客户端如何编程打开/指定会话

**核心 API：`ctx.uiWorkspace.openSession(target)`**

- 定义：`/var/opt/node24/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js:1471-1472`
  ```js
  openSession(target) { this.replaceMain(target, this.lifetime.signal, "reveal"); }
  ```
- `replaceMain`：同文件 `:1652-1673`；关键一行 `:1662`
  ```js
  const subagentAddress = typeof target === "string" ? this.sessions.subagentAddress(reference.sessionId) : target;
  ```
  即 **string 目标会自动解析 subagent 地址**；对象目标 `{parentSessionId, childSessionId, mode}` 直接作为 subagent 地址使用。随后 `this.selection.set({ sessionId, ...subagentAddress })`（`:1663-1666`）完成切换。

**现成 UI 范例（三处，均 path:line）**

1. **原生成员行点击开会话（最贴题）** —— `dsh-experimental-client-ui-agent-team/lib/client.js`
   - `:88` `TeamMemberRow({ member, memberCount, sessionId, useSessions, useSessionStatus, openTeammate, onError, t })`
   - `:101-111` 渲染 `<button type="button" disabled={inert} onClick={...}>`（按钮 `:101`、`disabled: inert` `:104`、`onClick` `:105-110`；`inert = isCurrent || status==='failed' || status==='provisioning'` 定义在 `:95`）
   - `:478-491` `openTeammate(sessionId, childSessionId)`：`retainInfo` 门槛 `:480`；`childSessionId === parentSessionId` 分支 `:481-484` → `ctx.uiWorkspace.openSession(parentSessionId)`；否则 `:485-489` `ctx.uiWorkspace.openSession({ parentSessionId, childSessionId, mode: "continuable" })`
   - `:457-462` 服务声明 `const inject = ["sessions","uiWorkspace","slots","locale"]`
   - `:496` 注册带 `inject: () => actions`（`ctx.slots.register(...)` 块 `:493-497`）
2. **workflow-run 面板接线（与 cabinet 最同构，推荐照抄）** —— `dsh-client-ui-workflow-run/lib/client.js`
   - `:316` `function WorkflowRunPanel({ node, sessionId, useSessions, useSessionStatus, openSession, t })`
   - `:257-264` 成员行 `<button ... onClick: mode !== void 0 ? () => openSession({ parentSessionId, childSessionId: member.childId, mode }) : void 0>`（`childSessionId: member.childId` 在 `:260`）
   - `:641-647` `const inject = ["uiConversation","uiWorkspace","slots","sessions","locale"]`
   - `:654-663` `ctx.slots.register({ name, key, locale, inject: () => ({ openSession: (target) => { ctx.uiWorkspace.openSession(target); } }) }, WorkflowRunPanel)`
3. **chat 分叉后打开子会话** —— `dsh-client-ui-chat/lib/client.js:13314-13316` `ctx.uiWorkspace.openSession(childId)`
   - 另路：`dsh-client-ui-conversation/lib/client.js:20084` `workspaceNavigation.openSession(id)`（未深挖）

### 3.2 (b) agentTeam 投影成员数据能否拿到该成员的会话 id —— **能，`member.id` 即会话 id**

- schema：`dsh-experimental-agent-team/lib/index.js:649-659`
  ```js
  const teamMemberProjectionSchema = z$1.object({
      id: sessionIdSchema, name, role: z$1.enum(["lead","teammate"]), phase: z$1.enum([...]), error: z$1.string().optional()
  }).strict();
  ```
  `sessionIdSchema` 定义于同文件 `:391`；`.strict()` 说明**成员对象只有这五个字段**，没有单独的 `sessionId` 字段——`id` 就是它。
- 投影构造 `buildTeamProjection` `:685-699`：lead 成员 `id: brandString(state.id)`（= lead 会话 id），teammate `id: member.id`。
- **teammate 的 id 是 lead 的子会话 id**：`reconcileProvisioning` `:1111-1140`，`readPersistedSession(this.ctx.sessionPersistence, member.id)` `:1120`，且校验 `loaded.header.parentSession === root.id && descriptor?.mode === "continuable"` `:1124` —— 直接按**子会话**持久化读取。
- 任务侧：`projectTaskView` `:367` `task.ownerId === brandString(state.id) ? "lead" : state.members.find(m => m.id === task.ownerId)?.name`（下发处 `:381`）—— `ownerId` 同为会话 id，但**投影只下发 `ownerName`**（`teamTaskViewSchema` `:660-677`，`ownerName: z$1.string().optional()` `:673`），故任务行要经 `ownerName → member` 反查。
- fork 侧旁证（同一判断已在用）：
  - `client.js:3643` `isCurrent: member.id === sessionId`
  - `client.js:3504` `statusMap?.get?.(id)?.running`（`api-session/status` 以会话 id 为键）
  - `client.js:3391-3392` `parentSessionId = snapshot.subagent.address.parentSessionId`，`leadSessionId = parentSessionId ?? sessionId`
- **映射途径汇总**：
  - 成员卡 → `member.id` 直接可开；
  - 任务行 → `task.ownerName` → `memberByName`（**已有**：`client.js:3512`）→ `member.id`；lead 任务 → lead `member.id`（= 当前会话，建议 no-op）；`client.js:3562-3564` 已有 `isLeadTask` 判定可复用；
  - 无 owner 的任务（`client.js:3563` `unassigned`）无会话可开。

### 3.3 (c) 两套可行方案（优先：直接跳转打开子智能体会话）

#### 方案一（推荐）：照抄 workflow-run 接线 —— slot 注入 `openSession` prop

改动落点（均在 `client.js`，共 5 处）：
1. `:4068` `const inject = ['slots', 'locale', 'sidebarRightTabs'];` → 增加 `'uiWorkspace'`（上游先例 `workflow-run:641-647`、`agent-team:457-462`）。
2. `:4125-4129` `ctx.slots.register({ name, key, locale }, CabinetPanel)` → 选项增加
   `inject: () => ({ openSession: (target) => ctx.uiWorkspace.openSession(target) })`（先例 `workflow-run:654-663`；fork 内同构先例：设置页 `:4150-4157` 已用 `inject: () => ({ t: memberT })`）。
3. `:3378` `function CabinetPanel({ sessionId, useSession, useSessions, useSessionStatus, t })` → 形参增加 `openSession`。
4. 成员卡：`:3580-3589`（首辅）与 `:3639-3657`（阁臣）把 `openSession` 传入 `MemberCard`；`MemberCard` `:2999-3040` 在 `:3003-3005` 容器或 `:3008-3012` 名字 span 上加 `onClick` + `cursor:'pointer'`，并对齐原生 inert 条件（`agent-team:95`：自己/failed/provisioning 不可点）。
5. 任务行：`TaskLine` `:3042-3100` 增加 `openSession`/`memberOf` 入参，在 `:3054-3058` 任务名 span（或整行 `:3096-3100`）加 `onClick`；目标 = `memberByName.get(task.ownerName)?.id`（`memberByName` 已在 `:3512`），调用 `openSession({ parentSessionId: leadSessionId, childSessionId: member.id, mode: 'continuable' })`（`leadSessionId` 已在 `:3391-3392`）；lead 任务与 unassigned 走 no-op/禁用。

风险与未验证项：
- **`sidebar.right.pane.tab` 这个 slot 的框架 inject 已声明为 `SidebarRightTabInjected`（`dsh-client-ui-sidebar-right/lib/types/client/contract/slots.d.ts:53-58`，类型体 `:204-209`，仅 `hooks.tabInfo`）**；registration-level `inject` 是否与框架 inject 合并传给组件，**未验证**（`settings.section` 的 `inject: () => ({t})` 先例 `client.js:4150-4157` 说明 slots.register 支持该字段，但**不是同一个 slot**）。
- 把 `uiWorkspace` 放进 manifest 必选 `inject` 数组：若部署缺 `dsh-client-ui-workspace`，整个 cabinet 插件将不加载（**未验证**）。
- 浏览器实测（点击是否真跳转）**未做**。

#### 方案二（最小改动）：`ctx.inject` 可选通道 + 模块级变量（只用 fork 已证机制）

改动落点（均在 `client.js`，共 4 处）：
1. `apply(ctx)` 内新增可选通道（**fork 已证先例**：`:4104-4110` `ctx.inject(['remote','remote.session'], ...)`、`:4134` `ctx.inject(['configForms'], ...)`）：
   `ctx.inject(['uiWorkspace'], (scope) => { ... cabinetOpenSession = (target) => scope.uiWorkspace.openSession(target); ... })`，存入模块级变量。
2. 模块级变量先例：`:4101` `memberT = t`、`:4107` `memberRemote = remote`、`:4149` `memberWriter = form` —— 面板组件直接读该变量，**不动 `:4068` manifest、不动 `:4125-4129` 注册**。
3. `:3378` `CabinetPanel`（或直接 `MemberCard`/`TaskLine`）读模块级 `cabinetOpenSession`，点击时判空。
4. `MemberCard` `:3003/:3008`、`TaskLine` `:3054` 与 `:3096` 加 `onClick`（同方案一第 4/5 步的目标解析逻辑）。

风险与未验证项：
- 服务缺失时通道不触发 → 变量为 null → 点击静默无效，需给禁用态或提示（**未验证 `uiWorkspace` 是否在 cabinet 场景总可用**；`agent-team`/`workflow-run` 都把它列为必选服务，旁证可用）。
- 模块级可变量的多实例/热重载生命周期（fork 同模式已在用，风险低但**未验证**）。
- 浏览器实测**未做**。

> 两案共同前提：面板已能拿到 `leadSessionId`（`client.js:3391-3392`）与 `memberByName`（`:3512`），无需新增数据通道，符合「只走 useSessionStatus + agentTeam 投影」的既有约束（`client.js:1-8` 头注）。

---

## 4. 未验证清单

1. **用户所指「箭头」具体是哪一层**（依赖边 vs org-chart 跨行折线）——无截图、未做浏览器实测，本文给出的是基于「唯一带端点标记 + 流光」的判读（§1.2）。
2. **反转依赖边后 `scripts/test-client.mjs` 是否仍全绿**——未复跑（本轮只读，未改码）。
3. `stroke-dashoffset` 反向后的流光视觉方向——未实测（`client.js:2412`）。
4. `sidebar.right.pane.tab` slot 的 registration-level `inject` 与框架 `SidebarRightTabInjected` 是否合并（`contract/slots.d.ts:53-58/204-209`）——未验证。
5. manifest 增加 `uiWorkspace` 必选服务后的插件加载——未验证。
6. `member.id` 与 `sessions.byId`/`statusMap` 键的恒等性、点击后是否真跳转——未验证（仅有 schema `:649-659`、`reconcileProvisioning :1111-1140` 与 fork 既有用法 `:3643/:3504` 旁证）。
7. `provisioning`/`failed` 阶段成员点击行为（原生用 `retainInfo` 门槛 `agent-team:480`、`inert` `agent-team:95`）——未验证。
8. 两套方案均**未改码、未装机、未重启 DSH**，浏览器端零验证。

## 5. 本轮只读纪律

- 仅新建本报告 `docs/research-arrow-drilldown.md`；未改 `client.js`、`cordis.patch.yml`、`index.js`、`scripts/`、`README*`、`CHANGELOG.md`、`package.json` 任何既有文件。
- 所有行号均在本次会话现场读取核对（`read`/`grep`/`sed`），装机副本与 fork 的一致性以 `md5sum` 输出为证（§ 头）。
