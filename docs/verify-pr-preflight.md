> Historical contributor notes from PR #22 head e1f0058. These are not release acceptance evidence. Local file sources, version fallbacks and install-chain claims below are superseded by `pr22-install-validation.md`.

# PR 前增量核验报告：task-15/16（task-17 独立核验）

- 复验人：大理寺卿（二）dalisi-qing-2，受首辅 lead 节制
- 时间：2026-11-08 18:14–18:35 (Asia/Shanghai)
- 现场：仓库 cabinet-fork/dsh-cabinet-mode，HEAD=425dd48f286a36321b41461a9b98022b0239b02c（= 上游 main 同头），四文件改动**均未提交**
- 范围：task-13 已核 task-10/11 基线，本轮只核其上 task-15（五 tab）与 task-16（已装态改更新+隐藏 spec+五亮点）增量
- 结论：**通过**（离线核验范围）；浏览器与真机安装按令全列未验证
- 写入范围：仅本文件（唯一写入；全程只读，无网络操作、未提交/推送/装机/重启）

## ① 改动面与受保护文件

```
$ git rev-parse HEAD
425dd48f286a36321b41461a9b98022b0239b02c

$ git diff --numstat
260	52	client.js
1	0	index.js
159	2	scripts/test-client.mjs
6	1	scripts/test-model-picker.mjs

$ git status --porcelain
 M client.js
 M index.js
 M scripts/test-client.mjs
 M scripts/test-model-picker.mjs
?? docs/acceptance/member-config-acceptance.md
?? docs/research-respire-install.md
?? docs/research-upstream-sync.md
?? docs/verify-pr21-copy-install.md
?? docs/verify-prompt-settings.md
?? docs/verify-sync-upstream.md
?? docs/verify/member-config-verification.md
```

→ **通过**：改动恰四文件（client.js、index.js、scripts/test-client.mjs、scripts/test-model-picker.mjs）；七份未跟踪 docs 均为既有产出，非本次改动。

（对照 task-13 基线 numstat：client.js 239/51→**260/52**、index.js 1/0 不变、test-client 116/2→**159/2**、test-model-picker 6/1 不变 → 本轮增量集中在 client.js +21/-1 与 test-client.mjs +43，与 task-15/16 范围吻合。）

受保护文件逐个 `git diff --quiet HEAD -- <file>`（空 diff = 零改动）：

| 文件 | 结果 |
|---|---|
| cordis.patch.yml | 无改动 |
| package.json | 无改动 |
| README.md / README.zh.md | 无改动 |
| CHANGELOG.md | 无改动 |
| locale/en.json / locale/zh.json | 无改动 |
| scripts/verify.mjs | 无改动 |

冲突标记 `grep -rn -E '^(<<<<<<<|=======|>>>>>>>)' client.js index.js scripts/` → **零命中**。

## ② 门禁亲跑

| 命令 | exit | 结果 |
|---|---|---|
| node --check client.js | 0 | （无输出） |
| node --check index.js | 0 | （无输出） |
| node scripts/test-client.mjs | 0 | **6 行 PASS**，末行 `PASS: five settings tabs switch by section; the plugin card keeps specs off its face, renders highlight lines, offers update with a visible version, and echoes failures verbatim; bilingual settings keys match` |
| node scripts/verify.mjs | 0 | `Result: PASS=43 FAIL=0 WARN=1` + `Verification passed.` |
| node scripts/test-model-picker.mjs | 0 | `PASS model picker render: loading hint, empty/failure fallback, refresh, retained choices, manual Save and Chinese/English error translation` |

→ **全部通过**，与工部所报一致（test-client 恰 6 行 PASS、verify 43/0/1）。

（WARN 仍为 `0.2.2-rc.1 tested, running 0.2.1-rc.5`，informational only，系 task-9 遗留口径，与本次无关。）

## ③ 增量重点

### 3.1 五 tab 与条件渲染

```
$ grep -n "SETTINGS_TABS = " client.js
3898:		const SETTINGS_TABS = ['members', 'avatars', 'models', 'prompts', 'plugin'];
```

→ **五项含 plugin ✓**（task-13 时为四项）。

条件渲染全列（现文行号）：

| 行 | 内容 |
|---|---|
| client.js:4068 | `activeTab === 'avatars' ? h('div', { key: 'builtin', ...` |
| client.js:4098 | `activeTab === 'members' ? [` |
| client.js:4110 | `activeTab === 'models' ? [` |
| client.js:4138 | `activeTab === 'prompts' ? [` |
| client.js:4180 | `activeTab === 'models' ? h('div', { key: 'catalog-row', ...` |
| **client.js:4184** | `activeTab === 'plugin' ? null : h('fieldset', { key: 'fields', disabled: !ready || busy, ... }, cards)` → **plugin tab 下 fieldset 隐藏** ✓ |
| **client.js:4187** | `activeTab === 'plugin' ? h(MemoryPluginCard, { key: 'memory-plugin', t }) : null` → **卡仅 plugin tab 渲染** ✓ |
| client.js:4188-4189 | `key: 'save'` / `key: 'cancel'`（卡仍在 save 之前） |

### 3.2 已装态 = 版本 + 更新钮（无一键安装字样）

- client.js:3989 已装徽标 `'data-cabinet-plugin-state': 'installed'` → `t('settings.plugin.installed')`
- client.js:3996-3998 已装分支：`installed !== null ? h('div', { key: 'where', ... })`，内含：
  - client.js:3997 版本 span `'data-cabinet-plugin-version': shownVersion`，文本 `shownVersion + (hasInstalledVersion ? '' : ' · ' + t('settings.plugin.versionFallback'))`
  - client.js:3999 **更新钮** `key: 'update'`、`'data-cabinet-plugin-action': 'update'`、`onClick: () => { void run(); }`、文案 `t('settings.plugin.update')`（zh '更新' client.js:4258 / en 'Update' client.js:4340）
- 未装分支 client.js:4001-4003 才渲染 `key: 'install'`、`'data-cabinet-plugin-action': 'install'`、文案 `t('settings.plugin.install')`（'一键安装' client.js:4255）

→ **已装态渲染 update 钮、不渲染 install 钮 ✓**；卡面已装态**无「一键安装」字样**（该词只在未装分支与键定义处）。

### 3.3 卡面无 file: 与 @rsrsai/dsh@ 展示

- 卡面渲染区（client.js:3986-4007）grep `file:` / `@rsrsai/dsh@` / `MEMORY_PLUGIN_SPEC` / `MEMORY_PLUGIN_REGISTRY_SPEC` → **仅命中 1 处，且是注释**：client.js:3991 `// Highlight lines replace the old one-line description; the file:`（注释，不渲染）
- `MEMORY_PLUGIN_SPEC` / `MEMORY_PLUGIN_REGISTRY_SPEC` 在整个 MemoryPluginCard 函数体内的引用**只有 2 处，均在 install 链**：client.js:3946 `manager.inspect(MEMORY_PLUGIN_SPEC, {})`、client.js:3952 `manager.installBundle(MEMORY_PLUGIN_SPEC, ...)`
- 定义仍在：client.js:3890 `MEMORY_PLUGIN_SPEC = 'file:/home/fslong/Documents/玩机/cabinet-fork/respire-dsh'`、:3892 `MEMORY_PLUGIN_REGISTRY_SPEC = '@rsrsai/dsh@0.1.13'` —— **仅作安装参数，不上卡面** ✓

（task-13 时卡面 :3985/:3986 两行曾回显 spec，本轮已删。）

### 3.4 hint1..5 亮点 zh/en 同键

- 渲染：client.js:3994 `[1, 2, 3, 4, 5].map((n) => h('div', { key: 'hint' + n, 'data-cabinet-plugin-hint': String(n), ... }, t('settings.plugin.hint' + n)))` → **五行齐** ✓
- zh：client.js:4262-4266 `settings.plugin.hint1`~`hint5`（respire/dsh 原生 TS / 自动召回 / 本地优先 / 教训入库 / 结构化记忆）
- en：client.js:4344-4348 `settings.plugin.hint1`~`hint5`
- **同键同数**（见 3.5 实测）

### 3.5 settings.* 17 键同键同数

脚本抽取两字典 `settings.` 前缀键：

```
zh settings.* count: 17
en settings.* count: 17
same set: true
zh-only: []
en-only: []
```

17 键清单（zh 落点 client.js:4250-4266，en 落点 client.js:4332-4348）：
`settings.tab.members`、`settings.tab.avatars`、`settings.tab.models`、`settings.tab.prompts`、**`settings.tab.plugin`**、`settings.plugin.install`、`settings.plugin.installing`、`settings.plugin.installed`、**`settings.plugin.update`**、**`settings.plugin.versionFallback`**、`settings.plugin.restartRequired`、`settings.plugin.unavailable`、**`settings.plugin.hint1`~`hint5`**（粗体为本轮新增）。

→ **17 键同键同数 ✓**（task-13 时为 13 键）。

### 3.6 更新链复用 run()

```
$ grep -n "const run = async\|void run()" client.js
3937:			const run = async () => {
3999:	... key: 'update', ... onClick: () => { void run(); } ... t('settings.plugin.update')
4002:	... key: 'install', ... onClick: () => { void run(); } ... t('settings.plugin.install'
```

→ **update 与 install 按钮 onClick 同为 `void run()`，复用同一条 inspect → installBundle → waitForInstall → setBundleEnabled → listBundles 链 ✓**（无第二条安装实现）。

### 3.7 versionFallback 兜底

- client.js:3982 `const hasInstalledVersion = installed !== null && typeof installed.version === 'string' && installed.version !== '';`
- client.js:3983 `const shownVersion = hasInstalledVersion ? installed.version : MEMORY_PLUGIN_SOURCE_VERSION;`
- client.js:3896 `const MEMORY_PLUGIN_SOURCE_VERSION = '0.1.13';`（本地源 package.json 版本快照）
- client.js:3997 无已装版本时文本追加 `' · ' + t('settings.plugin.versionFallback')`（zh '本地源版本（快照）' :4259 / en 'local source version (snapshot)' :4341）

→ **兜底链完整 ✓**：已装有版本用其值，无则回落本地源快照并显式标注来源。

### 3.8 提示词未被本轮动过（附核）

- index.js 仍 `1/0`（仅 task-10 的 :152 一行），client.js 提示词区未动
- 两半 902 字符、md5 同为 `84c69215aeedbda166daa04417801b6e`（index.js / client.js 各自抽取实测）→ **与 task-13 结论一致，本轮零改动** ✓
- test-client.mjs:92 8 词断言仍在（`grep -c "监控纠偏" = 1`）

## ④ 断言增量：只增改不删弱

`git diff -- scripts/` 删除行全量（**合计 3 行**）：

```
-runInNewContext(source.replace(exportPoint,
-  'return { inject, apply, avatarFor, ..., DEFAULT_LEAD_PROMPT };'), {
-let tree=render();assert.ok(pickers(tree).every(n=>n.type==='input'&&n.props.disabled));
```

逐处定性：

1. **test-client.mjs 导出行改写（2 行删除）**：原内联串改为 `const exportList = '...'` + `runInNewContext(source.replace(exportPoint, exportList), {`。用 sed 精确切串做集合差：
   ```
   HEAD 名数: 21
   now 名数: 25
   --- added ---
   CabinetMemberSettings
   MemoryPluginCard
   SETTINGS_TABS
   memoryPluginInstalledOf
   --- removed ---
   （空）
   ```
   → **纯增 4 名、0 删**，原 21 名全保留 ✓（任务书允许的「导出串改写」）。

2. **test-model-picker.mjs setup 拆分（1 行删除）**：`let tree=render();assert.ok(...)` 拆为 setup 5 行 + 同一断言行。task-13 已证 HEAD :25..47 与现 :30..52 逐行 `diff` **EXIT=0**；本轮复核该 diff 仍为同形态（+6/-1，唯一删除行即拆分前单行，断言文本原样）→ **位置/tab 数相关反转，断言体未改** ✓（任务书允许）。

3. **删除行含 assert 数 = 1**，即上述 picker 那行拆分前形态，非断言删弱；**test-client.mjs 删除行含 assert 数 = 0**。

4. **新增 assert 数 = 52**（`git diff -- scripts/ | grep -c "^+.*assert"`）；其中 task-15/16 相关抽样覆盖：
   - 五 tab 顺序与 active：test-client.mjs:422-423 `deepEqual(['members','avatars','models','prompts','plugin']...)`
   - 卡在 plugin tab、离开即隐：:432-440（`clicking the plugin tab shows the memory-plugin card` / `leaving the plugin tab hides the card again`）
   - 卡面无 spec：:470-471、:482-483 `!faceTextOf(...).includes('file:')` / `.includes('@rsrsai/dsh@')`（未装态与已装态各一对）
   - 已装态无一键安装、有更新钮：:477 `the installed state shows no one-click install button`、:478-479 update 钮存在且无通道时 disabled
   - 版本可见：:481 `includes('0.1.13')`、:488 fallback `includes('0.1.13')`、:489 `includes('settings.plugin.versionFallback')`
   - 五亮点：:472 `data-cabinet-plugin-hint` 渲染
   - 更新链复用：:520-528 update 点击 → 失败原文回显 `the update button reuses the install chain and echoes its failure verbatim`
   - 17 键：:534 `zhSettingsKeys.length >= 17`、:536 五 tab 标签循环、:539 七键 plugin 文案循环

→ **断言只增改不删弱 ✓**（新增 52、assert 删除 0 于 test-client；picker 唯一删除为已证的 setup 拆分）。

## ⑤ 装机 md5 与备份

```
$ md5sum client.js ~/.dsh/profiles/web/node_modules/dsh-cabinet-mode/client.js
c40eb17bf24edaf06c63ba9a27f3f5b0  client.js
c40eb17bf24edaf06c63ba9a27f3f5b0  /home/fslong/.dsh/profiles/web/node_modules/dsh-cabinet-mode/client.js
```

→ **工作区 = 装机 = c40eb17bf24edaf06c63ba9a27f3f5b0 ✓（首辅所给 md5 亲验相符）**

四文件工作区 vs 装机全比：

| 文件 | 工作区 md5 | 装机 md5 | 结果 |
|---|---|---|---|
| client.js | c40eb17bf24edaf06c63ba9a27f3f5b0 | 同 | **同** |
| index.js | 1ddc90813d598c8881654dd6ff663cf3 | 同 | **同** |
| scripts/test-client.mjs | 08a0295445b5be785c5df27f708f2598 | 同 | **同** |
| scripts/test-model-picker.mjs | 462a20de90e500469f67e4703d3a022c | 同 | **同** |

→ **四文件装机与工作区完全同步 ✓**

装机内容亲验（不只比哈希）：

- `grep -c "settings.tab.plugin" 装机/client.js` = **2**（键定义 + tab 标签渲染）
- `grep -c "settings.plugin.hint1" 装机/client.js` = **2**（zh/en 各一）
- `grep -c "data-cabinet-plugin-action': 'update'" 装机/client.js` = **1**（更新钮在）
- 装机 index.js 提示词 902 字符、md5 `84c69215aeedbda166daa04417801b6e`（与工作区同）
- 亲跑装机版 `node .../dsh-cabinet-mode/scripts/test-client.mjs` → **exit 0，末行 `PASS: five settings tabs switch by section; the plugin card keeps specs off its face...`**

备份：

```
$ ls -d ~/.dsh/profiles/web/node_modules/dsh-cabinet-mode.bak-1108-173710
/home/fslong/.dsh/profiles/web/node_modules/dsh-cabinet-mode.bak-1108-173710   （在）
$ stat -c '%y'  备份 2026-11-08 16:50:38 / 装机 2026-11-08 17:37:12
$ 逐文件 md5 备份 vs 装机
异: client.js      （装机 c40eb17b… 备份 28da82eb6bf34da57de2efad3d82e51c）
异: scripts/test-client.mjs （装机 08a02954… 备份 0a7bf42102c7d40050a11a58e7da55d1）
同: index.js / package.json / cordis.patch.yml / scripts/test-model-picker.mjs
```

备份形态定性（**备份是 task-15 完成时点的中间态、非 task-16 终态**）：

- 备份 client.js `SETTINGS_TABS = ['members','avatars','models','prompts','plugin']` → **已是五 tab**
- 备份 client.js `grep -c "settings.plugin.hint1"` = **0**（无五亮点）
- 备份 client.js `grep -c "data-cabinet-plugin-action': 'update'"` = **0**（无更新钮，仍是旧已装态）
- 备份 test-client.mjs 末行 `PASS: five settings tabs switch by section, the memory-plugin card lives in the plugin tab...`（task-15 形态）vs 装机/工作区末行 `...the plugin card keeps specs off its face, renders highlight lines, offers update...`（task-16 形态）

→ **备份 bak-1108-173710 在，且是 task-15 → task-16 之间的可回滚点 ✓**（备份版本 package.json 亦 0.5.4）。

## 缺陷

**未发现阻断性缺陷。** 低危观察项：

1. **【低】`fieldset` 在 plugin tab 隐藏无直接断言**：实现 client.js:4184 `activeTab === 'plugin' ? null : h('fieldset', ...)` 存在且经静态核为真，但 `scripts/test-client.mjs` 无 `key === 'fields'` 断言（全文件 `fields` 仅 2 处命中且均非该键：:104、:493 注释）。即 **plugin tab 下成员字段集是否真的缺席，只有实现、无断言覆盖**。间接覆盖有：plugin tab 下 `cardAt>=0`、members tab 下 `cardAt===-1`、各 tab 字段显隐断言（name/pi/builtin/ml），但 fieldset 自身缺席未验。→ 建议补一条 `!nodes.some(n => n.props?.key === 'fields')` 于 plugin tab 分支；本轮只读不改。
2. **【低】`MEMORY_PLUGIN_SOURCE_VERSION = '0.1.13'` 为硬编码快照**（client.js:3896），本地源升版后需手工同步，否则 fallback 显示旧值。已有注释与 `versionFallback` 文案明示「快照」，属已知取舍。
3. **【低】绝对路径 `file:/home/fslong/...` 仍在**（client.js:3890），但**已不上卡面**（§3.3），仅作安装参数；换机场景仍需 registry 路径，跨机未验证。
4. **【低】verify WARN 沿袭 task-9**（0.2.2-rc.1 vs 0.2.1-rc.5），informational only，与本次无关。

## 未验证清单

1. **浏览器全未测**：未开 127.0.0.1:3080、未截图、未点五 tab、未点更新钮；五 tab 切换、fieldset 隐藏、卡面无 spec、五亮点渲染的**真实 UI 表现全部未验证**（离线仅 mock React 断言）。
2. **更新链真机未验**：未真调 `update` 钮 → `run()` → `installBundle`；`the update button reuses the install chain` 仅为测试桩断言。
3. **`file:` 免网安装未实跑**（沿 task-13 结论，本轮仍无网络操作）。
4. **进程内存仍是旧码（推断，未读内存实证）**：`ps` 实测 DSH web **PID 2389545，lstart = Sun Nov 8 16:15:22 2026**；装机目录 mtime **17:37:12** 晚于进程启动 → 进程加载的是启动时的插件码，**晚于 16:15 的 task-16 改动未进入该进程内存**（须重启才生效；本轮禁重启）。
5. **备份能否真回滚未验**：备份目录在、md5 已录，但未实际执行回滚。
6. **PR 网络面未验**：上游 luodaoyi/dsh-cabinet-mode 的推送与 PR 创建由工部执行，本轮全只读、未 fetch 未 push（https 代理 12000 已死，ssh 通——本轮无网络需求）。
7. **装机目录 scripts/ 其余文件未逐一 md5**：只比了四改动文件与 client/index/test-client/test-model-picker；`scripts/verify.mjs` 等未改文件未单列（其受保护性由 ① 工作区零 diff 保证，装机侧未验）。
8. **`MEMORY_PLUGIN_SOURCE_VERSION` 与本地源 package.json 实际版本一致性**：本地源 respire-dsh/package.json 版本为 0.1.13（task-13 已核），本轮未重跑核对（标未验证）。

## 可复现命令汇总

```
cd /home/fslong/Documents/玩机/cabinet-fork/dsh-cabinet-mode
git rev-parse HEAD; git diff --numstat; git status --porcelain
git diff --quiet HEAD -- cordis.patch.yml package.json README.md README.zh.md CHANGELOG.md locale/en.json locale/zh.json scripts/verify.mjs
grep -rn -E '^(<<<<<<<|=======|>>>>>>>)' client.js index.js scripts/
node --check client.js && node --check index.js
node scripts/test-client.mjs        # 6 行 PASS
node scripts/verify.mjs             # PASS=43 FAIL=0 WARN=1
node scripts/test-model-picker.mjs  # PASS
grep -n "SETTINGS_TABS = \|activeTab === \|MemoryPluginCard, { key\|data-cabinet-plugin-action\|MEMORY_PLUGIN_SOURCE_VERSION\|const run = async" client.js
sed -n '18p' <(git show HEAD:scripts/test-client.mjs)   # 导出串 HEAD 版
sed -n '17p' scripts/test-client.mjs                    # 导出串现版
md5sum client.js ~/.dsh/profiles/web/node_modules/dsh-cabinet-mode/client.js
md5sum client.js index.js scripts/test-client.mjs scripts/test-model-picker.mjs \
       ~/.dsh/profiles/web/node_modules/dsh-cabinet-mode/{client.js,index.js,scripts/test-client.mjs,scripts/test-model-picker.mjs}
grep -c "settings.plugin.hint1" ~/.dsh/profiles/web/node_modules/dsh-cabinet-mode{,.bak-1108-173710}/client.js
node /home/fslong/.dsh/profiles/web/node_modules/dsh-cabinet-mode/scripts/test-client.mjs
ps -o pid,lstart,cmd -p 2389545
```
