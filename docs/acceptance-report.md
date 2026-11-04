# 都察院御史终验报告 · dsh-cabinet-mode 内阁改造

- 验收人：都察院御史（yushi-censor），受首辅 lead 分派独立验收，按律弹劾缺陷
- 验收时间：2026-11-04 19:27–19:46（Asia/Shanghai）
- 对象仓：`/home/fslong/Documents/玩机/cabinet-fork/dsh-cabinet-mode/`（v0.1.6 基线，现 `package.json` 0.2.0）
- 边界：只读核验；**仅写本文件** `docs/acceptance-report.md`；未改 live 配置、未重装 profile、未重启 DSH、未 commit
- 采信规则：不采信 `docs/review-report.md`（评事 17:37 稿，所验头像为 18:00 前旧稿）与 `docs/research-ui-extension.md`（编修调研）的既有结论；下列断言均为本轮重新实测，未跑项明标「未验证」

---

## 0. 判定速览

| # | 用户诉求 | 判定 | 关键证据（详见 §2） |
|---|---|---|---|
| 1 | 首辅先拆解、`spawn_teammate` 点名分派、建任务板，禁亲自执行 | **通过（静态）** | `cordis.patch.yml:46-50`、`62`；YAML 实测 plugins=22；**运行时未验证** |
| 2 | 界面显示成员 running / 非 running 状态 | **通过（静态）** | `client.js:2297-2302`、`2372`、`2475-2487`、`2605`；DSH 契约核对通过 |
| 3 | 五名成员各有头像并显示 | **通过（静态+目检）** | `client.js:23`（5 个 data URL）、`2350-2362`、`2328-2332`；五图 1024²、内嵌 sha 与源一致 |
| 4 | 右栏面板：派活关系 + 成员状态 + 任务状态 | **通过（静态）** | `client.js:2793-2810` 注册、`2579-2610` 数据、`2644-2716` 派活树、`2303-2308` 任务三色 |
| 5 | 单点接口：用户只与首辅对话 | **通过（文本）** | `cordis.patch.yml:65`；身份判据精确短语实测存在于 DSH 源码 |
| 6 | 评事/御史女官，首辅/编修/主事年轻男官 | **通过（目检）** | 逐张 `read_image`：dali/yushi 女官、lead/hanlin/works 男官 |
| 7 | 仙逆国风 3D 半写实、浅色、3/4 侧颜、圈内带景、明黄/青/赤/玄/绯可辨、无文字、1024² | **通过（目检+像素+OCR）** | 五图 1024²、背景 hue 实测互异、圈内均有国风景、OCR 仅噪声；质感差异列遗留 |

**总体结论：准予交差**（实际缺陷 2 条：中 1、低 1；另有建议 2 条；不阻断交付；遗留 10 条见 §4）。若用户坚持「首辅绝对不得亲自执行」的绝对口径，则弹劾 #1 须在发版前先整改。

---

## 1. 方法、状态与证据

### 1.1 本轮实测命令

| 检查 | 命令/方法 | 结果 |
|---|---|---|
| JS 语法 | `node --check client.js` / `index.js` / `src/avatars.js` | exit 0 |
| YAML 结构 | `python3` + PyYAML（自定义 `!!js` 构造器） | 顶层 list len=2、plugins=22、prefix 41 行 |
| 头像文件 | `file`、`sha256sum` | 5× `PNG 1024 x 1024, RGBA`，sha 互异 |
| 内嵌一致性 | base64 解码 `client.js` 5 个 data URL → sha256 | 与 `src/avatars/*.png` 逐字节相同（5/5） |
| 缩放一致性 | PIL 按 `src/build_avatars.py` 同法（中心裁方+LANCZOS 128）重算 | 与 `src/avatars/*.png` `maxdiff=0`（5/5） |
| 底色取样 | PIL 圆内上左/上右 6 点 + 8 向环带 r=0.30–0.465 | 见表 §2.7 |
| 无文字 | `tesseract -l chi_sim+eng --psm 11` + 目检 | 仅噪声串，无可读字形 |
| 包自检 | `node scripts/verify.mjs` | `PASS=20 FAIL=2 WARN=1`（两条 FAIL 为首辅已声明的发版前预期） |
| 装机状态 | `dsh --profile web --dump-config`、`~/.dsh/profiles/web/node_modules/dsh-cabinet-mode` | 仅旧版 preset-cabinet，无 cabinet-ui；旧目录 13:49、无 client.js |
| 写范围 | `git status --porcelain` | 见 §1.3 |

### 1.2 验收时点状态（重要）

- 头像：`docs/images/avatars/*.png` mtime 18:00–18:09；`src/avatars/*.png`、`src/avatars.js`、`client.js` mtime 18:10。**18:00 前旧头像的 sha 全部作废**；本报告只认本轮 sha：
  - lead `51bae8f5…`、hanlin `0e89fd9d…`、works `da2f16f1…`、dali `960ac506…`、yushi `670f75c5…`
  - 128px 版：lead `c1f52b0a…`、hanlin `40f39eb7…`、works `d35e5cc1…`、dali `3127e347…`、yushi `1d308579…`
- 文档/版本：`package.json` 0.2.0（19:31）、`README*.md`/`CHANGELOG.md` 19:36、`scripts/verify.mjs` 19:37，均为首辅声明的授权更新；本轮已按其口径复核，不将两条预期 FAIL 记缺陷。
- 评事旧报告 `docs/review-report.md:44` 中「C 不通过（lead 底色）」基于旧稿；本轮五图已全部重出并复测，**旧结论作废**（见 §2.7）。

### 1.3 仓库写范围

`git status --porcelain` 实测：

```
 M CHANGELOG.md
 M README.md
 M README.zh.md
 M cordis.patch.yml
 M package.json
 M scripts/verify.mjs
?? client.js
?? docs/images/avatars/
?? docs/research-ui-extension.md
?? docs/review-report.md
?? docs/acceptance-report.md
?? index.js
?? src/
```

（`docs/acceptance-report.md` 为本次验收产出。）

`/var/opt/node24/lib/node_modules/@deepseek-ai/dsh` 下 `find -newermt "2026-11-04 14:00" -type f` 零命中；`find -iname "*cabinet*"` 零命中 → DSH 安装树未被本轮触碰。`~/.dsh/profiles/web/cordis.yml` 内容仍为 `[]`、`cordis.patch.yml` 对 `cabinet-ui`/`首辅令制` 命中 0 → live 配置未落本轮改造（详见 §4）。

---

## 2. 逐条验收

### 2.1 诉求 1：首辅强制拆解、点名分派、建任务板、禁亲自执行

**判定：通过（静态证据充分；运行时行为未验证）。**

证据：

1. `cordis.patch.yml:46-50` 首辅令制四条齐备：
   - `47`：`拆解后立即用 spawn_teammate 把子任务点名分派…并用 team_task_create 建任务板…`
   - `48`：`令出即行，全程自主推进…`
   - `49`：`执行类工作一律委派，禁止首辅亲自执行。调研、写码、改文件、跑命令…必须委派…`
   - `50`：`委派非免责：成员产出须经核验方许采信。`
2. 阁臣侧状态条：`62`：`主动用 team_task 更新任务状态：接令后 claim 认领，完工即 complete…`
3. 结构实测：PyYAML 解析成功，`insert[0].config.plugins` 长度 **22**，id 顺序与标准模式一致；`insert[1]` 为 `cabinet-ui`（`184-186`），恰好一行。
4. 文件头 `3-8` 已同步描述「两行 insert」；`package.json` 新增 `exports`（`36-39`）、`files` 含 index/client（`40-49`）、`dsh.client`（`57-66`），与实现一致。
5. 身份判据可用性：DSH 源码 `dsh-experimental-tool-agent-team/lib/index.js:245` 实测精确产出 `You are the Team Lead named "lead".` / `You are teammate "<name>".` / `Your Team Lead is named "lead".`，与 persona `32-35` 的判据逐字一致。

**但**：`49` 末句保留「无人可派或超出成员职责的环节，方可由首辅亲自完成」的例外口子，与用户「不得亲自执行」的绝对表述存在口径偏差 → 弹劾 #1（中）。

**运行时未验证**：live profile 仍装 0.1.6（13:49），`dsh --profile web --dump-config` 只有 `preset-cabinet`、无 `cabinet-ui`；新 persona 尚未加载，故「首辅实际是否照令分派」无法在本轮实测。属已知装机前置（用户动作），不记缺陷。

### 2.2 诉求 2：界面显示成员 running / 非 running 状态

**判定：通过（静态）。**

证据：

1. 状态色板：`client.js:2297-2302` — `running #22c55e`、`inactive #9aa0a6`、`provisioning #f5a524`、`failed #ef4444`。
2. 状态点睛：`2372-2387` `StatusDot`；`2384` running 时 `cabinetPulse 1.7s` 脉冲；`2311` 尊重 `prefers-reduced-motion`。
3. 成员行：`2475-2487` 由 `member.phase === 'active'` + running 推导 `running/inactive`，`provisioning/failed` 直接展示 phase；`2506` 显示本地化状态文字；`2507-2511` 显示模型；`2512` 显示 error。
4. 运行态取数：`2605` `runningOf = (statusMap?.get?.(id)?.running ?? list?.byId?.[id]?.running) === true`；`2593` 订阅 `useSessionStatus`。
5. 契约核对（DSH 安装树）：
   - `dsh-client-ui-session/lib/types/client/index.d.ts:30-41`：`SessionStatusSnapshot = ReadonlyMap<SessionId, SessionStatus>`，`SessionStatus.running` 为 `boolean | undefined`；
   - 同文件 `72-87`：`GlobalStandardProps` 注入 `useSessions`/`useSessionStatus`，`SessionStandardProps` 注入 `useSession`/`sessionId` → 面板四个 hook props 合法；
   - `dsh-client-ui-sidebar-right/lib/types/client/contract/slots.d.ts:53-57`：`sidebar.right.pane.tab` 为 session-scope keyed seat；
   - 对照出厂实现 `dsh-experimental-client-ui-agent-team/lib/client.js:88-93` 的 status 推导（同一公式）、`239` 的 `projectionsBySession[...].values.agentTeam` 读取，面板取数方式与产品自身一致。

**运行时未验证**：面板须重装并重启 DSH 才在浏览器加载，本轮无浏览器截图。

### 2.3 诉求 3：五名成员各有头像并显示

**判定：通过（静态+目检）。**

证据：

1. `client.js:23` 起 `AVATARS` 五个 data URL；`2289` `AVATAR_PLACEHOLDERS = []`（无占位）；5 个 data URL base64 解码后 sha256 与 `src/avatars/{key}.png` **逐字节相同**（5/5）。
2. `src/avatars/*.png` 为 `docs/images/avatars/*.png` 按 `src/build_avatars.py:54-65` 同法（中心裁方+LANCZOS 128）生成；PIL 重算 `maxdiff=0`（5/5），时间戳链 18:00–18:09 → 18:10。
3. 头像组件：`client.js:2350-2362` `Avatar`（圆形 `borderRadius:50%`、`loading:lazy`、data URL）；`2492`（MemberLine 内）按 `isLead ? 24 : 22` 渲染；首辅行与每位阁臣行均带 `Avatar`。
4. 映射：`2328` `AVATAR_KEYS = ['lead','hanlin','works','dali','yushi']`；`2329-2332` `avatarFor` 按姓名前缀匹配；本队成员 `lead`、`hanlin-editor`、`works-executor`/`works-ui`、`dali-reviewer`、`yushi-censor` 均命中各自 prefix。
5. 目检：五张均为浅色系胸像，角色与头像键对应（详见 §2.7 图目检）。

**限制**：未匹配前缀的成员回落首辅头像（`2331-2332`），若未来 spawn 名不使用五衙门前缀，会出现「全员首辅头像」；列弹劾 #3（低/建议）。

**运行时未验证**：头像是否在真实浏览器面板中显示，须重装+重启后实测。

### 2.4 诉求 4：右栏面板（派活关系 + 成员状态 + 任务状态）

**判定：通过（静态）。**

证据：

1. 页签注册：`client.js:2793-2804` `ctx.sidebarRightTabs.register({ id:'cabinet-panel', kind:'cabinet', priority:'extension', title, guide:[…] })`；`2787` `TAB_ID`；`2806-2810` `ctx.slots.inject('sidebar.right.pane.tab', … ctx.slots.register({ name, key:TAB_ID, locale:NS }, CabinetPanel))`。两段式注册与出厂 `dsh-client-ui-plan/lib/client.js:692-695` 同法。
2. 契约核对：`dsh-client-ui-sidebar-right/lib/types/client/tab-registry.d.ts:57-110` 接受 id/kind/priority/title/guide；`slots.register` 的 `locale` 与 `PlanPreview` 用法一致（`dsh-client-ui-plan/lib/client.js:657-695`）；`inject` 列 `locale`，与 `dsh-client-ui-locale/lib/client.js:1526` `ctx.provide("locale")` 吻合。
3. 数据：`2585-2600` 同时消费 `useSessionStatus`（running）与 `useSessions` 的 `projectionsBySession[leadSessionId].values.agentTeam`（名册+任务板）；`leadSessionId` 由 `useSession` 的 `subagent.address.parentSessionId` 回溯，与出厂 `dsh-experimental-client-ui-agent-team/lib/client.js:238-239` 完全同法。
4. 派活树：`2644-2716` — 首辅行（`2658-2669`）在顶；`unassigned`/`leadOwn`/`foreignOwners` 分组；每位阁臣下按 `ownerName` 挂任务（`2691-2714`）；`blockedBy` 以 chip 显示（`2513-2558` 中 blocker 段）；`RailList`/`Row` 画连接线（`2423-2455`）。
5. 任务三色：`2303-2308` pending 灰 / in_progress 蓝 / completed 绿 / deleted 深灰；`2717-2733` 图例；`2741-2758` 中英双语文案（`status.running` = 干活中/working；`task.*` 齐备）。
6. 空态：`2629-2641` 无团队数据时给提示（含 leadSessionId 诊断），不会白屏。

**运行时未验证**：面板在浏览器中的实际渲染/折叠/Tab 打开路径未实测；README 已说明入口（`+` → 指南页「内阁」）。

### 2.5 诉求 5：单点接口（用户只与首辅对话，阁臣皆下臣）

**判定：通过（文本）；运行时未验证。**

证据：

- `cordis.patch.yml:65`：`单点接口（硬规矩）：用户只与首辅对话，首辅是唯一对外出口……阁臣不直接面向用户说话，不等待用户指令，只接受首辅分派、只向首辅回报……阁臣即便被用户@或看到用户消息，也须转呈首辅、由首辅裁断，不得自行答复。`
- 阁臣侧呼应：`61` 用 `send_message` 向 lead 回报；`66` 不得自称首辅/代替裁断。
- 身份判据短语已在 DSH 源码实测存在（§2.1-5），不会出现「判据失效导致阁臣自封首辅」。
- 限制：这是提示词约束，不是 UI 锁；用户仍可点开阁臣会话直接说话，只能靠阁臣转呈。是否满足用户「只能」的绝对要求，取决于运行时遵守，**未实测**。

### 2.6 诉求 6：女官/男官性别与年轻帅气

**判定：通过（目检）。**

逐张 `read_image` 结果：

| 头像 | 性别/身份目检 | 是否年轻 | 备注 |
|---|---|---|---|
| lead | 年轻男性，浅色书生袍、软巾，温润 | 是 | 契合同一诉求「齐静春式温润年轻书生」 |
| hanlin | 年轻男性，青色圆领官服、乌纱 | 是 | 编修 |
| works | 年轻男性，赤色官服、乌纱 | 是 | 主事 |
| dali | 年轻女性，黑色珠饰女官冠、灰色官服 | 是 | 女官，契合理事 |
| yushi | 年轻女性，黑色独角金饰冠、绯色官服 | 是 | 女官，契合理事；冠形见遗留 |

（性别为目检判断，未做自动化人脸/性别分类；五张均无胡须、面部年轻。）

### 2.7 诉求 7：画风、底色、圈内景、无文字、1024²

**判定：通过（目检+像素+OCR）。**

文件级：`file` 五张均 `PNG image data, 1024 x 1024, 8-bit/color RGBA`；sha256 互异（§1.2）。

底色实测（PIL；取圆内上左/上右 6 点均色，及 8 向环带 r=0.30–0.465 均色）：

| 头像 | 圆内上景 RGB | 上景 hue/sat | 环带 hue/sat | 判定色 | 目检场景（圈内） |
|---|---|---|---|---|---|
| lead | (249,238,198) | 47.9° / 0.21 | 42.9° / 0.25 | **明黄** | 暖金山峦、亭、竹，浅景深 |
| hanlin | (219,241,238) | 172.3° / 0.09 | 184.9° / 0.17 | **青** | 青蓝远山、飞檐、竹 |
| works | (233,215,184) | 37.1° / 0.21 | 20.2° / 0.32 | **赤** | 珊瑚/赤色山峦、亭、竹 |
| dali | (225,228,230) | 205.2° / 0.02 | 207.0° / 0.05 | **玄**（冷灰蓝提亮） | 灰蓝远山、亭、竹 |
| yushi | (239,218,216) | 4.9° / 0.09 | 2.5° / 0.16 | **绯** | 粉色山峦、亭、竹 |

补充量（外圈饱和样本圆周均值 hue）：lead 43.1°、hanlin 184.3°、works 25.3°、dali 209.4°、yushi 358.4°。两两 hue 距离：lead–works 18°（最小）、works–yushi 27°、hanlin–dali 25°、lead–yushi 45°，其余均 ≥124°。目检五色可辨（lead 金黄、works 珊瑚赤、yushi 绯粉、hanlin 青、dali 冷灰）；works 与 lead 的 hue 差最小，建议后续再拉开一档（非阻断）。全图平均亮度：lead 203.8、hanlin 199.9、works 190.6、dali 164.4、yushi 200.9（/255），均属浅色系；dali 最暗但仍为亮灰，不苦大仇深。

其余验收点：

- **圈内带景**：五张圆内均见山/亭/竹/云雾等国风风景，非纯色平涂；圆外同景延伸并有浅色光晕圈。
- **3/4 侧颜**：五张均微微侧转（非正面证件照），目检通过。
- **无文字**：目检无字形；`tesseract --psm 11` 仅输出噪声（如 `人 人 NT`、`% be RAS Kos WK!`、`rt 41] …`），无可读文字/水印。
- **1024²**：`file` 实测五张均 1024×1024。
- **画风**：lead/hanlin/dali/yushi 为 3D 半写实；works 更偏平面插画/水彩感 → 质感不统一，列遗留（按首辅口径不计缺陷）。
- **首辅气质**：lead 浅色书生装、温润微笑，非威严帝王，契合同一诉求。

---

## 3. 弹劾清单（按严重度排序）

| # | 严重度 | 缺陷 | 证据 | 处置建议 |
|---|---|---|---|---|
| 1 | **中** | 首辅令制第 49 行留有「无人可派或超出成员职责的环节，方可由首辅亲自完成」的例外，与用户「不得亲自执行调研/写码/跑命令」的绝对要求存在口径偏差；理论上可被首辅用来复现原「首辅直接干活」问题 | `cordis.patch.yml:49` | 删去例外，或改为「确需首辅亲自执行时，必须先向用户说明并取得同意」；至少要求留痕 |
| 2 | **低** | README 中文稿称头像为「正面胸像」，与实际五张 3/4 侧颜 + 圈内带景不符，也与用户裁定「3/4 侧颜自然非证件照」相左 | `README.zh.md:37` | 改为「3/4 侧颜胸像（圈内浅景深国风背景）」；英文稿无此句 |
| 3 | 低（建议） | 头像按姓名前缀匹配，未匹配即回落首辅头像；若未来成员不按五衙门前缀命名，成员会显示错误头像 | `client.js:2328-2332` | 可在 persona 中固定 spawn 名，或增加 role/衙门→头像的备用映射 |
| 4 | 低（建议） | `scripts/verify.mjs` 未断言 `client.js`/`index.js`/五张头像内嵌存在；若新文件缺失，verify 仍可能 PASS（除 README 项） | `scripts/verify.mjs` 无 client/avatar 检查；`node scripts/verify.mjs` 仅 20 PASS | 增加「client.js/index.js 存在且 data URL 数量=5、sha 非空」检查 |

> 其余发现（live 版本旧、浏览器未实测、质感差、yushi 冠形、未提交文件）按首辅口径归入遗留/风险，不记缺陷。

---

## 4. 未验证与遗留清单

1. **浏览器运行时渲染未实测（已知，须用户动作）**：`client.js` 为浏览器半部，须 `dsh plugin … install` 重装进 web profile 并完全重启 DSH 才生效；本轮无浏览器截图，面板实际布局/折叠/Tab 打开路径均未验证。同理，新 persona 的分派行为未实测。
2. **live 装机副本仍是旧版（预期，非缺陷）**：`~/.dsh/profiles/web/node_modules/dsh-cabinet-mode/` mtime 13:49、version 0.1.6、无 `client.js`/`index.js`/`src`；`dsh --profile web --dump-config` 只有 `preset-cabinet`（`/tmp/dumpconfig.txt:1337-1339`）、`cabinet-ui` 命中 0 → 新面板与新人设均未进入 live。
3. **质感差异（已知）**：works 偏平面插画/水彩，lead/hanlin/dali/yushi 偏 3D 半写实，五张质感不完全统一。
4. **yushi 冠形（已知）**：女性独角金饰冠，有獬豸/独角意象，但非明确完整的獬豸冠造型。
5. **前序评事报告 C 项已作废但文件未更新**：`docs/review-report.md` 仍写「C 不通过 / lead 底色非明黄」，其依据是 18:00 前旧图；本轮新图已通过（§2.7）。该文件不在 `package.json files` 发货清单内，不影响交付，但仓库读者可能误读。
6. **交付文件未纳入 git 跟踪（风险）**：`git status` 中 `client.js`、`index.js`、`src/`、`docs/images/avatars/`、`docs/research-ui-extension.md`、`docs/review-report.md` 均为 `??`；若按 tag/干净检出流程发版，这些文件不会进包，`client.js` 缺失将导致面板与头像整体不可用（`build_avatars.py` 只会生成占位色）。建议发版前 `git add` 并确认 release 工作流从工作树打包。
7. **verify.mjs 两条 FAIL 为发版前预期（首辅已声明，非缺陷）**：`PASS=20 FAIL=2 WARN=1`；FAIL 为 README 发行 URL 仍指 v0.1.6（待 v0.2.0 tag）与 `dump-config` 出现两份 preset-cabinet（profile 已装同 bundle 所致）。
8. **live 配置文件 mtime 变动**：`~/.dsh/profiles/web/cordis.yml` mtime 19:32、内容仍为 `[]`；`settings.yaml`/`cordis.patch.yml` 18:54，均未含本轮改造（`cabinet-ui`/`首辅令制` 命中 0）。写入发起者未验证（运行时自动重写或人工），但内容零涉本轮，不阻验收。
9. **头像前缀回落**（同弹劾 #3）：非标准命名成员会回落首辅头像。
10. **GR 口径限制**：本报告对诉求 1/2/5 的「运行时行为」只做静态/契约核验；「首辅是否真的先分派」「成员是否真的在界面显示」须重装重启后复验。

---

## 5. 交差判定

**准予交差。**

- 七条诉求均有可复核证据：1-6 通过（静态/文本/目检），7 通过（像素+目检+OCR）；未发现阻断性功能缺陷。
- 两条实际缺陷（弹劾 #1 中、#2 低）不影响本轮四项功能与三项追加裁定的静态验收结论，但建议在发版前修正；其中 #1 若用户坚持绝对「不得亲自执行」，应先改 `cordis.patch.yml:49` 再发版。
- 遗留 1（浏览器未实测）与遗留 6（未提交）属交付动作，须由首辅/用户跟进；在重装+重启前，用户当前界面仍是旧版，属预期而非缺陷。

> 本报告为我方独立结论，不采信评事/编修既有文档；所有路径与行号均对应当前工作树（截至 2026-11-04 19:46）。
