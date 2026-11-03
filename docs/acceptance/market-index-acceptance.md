# 插件市场索引源安装/更新能力 · 终验（都察院御史）

- 验收人：都察院御史（duchayuan-acceptor）
- 验收时间：2026-11-03 22:50–23:05（Asia/Shanghai）
- 验收对象：`D:\sources\repos-new\gh\dsh-cabinet-mode`（只读；实验均在 `$env:TEMP`）
- 原始诉求：把内阁插件改造成可用「插件市场索引源（一个索引文件 URL）」安装和更新的插件，参考 Respire 先例。
- 验收口径：task-4 description；不采信工部/大理寺自述，以下断言均由本官重新执行。
- 边界：只写 `docs/acceptance/`；未改任何已跟踪文件；未碰 `.artifacts` 与 `C:\Users\tb16p\.dsh`；未 commit/push/tag；未 npm publish；未动 live profile。

---

## 0. 判定

**判定：有条件通过。**

索引可用、安装可用、发布链路可用；「更新」在该机制下**不是一键原地升级**，只能走「已安装页卸载旧版 → 从发现页安装新版 → 重启」，或走 CLI 精确版本切换。另有两项非阻断条件：文档仍有两处陈旧/自相矛盾的「未验证」表述；按任务背景本机 live desktop profile 为 `0.2.0`，而索引只有 `0.1.5`，**直接装 0.1.5 等于降级**。

| 项目 | 结论 | 依据 |
|---|---|---|
| 索引 URL 可读、格式合法 | **PASS** | §2：HTTP 200、2159 B、与分支 blob 逐字节一致、rc.5 真解析器 PASS |
| 0.1.5 可从 npm spec 安装进 profile | **PASS** | §3：内嵌 pnpm 实装、包根 `cordis.patch.yml`、`dsh.bundle.patch` 可解析、依赖精确 `0.1.5` |
| 安装后 preset 正确、未破坏四个内建 preset | **PASS** | §3.5：`--dump-config` 共 5 个 preset，`preset-cabinet` 恰 1 个；与基线 diff 为 +233/−0 |
| 「可更新」可判定 | **PASS（机制级）** | §4：`installationOf` 用 `semver.gt(defaultVersion, installedVersion)` 得出 `update-available` |
| 「可更新」在 GUI 一键完成 | **FAIL / 平台限制** | §4.2：rc.5 第三方插件无原地升级；已装包再 install 会被 `inspect` 以 `already-installed` 拒绝 |
| tag → verify → OIDC publish → Release → 索引刷新 | **PASS** | §5：run 41657224370 两个 job 均成功，索引 job 等待 76.2 s 后强推 `a87b0b0` |
| 文档诚实性 | **有条件 PASS** | §6：无夸大、无「不发 npm」现行旧文案；但 README/zh 发布状态仍停在 0.1.4，cross-platform 第 23 行与第 155 行互相矛盾 |

**阻断项（对 0.1.5 索引安装链路）：无。**

**阻断项（对「把 live profile 用市场更新到当前版本」）：有，但属前置条件缺失而非 0.1.5 链路缺陷。** 本机 live desktop profile 背景为 `dsh-cabinet-mode@0.2.0`（旁证：`D:\sources\repos-new\gh\dsh-cabinet-mode-ui\package.json:3` 为 `0.2.0`，同目录有 `dsh-cabinet-mode-0.2.0.tgz`）；npm registry 只有 `0.0.0-stage`、`0.1.4`、`0.1.5`，没有 `0.2.0`。索引默认版本 `0.1.5 < 0.2.0`，`semver.gt('0.1.5','0.2.0')=false`，按 rc.5 规则状态是 `different-version` 而非 `update-available`。**在发布 0.2.x 并刷新索引前，市场不能作为 live profile 的升级路径。**

---

## 1. 验收对象与当前状态

### 1.1 仓库与 tag

```text
$ git rev-parse HEAD
5edc88fec708944bebbf2fd3bee5ebda4b2dc79a
$ git rev-parse origin/main
c0242190a99ac04917989cedd03d4a3f524c2df5
$ git log --oneline 5edc88f..origin/main
c024219 fix: bust the cache in check mode and keep fs error codes for the guard
d136251 fix: read a fresh rollback baseline and only skip the guard when the index is absent
$ git cat-file -p v0.1.5 | head -2
object 5edc88fec708944bebbf2fd3bee5ebda4b2dc79a
type commit
$ git cat-file -p v0.1.4 | head -2
object 4452af0511dd30f460b6b4a55f52a3776ecf0b47
type commit
```

- `v0.1.5` 是 annotated tag，指向 `5edc88f`；`v0.1.4` 指向 `4452af0`。两者均已在 `origin/main` 内（`git merge-base --is-ancestor` 返回 0）。
- **注意：本地 worktree 主分支停在 `5edc88f`，`origin/main` 已前进到 `c024219`。** 后两个提交只改 `scripts/market-index.mjs` 与 `CHANGELOG.md`（`git diff --stat 5edc88f origin/main`：2 files, +47/−7），是发布后的守卫加固，**不在 npm 0.1.5 tarball 内**（见 §7 D-03）。
- `git status --short` 在验收开始时为空；本文件写入后仅多出未跟踪的 `docs/acceptance/`。

### 1.2 已发布事实（独立复核）

```text
npm dist-tags: {"latest":"0.1.5"}
npm time:      0.0.0-stage=2026-11-03T14:25:46.700Z
               0.1.4      =2026-11-03T14:34:49.194Z
               0.1.5      =2026-11-03T14:49:21.106Z
npm versions:  0.0.0-stage, 0.1.4, 0.1.5
```

- `0.1.4` / `0.1.5` 的 `dist.attestations.provenance.predicateType = https://slsa.dev/provenance/v1`，`_npmUser = GitHub Actions`，`trustedPublisher.id = github`。
- `0.0.0-stage` 的 `_npmUser = asural`（人工引导占位），无 attestations；版本号含 `-stage`，索引按预发布跳过。
- 远端 `market-index` 分支头：`a87b0b0`，提交信息 `chore: refresh plugin market index for 0.1.5`；本地 `origin/market-index` 仍是旧的 `5722232`，**不要以本地旧 ref 判断远端**。

---

## 2. 索引可用性（A 组）

### 2.1 真实 URL、状态、字节与 blob 一致性

命令（带一次性 cache-buster，避免 5 分钟 CDN 缓存）：

```powershell
$t=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$url="https://raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/market-index/marketplace.json?t=$t"
Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 60 -OutFile "$env:TEMP\acc-marketplace.json"
Get-FileHash "$env:TEMP\acc-marketplace.json" -Algorithm SHA256
```

原始输出摘录：

```text
status=200
content-type=text/plain; charset=utf-8
cache-control=max-age=300
etag=W/"fb98a63a6d43344bbed01cd062fd69ea37b163dff92cb50759aef11d9dd37ea6"
bytes=2159
sha256=C51401B28DAF8D2E514217C1ABDBD20350F992435B817A12EE01222D5C7B641B
```

GitHub Contents API 取同分支 blob 并解码后比对：

```text
blob-bytes=2159
blob-sha256=C51401B28DAF8D2E514217C1ABDBD20350F992435B817A12EE01222D5C7B641B
live-sha256=C51401B28DAF8D2E514217C1ABDBD20350F992435B817A12EE01222D5C7B641B
identical=True
gitblob-sha=c4e64c84b8580aa728bdeae3e829f5768ddacb94
```

结论：**live URL 与 `market-index` 分支上的 blob 逐字节一致（2159 B）**；`cache-control: max-age=300` 证实了 5 分钟缓存的存在，验收抓取必须带 `?t=`。

### 2.2 用 rc.5 真解析器复跑

解析器来源：`D:\sources\repos-new\gh\dsh-cabinet-mode\.artifacts\asar\dsh\node_modules\@deepseek-ai\dsh-plugin-market-index\lib\index.js`（package.json version `0.2.1-rc.5`）。复制到 `$env:TEMP\acc-parser`，`npm install semver@^7`（`node_modules/semver`），未改 `.artifacts` 内文件。执行脚本 `$env:TEMP\acc-parser\run.mjs`，以生产 URL 作为 `indexUrl`：

```text
format= 1
title= {"en":"Cabinet Mode","zh":"内阁模式"}
categories= {"preset":{"title":{"en":"Agent presets","zh":"智能体预设"}}}
plugin.name= dsh-cabinet-mode
plugin.title= {"en":"Cabinet Mode","zh":"内阁模式"}
plugin.icon= https://raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/market-index/icon.svg
plugin.metadata.category= preset
versions= [{"version":"0.1.5","publishTimestamp":1793717361,"source":{"type":"npm","registry":"https://registry.npmjs.org/"},"engines":{}},{"version":"0.1.4","publishTimestamp":1793716489,"source":{"type":"npm","registry":"https://registry.npmjs.org/"},"engines":{}}]
marketInstallTarget(0.1.5)= {"spec":"dsh-cabinet-mode@0.1.5","registry":"https://registry.npmjs.org/"}
MAX_INLINE_ICON_BYTES= 32768
negative format -> MarketIndexError | $.format must be 1
negative timestamp -> MarketIndexError | $.plugins[0].versions[1].publishTimestamp must be an integer number of Unix seconds in [0, 10^11)
PARSER-ALL-ASSERTIONS-PASSED
```

逐项核对：

| 断言 | 实测 | 证据 |
|---|---|---|
| `format` 为数字 1 | PASS | 解析输出 `format=1`；校验代码 `lib/index.js:284` |
| 两条版本为 0.1.5 / 0.1.4 且降序 | PASS | 解析输出；读取器 `:248` 用 `semver.rcompare` 归一；生成器 `scripts/market-index.mjs:317-327` 自检降序 |
| `publishTimestamp` 为整数秒 | PASS | `1793717361` / `1793716489`，与 npm packument `time` 的 epoch 逐位一致（`node -e` 输出 `epoch(0.1.4)=1793716489`、`epoch(0.1.5)=1793717361`） |
| `source.type=npm` 且 registry 合规 | PASS | 解析输出 `https://registry.npmjs.org/`；校验代码 `:179-185` |
| `engines.dsh` 缺省被接受 | PASS | 解析输出 `engines:{}`；校验代码 `:200-208` 把 `engines.dsh` 当可选 |
| `title.en` 必填 | PASS | 解析输出含 `en`；校验代码 `:51-60` |
| 版本唯一 | PASS | 无重复；校验代码 `:245` 对重复版本抛错 |
| `icon: "./icon.svg"` 解析为 https 同源 | PASS | 解析输出为 `.../market-index/icon.svg`；校验代码 `:209-225` |
| `repository.url` 无 query/fragment | PASS | 解析 PASS；校验代码 `:167-175`（repository 校验调用 `httpUrl` 的 query/fragment 拒绝，`:134-146`） |
| `metadata.category` 引用已声明 id | PASS | index 中 `categories.preset` 已声明，plugin 的 `category=preset`；校验代码 `:97-104`（`declaredId`）与 `:102-104` |
| `0.0.0-stage` 被排除 | PASS | 索引 versions 仅 0.1.5/0.1.4；packument 存在 `0.0.0-stage`，生成器跳过逻辑 `scripts/market-index.mjs:233-236`（`version.includes('-')`）；本次 run 日志亦为 `skipped: 0.0.0-stage (prerelease)` |

### 2.3 反向控制（证明解析器真会拒绝）

```text
negative format -> MarketIndexError | $.format must be 1
negative timestamp -> MarketIndexError | $.plugins[0].versions[1].publishTimestamp must be an integer number of Unix seconds in [0, 10^11)
```

将 `format` 改为 2、将 `0.1.4` 的 `publishTimestamp` 改为毫秒，均被 rc.5 真解析器拒绝并给出 JSON path，不是「脚本自说自话」。

### 2.4 icon 体积

```text
live icon: status=200, content-type=image/svg+xml, bytes=79384, sha256=08E964B6D79CFB906B431976DC8E8814C93D58393FE0B6B1DD424DE89FD34E29
```

- 本仓库 `icon.svg` 79384 B；索引用相对路径 `./icon.svg`。
- rc.5 的 32 KiB 上限只约束 `data:` 内联图标（`lib/index.js:214`，`MAX_INLINE_ICON_BYTES` 在 `:35`）；相对路径仅解析为 URL（`:209-225`），**没有体积检查**。
- 结论：79384 B 相对图标合规，解析器实跑也接受。包内 `package.json` 的 `icon` 是另一条链路（256 KiB 包内图标上限），80 KiB 同样在限内。

---

## 3. 安装可用性（B 组）

### 3.1 临时 DSH_HOME 与内嵌 pnpm 实装

```powershell
$env:DSH_HOME="$env:TEMP\acc-dsh-home"
dsh plugin --profile accweb add dsh-cabinet-mode@0.1.5
```

原始输出摘录：

```text
dsh: initialized profile accweb at C:\Users\tb16p\AppData\Local\Temp\acc-dsh-home\profiles\accweb
Progress: resolved 1, reused 0, downloaded 0, added 0
Packages: +1
dependencies:
+ dsh-cabinet-mode 0.1.5
Done in 338ms using pnpm v11.28.5
```

`dsh plugin --profile accweb list`：

```text
dsh-profile-accweb C:\Users\tb16p\AppData\Local\Temp\acc-dsh-home\profiles\accweb (PRIVATE)
│   dependencies:
└── dsh-cabinet-mode@0.1.5
1 package
```

### 3.2 回写 profile 的依赖串与 bundle 选择

`$env:TEMP\acc-dsh-home\profiles\accweb\package.json`：

```json
{
  "name": "dsh-profile-accweb",
  "private": true,
  "dependencies": {
    "dsh-cabinet-mode": "0.1.5"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-cabinet-mode"
      ]
    }
  }
}
```

- 依赖串是**精确版本** `"0.1.5"`（不是 `^0.1.5`），便于回退与核对。
- 安装后 profile 清单的 `dsh.profile.bundles` 为 `["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app","dsh-cabinet-mode"]`；安装路径（`runPluginCommand`）会同步 bundle 选择，未出现「只装依赖、不选 bundle」。
- 安装后 `node_modules/dsh-cabinet-mode` 存在，`package.json` 的 `dependencies`/`peerDependencies` 均为空，纯 YAML bundle。
### 3.3 包结构与 `dsh.bundle.patch`

```text
installed.version= 0.1.5
installed.dsh.bundle.patch= ./cordis.patch.yml
installed.patch.exists= true
installed.patch.bytes= 11316
profile.dependency= 0.1.5
installed.dependencies= {}
installed.peerDependencies= {}
installed.engines.dsh= null
tarball-vs-installed package.json: identical dadaefd36530a3a3ca1dc8ef5e5ef561398b201209f5c3e8e5f54cccc69e78f7
tarball-vs-installed cordis.patch.yml: identical 0e580f513ef25f2033f1081f37957a416aec683b8c1624786ff80f855a1c0da8
tarball-vs-installed icon.svg: identical 08e964b6d79cfb906b431976dc8e8814c93d58393fe0b6b1dd424de89fd34e29
tarball-vs-installed scripts/market-index.mjs: identical 9a33e45f8dde9fdaf1befb8dd98fbf4e1540e984e5375584b66dda7e5c00318a
INSTALL-ASSERTIONS-PASSED
```

- `cordis.patch.yml` 在**包根**，`dsh.bundle.patch` 指向它，文件存在且可读；DSH `--dump-config` 成功解析（见 3.5）。
- 关键文件与 npm tarball 逐字节一致：`package.json`、`cordis.patch.yml`、`icon.svg`、`scripts/market-index.mjs`（见上面 `tarball-vs-installed` 四项）；tarball 清单共 15 文件。line-ending 说明：仓库工作树是 CRLF，npm tarball/安装树是 LF；`11487 B` vs `11316 B` 的差为 171 个换行，不是内容缺失。

### 3.4 npm tarball 与 GitHub Release 资产一致

```text
npm tarball: https://registry.npmjs.org/dsh-cabinet-mode/-/dsh-cabinet-mode-0.1.5.tgz
bytes=182103
sha256=E73C6E30591E5B5B201CBEC3963D153E87C731743B352B30EC71E6444F3A15EE
GitHub Release asset digest: sha256:e73c6e30591e5b5b201cbec3963d153e87c731743b352b30ec71e6444f3a15ee
SHA256SUMS.txt: e73c6e30591e5b5b201cbec3963d153e87c731743b352b30ec71e6444f3a15ee  dsh-cabinet-mode-0.1.5.tgz
```

npm 包与 GitHub Release 资产是同一份 tarball。tarball 清单 15 个文件，含 `package/cordis.patch.yml`、`package/icon.svg`、`package/scripts/*`，不含 `docs/research`、`docs/verify`、`.github`、`marketplace.json`。

### 3.5 rc.5 运行时 CLI 验证 preset 组合

命令与计数：

```powershell
$env:DSH_HOME="$env:TEMP\acc-dsh-home"
dsh --profile accweb --dump-config   # 已装 0.1.5 的 web 模板 profile
dsh --profile accpatch --from-default-profile web --patch D:\sources\repos-new\gh\dsh-cabinet-mode\cordis.patch.yml --dump-config
```

```text
baseline-presets=- id: preset-standard, - id: preset-ptc, - id: preset-minimal, - id: preset-cordis
with-cabinet-presets=- id: preset-standard, - id: preset-ptc, - id: preset-minimal, - id: preset-cordis, - id: preset-cabinet
preset-cabinet-count=1
cabinet-config-id-count=1
diff-numstat=233  0  acc-dump-web.txt => acc-dump-web-cabinet.txt
removed-lines=0
```

- 基线 web 模板已有四个内建 preset：`standard`、`ptc`、`minimal`、`cordis`（`--dump-config` 行 630/794/964/1061）。
- 装上 0.1.5 后为 5 个：上述四个 + `preset-cabinet`；`preset-cabinet` 恰 1 个，`config.id: cabinet` 恰 1 个。
- 与基线相比的 diff 为 **+233 / −0**：只新增 `dsh-cabinet-mode` 层，没有改动/删除四个内建 preset。
- 用 `--patch` 直接叠加仓库 `cordis.patch.yml` 也得到同样 5 个 preset、同样 +233/−0，说明**不是安装脚本碰巧写入了别的东西**。

结论：**安装可用性 PASS**（CLI + rc.5 运行时组合验证）。GUI 点击安装未实测（见 §8）。

---

## 4. 更新可用性（C 组）

### 4.1 「可更新」的判定链

索引版本与已装版本的 semver 比较在 **Host 侧 `dsh-plugin-market`**，不在客户端：

- `listingOf()`：`plugin.versions` 先由读取器降序；`defaultVersion` 取第一个「兼容且非预发布」版本（`lib/index.js:610-626`）。
- `installationOf(name, version, bundles)`（`lib/index.js:628-644`）：
  - 已装版本 === 默认版本 → `installed`；
  - 否则 `status = semver.valid(installedVersion) !== null && semver.gt(version, installedVersion) ? "update-available" : "different-version"`（`:642`）。
- 索引当前默认版本是 `0.1.5`；已装 `0.1.4` 时：

```text
semver.valid(installed)= 0.1.4
semver.gt(indexDefault, installed)= true
predicted status= update-available
```

- 已装 `0.2.0` 时（live profile 的场景）：

```text
gt(0.1.5,0.2.0)= false
gt(0.2.0,0.1.5)= true
status-when-installed-0.2.0= different-version
```

- 没有定时器：索引只在打开/刷新市场时抓取，成功后按 `cacheTtlMs` 缓存；默认 `cacheTtlMs=6e5`（600000 ms = 10 分钟，`lib/index.js:367`）。`search`/`entry` 读取缓存（`:441-490`），代码中没有 `setInterval`/定时检查。

### 4.2 客户端行为：有「可更新」徽标，但没有原地升级

从本机 rc.5 的 `app.asar` 中提取真实客户端包 `dsh/node_modules/@deepseek-ai/dsh-client-ui-plugin-market/lib/client.js`（68480 B，包版本 `0.2.1-rc.5`）：

- `EntryAction`（`:232-240`）：`status !== "not-installed"` 时只渲染一个 ghost 按钮，`onClick: onOpenInstalled`；`update-available` 只把文案换成 `statusUpdate`（「有新版本 / Update available」）。**点它只是跳到「已安装」页，不执行安装/升级。**
- `VersionRow`（`:326-378`）：非当前版本仍显示 Install 按钮；点击后 `onInstall(version)` → `ConfirmDialog` → `install({...version.install, ...})`（`:1092-1098`），即用索引的 `spec`（`dsh-cabinet-mode@0.1.5`）走安装流程。
- 但真正的安装入口在 Host `plugin-manager`：
  - `inspect()`（`.artifacts\...\dsh-plugin-manager\lib\index.js:1820-1924`）对 registry spec 先检查包名是否已在 profile：`:1870` `if (known.has(parsed.name)) return refused("already-installed", ...)`。
  - 因此已装 `dsh-cabinet-mode` 时，再对 `dsh-cabinet-mode@0.1.5` 走安装，会在 `inspect` 阶段被拒绝（即使版本不同）。
  - `installBundle()` 还有第二道：`:1991` `if (this.ownerContext.get("hmr") !== void 0 && known !== void 0 && Object.hasOwn(before, known)) throw new ManagementFailure("already-installed")`；桌面/web profile 的 `hmr` 服务在 `dsh-base` 中启用（`--dump-config` 显示 `id: hmr`，仅 `!profileContext` 时 disabled）。
- 结论：**rc.5 对第三方插件没有原地升级 UI**。真实更新路径只能是：**已安装页卸载 → 发现页安装新版本 → 重启**。README/zh 与 `docs/cross-platform.md:140` 已如实写明这一点；这不是本次 0.1.5 引入的缺陷，但意味着原始诉求中的「更新」不能按一键升级验收。

### 4.3 可复现检查路径

**UI 路径（机制上可判定；GUI 点击未实测）：**

1. 在 DSH「插件 → 发现 → 索引源」添加生产 URL。
2. 条目页选择 `0.1.4` 安装；重启后打开「发现」，索引默认版本是 `0.1.5`，按 `semver.gt(0.1.5,0.1.4)` 应显示「有新版本 / Update available」。
3. 点该徽标只会跳到「已安装」页；要更新必须卸载 `0.1.4`，再到发现页安装 `0.1.5`，然后重启。

**CLI 路径（本机已实测，仅证明版本切换，不证明 GUI）：**

```powershell
$env:DSH_HOME="$env:TEMP\acc-dsh-home"
dsh plugin --profile acc add dsh-cabinet-mode@0.1.4   # 依赖变 0.1.4
dsh plugin --profile acc add dsh-cabinet-mode@0.1.5   # 依赖变回 0.1.5
```

```text
dependencies:
- dsh-cabinet-mode 0.1.5
+ dsh-cabinet-mode 0.1.4
Done in 345ms using pnpm v11.28.5
dep=0.1.4
...
dependencies:
- dsh-cabinet-mode 0.1.4
+ dsh-cabinet-mode 0.1.5
Done in 354ms using pnpm v11.28.5
dep=0.1.5
```

**索引侧检查（本机已实测）：**

```powershell
node scripts/market-index.mjs --check
# published index matches the registry: 2 version(s); skipped: 0.0.0-stage (prerelease)
```

`--check` 从 registry 重新生成索引并与 live URL 比较；本机在 `5edc88f` 和 `origin/main` 的脚本上都返回 exit 0。

---

## 5. 发布链路（D 组）

### 5.1 Workflow 结构

`release.yml`：

| 项目 | 行号 | 实测/审阅 |
|---|---|---|
| 触发 `push: tags: v*` | `:15-18` | 是 |
| 顶层 `contents: read`、并发组 `release-${{ github.ref }}` | `:20-25` | 是 |
| `publish` job `contents: write` + `id-token: write` | `:32-34` | 是；OIDC 唯一凭据 |
| tag 必须在 `origin/main` 内 | `:48-56` | 是，`git merge-base --is-ancestor "$GITHUB_SHA" origin/main` |
| `package.json` 版本 + `CHANGELOG` 段与 tag 一致 | `:58-71` | 是 |
| 打包前跑 `verify.mjs` / `node --check` / `bash -n` | `:73-79` | 是 |
| tarball 8 条路径断言 | `:81-102` | 是 |
| `npm publish ./dsh-cabinet-mode-*.tgz --access public --tag "$tag"` | `:104-114` | 是；预发布 `--tag next` |
| `gh release create --verify-tag` | `:116-123` | 是 |
| `market-index` job `needs: publish`、预发布跳过、`contents: write`、`MARKET_EXPECT_VERSION`、发布分支 | `:125-164` | 是 |

`market-index.yml`：`workflow_dispatch` + 每周 cron（`:13-21`），`allow_shrink` 只在手动 dispatch 传入（`:49-55`），`contents: write`（`:35-36`），无 `npm publish`、无 `id-token`。

`ci.yml`：push main / PR（`:6-9`），`contents: read`（`:11-12`），`verify.mjs` + 语法检查 + `npm pack` 路径断言（`:34-60`），不参与发布。

### 5.2 v0.1.5 真实 run 41657224370

```text
gh run view 41657224370 --repo luodaoyi/dsh-cabinet-mode
✓ v0.1.5 Release · 41657224370
JOBS
✓ Publish to npm and create the GitHub Release in 17s (ID 125990647744)
✓ Refresh the plugin market index in 1m22s (ID 125990846182)
```

Publish job 日志要点：

```text
npm notice Publishing to https://registry.npmjs.org/ with tag latest and public access
npm notice publish Signed provenance statement with source and build information from GitHub Actions
npm notice publish Provenance statement published to transparency log: https://search.sigstore.dev/?logIndex=3672680367
+ dsh-cabinet-mode@0.1.5
https://github.com/luodaoyi/dsh-cabinet-mode/releases/tag/v0.1.5
```

Market-index job 日志要点：

```text
waiting for dsh-cabinet-mode@0.1.5 in the registry (257 ms elapsed; last seen: 0.0.0-stage, 0.1.4)
waiting ... (15442 ms elapsed ...)
waiting ... (30622 ms elapsed ...)
waiting ... (45800 ms elapsed ...)
waiting ... (60998 ms elapsed ...)
registry lists dsh-cabinet-mode@0.1.5 after 76204 ms
Wrote marketplace.json: 2 version(s); skipped: 0.0.0-stage (prerelease)
  + 5722232...a87b0b0 HEAD -> market-index (forced update)
```

- 两个 job 均 success；索引 job 等待 76.2 s 后成功，证明 `MARKET_EXPECT_VERSION` 传播等待确实生效（0.1.4 的索引 job 正是在这里失败）。
- GitHub Release `v0.1.5` 存在，资产 `dsh-cabinet-mode-0.1.5.tgz`（182103 B）与 `SHA256SUMS.txt`；tarball sha256 与 npm 包一致（§3.4）。

### 5.3 v0.1.4 索引 job 失败对照

`gh run view 41654601378`：

```text
✓ Publish to npm and create the GitHub Release in 19s
X Refresh the plugin market index in 17s
...
AssertionError [ERR_ASSERTION]: no installable versions found in the registry
    at scripts/market-index.mjs:157:8
```

这与 0.1.5 的 `registry lists ... after 76204 ms` 形成对照：传播延迟问题已由轮询修复，0.1.5 全链路成功。

---

## 6. 文档诚实性（E 组）

### 6.1 如实/未夸大的部分

- `README.md:93-122` 明确写「no in-place update」「update badge only opens the Installed page」「no periodic auto-check」「cached for 10 minutes」「real update flow was not exercised end to end」；与 §4 的代码结论一致。
- `README.zh.md:80-101` 同样写明「市场对第三方插件没有原地升级」「真实更新流程未做端到端实测」。
- `README.md:326-356` 把 npmjs.com trusted publisher 写成维护者在网页完成的人工前置，未声称仓库能自动完成；`npm whoami` 不能验证权限也写明。
- `docs/cross-platform.md:121-145` 对 OIDC、索引格式、`engines.dsh`、icon 32 KiB 边界的描述与本次实测/解析器一致；`:140-144` 对「无原地升级」「只比较 SemVer」「10 分钟缓存」「精确依赖串」「engines.dsh 缺省不设门禁」的代码级描述与本官复核一致。
- `CHANGELOG.md:18-53` 对 0.1.5 修复项（传播等待、cache-buster、回退守卫、预发布跳过、移除 `package-manager-cache`）与 workflow/日志一致。
- 未发现现行文档残留「Nothing is published to npm」或「不发 npm」的旧文案；`CHANGELOG.md:263-265` 的 “Nothing is published to npm” 位于历史版本 `[0.1.0]` 段，是对当时事实的记录，不是当前声称。

### 6.2 陈旧/自相矛盾（轻微，非阻断）

| 位置 | 问题 | 证据 |
|---|---|---|
| `README.md:128-142` | 发布状态仍只写 `0.1.4`，并把 tag→publish→自动刷新索引全链路标为 **Not verified**；实际 run 41657224370 已成功 | 本报告 §5.2；README 该段未提 0.1.5 |
| `README.zh.md:95-97` | 同上，发布状态停在 0.1.4，全链路仍写「未验证」 | 原文 |
| `README.md:386-390`、`README.zh.md:242` | 「Unverified items」仍写 0.1.5 是整条链路的首次运行，未记录已成功 | 原文 |
| `docs/cross-platform.md:23` vs `:155` | 第 23 行表格写「0.1.5 验证自动刷新链路」，第 155 行又写「仍未实跑 … 全链路（0.1.5 首发验证）」 | 同文件自相矛盾 |

这些是**保守陈旧/内部不一致**，不是夸大，也不影响索引/安装功能；但既然 run 已成功，文档应更新为「已验证：run 41657224370；0.1.5 已发布」，并消除第 23/155 行矛盾。修法只改文档，不改代码。

### 6.3 文档与实现一致性的两个细节

- `docs/cross-platform.md:140` 引用的 `update(packageName)`/`pkg.installTarget` 行为，与本官在 app.asar 客户端包中看到的 `EntryAction` 一致；`installTarget` 只对官方目录条目产生，第三方已装包没有 Update 按钮。
- `docs/cross-platform.md:131` 说「发布链路已由 v0.1.4 实跑成功」，现在 0.1.5 也成功；不矛盾，但可补 0.1.5。

---

## 7. 缺陷/弹劾与加固项（均非阻断 0.1.5 索引安装）

> 按律弹劾：只列缺陷、证据、影响、修法建议；不代工部改码。

### D-01（低，文档）发布状态与「未验证」清单陈旧

- 证据：`README.md:128-142`、`README.zh.md:95-97`、`README.md:386-390`、`README.zh.md:242`；`docs/cross-platform.md:23` 与 `:155` 自相矛盾。
- 影响：用户/后续维护者可能仍以为全链路未跑过；与 run 41657224370 的事实不符。属「保守错误」，不是夸大。
- 修法建议：把发布状态改为 0.1.5 + run 链接；把「tag → publish → 自动刷新索引」从 Unverified 移到 Verified（注明 GUI 安装/更新仍未实测）；把 cross-platform 第 155 行改为「已由 0.1.5 run 41657224370 实跑」。

### D-02（中，验证缺口）CI/发布门禁不跑 rc.5 真解析器

- 证据：`ci.yml:34-42`、`release.yml:73-79` 只跑 `node --check`/`bash -n`/`verify.mjs`；`scripts/verify.mjs` 的脚本清单不含 `market-index.mjs`（大理寺 D-3 亦指出）。索引 schema 只在 DSH 读取时才被验证。
- 影响：生成器自洽 ≠ 读取器接受；未来改索引结构可能直到用户端才暴露。本次 0.1.5 索引本官用真解析器跑过，当前无问题。
- 修法建议：CI 加一个 fixture 驱动的 `parseMarketIndex` 断言（或把 rc.5 解析器作为 devDependency 在临时目录 import；缺依赖时 WARN 而非静默跳过），并纳入 release 门禁。

### D-03（中低，发布缺口）main 的发布后守卫修复未进入 npm 0.1.5 tarball

- 证据：`git diff 5edc88f origin/main` 显示 `scripts/market-index.mjs` 新增 `withCacheBuster(indexUrl)`（`origin/main:scripts/market-index.mjs:115`）、404/ENOENT 精确判断（`:119-130`）、`fetchText` 保留 `error.status`（`:167`）、`--check` 也带 cache-buster（`:340`）；`CHANGELOG.md:5-16 [Unreleased]` 记录了 D-12/D-13。tag `v0.1.5` 指向 `5edc88f`，npm 0.1.5 tarball 内的 `scripts/market-index.mjs` 是旧版（无这些修复）。
- 影响：从 npm 安装 0.1.5 的用户若运行 `npm run market:index`，仍会走旧的「读不到基线一律当首次发布」和「`--check` 不带 cache-buster」逻辑；不影响 DSH 安装/更新本身，也不影响已生成的索引。
- 修法建议：若要在 npm 分发脚本中带修复，发 0.1.6（tag + OIDC）并刷新索引；或在 README 说明这些是源码 main 的未发布修复。**不要**把未发布源码说成已在 0.1.5 中。

### D-04（低，加固）`publish-market-index.sh` 的「已最新」短路只比较 marketplace.json

- 证据：`scripts/publish-market-index.sh:37-42` 用 `git show origin/market-index:marketplace.json | cmp -s - marketplace.json`；未比较 `icon.svg`。
- 影响：仅 icon 变化而索引不变时，手动/定时刷新会短路，图标不会更新。当前 live icon 与仓库一致（79384 B，sha256 08E9…），无现网问题。
- 修法建议：短路条件同时比较 `icon.svg`（或仅在两者都相同才 skip）。

### D-05（低，加固）`market-index` 分支 force-push 无「新鲜度」护栏

- 证据：`scripts/publish-market-index.sh:57-62`（`git push --force`，重试 3 次）；`release.yml:23-25` 的 release 并发组按 `github.ref` 分桶，只有索引 job 的 `market-index-publish` 组串行化。
- 影响：两个 tag 并发发布时，先完成的索引 job 可能在后者之后强推，把索引推回旧版本集合。单人维护 + 串行组下概率极低；本次未触发。
- 修法建议：推送前把生成索引的 version 集合与 registry 当前 packument 再做一次包含性校验（或要求新索引版本集合是当前索引的超集/带时间戳单调门）。

### D-06（低，加固）GitHub Release 创建失败会连带跳过索引 job

- 证据：`release.yml:116-131`：`gh release create` 与 npm publish 在同一 `publish` job；`market-index` job `needs: publish`。Release 步骤失败 → publish job 失败 → 索引 job 跳过。
- 影响：npm 已发布但索引未刷新，用户会看到旧索引；README 已给出手动跑 `Market index` 的恢复路径。
- 修法建议：把 Release 创建拆成独立 job（`needs: publish`），让 `market-index` 只依赖 npm publish 的 job；或明确 README 该失败模式。

### D-07（低，安全）main 未启用分支保护

- 证据：`gh api repos/luodaoyi/dsh-cabinet-mode/rulesets` → `[]`；`branches/main/protection` → 404 `Branch not protected`。`docs/cross-platform.md:122` 已如实记录。
- 影响：tag→main 的 gate 只能防「tag 指向 main 外」，不能防「有写权限的人直接推 main 再打 tag」；OIDC trusted publisher 已把发布限制到本仓库 + `release.yml`，风险有限。
- 修法建议：启用 main 分支保护（要求 CI / PR），并把 `release.yml` 的 tag-main gate 保留。

### D-08（低，文档）`market:index` / `market:check` 未在 README 说明

- 证据：`package.json:52-58` 有 `market:index`、`market:check`；README 的维护者章节只写了 `market:publish`（大理寺 D-5 同指）。
- 影响：维护者不知道如何本地检查索引是否过期。
- 修法建议：README「Releasing (maintainers)」补两行命令与用途。

### 非缺陷但必须写明的限制

- **没有原地升级**：rc.5 第三方插件只能卸载→重装→重启；这是平台行为，README/docs 已写明，不计为内阁插件缺陷。
- **live profile 0.2.0 与索引 0.1.5 的版本差**：0.1.5 < 0.2.0，装 0.1.5 是降级，且 0.1.5 是纯 YAML bundle（无 0.2.0 的客户端可视化 `lib/`/`client`）。在发布 0.2.x 前，市场不能作为 live profile 的升级通道。

---

## 8. 未验证清单（不得当作已通过）

| # | 未验证项 | 原因 |
|---|---|---|
| U1 | 在 DSH GUI「发现 → 索引源」里真实添加 URL、点击安装/更新的完整点击路径 | 本官只做了 CLI + `--dump-config` + 代码阅读；未启动 GUI 点击 |
| U2 | 安装/更新后**重启** DSH，模式选择器出现「内阁模式」、图标正确 | 需要真实 GUI 重启；本次未做 |
| U3 | 从索引安装 0.1.4 → 重启 → 看到「有新版本」徽标 → 卸载 → 装 0.1.5 → 重启 的 UI 全流程 | 同上；§4 只给机制级结论与 CLI 版本切换 |
| U4 | 本机 live desktop profile 实际安装 0.2.0 的状态 | 按边界未读取 `C:\Users\tb16p\.dsh`；只核验了 `dsh-cabinet-mode-ui` worktree 的 `package.json:3` 为 0.2.0 及其 tgz |
| U5 | Linux / macOS 上的安装、bash 脚本、图标/GUI | 无对应平台 |
| U6 | GitHub Release 创建失败 → 索引 job 跳过的恢复演练 | 未构造失败 |
| U7 | 两个 tag 并发发布时索引 force-push 的竞态（D-05） | 未构造并发 |
| U8 | npmjs.com trusted publisher 页面布局与 UI 操作 | 本仓库无 npm 账号页面访问；OIDC 发布成功只证明配置已生效 |
| U9 | 0.2.0 客户端可视化与 0.1.5 的兼容/回退 | 两个不同包，未在 live profile 试装 |
| U10 | `market-index` 的 icon-only 变化刷新（D-04） | 未构造 icon 变化 |

已实测但非 GUI 的替代证据：`dsh plugin --profile accweb add ...`（内嵌 pnpm v11.28.5）+ `dsh --profile accweb --dump-config` + `--patch` 叠加 + npm tarball 哈希比对。

---

## 9. 用户操作指引

### 9.1 在 DSH 中添加索引源

1. 打开 DSH → **插件 / Plugins** → **发现 / Discover** 标签。
2. 点 **索引源 / Index sources** → **添加 / Add**，粘贴以下原文（不要改路径、不要带 `#` 片段或账号密码）：

```text
https://raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/market-index/marketplace.json
```

3. 保存后刷新；索引应显示 **内阁模式 / Cabinet Mode**（`dsh-cabinet-mode`），默认版本 `0.1.5`。

### 9.2 安装

1. 在发现页打开条目，安装 `0.1.5`。
2. **完全退出并重启 DeepSeek Harness。**
3. 新建会话，在模式选择器选 **内阁模式**。

### 9.3 更新

- **当前 rc.5 没有第三方插件原地升级**。更新步骤：**已安装页卸载旧版 → 发现页安装新版 → 重启**。
- 也可用 CLI（本机已实测版本切换）：

```powershell
dsh plugin --profile <profile> add dsh-cabinet-mode@0.1.5
```

- 更新后 `dsh plugin --profile <profile> list` 应显示新版本；profile `package.json` 的依赖应为精确版本。

### 9.4 重要风险：不要拿 0.1.5 覆盖 live 的 0.2.0

- 本机 live desktop profile 背景为 `dsh-cabinet-mode@0.2.0`（旁证 `dsh-cabinet-mode-ui\package.json:3`，并有 `dsh-cabinet-mode-0.2.0.tgz`）；npm/索引只有 `0.1.5`。
- 0.1.5 是纯 YAML bundle，0.2.0 带 `main`/`client` 可视化；把 live profile 装成 0.1.5 **等于降级**，会丢 0.2.0 的客户端功能，且 `semver.gt(0.1.5, 0.2.0)=false` 不会显示「可更新」。
- 在 0.2.x 发布到 npm 并刷新索引之前，**不要**用市场索引源更新 live desktop profile；可继续用现有 `file:` tgz/0.2.0，或等 0.2.x 发布。
- 若只是想在隔离环境试用 0.1.5，请复制 profile 或使用临时 `DSH_HOME`，不要动 live profile。

### 9.5 回退

- 市场安装：已安装页卸载，再装回目标版本；或 `dsh plugin --profile <profile> add dsh-cabinet-mode@0.1.4` 后重启。
- 不会自动回退；每次换版本后都要完整重启。

---

## 10. 复现命令索引

```powershell
# 1) 索引抓取 + 哈希（cache-buster）
$t=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Invoke-WebRequest "https://raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/market-index/marketplace.json?t=$t" -OutFile "$env:TEMP\acc-marketplace.json"
Get-FileHash "$env:TEMP\acc-marketplace.json" -Algorithm SHA256

# 2) rc.5 解析器（复制到临时目录并装 semver，不改 .artifacts）
#    见 $env:TEMP\acc-parser\run.mjs；执行：
& 'C:\Users\tb16p\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe' `
  "$env:TEMP\acc-parser\run.mjs" "$env:TEMP\acc-marketplace.json"

# 3) 临时 profile 安装 + 组合校验
$env:DSH_HOME="$env:TEMP\acc-dsh-home"
dsh plugin --profile accweb add dsh-cabinet-mode@0.1.5
dsh --profile accweb --dump-config

# 4) 索引 --check（仓库根目录）
node scripts/market-index.mjs --check

# 5) npm tarball 哈希
Invoke-WebRequest "https://registry.npmjs.org/dsh-cabinet-mode/-/dsh-cabinet-mode-0.1.5.tgz?t=$t" -OutFile "$env:TEMP\acc-npm-0.1.5.tgz"
Get-FileHash "$env:TEMP\acc-npm-0.1.5.tgz" -Algorithm SHA256

# 6) 发布 run
gh run view 41657224370 --repo luodaoyi/dsh-cabinet-mode
gh run view 41657224370 --repo luodaoyi/dsh-cabinet-mode --job 125990647744 --log
gh run view 41657224370 --repo luodaoyi/dsh-cabinet-mode --job 125990846182 --log
```

---

## 11. 边界与副作用声明

- 本文件是本次唯一写入；`git status --short` 只应看到 `?? docs/acceptance/`。
- 未修改任何已跟踪文件；未修改 `.artifacts` 内文件；未读取/修改 `C:\Users\tb16p\.dsh` 下文件；未 commit/push/tag；未 npm publish；未操作 live profile。
- 实验均在 `$env:TEMP`（`acc-parser`、`acc-dsh-home`、`acc-marketplace.json`、`acc-npm-0.1.5.tgz` 等）。
- 本报告中的“未验证”项不得被引用为已通过；“PASS”只覆盖报告列出的命令与断言。
