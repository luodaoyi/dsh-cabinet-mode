# 大理寺评事独立核验报告 · dsh-cabinet-mode 四项改造

- 核验人：dali-reviewer（大理寺评事），受首辅分派独立复核，不采信首辅/主事既有结论
- 时间：2026-11-04 17:08–17:35（Asia/Shanghai）
- 对象仓：`/home/fslong/Documents/玩机/cabinet-fork/dsh-cabinet-mode/`
- 方法：命令实测（git / node / python3+PyYAML+PIL / sha256sum / file / tesseract）+ `dim image read` 逐张直读

> 目检通道偏差（须知）：首辅指定的 `dim image read --provider bai --model mimo-v2.6-flash` 在本机不可用——`dim provider list` 共 132 项无 `bai`（实测 `provider_not_found`），`mimo-v2.6-flash` 在 dimcode-api-oauth 报「当前套餐不包含模型」、在 custom 渠道报「Model does not support image reading」、opencode-go 报 `sessionId must be non-empty`。改用本机唯一实测可读图的通道 `--provider agnes --model agnes-2.5-flash` 完成五张直读，并以 PIL 像素取证与 tesseract OCR 交叉印证。

---

## A. persona 改写（cordis.patch.yml）——通过

证据（均为本轮实测）：

1. **git diff 范围**：`git diff --stat` = `cordis.patch.yml | 31 +++...`、`package.json | 16 +++`，仅两文件。cordis.patch.yml 全部 diff 只有 4 个 hunk：
   - `@@ -1,8 +1,11 @@` 文件头 `#` 注释（1–11 行，注释改动，非正文）
   - `@@ -39,7 +42,14 @@`、`@@ -49,12 +59,14 @@` 均落在 persona `prefix` 块内
   - `@@ -169,3 +181,6 @@` 末尾追加 `- insert: - id: cabinet-ui / name: dsh-cabinet-mode`（184–186 行）
   - prefix 边界实测：`prefix: |-` 起于 28 行，至 69 行止（70 行 `- id: agent-instructions` 仅作 diff 上下文出现、未被改动）。**prefix 之外除文件头注释与末尾 insert 外零改动**；文件头注释改动内容与新结构一致（「inserts two rows: preset-cabinet + cabinet-ui」），其授权依据来自记忆记录 c02c1841（[ref]，原始裁断指令未复核，标未验证）。
2. **首辅令制 4 条**（46–50 行）：
   - 47 行：`1. …立即用 spawn_teammate 把子任务点名分派…并用 team_task_create 建任务板…`（spawn_teammate 分派 + team_task 建板 ✅）
   - 49 行：`3. 执行类工作一律委派，禁止首辅亲自执行…`（✅）
   - 48 行：`2. 令出即行，全程自主推进…`（✅）
   - 50 行：`4. 委派非免责：成员产出须经核验方许采信。`（✅）
3. **阁臣 team_task 状态条**：62 行 `7. 主动用 team_task 更新任务状态：接令后 claim 认领，完工即 complete；状态不更新视为未交差。`（✅）
4. **单点接口硬规矩**：65 行 `1. 单点接口（硬规矩）：用户只与首辅对话…阁臣不直接面向用户说话…也须转呈首辅…`（✅）
5. **YAML 可解析**：PyYAML 以 `tag:yaml.org,2002:js` 构造器加载成功（顶层 list len=2：insert preset-cabinet + insert cabinet-ui）。
6. **plugins=22**：`preset-cabinet.config.plugins` 实测长度 22（persona, agent-instructions, time-context, tool-bash, tool-pwsh, tool-fs, tool-fs-search, tool-jobs, tool-schedule, skill-filesystem, tool-skill, command-goal, tool-goal, planning, compaction, delegation, tool-ask-user, tool-todo, tool-web, present, tool-plugin-manager, tool-plugin-market）。

## B. client 插件三件套——通过

1. **package.json**（`git diff package.json` 全为新增）：36–39 行 `exports: {".": "./index.js", "./client": "./client.js"}` ✅；43–44 行 files 含 `index.js`、`client.js` ✅；57–66 行 `dsh.client` 节（platform=web、immediately=true、inject 4 项含 `@deepseek-ai/dsh-client-ui-sidebar-right`）✅。
2. **index.js**：存在，2 行，`export function apply() {}`；`node --check index.js` 通过（exit 0）✅。
3. **client.js**：`node --check client.js` 通过（exit 0）✅；注册与订阅证据行号：
   - 2568 行 `const inject = ['slots', 'locale', 'sidebarRightTabs'];`
   - 2569 行 `const TAB_ID = 'cabinet-panel';`
   - 2575 行 `ctx.effect(() => ctx.sidebarRightTabs.register({ id: TAB_ID, kind: 'cabinet', … })` ✅
   - 2588–2589 行 `ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS }, CabinetPanel))` ✅
   - 数据订阅：2361 行 `function CabinetPanel({…, useSessions, useSessionStatus, t})`；2367 行 `readSessions = safeHook(useSessions, …)`；2368 行 `readStatus = safeHook(useSessionStatus, …)`；2374 行注释 `Channel 1: api-session/status (running)`；2377–2380 行 `projectionsBySession → values.agentTeam`（lead session 优先、回退当前 session）✅ `useSessionStatus` + `agentTeam` 投影双通道成立。
   - 内嵌头像：`AVATARS` 5 个 data URL（23 行起），与 `src/avatars.js` 逐 key 相等，各自 base64 解码均得 128×128 PNG 且字节等于 `src/avatars/<key>.png`（5/5 通过）。
4. **cordis.patch.yml 恰一行 cabinet-ui**：`grep -n cabinet-ui` = 4 行（`#` 注释内提及）与 185 行 `- id: cabinet-ui`（186 行 name），实际 insert 行恰 1 ✅；首辅令制仍在（46 行）✅。

## C. 头像五张（docs/images/avatars/）——**不通过（lead 底色非明黄）**，其余项通过

### 文件级证据（通过）
- `file`：五张均 `PNG image data, 1024 x 1024, 8-bit/color RGBA` ✅
- `sha256sum` 互异 ✅：lead `439ffeff…`、hanlin `29b747b0…`、works `95698d54…`、dali `03d26383…`、yushi `5c19111e…`

### 逐张 dim 直读（agnes/agnes-2.5-flash，带 7 条验收 prompt）

| 张 | ①明亮 | ②身份气质 | ④3/4 侧颜 | ⑤浅景深国风 | ⑥无文字 | ⑦底色 | 备注 |
|---|---|---|---|---|---|---|---|
| lead | ✅ 浅色明亮 | ✅ 男性青年温润书生、明示「非威严帝王」 | ✅ 3/4 | ✅ 朦胧山峦竹叶建筑 | ✅（两问均答无） | ❌ 判「淡青色/青白」，非明黄 | 见下 |
| hanlin | ✅ | ✅ 约 20 岁青年温儒 | ✅ 3/4 | ✅ 飞檐远山竹影 | ✅ | ✅ 淡青白＝青 | — |
| works | ✅ | ✅ 年轻男性官员 | ✅ 3/4 | ✅ 山水云层亭台 | ✅ | ✅ 浅粉米白（赤调） | 3D 写实 |
| dali | ✅ | ✅ 约 20 岁女性、明示「明代女官」 | ✅ 3/4 | ✅ 远山建筑竹叶 | ✅ | ⚠️ 极浅米白/灰白（玄的中性提亮，偏暖） | 3D 写实 |
| yushi | ✅ | ⚠️ 年轻女性，但冠为「装饰性银色镂空冠，非明代女官制度性冠帽」 | ✅ 3/4 | ✅ 亭台远山云雾竹枝 | ✅ | ✅ 淡粉红（绯） | 与已知遗留獬豸冠一致 |

### 像素取证（PIL，圆内背景带 r=0.30–0.465 与 8 向 0.38–0.44 环带）
- hanlin：UL/UR `RGB(231,249,247)/(220,242,241)` hue 173–177 sat 0.07–0.09，环带 hue≈168–182 sat 0.07–0.15 → 青 ✅
- works：UL/UR `RGB(249,219,210)/(246,214,204)` hue 14 sat 0.16–0.17，环带 hue≈13–15 sat 0.18–0.20 → 赤 ✅
- yushi：UL/UR hue 14 sat 0.10–0.11，环带 hue≈9–10 sat 0.08–0.10 → 绯 ✅
- dali：UL/UR `RGB(239,238,230)/(238,236,228)` hue 48–53 sat 0.04 → 中性暖白，作「玄提亮」可辩但偏暖 ⚠️
- lead：环带 8 向 hue 44–103、sat 0.03–0.07，UL `RGB(250,248,241)`、环带均值 ≈ `(224,224,214)`（G≥B、近中性）；圆内 sat≥0.10 且 hue∈[35,70] 的「黄」像素 2494/43709 且 99% 落在下半幅，vision 二次追问明确答「长袍米白、画面中不存在明显的黄色/金色区域」→ **明黄底色缺失** ❌
- **区分度问题**：lead 与 dali 圆环均值 `ΔRGB≈(4,5,1)`，肉眼几乎同色，不满足「按明黄/青/赤/玄/绯提亮」的五色区分意图。

### OCR 交叉（⑥）
`tesseract -l chi_sim+eng --psm 11` 对五张仅产出噪声串（hanlin `\aSe)==`、works `iNVv)Dyae(xa`、dali `Tidlyy"7»…`、yushi `f*VERwr»2`、lead `ViV 'e`），无可读字形；与 vision 五张「无文字/水印」结论一致（OCR 证据强度弱，仅作旁证）。

### C 项判定
- **不通过**：⑦ lead 底色应为明黄，实测为青白/米白近中性（vision 两问 + 像素双证），并与 dali 玄色底几乎同色。
- 通过：①②③④⑤⑥ 于 lead/hanlin/works 三张全过；dali 过 ①–⑥、⑦ 勉强；yushi 过 ①②④⑤⑥⑦、③ 部分（女官制度特征弱，冠非獬豸冠——已知遗留）。

## D. 同步一致性——通过

1. `src/avatars/` 五张，`file` = 128×128 PNG ✅，sha 互异（`a1a81f6d…`/`cd80ddd6…`/`b3f80f80…`/`9f53d049…`/`6141d2d5…`）✅
2. **与原图对应**：按 `src/build_avatars.py` 同法（中心裁方 + LANCZOS 128）重算原图，与 `src/avatars/<key>.png` 逐像素比对——五张 `maxdiff=0、meanLdiff=0.0` ✅
3. **占位符为空**：`client.js:2071 AVATAR_PLACEHOLDERS = []`；`src/avatars.js:2053 export const PLACEHOLDERS = []` ✅
4. **时间戳链**（晚于原图）：原图 16:29:36–17:04:44 → `src/avatars/*.png` 17:05:14–17:05:15 → `src/avatars.js` 17:05:15.849 → `client.js` 17:05:15.852 ✅

## E. 收尾完整度——通过（附一项未验证）

1. **git status 全在授权写入范围**：`M cordis.patch.yml`、`M package.json`、`?? client.js`、`?? index.js`、`?? src/`、`?? docs/images/avatars/`、`?? docs/research-ui-extension.md` —— 均属 cordis.patch.yml / package.json / index.js / client.js / src/ / docs/ ✅；`scripts/`、README、CHANGELOG 等零改动 ✅
2. **PKG 目录零改动**：`/var/opt/node24/lib/node_modules/@deepseek-ai/dsh` 下 `find -iname "*cabinet*"` 零命中；`find -newermt "2026-11-04 14:00"` 零文件 ✅
3. **live 装机副本仍是旧版**：`~/.dsh/profiles/web/node_modules/dsh-cabinet-mode/` mtime 13:49:39（本轮开工前），目录内 `*.js` 零个、`grep -c cabinet-ui cordis.patch.yml = 0`、`grep -c '"exports"' package.json = 0` → 未被本轮触碰 ✅
4. **未验证（须知）**：`~/.dsh/profiles/web/cordis.yml`（16:45:14）、`~/.dsh/profiles/web/cordis.patch.yml`（16:45:30）、`~/.dsh/settings.yaml`（16:45）mtime 落在本轮时段内，同窗口另有多个 `sessions/*/session.lock` 更新。核查：settings.yaml 与 14:21 的 `settings.yaml.imported` `diff` 为空（同内容重写）；live cordis.patch.yml 中 `首辅令制`、`cabinet-ui`（insert）命中均为 0 → **本轮改造未落 live 配置**。该三次写入的发起者（DSH 运行时 vs 人工）无日志可证，标「未验证」，不计入本轮不通过，但留痕。

---

## 总体结论

**有条件不通过（A/B/D/E 通过，C 不通过）**：按「验收合格方可交差」，头像项因 lead 底色未达验收⑦，须重画 lead（或由首辅/用户裁断接受现状并明示豁免）后方可整体交差；其余四项证据充分、可判定通过。

- 与首辅既有抽验的分歧：首辅「五张目检均合格」与本评事复核相左——分歧点仅在 lead 的 ⑦ 底色，证据为 dim 两问一致答「淡青色/青白、无黄色区」+ PIL 环带 hue/sat 实测近中性 + 与 dali 同色；以独立证据为准，判不通过。

## 不通过/存疑项单列

| # | 项 | 问题 | 证据 | 处置建议 |
|---|---|---|---|---|
| 1 | C-⑦ lead | 底色非明黄（读作青白/米白），且与 dali 玄色底 ΔRGB≈(4,5,1) 几乎同色 | dim 两问；PIL 环带 hue44–103 sat0.03–0.07 | 重画 lead 底色为提亮明黄，或首辅明示豁免 |
| 2 | C-③ yushi | 冠为装饰银冠、非獬豸冠；女官制度特征弱（vision 判「古风仕女」） | dim 直读原话 | 已知遗留，随重画一并处理 |
| 3 | C-⑦ dali | 玄的提亮呈暖米白，与 lead 同色系，区分度弱 | PIL 环带对比 | 与 #1 一并调色 |
| 4 | E-4 | live 配置 16:45 三次写入发起者未验证（内容未含本轮改造） | stat + diff + grep | 交首辅知悉，不阻验收 |

## 遗留清单（已知 + 本轮新增）

1. **浏览器运行时渲染未实测**：须 `plugin_manager install_bundle` 重装进 profile 并重启 DSH 才生效，属用户动作——未验证。
2. **质感差**：lead/hanlin 偏水彩，works/dali/yushi 偏 3D，五张不同质。
3. **yushi 冠未做成獬豸冠形**（本轮复核确认仍在）。
4. **【新增】lead 明黄底色缺失**，与 dali 底色几乎同色（见不通过表 #1/#3）。
5. **目检通道降级**：指定的 `--provider bai --model mimo-v2.6-flash` 本机不可用，改用 `agnes/agnes-2.5-flash`；若首辅要求原通道复检，需先修复 dim provider 配置。
6. live 配置 16:45 写入发起者未验证（内容零涉本轮改造）。

---

## C 项复检（第五轮重出，2026-11-04 19:26–19:40 复核）

> 本节结论**取代**上文 C 项「不通过」判定：主事已按「圈内人物也要背景」重出五张（18:00–18:09），A/B/D/E 结论不变，仅复检 C（附带复核 D 的同步部分与 client.js 完整性）。
> 读图通道同首轮：指定 `--provider bai --model mimo-v2.6-flash` 本机不可用，仍用 `--provider agnes --model agnes-2.5-flash`（偏差见文首）。

### 文件与同步（通过）
- `file`：五张均 1024×1024 RGBA；`sha256sum` 与首辅所列前缀逐一相符且互异——lead `51bae8f5…`、hanlin `0e89fd9d…`、works `da2f16f1…`、dali `960ac506…`、yushi `670f75c5…`。
- D 同步：`src/avatars/*.png` 五张 128²；按 `src/build_avatars.py` 同法（中心裁方+LANCZOS）重算原图逐像素比对，五张 `maxdiff=0、mean=0.0`；`src/avatars.js:2271 PLACEHOLDERS = []`、`client.js:2289 AVATAR_PLACEHOLDERS = []`；时间戳链 docs 18:00:59–18:09:04 → `src/avatars/*.png` 18:10:44–45 → `src/avatars.js` 18:10:45.713 → `client.js` 18:10:45.716，全部晚于原图。
- 内嵌：client.js 与 src/avatars.js 五条 data URL 逐 key 相等，字节等于 `src/avatars/<key>.png`，解码均 128×128；`node --check client.js` 仍通过（注册行位移至 2787/2793/2806，系 avatars 区加长所致）。

### 要点1 圈内有景（通过）
dim 直读五张一致答「浅景深国风风景，非纯色平涂」：lead=远山+左右宫檐/亭台+右侧竹叶+流云雾气（重度虚化）；hanlin=左侧飞檐+淡青山峦+竹叶+流云；works=远山+左侧飞檐+右侧竹枝+云雾；dali=层叠远山+右侧宫檐/亭角+左侧竹影；yushi=远山+右侧宫檐+右上竹影+流云（该项首轮漏答，单独补问取得）。
像素佐证：圆内环带亮度标准差 lead 41.6 / hanlin 45.6 / works 52.5 / dali 63.2 / yushi 53.7（纯色平涂应趋 0），均非平涂。

### 要点2 角色主调辨识（通过）
本评事独立环带采样（r=0.36–0.44，360 方向）与首辅自测对照：

| 张 | 我的采样 RGB / hue / sat | 首辅自测 | 判定色 |
|---|---|---|---|
| lead | (213,196,156) h42.1 s0.268 | (213,196,157) h41.8 s0.263 | 明黄 ✅ |
| hanlin | (173,207,208) h181.7 s0.168 | (172,206,208) h183 s0.173 | 青 ✅ |
| works | (211,167,136) h24.8 s0.355 | (211,167,140) h22.8 s0.336 | 赤 ✅ |
| dali | (165,170,173) h202.5 s0.046 | (169,174,178) h206.7 s0.051 | 玄（冷灰提亮）✅ |
| yushi | (221,187,186) h1.7 s0.158 | (226,195,193) h3.6 s0.146 | 绯 ✅ |

两两可辨：环带均值欧氏距离最小者 lead–yushi 32.3、lead–works 35.3，其余 ≥51.6；色相 42/182/25/203/2 五点分离，lead 与 works 虽最近但 h42 vs h25、s0.27 vs 0.36 可区分 ✅。
注：首轮 lead 底色 h44–103 sat0.03–0.07 近中性、与 dali ΔRGB≈(4,5,1) 同色的问题本轮已消除（lead sat 0.268、与 dali ΔRGB=(48,26,17)）。

### 要点3 身份性别（通过）
- lead：dim 答「温润年轻男书生，非威严帝王、非女性」，衣着**白色/米白色长袍**——与首辅更正「月白儒衫男书生」一致；首辅此前「樱粉女官」系其自述误读，我方直读从未如此判（首轮即判男性青年书生）。
- hanlin：年轻男性、黑色展脚幞头、淡青圆领袍、云鹤补 ✅ 男官。
- works：约20–30岁男性、赤陶橙红长袍、龙纹方补、黑色官帽 ✅ 男官。
- dali：年轻女性、黑色网纱官帽（金饰珍珠）、浅灰银白圆领袍、飞禽补，dim 明答「具明代女官/权贵气质」✅。
- yushi：年轻女性、dim 明答「具明代女官气质」，黑色冠帽顶部带立角（答为「类似獬豸冠变体」）、粉袍瑞兽补 ✅（较上轮「装饰性银冠非制度冠」有改善）。

### 要点4 构图/明亮/无文字/尺寸（通过）
- 3/4 侧颜：lead 约45度侧脸、hanlin 侧望、works 面向左微侧、dali 面向右、yushi 面向左微侧，五张均答「3/4 侧颜」✅
- 浅色明亮：五张均答「浅色明亮、光线柔和」✅（dali 主调冷灰但整体明度仍高，dim 判浅色明亮）
- 无文字：dim 五张均答「无文字/水印/汉字」；tesseract chi_sim+eng psm11 仅出噪声串（lead「人人NT」、hanlin「%beRASKosWK!」、dali 乱码串等），无可读词形，旁证一致 ✅（OCR 证据强度弱）
- 1024²：`file` 实测五张 ✅

### 要点5 同步一致性（通过）
见上「文件与同步」：五张 128² 与原图逐像素一致、PLACEHOLDERS 皆空、时间戳链完整 ✅

### 复检结论
**C 项复检通过**（要点 1–5 全过）；D 同步部分同步复核通过；A/B/E 未重跑（首辅指示不变）。

### 复检新增留痕（非 C 项，须首辅裁决）
- `git status` 于 19:31 新出现 `M README.md`、`M README.zh.md`（+89/−6，内容为补 cabinet panel 与五头像说明），**不在**本评事受核验任务时拿到的授权写入范围清单（cordis.patch.yml、package.json、index.js、client.js、src/、docs/）内，且非本评事所改；时间戳落在本轮复检进行中，疑似他曹补文档——授权与否请首辅确认。
- 遗留沿用：浏览器运行时渲染未实测（须重装 bundle 并重启 DSH）、水彩/3D 质感差、yushi 冠为「獬豸冠变体」而非严格獬豸冠形。
