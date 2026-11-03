# DSH 插件市场索引（format 1）机制与 Respire 先例取证卷宗

- 结论状态：只读取证，未改任何代码。所有断言均锚定「文件:行号」或命令输出；推断一律标 **未验证**。
- 取证时间：2026-11-03（Asia/Shanghai）。
- 分支：`feat/market-index`（worktree `D:\sources\repos-new\gh\dsh-cabinet-mode`）。

## 0. 结论先行

| 问题 | 结论 | 关键证据 |
| --- | --- | --- |
| (a) icon 的 32 KiB 限制范围 | **只限制 `data:` URI 的内联载荷**（解码后 >32768 字节即拒）。相对路径 / 绝对 https 的文件型 icon **在校验器里没有任何体积检查**，`icon.svg` 79384 字节走相对路径完全合规 | `.artifacts/asar/dsh/node_modules/@deepseek-ai/dsh-plugin-market-index/lib/index.js:211-215`（`if (text.startsWith("data:"))` 分支内的 32 KiB 判定）、`:35`；本卷宗探针输出见 §3.5 |
| (a') 包内 icon 另有上限 | 包 `package.json` 的 `icon` 必须是**包内相对文件**，SVG/PNG/JPEG/WebP，**≤256 KiB**。79384 字节通过 | `dsh-app-boot/lib/index.js:2077,2085-2107` |
| (b) 「发现」页能否装 git 源 | **能**。`source.type:"git"` 会被翻译成 `git+https://host/owner/repo.git#<40hex>[&path:/<dir>]`，先过 GitHub 连通性检查（仅 network/timeout 阻断），再 `pnpm add <spec>`，装后校验 `dsh.bundle` 与 `engines.dsh` | `dsh-plugin-market-index/lib/index.js:311-318`；`dsh-plugin-manager/lib/index.js:1839-1845,2001-2019,2033-2038,2074-2076`；实测见 §4.4 |
| (b') npm 源当前不可用 | 公开 registry 上**查不到** `dsh-cabinet-mode`（匿名与带令牌两种方式均 404，含 `@luodaoyi` 作用域），搜索接口也未返回该包名；npm 源索引现在装不上。git 源今天可用 | `pnpm view dsh-cabinet-mode versions` → `ERR_PNPM_FETCH_404`；`https://registry.npmjs.org/dsh-cabinet-mode` → HTTP 404；`/-/v1/search?text=dsh-cabinet-mode` → 200 但命中列表无该名 |
| (c) 更新链路 | 只算「可更新」并显示「有新版本」，点击**只是跳到「已安装」页**；官方按需插件之外**没有「更新」按钮**，只能**卸载后重装**（代码与官方文案双重确认） | `dsh-client-ui-plugin-market/lib/client.js:232-239`；`dsh-client-ui-plugin-manager/lib/client.js:1162-1182`、`:382`；`dsh-plugin-manager/lib/index.js:1991`；`dsh-plugin-market/README.zh.md:102` |
| (c') 安装后写入 profile 的依赖串 | pnpm 直接写 profile `package.json` 的 `dependencies`：npm 源记 `"dsh-cabinet-mode": "0.1.4"`（spec 本身精确 → 记录精确）；git 源被 pnpm 规范化记成 `"dsh-cabinet-mode": "github:luodaoyi/dsh-cabinet-mode#<sha>"` | 实测 §4.4、§5.3；`dsh-plugin-manager/lib/types/install-spec.js:104-118` |
| (c'') 是否要重启 / 有无自动检查 | 有 HMR 就热应用，否则 `restart-required`（reason `no-hmr`），另有 `package-moved`/`host-module` 等原因；**没有任何定时自动检查更新**，索引文档只按 `cacheTtlMs`(默认 600000ms) 缓存、由打开/刷新触发 | `dsh-plugin-manager/lib/index.js:2366-2396`；`dsh-plugin-market/lib/types/index.js:80-82,164`；`dsh-client-ui-plugin-manager/lib/client.js:94-99` |

**给方案选择的一句话**：先落 **git 源**（今天即可端到端验收，索引放 GitHub raw + 分支携带 icon.svg），**npm 源**留作 0.1.4 正式发布后的第二步；两者共用同一个索引文件与同一个校验器。

## 1. 取证环境与方法

| 项 | 值 | 依据 |
| --- | --- | --- |
| 内嵌 Node | v24.21.0（`C:\Users\tb16p\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`） | `node -e "console.log(process.version)"` → `v24.21.0` |
| 内嵌 pnpm | 11.28.5（`...\dependencies\pnpm\bin\pnpm.cjs`） | `pnpm --version` → `11.28.5` |
| 运行时快照版本 | `@deepseek-ai/dsh-plugin-market-index`、`dsh-plugin-market`、`dsh-plugin-manager`、`dsh-app-boot` **均为 0.2.1-rc.5** | 各包 `package.json` 的 `version` 字段（逐一读取） |
| app.asar 位置 | `C:/Users/tb16p/AppData/Local/Programs/DeepSeek Harness/resources/app.asar` | `.artifacts/asar-list.cjs:3` |

**重要更正（取证范围）**：`.artifacts/asar/dsh/node_modules/@deepseek-ai/` 下**只解包了 4 个包**（dsh-app-boot、dsh-plugin-manager、dsh-plugin-market、dsh-plugin-market-index）；任务里提到的客户端包 `@deepseek-ai/dsh-client-ui-plugin-market`、`dsh-client-ui-plugin-manager` 与 `dsh-experimental-plugin-market-bundle` **并不在 .artifacts 里**。它们存在于 `app.asar` 内部（`.artifacts/asar-list.json` 可检索到条目）。

为不触碰 `.artifacts` 既有文件，我把这些包**字节级解包到 `$env:TEMP\hanlin-market-research\asar`**（脚本 `extract.cjs` 复用 `.artifacts/asar-list.json` 的 `dataOffset/offset/size`，只读 asar，只写 TEMP）。下文引用客户端文件的行号，均指这些**与 asar 内条目字节一致**的副本。

之所以澄清：若不说明，读者会以为 `.artifacts` 里已有客户端包；实际没有，且我没有往 `.artifacts` 增加任何文件。

## 2. format 1 校验器入口（并回答「zod schema 在哪」）

- 校验器：`@deepseek-ai/dsh-plugin-market-index`（运行时依赖，非 zod）。
  - 入口函数：`parseMarketIndex(value, indexUrl)` — `.artifacts/asar/dsh/node_modules/@deepseek-ai/dsh-plugin-market-index/lib/index.js:280-303`，导出在 `:320`（同导出 `marketInstallTarget`、`MAX_INLINE_ICON_BYTES`）。
  - 错误类型：`MarketIndexError`，带 JSON 路径 — 同文件 `:9-22`。
  - **没有任何 zod schema**：format 1 用**手写逐字段校验**（`objectAt/stringAt/localizedText/source/versions/…`，同文件 `:40-303`）。
  - zod 只出现在拼装出来的 RPC 类型文件里（`dsh-plugin-market/lib/typert.host.js:2`、`typert.remote-client.js:2`），与索引格式无关；Host 的**配置** schema 用的是 `@deepseek-ai/schemastery`（`dsh-plugin-market/lib/types/index.js:36,78-83`）。
  - 索引解析在 Worker 里跑：`dsh-plugin-market/lib/types/parse.js:27`（`parseMarketIndex` 调用点），失败转成 `plugin-market/invalid-index`（`types/index.js:272-274`）。

## 3. format 1 schema 逐字段与硬约束

### 3.1 根级

| 字段 | 必填 | 约束 | 行号 |
| --- | --- | --- | --- |
| `format` | 是 | 必须 `=== 1` | `index.js:284` |
| `title` | **是** | 本地化文本；字符串或语言对象，**对象必须含 `en`** | `index.js:294` + `:51-61` |
| `description` | 否 | 同上（对象含 `en`） | `index.js:295` |
| `metadata` | 否 | 缺省补空：`categories`/`labels`/`sortKeys` | `index.js:89-96,285` |
| `plugins` | 是 | 数组；同 `name` 不得重复 | `index.js:286,290` |
| 其它成员 | — | **未定义成员被忽略并丢弃**（输出只保留已知字段） | `index.js:273,296-302` |

本地化规则：语言键必须匹配 `/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/`（`:23,56`），值必须是非空白字符串（`:44-47`），且**必须含 `en`**（`:59`，报错文案 `must contain en`）。

### 3.2 `metadata`（供分类/标签/排序引用）

| 字段 | 形状 | 行号 |
| --- | --- | --- |
| `categories` | `{ [id]: { title: 本地化 } }`，id 不得为空串 | `index.js:71-81,92` |
| `labels` | 同 `categories` | `index.js:93` |
| `sortKeys` | `{ [id]: { title, order: "asc"|"desc" } }` | `index.js:82-88,94` |

### 3.3 插件级

| 字段 | 必填 | 约束 | 行号 |
| --- | --- | --- | --- |
| `name` | 是 | 合法 npm 包名，长度 ≤214 | `index.js:252-253`；正则 `:24`，长度 `:25` |
| `title` / `description` | 否 | 本地化，对象须含 `en` | `index.js:254-255` |
| `icon` | 否 | 见 §3.5 | `index.js:256` |
| `author` | 否 | 非空白字符串 | `index.js:257` |
| `homepage` | 否 | 绝对 http(s) URL，**允许 query/fragment**（因 npm `homepage` 常带 `#readme`） | `index.js:148-154,258` |
| `repository.url` | 否 | 绝对 **http/https**、无凭据、**不得含 `?` 或 `#`**；`git+https:` 会被拒 | `index.js:134-146,169` |
| `repository.directory` | 否 | 相对目录，段字符集 `[A-Za-z0-9._@+-]`，不得含 `.`/`..` | `index.js:162-166,170` |
| `metadata.category` | 否 | **必须引用已声明的 category id**，否则 `references undeclared id` | `index.js:99,104` |
| `metadata.keywords` | 否 | 字符串数组 | `index.js:105-111` |
| `metadata.labels` | 否 | 已声明 label id 数组，**不得重复** | `index.js:112-117` |
| `metadata.sortKeys` | 否 | 已声明 sortKey id → 有限数字 | `index.js:118-126` |

### 3.4 版本级 `versions[]`

| 字段 | 必填 | 约束 | 行号 |
| --- | --- | --- | --- |
| 数组本身 | 是 | 非空 | `index.js:240` |
| `version` | 是 | **精确 SemVer 2.0.0**（不允许 range/tag）；同插件内不得重复；解析后按 `semver.rcompare` **降序重排**（输入顺序不强制） | `index.js:229,29,245,248` |
| `publishTimestamp` | 是 | **整数** Unix 秒，区间 `[0, 10^11)`；浮点/负数/`1e11` 均拒 | `index.js:231`；上限常量 `:36` |
| `source` | 是 | 见 §3.6 | `index.js:235` |
| `engines` | 否 | 仅 `engines.dsh`；缺省 `{}` | `index.js:200-208,236` |

### 3.5 `icon` 的三种形态（本题 (a) 的正面回答）

`index.js:209-225`：

1. **`data:` URI**：仅限 `image/svg+xml` / `image/png` / `image/jpeg` / `image/webp` 的 base64；载荷必须合法 base64；**解码后 >32768 字节即拒**（`:211-215`，常量 `MAX_INLINE_ICON_BYTES = 32 * 1024`，`:35`）。
2. **绝对 URL**：以索引 URL 为基准 `new URL(text, indexUrl)` 解析；解析结果必须 `https:` **或**与索引同源（`:217-224`）。
3. **相对路径**（如 `./icon.svg`）：同上解析 → 变成索引同源的 https URL。**此分支没有任何体积校验**。

探针实测（`$env:TEMP\hanlin-market-research\probe.mjs`，索引 URL 取 `https://raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/market/index.json`）：

```
MAX_INLINE_ICON_BYTES = 32768  icon.svg bytes = 79384
PASS icon: relative ./icon.svg (no payload limit) -> icon="https://raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/market/icon.svg"
PASS icon: https absolute -> icon="https://raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/main/icon.svg"
FAIL icon: http absolute (not https, other origin) -> $.plugins[0].icon must resolve to https or the index origin
FAIL icon: data: URI of 79384 decoded bytes -> $.plugins[0].icon must not exceed 32 KiB of decoded bytes
PASS icon: data: URI of exactly 32768 decoded bytes
FAIL icon: data: URI of 32769 decoded bytes -> $.plugins[0].icon must not exceed 32 KiB of decoded bytes
```

**结论**：32 KiB 是**内联 data: 载荷**的上限，不是「icon 一律 ≤32 KiB」。79384 字节的 `icon.svg` 只要**不内联**（走相对路径或 https 文件），format 1 完全接受。这也正是 Respire 的做法（`scripts/market-index.mjs:112` 用 `'./icon.svg'`，`:21` 注释明说「uses a relative path so the branch copy is self-contained」）。

补充：**包内** `package.json` 的 `icon` 是另一条链路（「已安装」页/插件卡片），规则不同 —— 必须是**包内相对路径**（绝对路径或带协议前缀即拒）、必须是 SVG/PNG/JPEG/WebP、**≤256 KiB**：`dsh-app-boot/lib/index.js:2077`（`MAX_ICON_BYTES = 256 * 1024`）、`:2085-2107`（相对性检查 `:2090-2096`、扩展名 `:2102`、体积 `:2107`）。客户端渲染是 `<img loading="lazy">`，无体积门槛（`dsh-client-ui-plugin-market/lib/client.js:198-212`）。

### 3.6 `source`

`index.js:176-199`：

| type | 字段 | 约束 | 行号 |
| --- | --- | --- | --- |
| `"npm"` | `registry?` | 绝对 http(s)、无凭据、无 query/fragment | `:180` + `:134-146` |
| `"git"` | `url`（必填） | **https**、规范形式（`url.href === value`）、路径 ≥2 段、不得是 `.tgz/.tar.gz`、无 query/fragment、无凭据 | `:192` + `:155-161` |
| `"git"` | `commit`（必填） | **小写 40 位 hex**（7 位短 sha、大写均拒） | `:187-188` + `:30` |
| `"git"` | `path?` | 子目录，相对目录规则同 `repository.directory` | `:189-195` + `:162-166` |
| 其它 | — | `must be "npm" or "git"`（`tarball` 等一律拒） | `:197` |

### 3.7 `engines.dsh`

`index.js:200-208`：仅允许字符串；**`workspace:` 前缀直接拒**（`:203`）；必须能被 `semver.validRange` 解析（`:204`）。缺省 `{}`。

探针（校验器只判「是不是合法的 SemVer range」，**不与运行时比对**）：`">=0.2.1-rc.5"`、`"^0.2.1-rc.5"`、`"~0.2.1"`、`"0.2.1-rc.5"`、`">=0.2.0 <0.3.0"`、`"*"` 全部被校验器接受；`"workspace:*"` → `must not be a workspace: range`；`"latest"` → `must be a SemVer range`（运行时可匹配性见 §6.4 —— 校验器接受 ≠ 运行时匹配）。

## 4. 索引条目 → 安装动作

### 4.1 索引 → install 参数（Host 侧）

- `marketInstallTarget(name, version)` — `dsh-plugin-market-index/lib/index.js:311-318`：
  - npm → `{ spec: "<name>@<version>", registry? }`（`:313-316`）
  - git → `{ spec: "git+<url>[.git]#<commit>[&path:/<path>]" }`（`:317`）
- 每条版本在读取时被贴上 `install` 与 `compatibility`：`dsh-plugin-market/lib/types/index.js:311-328`（`:314` 调 `marketInstallTarget`）。
- 文档口径一致：`dsh-plugin-market/README.zh.md:77`「npm 为 `name@version` 加该版本的 registry，Git 为 `git+<url>.git#<commit>`，包位于子目录时追加 `&path:/<path>`」。

探针实测两种 spec 形态：

```
npm  spec = {"spec":"dsh-cabinet-mode@0.1.4"}
git  spec = {"spec":"git+https://github.com/luodaoyi/dsh-cabinet-mode.git#38add4f486ebc2f7a0d615ed5b244e2a64d59024"}
git+path spec = {"spec":"git+https://github.com/a/b.git#38add4…#&path:/packages/x"}
```

### 4.2 「发现」页点击安装

1. 「安装」按钮可用性只看兼容性/豁免，**不看 source.type**：`dsh-client-ui-plugin-market/lib/client.js:225`（`installable(compatibility)`）、`:232-263`（`EntryAction`）、`:326-376`（版本行）。
2. 版本来源展示区分 npm/git：`:81-101`（git 显示仓库、commit、目录），即 git 是被正视的安装来源。
3. 确认后：`install({ ...version.install, title, version })` — `:1092-1098`，把 `{ spec, registry? }` 交给插件管理器 UI。
4. 插件管理器 UI 收下：`installFrom({ spec, registry, title, version })` — `dsh-client-ui-plugin-manager/lib/client.js:1045-1060`。
5. `runInstall()` — `:1464-1568`：先 `pluginManager.inspect(spec, { registry })`（`:1537`），再 `startInstall({ spec, ...inspected })`（`:1564-1567`）。
6. `startInstall` 调 RPC：`installBundle(spec, { enabled: subject.selection ?? false, requestId, registry, saveExact?, approvedBuilds? })` — `:1574-1601`（RPC 调用 `:1595-1601`）。

### 4.3 Host 侧 installBundle（git 与 npm 的实际差别）

`dsh-plugin-manager/lib/index.js`：

| 步骤 | 行为 | 行号 |
| --- | --- | --- |
| spec 合法性 | 空串或以 `-` 开头 → `invalid-spec` | `:1987` |
| 已安装拦截 | 已有 HMR 且该包已在依赖中 → `already-installed`（这是「不能原地升级」的根因） | `:1991` |
| GitHub 连通性预检 | `checkGithubConnection(parsedForRegistry(spec), …)`；**只有 network/timeout 阻断安装**，其余失败交给 pnpm（认证与传输回退由 pnpm 负责） | `:2001-2019`；实现 `lib/types/github-connection.js:20`（仅 `github.com`/`*.github.com`）、`:32-41`（`git ls-remote`） |
| 实际命令 | `pnpm add <spec> [--save-exact] [--config.registry=…]` | `:2033-2038` |
| 运行期兼容性 | `run.incompatible` → `incompatible-version` | `:2041`；判定 `:708-733`；回滚 `:740-761` |
| 装后校验 | 必须声明 `dsh.bundle`，否则 `not-bundle` | `:2074` |
| 装后兼容性 | `evaluatePluginCompatibility(manifest, exemptions)`，不兼容且无豁免 → `incompatible-version` + 回滚 | `:2075-2076`（回滚 `:2080-2083`） |
| 激活 | `selectBundle` 视 `enabled`；随后 `publishAndReload` | `:2089-2095` |

**git 与 npm 的差异点（代码级）**：

| 维度 | npm 源 | git 源 |
| --- | --- | --- |
| `inspect` 预检 | `pnpm view` 读 registry 元数据，检查 `already-installed`（`:1870`）、`dsh.bundle`（`:1917`） | **直接 accepted，`bundle: null`**，不预检 `dsh.bundle`（`:1839-1845`）→ 是否合规只能等装完（`:2074`） |
| 连通性预检 | 无 | 仅 github.com 走 `git ls-remote`（`:2001`、`github-connection.js:30-34`） |
| 最终 spec | `name@version` | `git+https://…#<sha>[&path:/<dir>]` |
| 失败可归因 | 可按 registry 回退（`:2023-2050`） | 单一来源，无 registry 回退 |
| 装后校验 | 同上（`dsh.bundle` + `engines.dsh`） | 同上 |

spec 解析侧也确认支持：`parseInstallSpec`（`dsh-plugin-manager/lib/types/install-spec.js:58-87`）把 `git+https://…` 判为 `kind:"git"`（`:70` + `GIT_URL :10`）。探针直接调用该函数：

```
OK "dsh-cabinet-mode@0.1.4" -> {"kind":"registry",...}
OK "git+https://github.com/luodaoyi/dsh-cabinet-mode.git#38add4f4…" -> {"kind":"git","host":"github.com"}
OK "git+https://github.com/luodaoyi/dsh-cabinet-mode.git#38add4f4…&path:/packages/x" -> {"kind":"git",...}
```

### 4.4 git 源端到端实测（本机，$env:TEMP）

```
pnpm add "git+https://github.com/luodaoyi/dsh-cabinet-mode.git#19105be322ea25f12cbef29396127108928a1520"
→ + dsh-cabinet-mode 0.1.3
→ package.json: {"dependencies":{"dsh-cabinet-mode":"github:luodaoyi/dsh-cabinet-mode#19105be322ea25f12cbef29396127108928a1520"}}
```

同时验证装出来的包内容 = `files` 白名单（`pnpm` 对 git 依赖同样按 npm `files` 过滤）：

```
1065 LICENSE            1155 package.json        2748 docs\images\cabinet-team.svg
7950 scripts\uninstall.mjs  8266 CHANGELOG.md     11316 cordis.patch.yml
11387 scripts\install.mjs  15790 scripts\verify.mjs  16205 README.zh.md  17760 README.md
21580 docs\cross-platform.md  63947 docs\images\cabinet-portrait.jpg  79384 icon.svg
```

（没有 `.github/`；`cordis.patch.yml`、`icon.svg` 都在。这条对「索引 icon 放分支 vs 放包里」没有影响，但对「npm tarball 会带什么」有影响，见 §8。）

## 5. 更新链路

### 5.1 「可更新」怎么算

`dsh-plugin-market/lib/types/index.js`：

- `installationOf(name, version, bundles)` — `:329-343`：
  - 未安装 → `not-installed`（`:332-333`）；提供但未装 → `provided`（`:334-335`）；无版本 → `different-version`（`:336-337`）；相等 → `installed`（`:339-340`）；
  - **`update-available` 仅当 `semver.gt(索引版本, 已装版本)`**（`:341-342`），否则 `different-version`。
- 参与比较的「索引版本」是**默认版本**（最高兼容版本，且稳定版优先）：`listingOf` `:317-319,325`。
- 已装版本来自 profile 里该包 `package.json` 的 `version`：`dsh-plugin-manager/lib/index.js:1757`（`version = info.version`）→ `listBundles` 输出。

**git 源的关键含义**：比较的是**版本号**，不是 commit。同一版本号的两次 commit（例如 0.1.4 改了文档再推）在 git 源下**不会被识别为可更新** —— 这是代码结构直接推出的结论（`:341-342`），未做端到端 UI 实测。

### 5.2 用户点什么

- 「发现」页：状态是 `update-available` 时按钮文案为「有新版本」，点击执行 `onOpenInstalled`（**只是跳到「已安装」页，不做升级**）— `dsh-client-ui-plugin-market/lib/client.js:232-239`（`t(status === "update-available" ? "statusUpdate" : …)` 与 `onOpenInstalled`），文案 `:1159`。
- 「已安装」页：`update(packageName)` 需要 `pkg.installTarget`；`installTarget` **只对官方按需目录条目产生**（`dsh-plugin-manager/lib/index.js:1706-1710`）。非官方插件因此**没有「更新」按钮** — `dsh-client-ui-plugin-manager/lib/client.js:1162-1182`（`if (pkg === void 0 || target === void 0 …) return;`），且官方文案已写明：`"其他插件请先卸载再安装新版"`（`:158`，英文 `:382`）。
- 官方按需插件的「更新」本身也是 **removeBundle → openCatalogInstall**（`:1170-1181`），不是原地升级。
- market 文档同样登记为已知限制：`dsh-plugin-market/README.zh.md:102`「**不支持升级** …… 升级仍需先卸载再安装」。
- Host 侧硬约束：`installBundle` 对已安装包直接 `already-installed`（`dsh-plugin-manager/lib/index.js:1991`），所以「装同版本/新版本」必须先 `removeBundle`（`:2137-2164`，内部 `pnpm remove <name>` `:2152-2156`）。

### 5.3 profile 里记成什么依赖串

- pnpm 直接写 profile 的 `package.json` `dependencies`（`runProfilePnpm` 以 profile 目录为 cwd：`index.js:610`；profile manifest 读取/写回：`:319-320,553,1686`）。
- **npm 源**：spec 是精确 `name@version`，pnpm 11.28.5 记录精确版本 —— 实测：`pnpm add @rsrsai/dsh@0.1.13` → `{"@rsrsai/dsh":"0.1.13"}`（加/不加 `--save-exact` 结果一致）。
- **git 源**：pnpm 规范化成 `github:<owner>/<repo>#<sha>`（实测见 §4.4）。
- 反向读取：`dependencySpec(name, recorded, profileDir, packageName)` — `dsh-plugin-manager/lib/types/install-spec.js:104-118`；非 registry 值（含 `github:`）原样使用（`:89,111-113`），供「重新安装/卸载」使用。
- 另有启用清单 `dsh.profile.bundles`：安装成功后排 pnpm 成功回调里 `reconcile()` 会把**新增且声明 `dsh.bundle`** 的依赖自动追加进 `dsh.profile.bundles` 并写回 profile（`index.js:762` 调用、`:323-341` 实现，注释「Reconcile package removals and newly installed bundles without re-enabling retained dependencies」）；显式启用/停用走 `selectBundle`（`:2280-2295`）。
  - 注：`startInstall` 传入的 `enabled` 对「发现」安装是 `false`（`subject.selection ?? false`，客户端 `:1596`；`inspectionOf` 不产出 `selection`，`index.js:1912-1918`），但 `reconcile` 已先行把新 bundle 加入清单，因此**实际效果仍是被启用**；安装完成对话框还提供「立即启用」按钮（客户端 `:3791-3797`、文案 `:224/:448`），点击执行 `setBundleEnabled(name, true)`（`:1791-1814`）。这一「enabled=false 但 reconcile 自动启用」的组合是**代码推断**，未做 UI 端到端实测 —— 见 §10 第 1 条。

### 5.4 是否重启 / 有无自动检查

- 重启：`publishAndReload` 走 HMR 协调（`index.js:2366-2370`）；没有 HMR → `application: "restart-required"` + `restartReason: "no-hmr"`（`:2380-2386`）；HMR 存在但原因未消 → 保留 `restartReason`（`:2388-2396`）。原因集合 `no-hmr / package-moved / host-module / unmanaged-plugin / module-comparison`（客户端文案 `:94-99`，映射 `:684-689`）。安装成功文案「已安装，请重启 DSH 加载它」（`:264`）。
- 自动检查：**没有定时器**。索引文档在打开/`refresh` 时获取（`dsh-plugin-market/lib/types/index.js:164,203,254-275`），成功文档缓存 `cacheTtlMs`（默认 `600000` ms，`:80-82`），配置变化时 `plugin-market/changed`（`:93-102`）。两个客户端文件里没有「周期性检查更新」的定时器（grep `setInterval`：market 客户端仅 `:1350`/`:3873` 两处与本功能无关的计时；插件管理器客户端无）。

## 6. `engines.dsh`

### 6.1 rc.5 的运行时版本

`getDshRuntimeVersion()` 读 `@deepseek-ai/dsh-app-boot/package.json` 的 `version` — `dsh-app-boot/lib/index.js:271-275`。本快照即 **0.2.1-rc.5**，`semver.valid` 通过（探针输出 `runtimeVersion valid? 0.2.1-rc.5`）。

### 6.2 判定逻辑

`dsh-app-boot/lib/index.js`：

- `satisfies(runtimeVersion, range)` = `semver.satisfies(runtime, range, { includePrerelease: true })` — `:276-278`（**预发布版参与匹配**）。
- `unmetRequirements`：有 `engines.dsh` 就**只**看它（`:281-285`）；没有才退回检查 `@deepseek-ai/dsh*` 的 `peerDependencies`（`:286-298`），该场景下 `workspace:^ ~ *` 被当作当前版本（`:292-296`）。
- `evaluatePluginCompatibility` — `:311-326`；豁免键是精确 `name@version` → 精确运行时版本数组（`:318-325,352-364`）。

### 6.3 是否硬性拦截（三处）

| 时机 | 行为 | 行号 |
| --- | --- | --- |
| 安装后（bundle 安装） | 不兼容且无豁免 → `incompatible-version` 并回滚 profile 文件 | `dsh-plugin-manager/lib/index.js:2075-2076`（回滚 `:2080-2083`） |
| pnpm 成功后扫描直接依赖 | 新增/变更的依赖不兼容 → 警告 + `exitCode=1` + 还原 `package.json`/`pnpm-lock.yaml` + 若锁文件存在则 `pnpm install --frozen-lockfile` 修复 | `:708-733`（判定）、`:740-761`（还原/修复）、`:2041`（抛出） |
| 启动加载 profile bundle | 不兼容且无豁免 → 抛错，该 bundle 进 `skippedBundles`，层**不被加载** | `dsh-app-boot/lib/index.js:1020-1040`（`:1025-1026`） |

豁免入口：`dsh plugin allow-version` 或插件管理器（`dsh-app-boot/lib/index.js:335` 的提示文案 + `compatibility.json` 机制 `:341-364`）。

### 6.4 接受什么写法（对 0.2.1-rc.5 实测，`includePrerelease: true`）

| range | 匹配 rc.5 | 备注 |
| --- | --- | --- |
| `>=0.2.1-rc.5` | ✅ | 最严：只接受 rc.5 及以后 |
| `>=0.2.1-rc.5 <0.3.0` | ✅ | 推荐（与 Respire 风格一致，封住 0.3） |
| `>=0.2.1-rc.2 <0.3.0` | ✅ | Respire 现行写法（`package.json` `engines.dsh`） |
| `^0.2.1-rc.5` | ✅ | 等价于 `>=0.2.1-rc.5 <0.3.0` |
| `>=0.2.0 <0.3.0` | ✅ | 最宽松 |
| `0.2.x` / `*` | ✅ | 不建议（过宽） |
| `~0.2.1` | ❌ | **陷阱**：`~0.2.1` 是 `>=0.2.1 <0.3.0`，不含预发布 `0.2.1-rc.5` |
| `workspace:*` | ❌ | 索引校验器直接拒（`market-index/lib/index.js:203`）；运行时也算 unmet |
| `latest` | ❌ | 索引校验器拒（`validRange` 为 null，`:204`） |

**给 cabinet 的建议**：若不打算表达版本约束，**索引里省略 `engines.dsh`** 也是合法的（`market/lib/types/index.js:344-350` 会一直判为兼容，安装也不会被拦）；若要写，用 `>=0.2.1-rc.5 <0.3.0`（本机 rc.5 可装、可启动），**不要用 `~0.2.1`**。

## 7. Respire 先例逐项清单

### 7.1 main 上新增/改动的文件

提交 `d1157a0 feat(market): publish Harness plugin market index on the market-index branch (0.1.12) (#8)`，共 11 文件 +417/−4：

| 文件 | 变化 | 作用 |
| --- | --- | --- |
| `scripts/market-index.mjs` | +140 | 从 npm registry 生成 `marketplace.json`，支持 `--check` 比对已发布副本 |
| `scripts/publish-market-index.sh` | +48 | orphan 分支 + force push 到 `market-index` |
| `.github/workflows/market-index.yml` | +31 | 手动/定时刷新索引 |
| `.github/workflows/release.yml` | +32 | 发布后追加 `market-index` job |
| `.github/workflows/ci.yml` | +5 | 增加 `node --check scripts/market-index.mjs`、`bash -n scripts/publish-market-index.sh` |
| `package.json` | +6/−4 | 增加 `engines.dsh`、`market:index`/`market:check` 脚本 |
| `.gitignore` / `CHANGELOG.md` / `README.md` / `README.zh-CN.md` / `package-lock.json` | 小改 | 文档与忽略项 |

关键实现点：

- 索引 URL 常量：`scripts/market-index.mjs:36-39`（`RAW_INDEX = https://raw.githubusercontent.com/risense-ai/respire-dsh/market-index`，`PUBLISHED_URL = …/marketplace.json`）。
- 只发 npm 源：`:16-18` 注释 + `:85`（`source: { type: 'npm', registry: REGISTRY }`）。
- 时间戳取整秒：`:61-64`（`Math.floor(Date.parse(time)/1000)`，注释点明 registry 带毫秒）。
- 跳过预发布与 deprecated：`:71-79`。
- **强制每个版本都有 `engines.dsh`**：`:80-81`（`assert.ok(engines.dsh, '… declaring no engines.dsh; refusing to publish it as installable')`）。
- 版本降序：`:90`。
- 根/插件字段：`:92-125`（`icon: './icon.svg'` `:112`、`homepage: REPO#readme` `:114`、`repository.url = ${REPO}.git` `:115-117`、`metadata.category: 'memory'` `:118-121`）。
- `--check` 与已发布副本逐字节比对：`:130-140`。
- 发布脚本：复制 `marketplace.json` + `icon.svg` 到 orphan 分支（`publish-market-index.sh:16-17,29-31`），内容相同则跳过（`:22-27`），`git push --force` 重试 3 次（`:42-47`）。
- 分支上的 README 明确「不要手改」（`.github` 外的分支 README，见 §7.3）。

### 7.2 两个 workflow 的触发与权限

`.github/workflows/market-index.yml`：

| 项 | 值 | 行号 |
| --- | --- | --- |
| 触发 | `workflow_dispatch` + `schedule: cron '23 4 * * 1'`（每周一 04:23 UTC） | `:3-6` |
| 顶层权限 | `contents: read` | `:8-9` |
| job 权限 | `contents: write` | `:18-19` |
| 并发 | `group: market-index-publish`，不取消进行中 | `:15-17` |
| 步骤 | checkout（`persist-credentials: true`, `fetch-depth: 0`）→ setup-node 24 → `node scripts/market-index.mjs` → `bash scripts/publish-market-index.sh` | `:21-31` |

`.github/workflows/release.yml`：

| 项 | 值 | 行号 |
| --- | --- | --- |
| 触发 | `push: tags ['v*']` | `:3-5` |
| `verify` job | `uses: ./.github/workflows/ci.yml` | `:15-16` |
| `publish` job 权限 | `contents: write` + `id-token: write`（npm provenance） | `:21-23` |
| 发布前闸门 | tag 必须在 `origin/main` 祖先链上；`release-notes/<tag>.md` 必须非空 | `:34-44` |
| 发布 | `npm publish ./*.tgz --access public --provenance --tag latest|next` | `:49-54` |
| `market-index` job | `needs: publish`，`contents: write`，同样两条脚本 | `:63-85` |

`.github/workflows/ci.yml`：`push branches:[main]` + `pull_request` + `workflow_call`，`contents: read`，三平台矩阵，含 `node --check scripts/market-index.mjs` 与 Linux 上的 `bash -n scripts/publish-market-index.sh`。

### 7.3 `market-index` 分支内容

```
git ls-tree -r --name-only origin/market-index
README.md
icon.svg
marketplace.json
git log --oneline origin/market-index
752bed3 chore: refresh plugin market index for 0.1.13
```

即：**单 orphan 提交、3 个文件、每次全量 force push**（与 `publish-market-index.sh:29-47` 一致）。`main` ↔ `origin/market-index` 的 `git diff --name-status` 显示该分支只保留这三个文件（`README.md` 为 `M`，其余全部为 `D`）。

### 7.4 索引发布 URL 实测

```
GET https://raw.githubusercontent.com/risense-ai/respire-dsh/market-index/marketplace.json
→ HTTP 200, 4559 bytes
GET https://raw.githubusercontent.com/risense-ai/respire-dsh/market-index/icon.svg
→ HTTP 200, 7970 bytes
```

索引内容要点（同上抓取）：`format: 1`；`title.en/zh`；`metadata.categories.memory`；单个插件 `name: "@rsrsai/dsh"`；`icon: "./icon.svg"`；`repository.url: "https://github.com/risense-ai/respire-dsh.git"`（**无 `git+` 前缀**）；`homepage` 带 `#readme`（合法，§3.3）；**11 个版本全部 `source.type: "npm"`**，`engines.dsh` 一律 `">=0.2.1-rc.2 <0.3.0"`，`publishTimestamp` 均为整数秒。

### 7.5 对 cabinet 的直接启示

1. 索引放 `market-index` 分支（origin 用 raw URL），主分支规则集不会挡 bot 推送。
2. 索引分支要**同时携带 `icon.svg`**，相对路径 icon 才自洽（Respire 正是 `cp marketplace.json icon.svg`）。
3. `repository.url` 要去掉 `git+`（cabinet 的 `package.json` 是 `git+https://…`，见 §8）。
4. Respire **只用 npm 源**；git 源在 rc.5 代码里是被支持的（§4），但没有可参考的线上先例。

## 8. cabinet 侧差距（当前 0.1.4 草稿）

现状（**取证开始时**）：`package.json` 已被改成 0.1.4 草稿（`git status` → ` M package.json`；分支 `feat/market-index`），`scripts/market-index.mjs`、`scripts/publish-market-index.mjs` **当时不存在**（`scripts/` 只有 `install.mjs`/`uninstall.mjs`/`verify.mjs`），`.github/workflows/` 只有 `release.yml`。

> 取证末期观察（不属本卷宗范围，仅供首辅对账）：`git status` 新增了未跟踪的 `scripts/market-index.mjs`、`scripts/publish-market-index.mjs`、`scripts/publish-market-index.sh`、`.github/workflows/ci.yml`、`.github/workflows/market-index.yml`，且 `README.md`、`README.zh.md`、`.github/workflows/release.yml` 变为已修改（应为工部并行产出）。本卷宗**未阅读、未评价**这些文件；§8 表格只描述取证起点时的 `package.json` 与目录结构。

| 项 | 现状 | 是否合规 | 依据 |
| --- | --- | --- | --- |
| `name` | `dsh-cabinet-mode` | ✅ 合法 npm 名 | `package.json:2`；规则 `market-index/lib/index.js:24-25,253` |
| `version` | `0.1.4` | ✅ 精确 SemVer | `package.json:3`；`index.js:229` |
| `icon` | `"./icon.svg"`，79384 字节 | ✅ 包内 icon 上限 256 KiB；作为索引 icon 走相对路径**不受 32 KiB 约束** | `package.json:6`；`app-boot/lib/index.js:2077,2107`；`market-index/lib/index.js:211-215`；`Get-Item icon.svg` → 79384 |
| `dsh.bundle.patch` | `"./cordis.patch.yml"` | ✅ 安装后校验必需字段 | `package.json:46-50`；`manager/lib/index.js:2074` |
| `repository.url` | `git+https://github.com/luodaoyi/dsh-cabinet-mode.git` | ⚠️ **不能原样写进索引**：索引要求 http/https，`git+https:` 协议会被拒 | `package.json:17-20`；`index.js:134-146,169` |
| `homepage` | `https://github.com/luodaoyi/dsh-cabinet-mode#readme` | ✅ 索引允许 fragment | `package.json:21`；`index.js:148-154` |
| `engines` | 仅 `node: ">=20"`，**无 `engines.dsh`** | ⚠️ 合法但不表达 DSH 约束：索引版本可省略 `engines.dsh`，安装与启动都不会拦；一旦写错（如 `~0.2.1`）会被跳过加载 | `package.json:14-16`；`index.js:200-208,236`；`app-boot/lib/index.js:281-285,1025-1026`；§6.4 |
| `files` | 含 `icon.svg`、`cordis.patch.yml`、`docs`、`scripts` 等 | ✅ 但副作用：`docs/` 整目录会进 npm 包 → **本卷宗 `docs/research/market-index-research.md` 也会被打包** | `package.json:36-45`；实测装出的 0.1.3 包含 `docs\cross-platform.md`、`scripts\*` |
| `publishConfig` | `access: public` + `registry: registry.npmjs.org` | ✅ npm 发布所需；**公开 registry 目前查不到该包（404）**，见 §0、§9、§10 第 7b 条 | `package.json:10-13`；§0 结论行 |
| `private` | `false` | ✅ | `package.json:7` |
| `devDependencies` | `@deepseek-ai/dsh-plugin-market-index: 0.2.1-rc.5` | ✅ 生成/校验脚本可 import 校验器 | `package.json:58-60` |
| 索引生成/校验/发布脚本 | **取证开始时缺失**（`market:index`/`market:check`/`market:publish` 三个 npm script 指向不存在的文件；取证末期工部已新建同名未跟踪文件，见上注） | ❌ 取证起点不合规（工部范围，本卷宗不代写、不评价） | `package.json:53-55` |
| 索引工作流 | 取证起点缺 | ❌ 取证起点不合规（同上，工部范围） | 取证起点 `.github/workflows/` 只有 `release.yml` |

**结论（cabinet 要补的最小集合）**：① 索引生成脚本（输出 format 1，`icon: "./icon.svg"`，`repository.url` 去掉 `git+`，版本降序、整数秒），② git 源分支（index + icon.svg）或 npm 发布，③ 若要版本约束再加 `engines.dsh`（≥0.2.1-rc.5 <0.3.0）。`files`/`icon`/`dsh.bundle` 三项**无需改动**。

## 9. 可行性结论表

| 维度 | npm 源（`source.type:"npm"`） | git 源（`source.type:"git"` + commit） |
| --- | --- | --- |
| 「发现」页能否安装 | 代码支持 ✅ 但现在**装不上**：公开 registry 查不到该包（`pnpm view` 与匿名 GET 均 404，scope 版也 404），索引里的 `name@0.1.4` 会以 `not-found` 失败 | ✅ 能。spec `git+https://github.com/luodaoyi/dsh-cabinet-mode.git#<40hex>` 实测 `pnpm add` 成功（0.1.3），且 `inspect` 对 git 直接放行（`manager/lib/index.js:1839-1845`） |
| 是否需要外部账号/密钥 | 需要 npm 发布权（`publishConfig` 已备）+ 本机已有 registry 令牌（`pnpm` 输出出现 `Bearer npm_[hidden]`） | 无需账号/密钥：公共仓库 https 只读（`github-connection.js:32` 用 `git -c credential.helper= ls-remote`，`:35` 设 `GIT_TERMINAL_PROMPT=0`/`GIT_ASKPASS=''`） |
| 能否更新 | 不能原地更新；**卸载后重装**（`manager/lib/index.js:1991`、`:2137`；文案 `client-ui-plugin-manager:158/382`；`market/README.zh.md:102`） | 同左；另有额外限制：更新判定按**版本号**而非 commit（`market/types/index.js:341-342`），同版本号新 commit 不报「有新版本」 |
| 本机能否端到端验收 | ⚠️ 发布前不能；发布后可用「发现」页装，但没有 UI 更新按钮 | ✅ 现在可：`pnpm add git+https://…` 已实测成功；`git ls-remote` 到 github.com 成功（HEAD `19105be322ea25f12cbef29396127108928a1520`）；索引 URL 可放 raw.githubusercontent（实测 200） |
| 需要重启 | 取决于 HMR 协调结果（`manager/lib/index.js:2366-2396`）；无 HMR 即 `restart-required/no-hmr` | 同左 |
| 自动检查更新 | 无定时器；仅打开/刷新时按 `cacheTtlMs`(600000ms) 取索引（`market/types/index.js:82,164`） | 同左 |
| 校验强度 | 装前可查 `dsh.bundle`（`manager/lib/index.js:1917`）+ 装后双重校验 | 装前**不查** `dsh.bundle`（`:1839-1845`），装后才在 `:2074` 拒绝并回滚 |
| 索引体积/带宽 | 小（只列元数据 + 相对 icon） | 同左（commit 锁定，不随分支漂移） |

## 10. 未验证清单

1. **UI 端到端**：未在真实「发现」页点击安装/卸载/启用按钮。本文所有 UI 结论均为**读码推断**（client bundle 行号已给出）。特别是「`enabled=false` 但 `reconcile` 自动加入 `dsh.profile.bundles`」这个组合（§5.3），未做运行期观察。
2. **cabinet 装到真实 profile 后是否需要重启**：未实测。`cordis.patch.yml` 是否会触发 `host-module`/`module-comparison` 原因，未知。
3. **git 源的「更新」用户体验**：未实测「同一版本号新 commit」与「新版本号新 commit」两种情形在「已安装」页的实际显示差异（代码推断为都不出现更新按钮，因非官方插件无 `installTarget`）。
4. **索引图标实际渲染**：未在 UI 观察 79384 字节 `icon.svg` 从 raw.githubusercontent 加载的效果（只验证了校验器接受、`<img loading="lazy">` 无体积门槛）。
5. **`engines.dsh` 写进 cabinet 后的启动行为**：未实测。仅确认 `0.2.1-rc.5` 与候选 range 的 `semver.satisfies` 结果（§6.4）。
6. **GitHub Actions 未实跑**：未创建/触发任何 workflow；Respire 的 workflow 只是**读取现有文件**。cabinet 仓库的 Actions 权限、分支规则集是否允许 bot 推送 `market-index` 分支 —— 未验证。
7. **npm 发布**：未执行 `npm publish`（任务禁止）。`package.json` 的 `publishConfig` 是否足够（scope/2FA/provenance 要求）未验证。
7b. **404 的二义性**：公开 registry 返回 404 也可能表示「存在但当前身份无权访问的私有包」。本机 pnpm 令牌的身份（输出中的 `Bearer npm_[hidden]`）未核实，`https://www.npmjs.com/package/dsh-cabinet-mode` 抓取被 403（Cloudflare）拦截。因此「从未发布过」是推断，**「当前无法从公开源安装」是实测**；`@luodaoyi` 作用域是否保留给该账号也未验证。
8. **`.artifacts` 之外的 rc.5 官方文档**（如 format 1 的 Agent Note）未取得：本卷宗只依据磁盘上的校验器代码，文档表述可能与代码存在差异。
9. **仓库工作树观察**：取证期间 `git status` 多出未跟踪的 `pnpm-lock.yaml` 与三个 `scripts/` 新文件（§8 注）。我全程只在 `$env:TEMP` 运行 pnpm、只新建 `docs/research/market-index-research.md`，这些未跟踪项非我所建，记录在此以免误判。

## 11. 复现命令

```powershell
$node='C:\Users\tb16p\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$pnpm='C:\Users\tb16p\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs'
$tmp="$env:TEMP\hanlin-market-research"

# 1) 版本确认
Get-Content 'D:\sources\repos-new\gh\dsh-cabinet-mode\.artifacts\asar\dsh\node_modules\@deepseek-ai\dsh-plugin-market-index\package.json' -Raw

# 2) 校验器 + install-spec 探针（合成用例，不写仓库）
& $node "$tmp\probe.mjs"

# 3) engines.dsh range 探针
& $node "$tmp\range-probe.cjs" "$tmp\asar\dsh\node_modules\semver"

# 4) git 源安装实测（在 TEMP 内）
New-Item -ItemType Directory -Force "$tmp\git-spec-test" | Out-Null
Set-Content "$tmp\git-spec-test\package.json" '{"name":"probe-profile","private":true}'
Push-Location "$tmp\git-spec-test"
& $node $pnpm add "git+https://github.com/luodaoyi/dsh-cabinet-mode.git#<40-hex-sha>"
Get-Content package.json -Raw   # 记录形态：github:owner/repo#sha
Pop-Location

# 5) 索引可达性
Invoke-WebRequest 'https://raw.githubusercontent.com/risense-ai/respire-dsh/market-index/marketplace.json' -UseBasicParsing
```

`probe.mjs` 是一次性文件（`$env:TEMP` 内），核心逻辑见附录 A，可直接重建。

## 12. 首发与 npm Trusted Publishing 前置（2026-11-03 追加）

本节回答 task-5：**从未发布过的包名能否用 npm Trusted Publishing（OIDC）首发**。上一节及之前的结论段落未改动。

### 12.1 结论

**不支持。截至 2026-11-03，npm 仍要求包先存在，才允许创建 Trusted Publisher 配置；首个版本必须用一次性凭证发布。**

三条独立证据（官方为主）：

| # | 证据 | 内容 | 类型 |
| --- | --- | --- | --- |
| 1 | npm/cli#8544（`Allow publishing initial version with OIDC`） | `state: "open"`、`updated_at: 2026-10-15T19:09:37Z`、9 条评论。正文原话：「it's not possible to publish the initial version of a package using OIDC, it needs to be published manually or using a token… The main problem is that the UI on npmjs.com requires a package to exist before you can edit its settings and enable OIDC publishing」 | 一手 issue（未关闭） |
| 2 | `npm trust` 官方文档「Prerequisites」 | 明列「**Package must exist**: The package you're configuring must already exist on the npm registry.」 | 一手文档 |
| 3 | Trusted publishing 文档「Configuring」 | 配置入口只有**包设置页**（"Navigate to your package settings on npmjs.com"；"Packages → YOUR_PACKAGE → Settings → Trusted publishing"），没有账号级入口 | 一手文档 |

来源 URL（均 2026-11-03 抓取，HTTP 200）：
- `https://raw.githubusercontent.com/npm/documentation/main/content/packages-and-modules/securing-your-code/trusted-publishers.mdx`
- `https://raw.githubusercontent.com/npm/cli/latest/docs/lib/content/commands/npm-trust.md`
- `https://api.github.com/repos/npm/cli/issues/8544`（及 `/comments`）
- `https://raw.githubusercontent.com/npm/documentation/main/content/packages-and-modules/securing-your-code/staged-publishing.mdx`

**关于「2 天内首发」的误读（重要）**：TP 文档该段原文是「A newly created trusted publisher configuration must complete its first successful publish within 2 days. The first successful publish validates the configuration and binds it to the repository's immutable identity.」——它说的是**配置的验证窗口**：配置建好后的 2 天内必须有一次成功发布来激活它，否则配置作废。**它并不创建包，也不是「可以给未存在的包预建配置」的证据**；恰恰相反，配置本身要求包已存在（证据 1、2）。

**维护者口径时间线**（防转述失真）：
- 2025-09-05 `owlstronaut`（npm）：「We determined to not have "first publish" available to limit scope in our MVP, but are evaluating options for the next step.」
- 2026-03-03 / 2026-08-05 社区两次追问「what's the latest on this?」，**无官方新答复**。
- 因此 2026-05 第三方交接文档引用的「MVP 不提供 first publish」与官方文档现状一致，**该说法在 2026-11 仍成立**，只是措辞停留在 2025 年的 MVP 时点。

### 12.2 若支持的话入口与字段（供「首发之后」这一步使用）

- **网页入口**：npmjs.com → Packages → 该包 → **Settings → Trusted publishing**（文档原文）；第三方工具文档另写作 `https://www.npmjs.com/package/<name>/access`。两者**未登录核实**，且 `www.npmjs.com` 直连返回 403（Cloudflare），**精确 URL 标未验证**。
- **CLI 入口**：`npm trust`（npm ≥ **11.15.0**；`npm trust <provider> --help` 查该 provider 的旗标）。
- **GitHub Actions 需要填的字段**（文档原文）：Organization or user（必填）、Repository（必填）、Workflow filename（必填，**只写文件名**，含 `.yml`/`.yaml`，文件须在 `.github/workflows/`）、Environment name（可选）、**Allowed actions**（可选/必选随创建时间；见下）。
- **Allowed actions 的重大变化**：文档注记「Configurations created after Sep 03, 2026 are automatically set to allow `npm stage publish`, and you can choose whether to also permit direct publishing with `npm publish`」→ **2026-09-03 之后新建的配置默认只允许 stage，必须显式勾上 `npm publish`**，否则直接 `npm publish` 会被拒。CLI 侧对应 `--allow-publish` / `--allow-stage-publish`（至少给一个）。
- 其它硬约束：每包最多 10 个配置；**已有配置不可编辑**（只能删了重建）；保存时 npm **不校验**配置正确性，错误只在发布时才暴露（文档原话：「npm does not verify your trusted publisher configuration when you save it」）。

### 12.3 引导方案 A（推荐）：一次性最小权限 token 直接首发 0.1.4

不制造多余版本，直接把计划中的 0.1.4 作为首发：

1. **建一次性 token**：npmjs.com → Access Tokens → **Granular Access Token**；权限选 *Read and write*，包范围选目标 scope 或 *All packages*（包尚不存在，无法按包精确选）；有效期取最短档。
   - 若用 **Classic**：必须选 **Automation**（普通 Publish token 会触发 OTP，CI 里必然失败）。
2. **注入凭证**：本机 `export NODE_AUTH_TOKEN=<token>`（Windows：`$env:NODE_AUTH_TOKEN`），或 GitHub Actions 里用一次性 secret。**不要**把 token 写进 `.npmrc` 提交。
3. **发布**（tarball 形态合法）：`npm publish ./dsh-cabinet-mode-0.1.4.tgz --access public`
   - 依据：`npm-publish` 文档 package 可为「b) a gzipped tarball」；相对路径须带 `./` 前缀。
4. **核对**：`npm view dsh-cabinet-mode version`（应 0.1.4）、`npm view dsh-cabinet-mode dist-tags`（latest=0.1.4）。
5. **建 TP 配置**：网页（Settings → Trusted publishing，勾上 `npm publish`）或 `npm trust github --allow-publish …`（**需交互 2FA**，不能用 token 驱动）。
6. **撤 token**：Access Tokens 页 Revoke，并删除 CI 里的临时 secret。
7. **可选加固**：包 Settings → Publishing access → 「Require two-factor authentication and disallow tokens」（文档推荐；只影响传统 token，不影响 TP）。

> 注意第 5 步与第 3 步的先后：必须先有包（第 3 步）才能建配置（第 5 步）。建完配置后 **2 天内**要有一次成功发布来激活它 —— 实操上把「建配置」安排在下次发版前一天，而不是提前几周建。

### 12.4 引导方案 B：先发占位版本再 OIDC（**Respire 走的就是这条**）

1. `npm stage publish`（npm ≥11.15.0，账号须开 2FA）→ 文档原文：**当包不存在时，npm 会先公开一个 `0.0.0-stage` 占位版本**，真正的 staged 版本待维护者 2FA 审批后才公开；或
2. 用第三方工具 `npx setup-npm-trusted-publish <name>`（默认占位版本 `0.0.0`，可 `--package-version` 改）。
3. 包存在后建 TP（勾 `npm publish`），首个真实版本走 OIDC。

**真实先例（本机实测 registry 数据）**：

```
GET https://registry.npmjs.org/@rsrsai%2Fdsh → 200
versions: 0.0.0-stage, 0.1.1, 0.1.2, 0.1.3, 0.1.4, 0.1.7 … 0.1.13
time.0.0.0-stage = 2026-10-19T14:36:26Z（= time.created），dist-tags: latest=0.1.13
```

即 Respire 的包**第一个版本就是 `0.0.0-stage`**，随后才是 0.1.1 起的真实版本；其索引生成脚本专门跳过它（`scripts/market-index.mjs:71` `if (version === '0.0.0-stage') continue`）。**这说明先例仓库本身也是被「必须先有包」卡住后走的占位路线**，可直接照搬。

**代价**：占位版本永久占用一个版本号（npm 明确 name@version 一经发布永不复用），且市场索引必须过滤它；若占位是 `0.0.0-stage` 还可能被「发现」页当正式版本展示（故 Respire 才在生成器里硬跳过）。

### 12.5 `npm publish <本地 tarball> --access public` 在 OIDC 下是否可行

- **可行**：tarball 是文档化的 package 形态（`npm-publish` 文档 b 项），OIDC 只替换凭证来源，不改变发布对象解析。
- **provenance 自动**：TP 文档明确「When you publish using trusted publishing from GitHub Actions or GitLab CI/CD, npm automatically generates and publishes provenance attestations… you don't need to add the `--provenance` flag」。客户端实现见 `npm/cli/lib/utils/oidc.js`：默认 provenance 且 GitHub 仓库 public 时置 `opts.provenance = true`；CircleCI 不自动开。
- **前置条件**：TP 文档要求「your package's `repository.url` field in `package.json` must exactly match your GitHub repository」。cabinet 现为 `git+https://github.com/luodaoyi/dsh-cabinet-mode.git`（`package.json:17-20`）→ 对应 `luodaoyi/dsh-cabinet-mode`，匹配。
- **版本门槛**：TP 需 npm CLI ≥ **11.5.1**、Node ≥ **22.14.0**。GitHub Actions `node-version: '24'` → 实测 Node **v24.22.2**（`https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt`），其内置 npm 为 **11.19.1**（`nodejs/node v24.22.2 deps/npm/package.json`）→ **满足**；`npm trust` 需 ≥11.15.0 也满足。
- ⚠️ **坑**：TP 文档注明 OIDC 下的 `npm dist-tag` 需要 npm ≥ **11.21.0**，而 11.19.1 **不满足**。若发布后要在 workflow 里改 dist-tag（如 `next`→`latest`），须先 `npm i -g npm@latest`，否则请用「发布时 `--tag`」而不是事后 `dist-tag`。

### 12.6 失败模式 → 处置（读 CI 日志用）

前提：`oidc.js` 的交换失败**不会抛错**，只在 `verbose` 级别留日志并回落传统凭证（源码 `lib/utils/oidc.js`：`catch { log.verbose(...) ; return undefined }`）。**因此「OIDC 配置错了」通常表现为通用鉴权错误，而不是明确的 TP 报错。**

| 日志文案 / 码 | 真实含义 | 处置 |
| --- | --- | --- |
| `ENEEDAUTH` / `This command requires you to be logged in to https://registry.npmjs.org` | OIDC 交换静默失败 + 无 token 回落 | 加 `--loglevel=verbose`，查 `oidc` 行：`Skipped because incorrect permissions for id-token within GitHub workflow`（缺 `id-token: write`）、`Failed token exchange request with body message: …`（repo/workflow 不匹配、配置过期）、`Skipped because no id_token available` |
| HTTP 401（token exchange 端点） | id token 无效或缺失 | 同上；本机实测该端点对**存在包与不存在包、假 token 均返回 401**，即鉴权先于包查找，不能用它判断包是否存在 |
| 403 / `You do not have permission to publish` / `not authorized to publish` | 凭证身份无写权限；OIDC 下多为 TP 配置与实际仓库/工作流不符 | 核对 owner/repo/workflow 文件名（含 `.yml`、大小写）、是否 self-hosted runner（不支持） |
| `E404` / `package not found`（`npm trust` 阶段） | 包还不存在 | 先走 §12.3 或 §12.4 引导 |
| `EPUBLISHCONFLICT` / `cannot publish over the previously published versions` | 该 name@version 已存在 | 升版本号；OIDC 下同样适用 |
| `EOTP` | 需要 2FA OTP | 用 Automation / GAT；`npm trust` 只能交互式 2FA |
| `GAT with the bypass 2FA option are not supported` / `401 token is invalid`（`npm trust`） | 文档前置条件：trust 命令不接受 GAT-bypass、也不接受 username/password | 用带 2FA 的交互式会话建配置 |
| 建配置 2 天内没有成功发布 | 配置过期，不可再用 | 删除后重建，并在 2 天内完成首次发布 |
| `npm whoami` 通过但发布失败 | `whoami` 不是 TP 权限检查（文档原话） | 直接以目标操作验证 |

### 12.7 给 cabinet 的可照做清单（首发版）

1. 取证确认包名未占用：`https://registry.npmjs.org/dsh-cabinet-mode` → 404（本卷宗已实测；404 也可能表示私有包，故再核 `pnpm view` 与 npm 搜索）。
2. 决定走 A 还是 B：**A＝直接首发 0.1.4（一次 token，干净）**；B＝先 `0.0.0-stage` 占位（与 Respire 一致，但留一个永久占位版本）。
3. 若走 B：本机 npm ≥11.15.0 + 账号 2FA → `npm stage publish`（占位）→ 审批 → 建 TP。
4. 若走 A：建 1 天期 GAT（或 Classic Automation）→ `npm publish ./dsh-cabinet-mode-0.1.4.tgz --access public` → 核对 `npm view` → 建 TP（勾 `npm publish`）→ 撤销 token。
5. TP 字段固定为：owner `luodaoyi`、repo `dsh-cabinet-mode`、workflow `<发布工作流文件名>.yml`、Allowed actions 勾 **npm publish**。
6. 下一次发版（0.1.5）走 OIDC：workflow 侧只保留 `permissions: id-token: write` + `contents: read`，**不要**再注入 `NODE_AUTH_TOKEN`（有 token 时 OIDC 失败会被掩盖）。
7. 建完配置后 2 天内完成该次 OIDC 发布；失败先看 `--loglevel=verbose` 的 `oidc` 行。
8. 首发成功后回头把「发现」页索引的 `source.type` 从 git 切到 npm（本卷宗 §9 的 git/npm 对比仍有效）。

### 12.8 本节未验证

1. **真实 npmjs.com UI 路径**：未登录，`www.npmjs.com` 直连 403（Cloudflare），无法确认「Settings → Trusted publishing」与 `/package/<name>/access` 是否为同一页面/同一入口。
2. **`npm trust github` 的完整参数集**：只读到文档概述（`--allow-publish`/`--allow-stage-publish`、provider 专属旗标需 `--help`），**未执行**该命令。
3. **tarball + OIDC 端到端**：本机无 GitHub OIDC 环境，未实测；「可行」依据是文档化的 package 形态 + 凭证可替换性，属推断。
4. **GAT 最短有效期**：第三方工具文档写「7 days (shortest available)」，issue 评论有人写「1 day」，**两者冲突且均非官方**；以 npmjs.com 建 token 时的下拉为准。
5. **占位版本能否删除**：未读 `npm unpublish` 文档的 72 小时规则原文，故只说「永久占用版本号」这一确定性结论。
6. **`0.0.0-stage` 出自哪个动作**：registry 只能证明该版本存在且是首版；究竟由 `npm stage publish` 还是第三方工具发布，未取证。

## 附录 A：最小校验器探针（可直接重跑）

前提：把 `.artifacts/asar-list.json` 指向的 `@deepseek-ai/dsh-plugin-market-index` 与 `semver` 两个包解到某个目录（本文用 `$env:TEMP\hanlin-market-research\asar`，见 §1）。脚本只用公开导出，不写任何文件：

```js
// node probe-min.mjs <extracted-node_modules-root>
import { pathToFileURL } from 'node:url';
const root = process.argv[2]; // 例：C:/Users/<you>/AppData/Local/Temp/x/asar/dsh/node_modules
const { parseMarketIndex, marketInstallTarget } =
  await import(pathToFileURL(`${root}/@deepseek-ai/dsh-plugin-market-index/lib/index.js`).href);

const SHA = '38add4f486ebc2f7a0d615ed5b244e2a64d59024';
const indexUrl = 'https://raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/market/index.json';
const doc = (plugin) => ({ format: 1, title: { en: 'M', zh: '市场' }, plugins: [{ name: 'dsh-cabinet-mode', versions: [
  { version: '0.1.4', publishTimestamp: 1767225600, source: { type: 'npm' } }], ...plugin }] });

const cases = {
  'relative icon (79384B file, no cap)': doc({ icon: './icon.svg' }),
  'data: icon 32769B decoded': doc({ icon: `data:image/svg+xml;base64,${Buffer.alloc(32769, 65).toString('base64')}` }),
  'title without en': { format: 1, title: { zh: '市场' }, plugins: [] },
};
for (const [label, value] of Object.entries(cases)) {
  try { const p = parseMarketIndex(value, indexUrl); console.log('PASS', label, p.plugins[0]?.icon ?? ''); }
  catch (e) { console.log('FAIL', label, '->', e.message); }
}

const gitDoc = { format: 1, title: { en: 'M' }, plugins: [{ name: 'dsh-cabinet-mode', versions: [
  { version: '0.1.4', publishTimestamp: 1767225600,
    source: { type: 'git', url: 'https://github.com/luodaoyi/dsh-cabinet-mode', commit: SHA } }] }] };
const git = parseMarketIndex(gitDoc, indexUrl);
console.log('git spec =', marketInstallTarget('dsh-cabinet-mode', git.plugins[0].versions[0]).spec);
// → git+https://github.com/luodaoyi/dsh-cabinet-mode.git#38add4f486ebc2f7a0d615ed5b244e2a64d59024
```

预期输出（本机实测，2026-11-03）：

```
PASS relative icon (79384B file, no cap) https://raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/market/icon.svg
FAIL data: icon 32769B decoded -> $.plugins[0].icon must not exceed 32 KiB of decoded bytes
FAIL title without en -> $.title must contain en
git spec = git+https://github.com/luodaoyi/dsh-cabinet-mode.git#38add4f486ebc2f7a0d615ed5b244e2a64d59024
```

---

**取证边界声明**：本卷宗只新建 `docs/research/market-index-research.md` 一个文件；未修改任何已跟踪文件，未改 `package.json`，未改 `.artifacts` 既有文件（仅在 `$env:TEMP` 做实验），未执行 `git commit`/`push`/`tag`/`npm publish`。
