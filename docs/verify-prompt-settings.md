> Historical contributor notes from PR #22 head e1f0058. These are not release acceptance evidence. Local file sources, version fallbacks and install-chain claims below are superseded by `pr22-install-validation.md`.

# 复验报告：提示词增补与配置页多 tab 未提交改动（task-13 独立核验）

- 复验人：大理寺卿（二）dalisi-qing-2，受首辅 lead 节制
- 时间：2026-11-08 15:34–15:55 (Asia/Shanghai)
- 现场：仓库 cabinet-fork/dsh-cabinet-mode，HEAD=425dd48f286a36321b41461a9b98022b0239b02c，改动**均未提交**
- 结论：**通过**（离线核验范围）；浏览器与真机安装按令全列未验证
- 写入范围：仅本文件（唯一写入，其余只读；未提交/未推送/未装机/未重启）

## ① 改动面与受保护文件

```
$ git rev-parse HEAD
425dd48f286a36321b41461a9b98022b0239b02c

$ git status --porcelain
 M client.js
 M index.js
 M scripts/test-client.mjs
 M scripts/test-model-picker.mjs
?? docs/acceptance/member-config-acceptance.md
?? docs/research-respire-install.md
?? docs/research-upstream-sync.md
?? docs/verify-pr21-copy-install.md
?? docs/verify-sync-upstream.md
?? docs/verify/member-config-verification.md

$ git diff --numstat
239	51	client.js
1	0	index.js
116	2	scripts/test-client.mjs
6	1	scripts/test-model-picker.mjs
```

→ **通过**：改动恰四文件（client.js、index.js、scripts/test-client.mjs、scripts/test-model-picker.mjs），与任务书一致；六份未跟踪 docs 均为既有/本轮前他人产出，非本次改动。

受保护文件逐个 `git diff --quiet HEAD -- <file>`（空 diff = 零改动）：

| 文件 | 结果 |
|---|---|
| cordis.patch.yml | 无改动 |
| package.json | 无改动 |
| README.md | 无改动 |
| README.zh.md | 无改动 |
| CHANGELOG.md | 无改动 |
| locale/en.json | 无改动 |
| locale/zh.json | 无改动 |
| scripts/verify.mjs | 无改动（`git diff --stat` 空） |

→ **通过**：受保护文件零改动。

冲突标记：

```
$ grep -rn -E '^(<<<<<<<|=======|>>>>>>>)' client.js index.js scripts/
（无输出）
```

→ 通过。

## ② 门禁亲跑（逐个 exit code 与首行）

| 命令 | exit | 首行 / 结果 |
|---|---|---|
| node --check client.js | 0 | （无输出） |
| node --check index.js | 0 | （无输出） |
| node scripts/test-client.mjs | 0 | **6 行 PASS**（末行 `PASS: settings tabs switch by section, memory-plugin card renders unavailable/installed/error states, bilingual settings keys match`） |
| node scripts/verify.mjs | 0 | `Result: PASS=43 FAIL=0 WARN=1` + `Verification passed.` |
| node scripts/test-model-picker.mjs | 0 | `PASS model picker render: loading hint, empty/failure fallback, refresh, retained choices, manual Save and Chinese/English error translation` |

→ **全部通过**，与工部所报一致（test-client 恰 6 行 PASS、verify 43/0/1、picker 绿）。

verify 中与本次相关的两条原文：

```
[PASS] Lead default prompt: identical in both halves, 902 chars, carries 御下术 copy and red lines
[PASS] 22-row plugin list order matches the DSH 0.2.2-rc.1 reference Standard Mode
```

（WARN 仍为 `0.2.2-rc.1 tested, running 0.2.1-rc.5`，informational only，与 task-13 无关，系 task-9 遗留口径。）

## ③ 提示词（task-10）

**两半字节一致**：

```
$ 抽取 index.js 与 client.js 的 DEFAULT_LEAD_PROMPT 模板串
index.js len=902
client.js len=902
$ md5 比对
84c69215aeedbda166daa04417801b6e  /tmp/lp-index.txt
84c69215aeedbda166daa04417801b6e  /tmp/lp-client.txt   （比对后已删临时文件）
identical: true
```

→ **通过**：两半 902 字符、md5 相同（与首辅亲验 902 一致，独立复核相符）。

**必含标记逐条在文**（脚本对抽串逐词 `includes`，全部 OK）：

| 项 | 结果 | 落点 |
|---|---|---|
| 「御下术」 | OK | index.js:151 / client.js 提示词区 |
| 「红线（压过全部话术）」 | OK | 同上（红线段在「十一」之后） |
| 「十一、监控纠偏」 | OK | index.js:152 新增行 |

**五条必含条款逐条在文**（逐词实测，全 true）：

| 条款 | 关键词命中 |
|---|---|
| ① 分派即设监控点 | `分派即设监控点` + `回报死线与产物清单` + `一轮只产一个交付物` ✓ |
| ② 巡检三手段 | `team_task_list` + `send_message` + `三件回报` + `产物文件时间戳与站内读回` + `不以 finished 或 not found 断定断链` ✓ |
| ③ 死循环三征兆 | `死循环三征兆` + `重复≥2 次无进展` + `提示词过长` + `一轮塞多文件多环节` ✓ |
| ④ 矫正动作链 | `interrupt_agent 中止` + `收窄拆成单文件小步重派` + `仍败则换人` + `严禁同一步骤并发派第二执行者` ✓ |
| ⑤ 裁决内嵌 | `裁决必须内嵌派单提示词` ✓ |

**index.js 改动恰一行**：`git diff -U0 -- index.js` → `@@ -151,0 +152 @@`，即在 `const DEFAULT_LEAD_PROMPT = \``（:151）之后插入 :152 一行「十一、监控纠偏」，`+1/-0`。既有「一～十」与「红线」段一字未动（diff 无删除行）。

**test-client.mjs 新增 8 词断言在位**（scripts/test-client.mjs:92-94）：

```js
for (const clause of ['监控纠偏', 'team_task_list', 'send_message', 'interrupt_agent', '并发派第二执行者', '文件时间戳', '单文件小步重派', '内嵌派单提示词']) {
  assert.ok(client.DEFAULT_LEAD_PROMPT.includes(clause), `lead prompt carries the monitoring/correction clause: ${clause}`);
}
```

8 词实测**全在**提示词中；且 :91 既有 `assert.ok(...includes('御下术'))` 仍在。

**既有断言未删**：`git diff -- scripts/test-client.mjs` 的全部删除行只有 2 行，均为**导出串改写**（`-runInNewContext(source.replace(exportPoint,` 与 `-  'return { inject, ..., DEFAULT_LEAD_PROMPT };'), {`），改写后为 `const exportList = 'return { ..., DEFAULT_LEAD_PROMPT, CabinetMemberSettings, MemoryPluginCard, memoryPluginInstalledOf, SETTINGS_TABS };'` + `runInNewContext(source.replace(exportPoint, exportList), {` —— **纯增名字（4 个），原有 18 个导出名一字未删**；`grep -E "^-" | grep assert` → **0**（零断言删除）。

verify.mjs 的两半字节断言（:196-209）与 13 词必含断言（:205 `['【御下术·仅首辅适用】', '立威', ..., '绝不对陛下（用户）使用']`）**均未被改**（verify.mjs 零 diff），实跑 PASS。

## ④ 配置页（task-11）

**四 tab 与条件渲染**（行号为现文 client.js）：

| 位置 | 内容 |
|---|---|
| client.js:3894 | `const SETTINGS_TABS = ['members', 'avatars', 'models', 'prompts'];` |
| client.js:4158 | `h('div', { key: 'tabs', role: 'tablist', ... }, SETTINGS_TABS.map(...))` |
| client.js:4056 | `activeTab === 'avatars' ? h('div', { key: 'builtin', ...` |
| client.js:4086 | `activeTab === 'members' ? [`（name label + input key:'ni'） |
| client.js:4098 | `activeTab === 'models' ? [`（ml label + mi select/input + mh + mhint） |
| client.js:4126 | `activeTab === 'prompts' ? [`（prompt label + textarea key:'pi'） |

→ 与任务书给的 :4056/:4086/:4098/:4126 **逐一吻合**。

**活动 tab 状态**：client.js:4005 `const [activeTab, setActiveTab] = React.useState('members');` —— 唯一一处 `useState('members')`；client.js:4004 注释明写 `// localStorage precedent — so no second persistence source.`；`grep -c "localStorage" client.js` = **1，且那 1 处就是这行注释本身**，代码无任何 localStorage 调用。→ **会话内状态、无持久化，符合「方案 A」**。

**tab bar 与 aria**：client.js:4158-4167 —— `role: 'tablist'`（容器）、每按钮 `role: 'tab'`、`'aria-selected': activeTab === id`、`data-cabinet-settings-tab`、`data-cabinet-settings-active`（'1'/'0'）、`onClick: () => setActiveTab(id)`。→ **在位**。

**catalog 行随 models tab**：client.js:4168 `activeTab === 'models' ? h('div', { key: 'catalog-row', ... ['data-cabinet-settings-refresh': '1'] ... }) : null` —— 刷新按钮已从全局移入 models tab（旧位置为 save 之前，已删，见 §⑥ 删除行清单）。

**MemoryPluginCard 位置与三态**：

- 定义 client.js:3909 `function MemoryPluginCard(props)`；挂载 client.js:4175 `h(MemoryPluginCard, { key: 'memory-plugin', t })`，**紧邻其后** client.js:4176 `key: 'save'`、:4177 `key: 'cancel'` → **位于 save 之前**（测试断言 `saveAt > cardAt` 亦覆盖）。
- 卡片容器 client.js:3978 `'data-cabinet-plugin-card': 'memory'`。
- **已装态**：client.js:3982 `'data-cabinet-plugin-state': 'installed'` 徽标；client.js:3989 `installed !== null ? h('div', { key: 'where', ... })` **不渲染 install 按钮**（按钮在 `: h('div', { key: 'row', ...` 分支内，:3990）→ 已装无安装按钮 ✓。
- **unavailable 态**：client.js:3992 `!manager ? h('div', { key: 'unavailable', 'data-cabinet-plugin-state': 'unavailable', ... }, t('settings.plugin.unavailable')) : null`；按钮 `disabled: !manager || working`（:3990）→ 无通道时 disabled ✓。
- **错误回显原文**：client.js:3933 `const fail = (text) => { setWorking(false); setFailure(typeof text === 'string' && text !== '' ? text : String(text)); };` → 原样入 state；client.js:3996 `failure !== '' ? h('div', { key: 'failure', 'data-cabinet-plugin-state': 'error', ... }, failure) : null` → **直渲染 failure，无 t() 包裹、无截断**，即原文回显 ✓（测试断言 `includes('boom: registry unreachable')` 亦覆盖）。
- 进度/重启态：:3993 progress、:3994 restart（`settings.plugin.restartRequired`）。

**spec 双路径**：

- client.js:3887 `const MEMORY_PLUGIN_NAME = '@rsrsai/dsh';`
- client.js:3890 `const MEMORY_PLUGIN_SPEC = 'file:/home/fslong/Documents/玩机/cabinet-fork/respire-dsh';`（**默认本地路径**）
- client.js:3892 `const MEMORY_PLUGIN_REGISTRY_SPEC = '@rsrsai/dsh@0.1.13';`（**registry 备选**）
- 卡面两行分别回显：client.js:3985 `t('settings.plugin.spec.local') + '：' + MEMORY_PLUGIN_SPEC`、:3986 `t('settings.plugin.spec.registry') + '：' + MEMORY_PLUGIN_REGISTRY_SPEC`
- 安装实际只用 `MEMORY_PLUGIN_SPEC`（:3938 `manager.inspect(MEMORY_PLUGIN_SPEC, {})`、:3941 `manager.installBundle(MEMORY_PLUGIN_SPEC, ...)`）；registry spec 仅展示，**未接安装按钮** → 「备选」语义与工部自述一致。

**独立注入未动既有注入**：`grep -n "ctx.inject(" client.js` 现有五处：

| 行 | 注入 | 状态 |
|---|---|---|
| 4375 | `ctx.inject(['remote', 'remote.session'], ...)` | 与 HEAD 逐字 diff **EXIT=0** |
| 4386 | `ctx.inject(['uiWorkspace'], ...)` | 注入体 11 行逐字相同（diff 仅其后新增的注释块，非注入本体） |
| **4398** | `ctx.inject(['remote', 'remote.pluginManager'], ...)` | **新增** |
| 4431 | `ctx.inject(['configForms'], ...)` | 与 HEAD 逐字 diff **EXIT=0** |

新增注入自带 guard（:4400 `if (!manager || typeof manager.inspect !== 'function' || typeof manager.installBundle !== 'function') return;`），effect 清理 :4405-4406 把 `cabinetPluginManager/cabinetPluginEvents` 归还 null。→ **独立注入、既有三处未动 ✓**。

**zh/en settings.* 13 键同键同数**（脚本抽取两字典 `settings.` 前缀键）：

```
zh settings.* count: 13
en settings.* count: 13
same set: true
```

13 键清单：`settings.tab.members`、`settings.tab.avatars`、`settings.tab.models`、`settings.tab.prompts`、`settings.plugin.title`、`settings.plugin.desc`、`settings.plugin.install`、`settings.plugin.installing`、`settings.plugin.installed`、`settings.plugin.restartRequired`、`settings.plugin.unavailable`、`settings.plugin.spec.local`、`settings.plugin.spec.registry`。
（zh 落点 client.js:4238-4249，en 落点 client.js:4316-4328。）→ **同键同数 ✓**。

测试侧覆盖（scripts/test-client.mjs:394-505 新增段，36 行含 assert 的新增，**0 断言删除**）：四 tab 顺序与 active、members/models/prompts/avatars 各自字段显隐、card 在 save 之前、cancel 存活、插件卡 unavailable/installed/error 三态、`memoryPluginInstalledOf` 字段映射与畸形输入不抛、错误原文回显、zh/en settings 键集合相等、4 个 tab 标签 + 4 个 plugin 文案在 zh 齐备。

## ⑤ test-model-picker.mjs setup（:24-29）

```
$ git diff -- scripts/test-model-picker.mjs
-let tree=render();assert.ok(pickers(tree).every(n=>n.type==='input'&&n.props.disabled));
+let tree=render();
+// Setup only: the model fields now live on the models tab, so this click puts
+// the UI in the state every assertion below assumes. No assertion body changes.
+nodes(tree).find(n=>n.props['data-cabinet-settings-tab']==='models').props.onClick();
+tree=render();
+assert.ok(pickers(tree).every(n=>n.type==='input'&&n.props.disabled));
```

- **setup 仅 1 处点击**：`git diff | grep -c "^+.*onClick"` = **1**，且目标为 `'data-cabinet-settings-tab'==='models'` → **只点 models tab** ✓。
- **断言体一字未改**：以 HEAD :25..47 与现 :30..52 逐行 `diff` → **EXIT=0（完全相同）**；文件首末行 md5 相同（`e8a07ae6ab4c8d7ce874cc777831c915`）；总行数 42 → 47（+5，恰为 setup 增行）。原单行 `let tree=render();assert.ok(...)` 被拆为 setup 5 行 + 同一断言行，断言文本逐字保留。
- 唯一 `-1` 行即该单行的拆分前形态，非断言删弱。

## ⑥ 断言不删弱（scripts/ 全量）

```
$ git diff -- scripts/ | grep -E "^-" | grep -v "^---"
-runInNewContext(source.replace(exportPoint,
-  'return { inject, apply, avatarFor, ..., DEFAULT_LEAD_PROMPT };'), {
-let tree=render();assert.ok(pickers(tree).every(n=>n.type==='input'&&n.props.disabled));
```

- test-client.mjs：2 行删除，均为**导出串改写**（原 18 个名字全保留，新增 4 个名字），`grep -c "assert"` 于删除行 = **0**。
- test-model-picker.mjs：1 行删除，为 setup 拆分前单行，断言文本原样保留（§⑤ diff EXIT=0 证明）。
- **scripts/verify.mjs 零 diff**（受保护）。
- 新增 assert 统计：test-client.mjs `git diff | grep -c "^+.*assert"` = **36**；删除 = **0**。

→ **断言纯新增、零删弱 ✓**。

## ⑦ 工部「六条自报」独立复核

工部自报六条（首辅转述）逐条复核：

| # | 自报内容 | 我方独立复核 | 判定 |
|---|---|---|---|
| 1 | 本机已装 `@rsrsai/dsh` 0.1.13 | `ls ~/.dsh/profiles/web/node_modules/@rsrsai/dsh/package.json` 存在，`version` = `0.1.13` | **属实** |
| 2 | 已在 profile bundles 且启用 | `~/.dsh/profiles/web/package.json:6` `"@rsrsai/dsh": "file:/home/fslong/Documents/玩机/cabinet-fork/respire-dsh"`，:16 bundles 数组内含该名 | **属实** |
| 3 | 代理 12000 死 | `ss -ltn \| grep 127.0.0.1:12000` → 无监听（grep exit 1） | **属实** |
| 4 | `file:` 免网（代码级） | 源目录 `/home/fslong/Documents/玩机/cabinet-fork/respire-dsh` 存在，`package.json` name=`@rsrsai/dsh`、version=`0.1.13`，**含 `.git`**；「parseInstallSpec 走 kind:path 免网」为工部引源码结论，**我未复跑其源码读取** → 该子句**未验证** | **部分属实** |
| 5 | 真一键通道存在且无需改 host | 静态核本机 `dsh-plugin-manager/lib/index.js`：服务名 `super(ctx, "pluginManager")`（:1605）；`_inspect/_installBundle/_waitForInstall/_setBundleEnabled/_listBundles_decorators = [Remote]`（:1426-1430）→ 五方法均远程暴露；`inspect` 24 处、`installBundle` 7 处、`waitForInstall` 7 处、`setBundleEnabled` 7 处、`listBundles` 8 处命中 | **静态属实**；真机调用**未验证** |
| 6 | 浏览器未实测、真机安装未跑 | 我本轮亦未开浏览器、未点安装 | **属实（同为未验证）** |

→ 六条中 **5 条属实、1 条（file: 免网源码级论证）部分未验证**；无一条被证伪。

## 缺陷

**未发现阻断性缺陷。** 以下为低危观察项（不判失败）：

1. **【低】`MEMORY_PLUGIN_SPEC` 为本机绝对路径**（client.js:3890 `file:/home/fslong/Documents/玩机/cabinet-fork/respire-dsh`）。硬编码进 client.js，换机器即失效；卡面 :3985 会把该绝对路径原样显示给用户。工部已以 `MEMORY_PLUGIN_REGISTRY_SPEC`（:3892）作跨机备选并明示「需可达 registry」，属已知取舍，非隐藏缺陷。
2. **【低】registry spec 只展示、未接安装**（:3986 显示、:3938/:3941 安装恒用 file: spec）。用户若在无该本地目录的机器上点「一键安装」会失败；文案 :4248 已给出 host 侧替代命令。属设计口径，非缺陷，但**跨机场景未验证**。
3. **【低】verify WARN 沿袭 task-9**（`0.2.2-rc.1 tested, running 0.2.1-rc.5`，informational only），与本次改动无关。

## 未验证清单

1. **浏览器全未测**：未开 127.0.0.1:3080、未截图、未点击 tab、未点安装按钮；四 tab 切换、aria 呈现、插件卡三态的真实渲染**全部未验证**（离线仅有 mock React 断言）。
2. **remote.pluginManager 真机未验**：未在真机会话调用 `inspect/installBundle/waitForInstall/setBundleEnabled`；§⑦#5 仅为**静态源码核验**。
3. **`file:` 免网未实跑**：未实际执行一次 `installBundle('file:...')`；工部「parseInstallSpec 走 kind:path 即免网络」的源码级论证**我未复跑**，标未验证。
4. **进程内存仍是旧代码**：DSH web PID **9310**（`ps` 实测 `六 11月 7 22:00:10 2026`，注意与 task-6 时的 645970 已不同——期间有过重启，非本轮所为）内存加载的是启动时的插件；本轮改动**未装机、未重启**。
5. **装机与工作区不一致（本轮改动未生效）**：`md5sum` 实测工作区 client.js = `a2ac05ed47bf272c04bb98aae0c9b7a5`，装机 = `c6adeafcf1b4deeb96c63b1ec15cec84`（即 task-6 时的 0.5.0 版）。→ **本轮提示词与配置页改动尚未进入装机目录，线上不可见**，须后续装机+重启才生效（用户此前明令不重启，本轮仍禁）。
6. **跨机/registry 安装路径未验证**（见缺陷 2）。
7. **`.git` 目录对 path spec 安装的影响未验证**：源目录含 `.git`，工部引 `checkGithubConnection` 对非 git 直接 return —— 我未复跑该源码读取。
8. **index.js +1 行之外的 host 侧行为未验证**：本轮 index.js 仅提示词 +1 行，host 逻辑零改动；但提示词在真会话中的注入效果**未验证**。

## 可复现命令汇总

```
cd /home/fslong/Documents/玩机/cabinet-fork/dsh-cabinet-mode
git rev-parse HEAD; git status --porcelain; git diff --numstat
git diff --quiet HEAD -- cordis.patch.yml package.json README.md README.zh.md CHANGELOG.md locale/en.json locale/zh.json scripts/verify.mjs
grep -rn -E '^(<<<<<<<|=======|>>>>>>>)' client.js index.js scripts/
node --check client.js && node --check index.js
node scripts/test-client.mjs        # 6 行 PASS
node scripts/verify.mjs             # PASS=43 FAIL=0 WARN=1
node scripts/test-model-picker.mjs  # PASS
git diff -- index.js                # 仅 +1 行 @152
git diff -- scripts/test-client.mjs # 导出行改写 + 纯新增
git diff -- scripts/test-model-picker.mjs
grep -n "SETTINGS_TABS\|useState('members')\|ctx.inject(\|MEMORY_PLUGIN_SPEC" client.js
md5sum client.js ~/.dsh/profiles/web/node_modules/dsh-cabinet-mode/client.js
```
